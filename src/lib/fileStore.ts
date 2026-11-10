/**
 * 파일 저장소 통로(server/fileStore.ts 의 /__store/*).
 * 붙으면 디스크의 JSON 파일이 진실원이고 IndexedDB 는 그 사본이다.
 * - 앱을 켤 때 파일을 읽어 IndexedDB 를 채운다(store.init → attachFiles).
 * - IndexedDB 에 쓰면 Dexie 미들웨어(fileMirror)가 트랜잭션이 끝난 뒤 같은 변경을 파일에 쓴다.
 * - 파일에 쓰지 못한 변경이 있으면 표시(dirty)를 남긴다. 다음에 붙을 때 이 브라우저의 데이터를 파일에 합친다.
 *   합칠 때 updatedAt 이 더 새로운 쪽을 남기고, 같거나 없으면 브라우저 쪽을 남긴다. 파일은 지우지 않는다.
 * 개발 서버가 없으면(file:// · GitHub Pages) IndexedDB 만 쓴다.
 */
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, Middleware } from 'dexie'

export const FILE_TABLES = ['commands', 'runbooks', 'runs', 'envs', 'connections', 'cards', 'boards', 'snapshots', 'kv'] as const
export type FileTable = (typeof FILE_TABLES)[number]
/** 브라우저에만 두는 kv 키. 설정은 AKG 읽기 토큰을 품는다 */
export const LOCAL_KV = new Set(['settings'])

type Row = Record<string, unknown>
type Op = { op: 'put'; table: FileTable; rows: Row[] } | { op: 'del'; table: FileTable; ids: string[] } | { op: 'replace'; table: FileTable; rows: Row[] }
export type FileStatus = { ok: true; dir: string; empty: boolean } | { ok: false; error: string }

const PREFIX = './__store/'
const DIRTY_KEY = 'workbench.fileDirty'
const STATUS_TIMEOUT_MS = 3000

const isFileTable = (t: string): t is FileTable => (FILE_TABLES as readonly string[]).includes(t)
const localRow = (t: FileTable, r: Row) => t === 'kv' && LOCAL_KV.has(String(r.key))

let active = false
let paused = false
let chain: Promise<void> = Promise.resolve()
/** 끝나기를 기다리는 트랜잭션 수. 끝나면 그 변경을 chain 에 넣는다 */
let pendingCommits = 0
let commitWaiters: (() => void)[] = []
let reader: (t: FileTable) => Promise<Row[]> = async () => []
let onError: (msg: string) => void = () => undefined

/** deleteRange(clear) 뒤 테이블을 통째로 다시 쓸 때 읽을 곳. db.ts 가 넣는다 */
export function setTableReader(fn: (t: FileTable) => Promise<Row[]>) {
  reader = fn
}
export function onFileError(fn: (msg: string) => void) {
  onError = fn
}
/** 파일에서 읽은 값을 IndexedDB 에 넣는 동안은 되쓰지 않는다 */
export async function withMirrorPaused<T>(fn: () => Promise<T>): Promise<T> {
  paused = true
  try {
    return await fn()
  } finally {
    paused = false
  }
}
/** 진행 중인 트랜잭션의 변경까지 파일에 다 쓸 때까지 기다린다 */
async function idle(): Promise<void> {
  for (;;) {
    if (pendingCommits > 0) await new Promise<void>((r) => commitWaiters.push(r))
    const c = chain
    await c
    if (pendingCommits === 0 && c === chain) return
  }
}

