import type { Cell, ChartType, Limits, QueryResult } from '../types'
import { colIndex as colIdx, hasLimits, limitCols, overOf, rowLimit, toNum } from './marks'

export { toNum }

/** 카드의 그래프 설정(CardView 의 chart 쪽) */
export interface ChartSpec {
  type: ChartType
  x: string
  y: string[]
  series?: string
  focus?: string
  phase?: string
  band?: string
}

/** 그래프 밖에서 오는 값: 카드의 한계 열, 겹침 모드가 고를 시리즈 이름(focus 변수의 지금 값) */
export interface PrepareOpts {
  limits?: Limits
  focusValue?: string
}

/** 색 칸 수. 범주 색은 정해진 순서로만 쓰고, 넘치면 그리지 않고 알린다 */
export const SLOTS = 8

export type XKind = 'time' | 'num' | 'cat'
export interface Series {
  name: string
  slot: number // 0 부터. 처음 나온 순서로 정해서, 거르거나 접어도 색이 바뀌지 않는다
  values: (number | null)[]
  /** 겹침 모드의 나머지 시리즈(옅게 그린다) */
  muted?: boolean
}

/** 선 그래프에 얹는 것: x 마다 LCL · UCL, 구간, 넘은 구간, 가장 많이 넘은 점 */
export interface LineExtras {
  lcl?: (number | null)[]
  ucl?: (number | null)[]
  phases?: { from: number; to: number; name: string }[]
  /** 강조 구간: band 열 값이 있는 x 가 이어진 구간 */
  bands?: { from: number; to: number; name: string }[]
  over?: { from: number; to: number }[]
  /** 가장 많이 넘은 점. width 는 넘은 x 폭의 합(x 간격 × 넘은 점 수) */
  peak?: { x: number; v: number; limit: number; side: 'ucl' | 'lcl'; width: number }
  /** 겹침 모드: 고른 변수 · 값 · 그 값의 시리즈가 있는지 · 나머지 시리즈 수 */
  focus?: { var: string; value: string; found: boolean; others: number }
}
export interface XY {
  xKind: XKind
  xs: number[] // time 은 unix 초, cat 은 0..n-1
  labels: string[] // x 마다 보일 글자
  series: Series[]
}
export interface Panel {
  title?: string
  data: XY
  extras?: LineExtras
}
export interface HeatCell {
  xi: number
  yi: number
  v: number
  /** 이 칸을 만든 첫 행(눌러서 변수 넣기 · 고른 칸 표시) */
  row: number
}
export interface BoxGroup {
  name: string
  n: number
  lo: number
  q1: number
  med: number
  q3: number
  hi: number
  outliers: number[]
}

/** 숫자 타일 하나. 시간 열이면 spark(추세) · delta(마지막 − 처음) · from(처음 x 글자)이 붙는다 */
export interface StatTile {
  label: string
  value: number | null
  /** 값이 숫자가 아닌 글자(FAULT · RUN 같은 상태)면 그 글자를 큰 글자로 */
  text?: string
  spark?: (number | null)[]
  delta?: number
  from?: string
  /** 한계와 견줄 값(limits.value 열, 없으면 value)과 그 행의 한계 */
  cmp?: number | null
  lcl?: number | null
  ucl?: number | null
  /** 이 타일을 만든 행(이름 열 모양). 시간 열 모양은 시리즈의 마지막 행 */
  row?: number
}

/** 숫자 타일은 많아야 이만큼(넘치면 알린다). 한 카드에 파라미터 30 개를 넣는 쓰임까지 */
export const STAT_MAX = 40

/** 겹침 모드에서 그리는 시리즈 수의 끝 */
export const OVERLAY_MAX = 200

export type Prepared =
  | { kind: 'lines'; type: 'line' | 'step' | 'area' | 'scatter'; panels: Panel[]; note?: string }
  | { kind: 'bars'; stacked: boolean; data: XY; yName: string; note?: string }
  | { kind: 'heatmap'; xs: string[]; ys: string[]; cells: HeatCell[]; min: number; max: number; xName: string; yName: string; vName: string }
  | { kind: 'box'; groups: BoxGroup[]; xName: string; yName: string; note?: string }
  | { kind: 'stat'; tiles: StatTile[]; note?: string }
  | { kind: 'error'; message: string }

