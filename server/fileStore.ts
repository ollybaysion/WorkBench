/**
 * 파일 저장소. vite 개발 서버(npm run dev · npm run preview) 안에서 화면의 /__store/* 요청을 받아
 * 작업판 · 카드 · 명령어 · 런북 · 연결 · 환경 프리셋을 디스크의 JSON 파일로 읽고 쓴다.
 *
 *   WORKBENCH_DATA  저장 폴더. 기본 ~/.workbench/data
 *
 * 폴더 모양: <저장 폴더>/<테이블>/<id>.json. 항목 하나가 파일 하나다.
 * 설정(AKG 읽기 토큰을 품는다)은 브라우저에만 둔다. 화면이 kv 의 settings 를 보내지 않는다.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

const PREFIX = '/__store/'
/** 교체(replace)는 테이블 전체를 한 번에 보낸다. 런 이력이 쌓여도 들어가게 넉넉히 둔다 */
const MAX_BODY = 32 << 20

export const DATA_DIR = process.env.WORKBENCH_DATA || join(homedir(), '.workbench', 'data')

const TABLES = ['commands', 'runbooks', 'runs', 'envs', 'connections', 'cards', 'boards', 'kv'] as const
type TableName = (typeof TABLES)[number]
/** 브라우저에만 두는 kv 키. 화면이 보내도 받지 않는다 */
const LOCAL_KV = new Set(['settings'])

type Row = Record<string, unknown>
type Op = { op: 'put'; table: TableName; rows: Row[] } | { op: 'del'; table: TableName; ids: string[] } | { op: 'replace'; table: TableName; rows: Row[] }

class UserError extends Error {}

const isTable = (v: unknown): v is TableName => typeof v === 'string' && (TABLES as readonly string[]).includes(v)
const keyName = (t: TableName) => (t === 'kv' ? 'key' : 'id')

/** id 를 파일 이름으로. 경로 문자는 encodeURIComponent 가 바꾸고, 점으로 시작하는 이름은 받지 않는다 */
function fileOf(table: TableName, id: unknown): string {
  if (typeof id !== 'string' || !id || id.length > 200) throw new UserError(`${table} 의 id 가 맞지 않습니다`)
  const name = encodeURIComponent(id)
  if (name.startsWith('.')) throw new UserError(`${table} 의 id 는 점으로 시작할 수 없습니다: ${id}`)
  return join(DATA_DIR, table, `${name}.json`)
}

let tmpSeq = 0
/** 임시 파일에 쓰고 이름을 바꾼다. 쓰는 도중에 멈춰도 원래 파일이 깨지지 않는다 */
async function writeRow(table: TableName, row: Row) {
  if (table === 'kv' && LOCAL_KV.has(String(row.key))) return
  const file = fileOf(table, row[keyName(table)])
  const tmp = `${file}.tmp-${process.pid}-${tmpSeq++}`
  await writeFile(tmp, JSON.stringify(row, null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}

async function removeFile(file: string) {
  try {
    await unlink(file)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
}

async function jsonFiles(table: TableName): Promise<string[]> {
  try {
    return (await readdir(join(DATA_DIR, table))).filter((f) => f.endsWith('.json'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

async function readAll(): Promise<{ tables: Record<TableName, Row[]>; errors: string[] }> {
  const errors: string[] = []
  const tables = {} as Record<TableName, Row[]>
  for (const t of TABLES) {
    const rows: Row[] = []
    for (const f of await jsonFiles(t)) {
      try {
        const v: unknown = JSON.parse(await readFile(join(DATA_DIR, t, f), 'utf8'))
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('객체가 아닙니다')
        rows.push(v as Row)
      } catch (e) {
        errors.push(`${t}/${f}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    tables[t] = t === 'kv' ? rows.filter((r) => !LOCAL_KV.has(String(r.key))) : rows
  }
  return { tables, errors }
}

async function isEmpty(): Promise<boolean> {
  for (const t of TABLES) if ((await jsonFiles(t)).length) return false
  return true
}

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

/** 받은 순서대로 적용한다. 요청 하나씩 차례로 처리해서 쓰기 순서가 섞이지 않게 한다 */
let queue: Promise<unknown> = Promise.resolve()
function apply(ops: Op[]): Promise<void> {
  const run = async () => {
    for (const o of ops) {
      await mkdir(join(DATA_DIR, o.table), { recursive: true })
      if (o.op === 'put') for (const r of o.rows) await writeRow(o.table, r)
      if (o.op === 'del') for (const id of o.ids) await removeFile(fileOf(o.table, id))
      if (o.op === 'replace') {
        const keep = new Set<string>()
        for (const r of o.rows) {
          await writeRow(o.table, r)
          keep.add(fileOf(o.table, r[keyName(o.table)]))
        }
        for (const f of await jsonFiles(o.table)) {
          const file = join(DATA_DIR, o.table, f)
          if (!keep.has(file)) await removeFile(file)
        }
      }
    }
  }
  const p = queue.then(run, run)
  queue = p.catch(() => undefined)
  return p
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

/** npm run dev · npm run preview 에 /__store/* 를 단다. 빌드한 dist(file://)에는 이 통로가 없어서 화면이 IndexedDB 만 쓴다 */
export function fileStore(): Plugin {
  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith(PREFIX)) return next()
      void handle(req, res)
    })
    server.config.logger.info(`  [file-store] 저장 폴더 ${DATA_DIR}`)
  }
  return { name: 'workbench:file-store', configureServer: mount, configurePreviewServer: mount }
}
