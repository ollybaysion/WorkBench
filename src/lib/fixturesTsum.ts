import type { Cell } from '../types'
import { col, ok, PARAMS, rng, type FdcFixture, type Param, type Vars } from './fixturesFdc'

// TSUM 확인 작업판의 가짜 결과. TSUM 은 trace 의 한 구간(recipe · start step ~ end step)을 통계 하나로 줄인 값이다.
// 변수(lot_id · wafer · tsum_id · sensor)에 따라 결과가 바뀐다. 같은 변수면 같은 결과(시드 고정).
// 이야기: L2611-07 의 W12 는 STEP 3 에서 420 ms 동안 RF 반사파가 튀고 VPP 가 처진다(T01 · T06 이 기준을 넘는다).
//        W7 은 수집기가 1.2 초 늦게 받아서 저장된 T02 가 trace 로 다시 계산한 값과 다르다.

/** TSUM 기준 정보: id · recipe · 센서 · start step · end step · 통계 · LSL · USL */
interface Item {
  id: string
  recipe: string
  sensor: string
  start: number
  end: number
  stat: 'MAX' | 'MIN' | 'AVG' | 'RANGE'
  lsl: number
  usl: number
}
const I = (id: string, sensor: string, start: number, end: number, stat: Item['stat'], lsl: number, usl: number): Item => ({ id, recipe: 'ETCH_A', sensor, start, end, stat, lsl, usl })
const ITEMS: Item[] = [
  I('T01', 'RF_REF_PWR', 3, 3, 'MAX', 5, 50),
  I('T02', 'RF_REF_PWR', 2, 3, 'AVG', 10, 40),
  I('T03', 'CH_PRESSURE', 2, 3, 'AVG', 25, 38),
  I('T04', 'ESC_HE_PRESS', 3, 3, 'RANGE', 0, 1.5),
  I('T05', 'MFC1_FLOW', 3, 3, 'AVG', 195, 205),
  I('T06', 'RF_VPP', 3, 3, 'MIN', 1000, 1400),
]
const itemOf = (id: string) => ITEMS.find((i) => i.id === id.trim().toUpperCase()) ?? ITEMS[0]
const paramOf = (name: string): Param => PARAMS.find((p) => p.name === name.trim().toUpperCase()) ?? PARAMS[1]

/** 구간 통계 카드가 보여 줄 센서 */
const SENSORS = ['RF_FWD_PWR', 'RF_REF_PWR', 'RF_VPP', 'CH_PRESSURE', 'APC_ANGLE', 'MFC1_FLOW', 'ESC_HE_PRESS', 'ESC_TEMP']

/** ETCH_A 의 STEP 길이(ms): 1 램프업 · 2 안정화 · 3 식각 · 4 디척 */
const STEP_MS = [12000, 18000, 32000, 8000]
const SAMPLE_MS = 100
const SPIKE_SLOT = 12
const LATE_SLOT = 7

const waferNum = (v: Vars) => Math.min(25, Math.max(1, Number(v.wafer) || 1))
const lotOf = (v: Vars) => (v.lot_id ?? '').trim() || 'L2611-07'

/** 웨이퍼 하나의 시간 틀: 시작 시각(ms) · STEP 경계(시작부터 ms) · 샘플 시각 */
interface Frame {
  t0: number
  bounds: number[] // STEP 1 시작 · 2 시작 · 3 시작 · 4 시작 · 끝
  ts: number[] // 시작부터 ms
}
const frames = new Map<string, Frame>()
function frameOf(lot: string, slot: number): Frame {
  const key = `${lot}|${slot}`
  const hit = frames.get(key)
  if (hit) return hit
  const rnd = rng(`${key}|frame`)
  const t0 = new Date(2026, 10, 10, 14, 31, 0).getTime() + (slot - 1) * 95000 + Math.floor(rnd() * 900)
  const bounds = [0]
  for (const d of STEP_MS) bounds.push(bounds[bounds.length - 1] + d + Math.floor((rnd() - 0.5) * 600))
  // 샘플: 100 ms 마다, 수집 지터 0~40 ms
  const ts: number[] = []
  for (let t = 0; t < bounds[4]; t += SAMPLE_MS) ts.push(t + Math.floor(rnd() * 40))
  const f = { t0, bounds, ts }
  frames.set(key, f)
  return f
}
const stepAt = (f: Frame, t: number) => (t < f.bounds[1] ? 1 : t < f.bounds[2] ? 2 : t < f.bounds[3] ? 3 : 4)