const fail = (message: string): Prepared => ({ kind: 'error', message })

const DT_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?$/
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?$/

/** 초 아래 자리(".137")를 초로. trace 는 ms 단위로 보므로 버리지 않는다 */
const frac = (f: string | undefined) => (f ? Number(f) : 0)

/** 날짜 · 시각 글자를 unix 초로(소수 초 포함). 시각만 있으면 오늘 날짜로 본다 */
export function parseTime(v: Cell): number | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = DT_RE.exec(s)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime() / 1000 + frac(m[7])
  m = TIME_RE.exec(s)
  if (m) {
    const d = new Date()
    d.setHours(+m[1], +m[2], +(m[3] ?? 0), 0)
    return d.getTime() / 1000 + frac(m[4])
  }
  return null
}

const label = (v: Cell) => (v === null ? 'NULL' : String(v))

const colIndex = colIdx

function lookup(result: QueryResult, names: string[]): number[] | string {
  const idx = names.map((n) => colIndex(result, n))
  const missing = names.filter((_, i) => idx[i] < 0)
  if (missing.length) return `결과에 열 ${missing.join(', ')} 이 없습니다. 있는 열: ${result.columns.map((c) => c.name).join(', ')}`
  return idx
}

/** x 열의 모양: 숫자 열이면 num, 모든 값이 날짜 · 시각이면 time, 아니면 cat */
function xKindOf(result: QueryResult, xi: number): XKind {
  if (result.columns[xi].type === 'number') return 'num'
  const vals = result.rows.map((r) => r[xi]).filter((v) => v !== null)
  if (vals.length && vals.every((v) => parseTime(v) !== null)) return 'time'
  if (vals.length && vals.every((v) => toNum(v) !== null)) return 'num'
  return 'cat'
}

/**
 * 행을 x 하나에 값 여럿인 모양으로 모은다.
 * 시리즈 열이 있으면 그 값마다 시리즈 하나(y 가 여럿이면 "시리즈 · y"), 없으면 y 열마다 시리즈 하나.
 */
const xKeyFn = (xKind: XKind) => (v: Cell) => (xKind === 'time' ? parseTime(v) : xKind === 'num' ? toNum(v) : label(v))

function collect(result: QueryResult, xi: number, yi: number[], si: number, xKind: XKind): { xs: number[]; labels: string[]; series: Series[]; groups: string[] } {
  const keyOf = xKeyFn(xKind)
  const order: (string | number)[] = []
  const seenX = new Map<string | number, string>()
  const names: string[] = []
  const groups: string[] = []
  const cells = new Map<string, Map<string | number, number | null>>()
  for (const row of result.rows) {
    const k = keyOf(row[xi])
    if (k === null) continue
    if (!seenX.has(k)) {
      seenX.set(k, label(row[xi]))
      order.push(k)
    }
    const g = si >= 0 ? label(row[si]) : ''
    if (si >= 0 && !groups.includes(g)) groups.push(g)
    yi.forEach((y) => {
      const name = si < 0 ? result.columns[y].name : yi.length > 1 ? `${g} · ${result.columns[y].name}` : g
      if (!cells.has(name)) {
        cells.set(name, new Map())
        names.push(name)
      }
      cells.get(name)!.set(k, toNum(row[y]))
    })
  }
  if (xKind !== 'cat') order.sort((a, b) => (a as number) - (b as number))
  const xs = xKind === 'cat' ? order.map((_, i) => i) : (order as number[])
  const series = names.map((name, slot) => ({ name, slot, values: order.map((k) => cells.get(name)!.get(k) ?? null) }))
  return { xs, labels: order.map((k) => seenX.get(k)!), series, groups }
}

const capNote = (n: number) => (n > SLOTS ? `시리즈 ${n} 개 중 앞 ${SLOTS} 개만 그립니다. 겹침 변수를 정하면 모두 그립니다.` : undefined)

