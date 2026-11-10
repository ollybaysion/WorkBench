/**
 * 파일 저장소. vite 개발 서버(npm run dev · npm run preview) 안에서 화면의 /__store/* 요청을 받아
 * 작업판 · 카드 · 명령어 · 런북 · 연결 · 환경 프리셋을 저장 폴더의 JSON 파일로 읽고 쓴다(dataFiles.ts).
 *
 * 개발 서버는 저장 폴더를 지켜본다. 다른 프로그램(MCP 서버 · 편집기)이 파일을 바꾸면
 * 화면에 workbench:files 알림을 보내고, 화면은 바뀐 테이블을 다시 읽는다.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { relative, sep } from 'node:path'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { DATA_DIR, UserError, apply, isEmpty, isTable, ownWrites, readAll, type Op, type Row, type TableName } from './dataFiles.ts'

const PREFIX = '/__store/'
/** 교체(replace)는 테이블 전체를 한 번에 보낸다. 런 이력이 쌓여도 들어가게 넉넉히 둔다 */
const MAX_BODY = 32 << 20
/** 이 시간 안의 자기 쓰기는 화면에 다시 알리지 않는다 */
const OWN_WRITE_MS = 3000
/** 파일이 한꺼번에 바뀌면 모아서 한 번 알린다 */
const NOTIFY_DELAY_MS = 150

function parseOps(body: Record<string, unknown>): Op[] {
  const ops = body.ops
  if (!Array.isArray(ops)) throw new UserError('ops 가 없습니다')
  return ops.map((o: unknown) => {
    const x = o as Record<string, unknown>
    if (!x || typeof x !== 'object' || !isTable(x.table)) throw new UserError('table 이 맞지 않습니다')
    if ((x.op === 'put' || x.op === 'replace') && Array.isArray(x.rows) && x.rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
      return { op: x.op, table: x.table, rows: x.rows as Row[] }
    }
    if (x.op === 'del' && Array.isArray(x.ids) && x.ids.every((i) => typeof i === 'string')) return { op: 'del', table: x.table, ids: x.ids as string[] }
    throw new UserError(`op 가 맞지 않습니다: ${String(x.op)}`)
  })
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
    if (size > MAX_BODY) throw new UserError('요청이 32 MB 를 넘습니다')
    chunks.push(chunk as Buffer)
  }
  const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new UserError('JSON 본문이 아닙니다')
  return v as Record<string, unknown>
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  // 같은 출처 화면만 받는다. 다른 사이트의 폼 · fetch 는 Origin 이 다르거나 x-workbench 머리를 붙이지 못한다
  const origin = req.headers.origin
  if (origin && origin !== `http://${req.headers.host}`) return send(res, 403, { error: `받지 않는 출처입니다: ${origin}` })
  if (req.headers['x-workbench'] !== '1') return send(res, 403, { error: 'x-workbench 머리가 없습니다' })

  const path = (req.url ?? '').slice(PREFIX.length).split('?')[0]
  try {
    if (req.method === 'GET' && path === 'status') return send(res, 200, { ok: true, dir: DATA_DIR, empty: await isEmpty() })
    if (req.method === 'GET' && path === 'all') return send(res, 200, await readAll())
    if (req.method === 'POST' && path === 'write') {
      await apply(parseOps(await readJson(req)))
      return send(res, 200, { ok: true })
    }
    send(res, 404, { error: `${req.method} ${req.url} 는 없는 경로입니다` })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!(e instanceof UserError)) console.error(`[file-store] ${req.method} ${req.url}: ${msg}`)
    send(res, e instanceof UserError ? 422 : 500, { error: msg })
  }
}

/** 저장 폴더를 지켜보다가 다른 프로그램이 바꾼 테이블을 화면에 알린다(개발 서버만. 미리보기 서버는 HMR 통로가 없다) */
function watchData(server: ViteDevServer) {
  const pending = new Set<TableName>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const onFile = (file: string) => {
    if (!file.endsWith('.json')) return
    const rel = relative(DATA_DIR, file)
    if (rel.startsWith('..')) return
    const own = ownWrites.get(file)
    if (own && Date.now() - own < OWN_WRITE_MS) return
    const table = rel.split(sep)[0]
    if (!isTable(table)) return
    pending.add(table)
    clearTimeout(timer)
    timer = setTimeout(() => {
      server.ws.send({ type: 'custom', event: 'workbench:files', data: { tables: [...pending] } })
      pending.clear()
    }, NOTIFY_DELAY_MS)
  }
  server.watcher.add(DATA_DIR)
  server.watcher.on('add', onFile)
  server.watcher.on('change', onFile)
  server.watcher.on('unlink', onFile)
}

/** npm run dev · npm run preview 에 /__store/* 를 단다. 빌드한 dist(file://)에는 이 통로가 없어서 화면이 IndexedDB 만 쓴다 */
export function fileStore(): Plugin {
  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith(PREFIX)) return next()
      void handle(req, res)
    })
    server.config.logger.info(`  [file-store] 저장 폴더 ${DATA_DIR}`)
  }
  return {
    name: 'workbench:file-store',
    configureServer: (server) => {
      mount(server)
      watchData(server)
    },
    configurePreviewServer: mount,
  }
}