/** 스파이크(W12, STEP 3 시작 + 15.2 초부터 420 ms) */
const spikeAt = (f: Frame) => f.bounds[2] + 15200
const SPIKE_LEN = 420

const round = (v: number, dec: number) => Math.round(v * 10 ** (dec + 2)) / 10 ** (dec + 2)

const traces = new Map<string, number[]>()
/** 센서 하나의 trace(ts 와 같은 길이) */
function traceOf(lot: string, slot: number, p: Param): number[] {
  const key = `${lot}|${slot}|${p.name}`
  const hit = traces.get(key)
  if (hit) return hit
  const f = frameOf(lot, slot)
  const rnd = rng(`${key}|trace`)
  const s = (p.ucl - p.lcl) / 60
  const off = (rng(`${key}|off`)() - 0.5) * 3 * s
  const sp = spikeAt(f)
  const ys = f.ts.map((t) => {
    const n = (rnd() - 0.5) * 1.6 * s
    const st = stepAt(f, t)
    let v: number
    if (st === 1) v = p.nominal * (1 - Math.exp(-t / 2500)) * 0.92
    else if (st === 2) {
      const u = (t - f.bounds[1]) / 1000
      v = p.nominal + off + 3 * s * Math.exp(-u / 3) * Math.cos(u * 2.1)
    } else if (st === 3) v = p.nominal + off
    else v = p.nominal * 0.1
    v += n
    if (lot === 'L2611-07' && slot === SPIKE_SLOT && t >= sp && t < sp + SPIKE_LEN) {
      const k = Math.sin((Math.PI * (t - sp)) / SPIKE_LEN)
      if (p.name === 'RF_REF_PWR') v += (78 - p.nominal) * k
      if (p.name === 'RF_VPP') v -= 215 * k
      if (p.name === 'MATCH_C1') v += 9 * k
    }
    return round(v, p.dec)
  })
  traces.set(key, ys)
  return ys
}

/** 구간 [start, end] STEP 의 값들 */
function windowVals(lot: string, slot: number, sensor: string, start: number, end: number): number[] {
  const f = frameOf(lot, slot)
  const ys = traceOf(lot, slot, paramOf(sensor))
  return ys.filter((_, i) => {
    const st = stepAt(f, f.ts[i])
    return st >= start && st <= end
  })
}

interface Stat {
  n: number
  avg: number
  min: number
  max: number
  std: number
}
function statOf(vs: number[]): Stat {
  const n = vs.length
  const avg = vs.reduce((a, b) => a + b, 0) / n
  const min = Math.min(...vs)
  const max = Math.max(...vs)
  const std = Math.sqrt(vs.reduce((a, v) => a + (v - avg) ** 2, 0) / Math.max(1, n - 1))
  return { n, avg, min, max, std }
}
const pickStat = (s: Stat, stat: Item['stat']) => (stat === 'MAX' ? s.max : stat === 'MIN' ? s.min : stat === 'AVG' ? s.avg : s.max - s.min)
const r4 = (v: number) => Math.round(v * 1e4) / 1e4