/** x 마다 값 하나: 그 x 의 행 중 값이 처음 있는 것. keys 는 collect 의 x 순서(cat 은 글자, 나머지는 xs) */
function perX<T>(result: QueryResult, xi: number, ci: number, xKind: XKind, keys: (string | number)[], conv: (v: Cell) => T | null): (T | null)[] {
  const keyOf = xKeyFn(xKind)
  const m = new Map<string | number, T>()
  for (const row of result.rows) {
    const k = keyOf(row[xi])
    if (k === null || m.has(k)) continue
    const v = conv(row[ci])
    if (v !== null) m.set(k, v)
  }
  return keys.map((k) => m.get(k) ?? null)
}

/** x 마다 이름 → 같은 이름이 이어진 구간. breakOnGap 이면 이름 없는 x 에서 끊는다(강조 구간) */
function runsOf(names: (string | null)[], xs: number[], breakOnGap: boolean): { from: number; to: number; name: string }[] {
  const runs: { from: number; to: number; name: string }[] = []
  let prev: string | null = null
  names.forEach((n, i) => {
    if (n === null) {
      if (breakOnGap) prev = null
      return
    }
    const last = runs[runs.length - 1]
    if (last && last.name === n && prev === n) last.to = xs[i]
    else runs.push({ from: xs[i], to: xs[i], name: n })
    prev = n
  })
  return runs
}

/**
 * 선 그래프에 얹는 것을 만든다. 한계 열은 행마다 읽어서 x 마다 한 값으로(STEP 마다 한계가 달라도 된다).
 * 넘은 구간 · 가장 많이 넘은 점은 targets(겹침 모드면 고른 시리즈, 아니면 그린 시리즈 모두)로 본다.
 */
function lineExtras(result: QueryResult, xi: number, xKind: XKind, xs: number[], labels: string[], targets: Series[], spec: ChartSpec, opts: PrepareOpts): LineExtras {
  const keys = xKind === 'cat' ? labels : xs
  const lc = limitCols(result, opts.limits)
  const out: LineExtras = {}
  if (lc.lcl >= 0) out.lcl = perX(result, xi, lc.lcl, xKind, keys, toNum)
  if (lc.ucl >= 0) out.ucl = perX(result, xi, lc.ucl, xKind, keys, toNum)
  const pi = colIndex(result, spec.phase)
  if (pi >= 0) {
    const phases = runsOf(perX(result, xi, pi, xKind, keys, (v) => (v === null ? null : label(v))), xs, false)
    if (phases.length) out.phases = phases
  }
  const bi = colIndex(result, spec.band)
  if (bi >= 0) {
    const bands = runsOf(perX(result, xi, bi, xKind, keys, (v) => (v === null || String(v).trim() === '' ? null : label(v))), xs, true)
    if (bands.length) out.bands = bands
  }
  if (out.lcl || out.ucl) {
    const step = xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 1
    const over: { from: number; to: number }[] = []
    let run: { from: number; to: number } | null = null
    let count = 0
    let best = -Infinity
    let peak: Omit<NonNullable<LineExtras['peak']>, 'width'> | undefined
    xs.forEach((x, i) => {
      const l = out.lcl?.[i] ?? null
      const u = out.ucl?.[i] ?? null
      let hit = false
      for (const s of targets) {
        const v = s.values[i]
        const side = overOf(v, l, u)
        if (!side || v === null) continue
        hit = true
        const limit = (side === 'ucl' ? u : l) as number
        const ex = Math.abs(v - limit)
        if (ex > best) {
          best = ex
          peak = { x, v, limit, side }
        }
      }
      if (hit) {
        count++
        if (run) run.to = x + step / 2
        else {
          run = { from: x - step / 2, to: x + step / 2 }
          over.push(run)
        }
      } else run = null
    })
    if (over.length && peak) {
      out.over = over
      out.peak = { ...peak, width: count * step }
    }
  }
  return out
}

function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

/**
 * 숫자 타일의 열 모양(x 열이 빈 경우): y 열마다 타일 하나. 이름은 적은 열 이름, 값은 첫 행 값.
 * 한 행짜리 요약 쿼리(select count(*) as lot_cnt, max(..) as alarm_max …)를 열마다 보이는 쓰임이다.
 */
