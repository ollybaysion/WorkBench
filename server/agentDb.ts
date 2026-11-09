/**
 * agent-db 통로. vite 개발 서버(npm run dev) 안에서 agent-db MCP 서버를 자식 프로세스로 띄우고,
 * 화면의 /__agentdb/* 요청을 MCP 도구 호출(list_connections · run_query)로 넘긴다.
 *
 * 회사 PC(WSL)는 Windows 쪽 node.exe 로 agent-db 를 띄운다. 기본값이 그 명령이다.
 *   AGENT_DB_COMMAND  기본 node.exe
 *   AGENT_DB_SERVER   기본 C:/tools/agent-db/server.mjs
 * 비밀번호는 agent-db 가 connections.json 의 passwordEnv 로 읽는다. 여기서는 환경 변수를 그대로 넘긴다.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer, PreviewServer } from 'vite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const PREFIX = '/__agentdb/'
const MAX_BODY = 1 << 20
/** agent-db 의 불변 행 상한(config.mjs HARD_MAX_ROWS) */
const MAX_ROWS = 1000
const CALL_TIMEOUT_MS = 60_000

const command = process.env.AGENT_DB_COMMAND || 'node.exe'
const serverPath = process.env.AGENT_DB_SERVER || 'C:/tools/agent-db/server.mjs'
const commandLine = `${command} ${serverPath}`

class UserError extends Error {}

let client: Promise<Client> | null = null

function stringEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

/** 처음 부를 때 띄운다. 프로세스가 죽으면 다음 요청 때 다시 띄운다 */
function connect(): Promise<Client> {
  if (client) return client
  const c = new Client({ name: 'workbench', version: '1.0.0' })
  const transport = new StdioClientTransport({ command, args: [serverPath], env: stringEnv(), stderr: 'inherit' })
  transport.onclose = () => {
    client = null
  }
  const p = c.connect(transport).then(
    () => c,
    (e: unknown) => {
      client = null
      throw new UserError(`agent-db 를 띄우지 못했습니다(${commandLine}): ${e instanceof Error ? e.message : String(e)}`)
    },
  )
  client = p
  return p
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const c = await connect()
  const r = await c.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS })
  const content = (r.content ?? []) as { type: string; text?: string }[]
  const text = content.find((x) => x.type === 'text')?.text ?? ''
  if (r.isError) throw new UserError(text || `agent-db ${name} 오류`)
  try {
    return JSON.parse(text)
  } catch {
    throw new UserError(`agent-db 응답을 읽지 못했습니다: ${text.slice(0, 200)}`)
  }
}

export async function closeAgentDb(): Promise<void> {
  const p = client
  client = null
  if (p) await p.then((c) => c.close()).catch(() => undefined)
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new UserError('요청이 1 MB 를 넘습니다')
    chunks.push(chunk as Buffer)
  }
  const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new UserError('JSON 본문이 아닙니다')
  return v as Record<string, unknown>
}

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

async function handle(req: IncomingMessage, res: ServerResponse) {
  // 같은 출처 화면만 받는다. 다른 사이트의 폼 · fetch 는 Origin 이 다르거나 x-workbench 머리를 붙이지 못한다
  const origin = req.headers.origin
  if (origin && origin !== `http://${req.headers.host}`) return send(res, 403, { error: `받지 않는 출처입니다: ${origin}` })
  if (req.headers['x-workbench'] !== '1') return send(res, 403, { error: 'x-workbench 머리가 없습니다' })

  const path = (req.url ?? '').slice(PREFIX.length).split('?')[0]
  try {
    if (req.method === 'GET' && path === 'status') {
      try {
        const r = (await callTool('list_connections', {})) as { connections?: unknown[]; errors?: unknown[]; hint?: string }
        return send(res, 200, { ok: true, command: commandLine, connections: r.connections ?? [], errors: r.errors ?? [], hint: r.hint })
      } catch (e) {
        return send(res, 200, { ok: false, command: commandLine, error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (req.method === 'POST' && path === 'query') {
      const body = await readJson(req)
      const { alias, sql, binds } = body
      if (!isStr(alias, 128) || !alias) throw new UserError('alias 가 없습니다')
      if (!isStr(sql, 100_000)) throw new UserError('sql 이 맞지 않습니다')
      if (binds !== undefined && (!binds || typeof binds !== 'object' || Array.isArray(binds))) throw new UserError('binds 가 맞지 않습니다')
      const t0 = Date.now()
      const r = await callTool('run_query', { db: alias, sql, binds: binds ?? {}, max_rows: MAX_ROWS })
      return send(res, 200, { ...(r as object), roundTripMs: Date.now() - t0 })
    }
    send(res, 404, { error: `${req.method} ${req.url} 는 없는 경로입니다` })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!(e instanceof UserError)) console.error(`[agent-db] ${req.method} ${req.url}: ${msg}`)
    send(res, 422, { error: msg })
  }
}

/** npm run dev · npm run preview 에 /__agentdb/* 를 단다. 빌드한 dist(file://)에는 이 통로가 없다 */
export function agentDb(): Plugin {
  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith(PREFIX)) return next()
      void handle(req, res)
    })
    server.httpServer?.on('close', () => void closeAgentDb())
  }
  return { name: 'workbench:agent-db', configureServer: mount, configurePreviewServer: mount }
}
