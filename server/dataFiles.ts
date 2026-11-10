/**
 * 저장 폴더의 JSON 파일을 읽고 쓴다. 개발 서버의 파일 저장소(fileStore.ts)와 MCP 서버(mcp.ts)가 함께 쓴다.
 *
 *   WORKBENCH_DATA  저장 폴더. 기본 ~/.workbench/data
 *
 * 폴더 모양: <저장 폴더>/<테이블>/<id>.json. 항목 하나가 파일 하나다.
 * 설정(AKG 읽기 토큰을 품는다)은 브라우저에만 둔다. kv 의 settings 는 쓰지도 읽지도 않는다.
 */
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = process.env.WORKBENCH_DATA || join(homedir(), '.workbench', 'data')

export const TABLES = ['commands', 'runbooks', 'runs', 'envs', 'connections', 'cards', 'boards', 'kv'] as const
export type TableName = (typeof TABLES)[number]
/** 브라우저에만 두는 kv 키 */
const LOCAL_KV = new Set(['settings'])

export type Row = Record<string, unknown>
export type Op = { op: 'put'; table: TableName; rows: Row[] } | { op: 'del'; table: TableName; ids: string[] } | { op: 'replace'; table: TableName; rows: Row[] }

export class UserError extends Error {}

export const isTable = (v: unknown): v is TableName => typeof v === 'string' && (TABLES as readonly string[]).includes(v)
const keyName = (t: TableName) => (t === 'kv' ? 'key' : 'id')

/** 이 프로세스가 방금 쓰거나 지운 파일과 그 시각. 개발 서버가 자기 쓰기를 화면에 다시 알리지 않게 한다 */
export const ownWrites = new Map<string, number>()

/** id 를 파일 이름으로. 경로 문자는 encodeURIComponent 가 바꾸고, 점으로 시작하는 이름은 받지 않는다 */
export function fileOf(table: TableName, id: unknown): string {
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
  ownWrites.set(file, Date.now())
  await rename(tmp, file)
}

async function removeFile(file: string) {
  try {
    ownWrites.set(file, Date.now())
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

/** 테이블 하나를 읽는다. 읽지 못한 파일은 errors 에 넣고 건너뛴다 */
export async function readTable(t: TableName, errors: string[] = []): Promise<Row[]> {
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
  return t === 'kv' ? rows.filter((r) => !LOCAL_KV.has(String(r.key))) : rows
}

export async function readAll(): Promise<{ tables: Record<TableName, Row[]>; errors: string[] }> {
  const errors: string[] = []
  const tables = {} as Record<TableName, Row[]>
  for (const t of TABLES) tables[t] = await readTable(t, errors)
  return { tables, errors }
}

export async function isEmpty(): Promise<boolean> {
  for (const t of TABLES) if ((await jsonFiles(t)).length) return false
  return true
}

/** 받은 순서대로 적용한다. 한 프로세스 안에서는 요청 하나씩 차례로 처리해서 쓰기 순서가 섞이지 않게 한다 */
let queue: Promise<unknown> = Promise.resolve()
export function apply(ops: Op[]): Promise<void> {
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