function markDirty() {
  try {
    localStorage.setItem(DIRTY_KEY, '1')
  } catch {
    // 저장소를 막은 브라우저는 표시를 남기지 못한다. 다음에 붙을 때 파일을 읽는다
  }
}
export function isFileDirty(): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1'
  } catch {
    return false
  }
}
function clearDirty() {
  try {
    localStorage.removeItem(DIRTY_KEY)
  } catch {
    // 위와 같다
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const ctl = new AbortController()
  const timer = timeoutMs ? setTimeout(() => ctl.abort(), timeoutMs) : undefined
  try {
    const res = await fetch(PREFIX + path, {
      method,
      headers: { 'x-workbench': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    })
    const v = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (!res.ok) throw new Error(v.error ?? `HTTP ${res.status}`)
    return v
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 개발 서버의 파일 저장소에 붙어 본다. 앞서 보낸 쓰기가 끝난 뒤에 묻는다 */
export async function fileStatus(): Promise<FileStatus> {
  if (!/^https?:$/.test(location.protocol)) return { ok: false, error: '개발 서버가 아닙니다' }
  await idle()
  try {
    const v = await call<{ ok: boolean; dir: string; empty: boolean }>('GET', 'status', undefined, STATUS_TIMEOUT_MS)
    return { ok: true, dir: v.dir, empty: v.empty }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 파일 저장소의 모든 테이블을 읽는다. 앞서 보낸 쓰기가 끝난 뒤에 읽는다 */
export async function fileReadAll(): Promise<{ tables: Record<FileTable, Row[]>; errors: string[] }> {
  await idle()
  return call('GET', 'all')
}

const keyOf = (t: FileTable, r: Row) => String(t === 'kv' ? r.key : r.id)
const newer = (a: Row, b: Row) => typeof a.updatedAt === 'string' && typeof b.updatedAt === 'string' && a.updatedAt > b.updatedAt

/**
 * 앱을 켤 때 부른다. 붙으면 파일 내용을 돌려주고, 그 뒤의 쓰기를 파일에도 쓴다.
 * 파일이 비었거나 dirty 면 이 브라우저의 행을 먼저 파일에 합친다(파일 쪽이 더 새로우면 파일을 남긴다).
 * 돌려준 내용으로 IndexedDB 를 채우는 일은 부른 쪽이 withMirrorPaused 안에서 한다.
 */
export async function attachFiles(readLocal: () => Promise<Record<FileTable, Row[]>>): Promise<{ status: FileStatus; tables?: Record<FileTable, Row[]>; errors: string[] }> {
  active = false
  const status = await fileStatus()
  if (!status.ok) return { status, errors: [] }
  let tables: Record<FileTable, Row[]>
  let errors: string[]
  try {
    ;({ tables, errors } = await call<{ tables: Record<FileTable, Row[]>; errors: string[] }>('GET', 'all'))
  } catch (e) {
    // 파일을 읽지 못하면 이 브라우저의 데이터로 연다. 이번에 쓴 변경은 dirty 로 남아 다음에 합친다
    markDirty()
    const msg = e instanceof Error ? e.message : String(e)
    onError(msg)
    return { status: { ok: false, error: msg }, errors: [] }
  }
  if (status.empty || isFileDirty()) {
    const local = await readLocal()
    const ops: Op[] = []
    for (const t of FILE_TABLES) {
      const onFile = new Map(tables[t].map((r) => [keyOf(t, r), r]))
      const rows = local[t].filter((r) => !localRow(t, r) && !(onFile.has(keyOf(t, r)) && newer(onFile.get(keyOf(t, r))!, r)))
      for (const r of rows) onFile.set(keyOf(t, r), r)
      tables[t] = [...onFile.values()]
      if (rows.length) ops.push({ op: 'put', table: t, rows })
    }
    try {
      if (ops.length) await call('POST', 'write', { ops })
      clearDirty()
    } catch (e) {
      // 합친 내용은 IndexedDB 에 넣고, 파일에는 다음에 다시 합친다(dirty 를 남긴다)
      onError(e instanceof Error ? e.message : String(e))
    }
  }
  active = true
  return { status, tables, errors }
}

function enqueue(build: () => Promise<Op | undefined>) {
  chain = chain.then(async () => {
    try {
      const op = await build()
      if (op) await call('POST', 'write', { ops: [op] })
    } catch (e) {
      markDirty()
      onError(e instanceof Error ? e.message : String(e))
    }
  })
}

function record(table: FileTable, req: DBCoreMutateRequest, res: DBCoreMutateResponse) {
  const failed = new Set(Object.keys(res.failures ?? {}).map(Number))
  if (req.type === 'add' || req.type === 'put') {
    const rows = (req.values as Row[]).filter((r, i) => !failed.has(i) && !localRow(table, r))
    if (rows.length) enqueue(async () => ({ op: 'put', table, rows }))
  } else if (req.type === 'delete') {
    const ids = (req.keys as unknown[]).map(String).filter((k, i) => !failed.has(i) && !(table === 'kv' && LOCAL_KV.has(k)))
    if (ids.length) enqueue(async () => ({ op: 'del', table, ids }))
  } else {
    // deleteRange(clear 등): 어느 키가 지워졌는지 모르므로 트랜잭션이 끝난 뒤 테이블을 통째로 다시 쓴다
    enqueue(async () => ({ op: 'replace', table, rows: (await reader(table)).filter((r) => !localRow(table, r)) }))
  }
}

/** 트랜잭션이 끝난 뒤(complete) 부른다. 중간에 되돌려진(abort) 변경은 파일에 쓰지 않는다 */
function afterCommit(req: DBCoreMutateRequest, fn: () => void) {
  const tx = req.trans as unknown as Partial<IDBTransaction>
  if (typeof tx?.addEventListener !== 'function') return fn()
  pendingCommits++
  const done = (ok: boolean) => {
    if (ok) fn()
    if (--pendingCommits === 0) {
      const ws = commitWaiters
      commitWaiters = []
      for (const w of ws) w()
    }
  }
  tx.addEventListener('complete', () => done(true), { once: true })
  tx.addEventListener('abort', () => done(false), { once: true })
}

export const fileMirror: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'fileMirror',
  create: (down) => ({
    ...down,
    table: (name) => {
      const t = down.table(name)
      if (!isFileTable(name)) return t
      return {
        ...t,
        mutate: async (req) => {
          const res = await t.mutate(req)
          if (paused) return res
          // 붙어 있으면 파일에 쓴다. 개발 서버에서 붙지 못한 채 쓴 변경은 다음에 붙을 때 올린다
          if (active) afterCommit(req, () => record(name, req, res))
          else if (/^https?:$/.test(location.protocol)) markDirty()
          return res
        },
      }
    },
  }),
}