function statByColumn(result: QueryResult, spec: ChartSpec, opts: PrepareOpts): Prepared {
  const found = lookup(result, spec.y)
  if (typeof found === 'string') return fail(found)
  const row = result.rows[0]
  const lc = limitCols(result, opts.limits)
  const tiles: StatTile[] = row
    ? found.map((y, i) => {
        const value = toNum(row[y])
        const raw = row[y]
        return {
          label: spec.y[i].trim(),
          value,
          ...(value === null && raw !== null && String(raw).trim() !== '' ? { text: String(raw) } : {}),
          row: 0,
          ...(hasLimits(lc) ? { cmp: lc.value >= 0 ? toNum(row[lc.value]) : value, lcl: rowLimit(row, lc.lcl), ucl: rowLimit(row, lc.ucl) } : {}),
        }
      })
    : []
  const n = result.rows.length
  return { kind: 'stat', tiles: tiles.slice(0, STAT_MAX), note: n > 1 ? `첫 행만 타일로 보입니다(${n} 행 중). 표에서 모두 봅니다.` : undefined }
}

export function prepare(result: QueryResult, spec: ChartSpec, opts: PrepareOpts = {}): Prepared {
  if (spec.y.length === 0) return fail('그래프의 y 열을 정하세요')
  if (spec.type === 'stat' && !spec.x.trim()) return statByColumn(result, spec, opts)
  if (!spec.x.trim()) return fail('그래프의 x 열을 정하세요')
  const found = lookup(result, [spec.x, ...spec.y, ...(spec.series ? [spec.series] : [])])
  if (typeof found === 'string') return fail(found)
  const [xi, ...rest] = found
  const yi = rest.slice(0, spec.y.length)
  const si = spec.series ? rest[spec.y.length] : -1

  switch (spec.type) {
    case 'line':
    case 'step':
    case 'area':
    case 'scatter': {
      const xKind = xKindOf(result, xi)
      const all = collect(result, xi, yi, si, xKind)
      const base = { xKind, xs: all.xs, labels: all.labels }
      const extras = (targets: Series[]) => lineExtras(result, xi, xKind, all.xs, all.labels, targets, spec, opts)
      // 겹침 모드: 같은 축에 모두 깔고, focus 변수 값과 이름이 같은 시리즈만 진하게(맨 위에) 그린다
      if (spec.focus) {
        const value = (opts.focusValue ?? '').trim()
        const shown = all.series.slice(0, OVERLAY_MAX)
        const hit = shown.find((s) => s.name === value)
        const series = [...shown.filter((s) => s !== hit).map((s) => ({ ...s, muted: true })), ...(hit ? [{ ...hit, slot: 0 }] : [])]
        const focus = { var: spec.focus, value, found: !!hit, others: shown.length - (hit ? 1 : 0) }
        const note =
          all.series.length > OVERLAY_MAX
            ? `시리즈 ${all.series.length} 개 중 앞 ${OVERLAY_MAX} 개만 그립니다`
            : hit
              ? undefined
              : `${spec.focus} = ${value || '(비어 있음)'} 인 시리즈가 없어 모두 옅게 그립니다`
        return { kind: 'lines', type: spec.type, panels: [{ data: { ...base, series }, extras: { ...extras(hit ? [hit] : shown), focus } }], note }
      }
      // 시리즈가 넷 이하면 위아래로 나눠 그린다(축 하나에 단위가 다른 값을 겹치지 않는다)
      if (si >= 0 && all.groups.length > 1 && all.groups.length <= 4) {
        const panels = all.groups.map((g, gi) => {
          const series = all.series.filter((s) => (yi.length > 1 ? s.name.startsWith(`${g} · `) : s.name === g)).map((s) => ({ ...s, slot: gi }))
          return { title: g, data: { ...base, series }, extras: extras(series) }
        })
        return { kind: 'lines', type: spec.type, panels }
      }
      const series = all.series.slice(0, SLOTS)
      return { kind: 'lines', type: spec.type, panels: [{ data: { ...base, series }, extras: extras(series) }], note: capNote(all.series.length) }
    }
    case 'bar':
    case 'stacked-bar': {
      const all = collect(result, xi, yi, si, 'cat')
      return {
        kind: 'bars',
        stacked: spec.type === 'stacked-bar',
        data: { xKind: 'cat', xs: all.xs, labels: all.labels, series: all.series.slice(0, SLOTS) },
        yName: yi.map((y) => result.columns[y].name).join(', '),
        note: capNote(all.series.length),
      }
    }
    case 'histogram': {
      // y 첫 열의 값을 구간으로 나눠 센다. 구간 수는 √n (5~30)
      const vals = result.rows.map((r) => toNum(r[yi[0]])).filter((v): v is number => v !== null)
      if (vals.length === 0) return fail(`${spec.y[0]} 열에 숫자가 없습니다`)
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const bins = Math.min(30, Math.max(5, Math.round(Math.sqrt(vals.length))))
      const width = max > min ? (max - min) / bins : 1
      const counts = new Array<number>(bins).fill(0)
      for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - min) / width))]++
      const fmt = (n: number) => String(Math.round(n * 1000) / 1000)
      const labels = counts.map((_, i) => `${fmt(min + i * width)}–${fmt(min + (i + 1) * width)}`)
      return {
        kind: 'bars',
        stacked: false,
        data: { xKind: 'cat', xs: counts.map((_, i) => i), labels, series: [{ name: `${result.columns[yi[0]].name} 개수`, slot: 0, values: counts }] },
        yName: '개수',
      }
    }
    case 'heatmap': {
      // x · y 칸마다 값 하나. y 둘째 열이 값이고, 없으면 행 수를 센다
      const yy = yi[0]
      const vi = yi[1] ?? -1
      const xKey = (v: Cell) => label(v)
      const xs: string[] = []
      const ys: string[] = []
      const acc = new Map<string, number>()
      const first = new Map<string, number>()
      for (const [ri, row] of result.rows.entries()) {
        const a = xKey(row[xi])
        const b = xKey(row[yy])
        if (!xs.includes(a)) xs.push(a)
        if (!ys.includes(b)) ys.push(b)
        const k = `${a}\u0000${b}`
        if (!first.has(k)) first.set(k, ri)
        const v = vi >= 0 ? toNum(row[vi]) : 1
        if (v !== null) acc.set(k, (vi >= 0 ? 0 : (acc.get(k) ?? 0)) + v)
      }
      const numSort = (arr: string[]) => (arr.every((s) => toNum(s) !== null) ? arr.sort((p, q) => Number(p) - Number(q)) : arr)
      numSort(xs)
      numSort(ys)
      const cells: HeatCell[] = []
      for (const [k, v] of acc) {
        const [a, b] = k.split('\u0000')
        cells.push({ xi: xs.indexOf(a), yi: ys.indexOf(b), v, row: first.get(k)! })
      }
      if (cells.length === 0) return fail('그릴 칸이 없습니다')
      const vs = cells.map((c) => c.v)
      return {
        kind: 'heatmap',
        xs,
        ys,
        cells,
        min: Math.min(...vs),
        max: Math.max(...vs),
        xName: result.columns[xi].name,
        yName: result.columns[yy].name,
        vName: vi >= 0 ? result.columns[vi].name : '행 수',
      }
    }
    case 'stat': {
      const xKind = xKindOf(result, xi)
      // 한계: 타일을 만든 행의 LCL · UCL. 견줄 값은 limits.value 열, 없으면 타일 값
      const lc = limitCols(result, opts.limits)
      const lim = (ri: number | undefined, value: number | null) => {
        if (!hasLimits(lc) || ri === undefined) return {}
        const row = result.rows[ri]
        return { cmp: lc.value >= 0 ? toNum(row[lc.value]) : value, lcl: rowLimit(row, lc.lcl), ucl: rowLimit(row, lc.ucl) }
      }
      if (xKind === 'time') {
        // 시간 열: y(시리즈가 있으면 시리즈 값)마다 타일 하나. 큰 숫자는 마지막 값
        const all = collect(result, xi, yi, si, 'time')
        // 시리즈마다 시각이 가장 늦은 행(한계 · 눌러서 변수 넣기에 쓴다)
        const lastRow = new Map<string, { t: number; ri: number }>()
        result.rows.forEach((row, ri) => {
          const t = parseTime(row[xi])
          if (t === null) return
          const g = si >= 0 ? label(row[si]) : ''
          for (const y of yi) {
            const name = si < 0 ? result.columns[y].name : yi.length > 1 ? `${g} · ${result.columns[y].name}` : g
            const cur = lastRow.get(name)
            if (!cur || t >= cur.t) lastRow.set(name, { t, ri })
          }
        })
        const tiles = all.series.slice(0, STAT_MAX).map((s) => {
          const idx = s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0)
          const first = idx[0]
          const last = idx[idx.length - 1]
          const value = last === undefined ? null : s.values[last]
          const ri = lastRow.get(s.name)?.ri
          return {
            label: s.name,
            value,
            spark: s.values,
            row: ri,
            ...lim(ri, value),
            ...(idx.length > 1 && value !== null ? { delta: value - (s.values[first] as number), from: all.labels[first] } : {}),
          }
        })
        return { kind: 'stat', tiles, note: all.series.length > STAT_MAX ? `타일 ${all.series.length} 개 중 앞 ${STAT_MAX} 개만 보입니다` : undefined }
      }
      // 이름 열: 행마다 타일. y 가 여럿이면 "이름 · y". 값이 숫자가 아닌 글자면 그 글자(상태)를 보인다
      const tiles: StatTile[] = []
      result.rows.forEach((row, ri) => {
        for (const y of yi) {
          const value = toNum(row[y])
          const raw = row[y]
          tiles.push({
            label: yi.length > 1 ? `${label(row[xi])} · ${result.columns[y].name}` : label(row[xi]),
            value,
            ...(value === null && raw !== null && String(raw).trim() !== '' ? { text: String(raw) } : {}),
            row: ri,
            ...lim(ri, value),
          })
        }
      })
      return { kind: 'stat', tiles: tiles.slice(0, STAT_MAX), note: tiles.length > STAT_MAX ? `타일 ${tiles.length} 개 중 앞 ${STAT_MAX} 개만 보입니다. 표에서 모두 봅니다.` : undefined }
    }
    case 'box': {
      // x 값마다 y 첫 열의 분포: 사분위 · 1.5 IQR 수염 · 바깥 점
      const by = new Map<string, number[]>()
      for (const row of result.rows) {
        const v = toNum(row[yi[0]])
        if (v === null) continue
        const g = label(row[xi])
        if (!by.has(g)) by.set(g, [])
        by.get(g)!.push(v)
      }
      if (by.size === 0) return fail(`${spec.y[0]} 열에 숫자가 없습니다`)
      const groups = [...by].slice(0, 40).map(([name, raw]) => {
        const s = [...raw].sort((a, b) => a - b)
        const q1 = quantile(s, 0.25)
        const q3 = quantile(s, 0.75)
        const fence = 1.5 * (q3 - q1)
        const inside = s.filter((v) => v >= q1 - fence && v <= q3 + fence)
        return { name, n: s.length, q1, med: quantile(s, 0.5), q3, lo: inside[0] ?? q1, hi: inside[inside.length - 1] ?? q3, outliers: s.filter((v) => v < q1 - fence || v > q3 + fence) }
      })
      return {
        kind: 'box',
        groups,
        xName: result.columns[xi].name,
        yName: result.columns[yi[0]].name,
        note: by.size > 40 ? `묶음 ${by.size} 개 중 앞 40 개만 그립니다` : undefined,
      }
    }
  }
}

/** 0 을 포함하는 보기 좋은 눈금 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step)
  return out
}

export function fmtNum(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e6) return `${Math.round(v / 1e5) / 10}M`
  if (a >= 1e4) return `${Math.round(v / 100) / 10}k`
  if (a >= 100) return String(Math.round(v))
  return String(Math.round(v * 1000) / 1000)
}

/** 툴팁 값: 축 눈금과 달리 반올림하지 않는다(소수 넷째 자리까지) */
export function fmtVal(v: number): string {
  return Math.abs(v) >= 1e6 ? v.toExponential(3) : String(Math.round(v * 1e4) / 1e4)
}
