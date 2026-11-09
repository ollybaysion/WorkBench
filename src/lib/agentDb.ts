import type { Cell, Column, Connection, QueryCard, QueryResult } from '../types'

/** vite 개발 서버의 agent-db 통로(server/agentDb.ts) 와 말하는 곳 */
const BASE = './__agentdb/'

export interface AgentConn {
  alias: string
  description: string | null
  user: string
  passwordStatus: string
}
export type AgentStatus = { ok: true; command: string; connections: AgentConn[]; errors: string[]; hint?: string } | { ok: false; command?: string; error: string }

interface RunPayload {
  columns: { name: string; type: string }[]
  rows: (string | number | null)[][]
  truncated: boolean
  hint?: string
  elapsedMs: number
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'x-workbench': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(75_000),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('agent-db 가 75 초 안에 답하지 않았습니다')
    throw new Error('agent-db 통로에 닿지 않습니다. npm run dev 로 띄운 WorkBench 에서 조회하세요')
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!data) throw new Error('agent-db 통로가 없습니다. npm run dev 로 띄운 WorkBench 에서 조회하세요')
  if (!res.ok) throw new Error(data.error ?? `agent-db 통로 오류 HTTP ${res.status}`)
  return data
}

export const agentStatus = () => call<AgentStatus>('GET', 'status').catch((e: unknown): AgentStatus => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))

const NUM = /^(NUMBER|BINARY_FLOAT|BINARY_DOUBLE|BINARY_INTEGER|FLOAT|INTEGER)/i
const DATE = /^(DATE|TIMESTAMP)/i

/** Oracle 이 대문자로 돌려준 따옴표 없는 열 이름은 소문자로(카드의 그래프 열 'ts' 와 맞춘다) */
const colName = (n: string) => (n === n.toUpperCase() ? n.toLowerCase() : n)

/** agent-db 는 숫자를 글자로 준다. 안전한 범위면 숫자로 바꾼다 */
function numCell(v: string | number | null): Cell {
  if (v === null || typeof v === 'number') return v
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : v
}

export function toResult(p: RunPayload): QueryResult {
  const columns: Column[] = p.columns.map((c) => ({ name: colName(c.name), type: NUM.test(c.type) ? 'number' : DATE.test(c.type) ? 'date' : 'string' }))
  const rows = p.rows.map((row) => row.map((v, i) => (columns[i]?.type === 'number' ? numCell(v) : v)))
  return { columns, rows, truncated: p.truncated, elapsedMs: p.elapsedMs, ...(p.hint ? { note: p.hint } : {}) }
}

/** 카드 하나를 그 연결의 alias 로 돌린다 */
export async function runOnAgent(card: QueryCard, conn: Connection, vars: Record<string, string>): Promise<QueryResult> {
  if (!conn.alias) throw new Error(`${conn.name} 연결에 agent-db alias 가 없습니다`)
  return toResult(await call<RunPayload>('POST', 'query', { alias: conn.alias, sql: card.sql, binds: vars }))
}

/** 연결 테스트: SELECT 1 FROM dual */
export async function pingAlias(alias: string): Promise<number> {
  const t0 = performance.now()
  await call<RunPayload>('POST', 'query', { alias, sql: 'SELECT 1 FROM dual', binds: {} })
  return Math.round(performance.now() - t0)
}