/** trace 로 다시 계산한 TSUM 값 */
const recalc = (lot: string, slot: number, it: Item) => r4(pickStat(statOf(windowVals(lot, slot, it.sensor, it.start, it.end)), it.stat))
/** 저장된 TSUM 값. W7 의 T02 는 수집기 지연으로 앞 1.2 초가 빠진 채 계산되었다 */
function stored(lot: string, slot: number, it: Item): number {
  const v = recalc(lot, slot, it)
  if (lot === 'L2611-07' && slot === LATE_SLOT && it.id === 'T02') return r4(v + 0.8417)
  return v
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
/** 'YYYY-MM-DD HH:MI:SS.FF3' */
function tsText(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** 챔버 이력: 한 웨이퍼의 이벤트(시작부터 ms · 이벤트 · STEP · 내용) */
function waferEvents(lot: string, slot: number): [number, string, number | null, string][] {
  const f = frameOf(lot, slot)
  const b = f.bounds
  const ev: [number, string, number | null, string][] = [
    [-6200, 'WAFER_IN', null, `${lot} W${slot} · slot ${slot}`],
    [-1800, 'RECIPE_START', null, 'ETCH_A rev 14'],
    [b[0], 'STEP_START', 1, 'RAMP UP'],
    [b[1], 'STEP_START', 2, 'STABILIZE'],
    [b[1] + 2400, 'APC_HOLD', 2, 'APC angle 41.0 %'],
    [b[2], 'STEP_START', 3, 'MAIN ETCH'],
    [b[3], 'STEP_START', 4, 'DECHUCK'],
    [b[4], 'RECIPE_END', null, 'ETCH_A rev 14'],
    [b[4] + 2900, 'WAFER_OUT', null, `${lot} W${slot}`],
  ]
  if (lot === 'L2611-07' && slot === SPIKE_SLOT) {
    const sp = spikeAt(f)
    ev.push([sp + 35, 'MATCH_TUNE_RETRY', 3, 'C1 48.2 → 57.1 %, 반사파 78 W'], [sp + 380, 'MATCH_TUNE_OK', 3, 'C1 57.1 → 48.6 %'])
  }
  if (lot === 'L2611-07' && slot === LATE_SLOT) ev.push([b[1] + 40, 'COLLECTOR_DELAY', 2, '버퍼 지연 1 240 ms · 그 사이 샘플은 늦게 들어옴'])
  return ev.sort((x, y) => x[0] - y[0])
}

export const tsumFixtures: Record<string, (v: Vars) => FdcFixture> = {
  card_tsum_items: () =>
    ok(
      300,
      [col('tsum_id'), col('recipe'), col('sensor'), col('start_step', 'number'), col('end_step', 'number'), col('stat'), col('lsl', 'number'), col('usl', 'number')],
      ITEMS.map((i) => [i.id, i.recipe, i.sensor, i.start, i.end, i.stat, i.lsl, i.usl]),
    ),

  card_tsum_wafers: (v) => {
    const lot = lotOf(v)
    const it = itemOf(v.tsum_id ?? '')
    return ok(
      500,
      [col('slot', 'number'), col('tsum_value', 'number'), col('lsl', 'number'), col('usl', 'number'), col('calc_ts')],
      Array.from({ length: 25 }, (_, k) => {
        const slot = k + 1
        const f = frameOf(lot, slot)
        return [slot, stored(lot, slot, it), it.lsl, it.usl, tsText(f.t0 + f.bounds[4] + 1500).slice(11)]
      }),
    )
  },

  card_tsum_value: (v) => {
    const lot = lotOf(v)
    const slot = waferNum(v)
    const it = itemOf(v.tsum_id ?? '')
    const a = stored(lot, slot, it)
    const b = recalc(lot, slot, it)
    return ok(
      400,
      [col('k'), col('v', 'number'), col('lsl', 'number'), col('usl', 'number')],
      [
        [`저장 ${it.id} ${it.stat}`, a, it.lsl, it.usl],
        ['trace 로 다시 계산', b, it.lsl, it.usl],
        ['차이', r4(a - b), null, null],
      ],
    )
  },

  card_tsum_trace: (v) => {
    const lot = lotOf(v)
    const slot = waferNum(v)
    const it = itemOf(v.tsum_id ?? '')
    const p = paramOf(v.sensor ?? it.sensor)
    const f = frameOf(lot, slot)
    const ys = traceOf(lot, slot, p)
    const rows: Cell[][] = f.ts.map((t, i) => {
      const st = stepAt(f, t)
      return [tsText(f.t0 + t), ys[i], `STEP ${st}`, st >= it.start && st <= it.end ? `TSUM ${it.id} · STEP ${it.start}~${it.end}` : null]
    })
    return ok(700, [col('ts'), col('value', 'number'), col('step_nm'), col('tsum_win')], rows)
  },

  card_tsum_stats: (v) => {
    const lot = lotOf(v)
    const slot = waferNum(v)
    const it = itemOf(v.tsum_id ?? '')
    const f = frameOf(lot, slot)
    const winMs = f.bounds[it.end] - f.bounds[it.start - 1]
    return ok(
      600,
      [col('sensor'), col('n', 'number'), col('avg', 'number'), col('min', 'number'), col('max', 'number'), col('max_min', 'number'), col('std', 'number'), col('win_ms', 'number')],
      SENSORS.map((name) => {
        const s = statOf(windowVals(lot, slot, name, it.start, it.end))
        return [name, s.n, r4(s.avg), s.min, s.max, r4(s.max - s.min), r4(s.std), winMs]
      }),
    )
  },

  card_tsum_ctx: (v) => {
    const lot = lotOf(v)
    const slot = waferNum(v)
    const rows: Cell[][] = []
    for (const s of [slot - 1, slot, slot + 1]) {
      if (s < 1 || s > 25) continue
      const f = frameOf(lot, s)
      for (const [t, ev, st, detail] of waferEvents(lot, s)) rows.push([tsText(f.t0 + t), s, ev, st, detail])
    }
    return ok(400, [col('ts'), col('slot', 'number'), col('event'), col('step', 'number'), col('detail')], rows)
  },
}
