import type { Cell, Limits, PickRule, QueryCard, QueryResult } from '../types'

/**
 * 카드 결과에 얹는 표시. 표 · 히트맵 · 숫자 타일 · 선 그래프가 함께 쓴다.
 * - 고름: 고르기 규칙(picks)의 열 값이 모두 지금 변수 값과 같은 행
 * - 넘음: 값이 그 행의 LCL 아래 또는 UCL 위인 행
 */
export interface Marks {
  vars: Record<string, string>
  picks?: PickRule[]
  limits?: Limits
  /** 있으면 행을 누를 때 그 행의 값을 변수에 넣는다. 없으면 누를 때 값을 복사한다 */
  onPick?: (patch: Record<string, string>) => void
}

export const cellStr = (v: Cell) => (v === null ? '' : String(v))

export function colIndex(result: QueryResult, name: string | undefined): number {
  const want = (name ?? '').trim().toLowerCase()
  if (!want) return -1
  return result.columns.findIndex((c) => c.name.toLowerCase() === want)
}

export function toNum(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** 고르기 규칙 중 결과에 열이 있는 것만, 열 번호와 함께 */
export interface PickCol {
  ci: number
  var: string
}
export function pickCols(result: QueryResult, picks: PickRule[] | undefined): PickCol[] {
  return (picks ?? []).map((p) => ({ ci: colIndex(result, p.col), var: p.var })).filter((p) => p.ci >= 0 && p.var)
}

/** 행 하나를 변수 값으로: { lot_id: 'L2611-07', wafer: '12' } */
export const pickPatch = (row: Cell[], cols: PickCol[]): Record<string, string> => Object.fromEntries(cols.map((p) => [p.var, cellStr(row[p.ci])]))

/** 행의 고르기 열 값이 모두 지금 변수 값과 같으면 고른 행이다 */
export const isPicked = (row: Cell[], cols: PickCol[], vars: Record<string, string>) =>
  cols.length > 0 && cols.every((p) => (vars[p.var] ?? '') !== '' && vars[p.var] === cellStr(row[p.ci]))

export type Over = 'ucl' | 'lcl' | undefined

/** UCL 위면 'ucl', LCL 아래면 'lcl'. 한계가 비면 그쪽은 보지 않는다 */
export function overOf(v: number | null | undefined, lcl: number | null | undefined, ucl: number | null | undefined): Over {
  if (v === null || v === undefined) return undefined
  if (ucl !== null && ucl !== undefined && v > ucl) return 'ucl'
  if (lcl !== null && lcl !== undefined && v < lcl) return 'lcl'
  return undefined
}

/** 한계 열 번호. 없는 열은 -1 */
export interface LimitCols {
  lcl: number
  ucl: number
  value: number
}
export function limitCols(result: QueryResult, limits: Limits | undefined): LimitCols {
  return { lcl: colIndex(result, limits?.lcl), ucl: colIndex(result, limits?.ucl), value: colIndex(result, limits?.value) }
}
export const hasLimits = (c: LimitCols) => c.lcl >= 0 || c.ucl >= 0
export const rowLimit = (row: Cell[], ci: number) => (ci >= 0 ? toNum(row[ci]) : null)

/** 표 행이 넘었는지: 견줄 열(limits.value)의 값과 그 행의 한계 */
export function rowOver(row: Cell[], c: LimitCols): Over {
  if (c.value < 0 || !hasLimits(c)) return undefined
  return overOf(toNum(row[c.value]), rowLimit(row, c.lcl), rowLimit(row, c.ucl))
}

/** "lot_id, slot:wafer" ↔ [{col:'lot_id',var:'lot_id'},{col:'slot',var:'wafer'}]. 열과 변수가 같으면 이름 하나만 쓴다 */
export function parsePicks(s: string): PickRule[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [col, v] = x.split(/\s*(?::|→|->)\s*/)
      return { col: col.trim(), var: (v ?? col).trim() }
    })
    .filter((p) => p.col && p.var)
}
export const formatPicks = (picks: PickRule[] | undefined) => (picks ?? []).map((p) => (p.col === p.var ? p.col : `${p.col}:${p.var}`)).join(', ')

/** 카드 꼬리에 보일 글자: "누르면 lot_id · wafer ←" */
export const pickHint = (card: QueryCard) => (card.picks?.length ? `누르면 ${card.picks.map((p) => p.var).join(' · ')} ←` : undefined)
