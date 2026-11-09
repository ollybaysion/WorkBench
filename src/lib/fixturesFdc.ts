import type { Cell, Column, QueryResult } from '../types'

// FDC 확인 작업판의 가짜 결과 — mockups/fdc/index.html · mockups/stat/many.html 의 값을 옮겼다.
// 변수(lot_id · wafer · param · step)에 따라 결과가 바뀐다. 같은 변수면 같은 결과(시드 고정).

type Vars = Record<string, string>
export type FdcFixture = { delayMs: number; result: QueryResult }

const col = (name: string, type: Column['type'] = 'string'): Column => ({ name, type })
const ok = (delayMs: number, columns: Column[], rows: Cell[][]): FdcFixture => ({ delayMs, result: { columns, rows, truncated: false, elapsedMs: delayMs } })

/** 파라미터(SVID): 이름 · 묶음 · 평소 값 · 단위 · LCL · UCL · 소수 자리 */
interface Param {
  name: string
  group: string
  nominal: number
  unit: string
  lcl: number
  ucl: number
  dec: number
}
const P = (name: string, group: string, nominal: number, unit: string, lcl: number, ucl: number, dec: number): Param => ({ name, group, nominal, unit, lcl, ucl, dec })
export const PARAMS: Param[] = [
  P('RF_FWD_PWR', 'RF', 512, 'W', 400, 600, 0),
  P('RF_REF_PWR', 'RF', 25, 'W', 5, 50, 1),
  P('RF_VPP', 'RF', 1182, 'V', 900, 1400, 0),
  P('RF_VDC', 'RF', -312, 'V', -400, -200, 0),
  P('MATCH_C1', 'RF', 48.2, '%', 20, 80, 1),
  P('MATCH_C2', 'RF', 61.5, '%', 20, 80, 1),
  P('RF_FREQ', 'RF', 13.56, 'MHz', 13.5, 13.62, 2),
  P('BIAS_PWR', 'RF', 248, 'W', 150, 300, 0),
  P('MFC1_FLOW', '가스', 199.6, 'sccm', 190, 210, 1),
  P('MFC2_FLOW', '가스', 49.8, 'sccm', 45, 55, 1),
  P('MFC3_FLOW', '가스', 9.9, 'sccm', 8, 12, 1),
  P('MFC4_FLOW', '가스', 4.6, 'sccm', 0, 5, 1),
  P('O2_FLOW', '가스', 20.4, 'sccm', 18, 22, 1),
  P('AR_FLOW', '가스', 300.2, 'sccm', 280, 320, 1),
  P('CH_PRESSURE', '압력', 31.2, 'mT', 20, 45, 1),
  P('APC_ANGLE', '압력', 41.0, '%', 10, 70, 1),
  P('FORELINE_P', '압력', 182, 'mT', 100, 250, 0),
  P('ESC_HE_PRESS', '압력', 14.2, 'Torr', 8, 15, 1),
  P('ESC_HE_FLOW', '압력', 3.2, 'sccm', 1, 6, 1),
  P('TMP_SPEED', '압력', 99.5, '%', 95, 100, 1),
  P('CHILLER_TEMP', '온도', 20.1, '°C', 18, 23, 1),
  P('ESC_TEMP', '온도', 45.3, '°C', 40, 50, 1),
  P('WALL_TEMP', '온도', 60.2, '°C', 55, 65, 1),
  P('LID_TEMP', '온도', 80.1, '°C', 70, 90, 1),
  P('GDP_TEMP', '온도', 72.4, '°C', 65, 80, 1),
  P('ESC_ZONE2_T', '온도', 46.0, '°C', 40, 50, 1),
  P('ESC_VOLT', '기구', 2480, 'V', 2000, 2600, 0),
  P('ESC_CURR', '기구', 312, 'uA', 100, 400, 0),
  P('LIFT_PIN_POS', '기구', 0.02, 'mm', 0, 0.1, 2),
  P('EPD_SIGNAL', '기구', 0.82, 'a.u.', 0.2, 1.0, 2),
]
const paramOf = (name: string) => PARAMS.find((p) => p.name === name.trim().toUpperCase()) ?? PARAMS[1]

/** 로트: 이름 · 시작 · 알람 수 · 튄 웨이퍼(RF_REF_PWR 가 UCL 을 넘는다) · 튄 높이 */
const LOTS: [string, string, number, number, number][] = [
  ['L2611-07', '11-10 14:31', 1, 12, 80.3],
  ['L2611-06', '11-10 13:48', 1, 7, 53.1],
  ['L2611-05', '11-10 13:02', 0, 0, 0],
]
const lotOf = (lot: string) => LOTS.find((l) => l[0] === lot.trim()) ?? [lot.trim(), '-', 0, 0, 0]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed: string) {
  let s = hash(seed) % 2147483647 || 1
  return () => (s = (s * 48271) % 2147483647) / 2147483647
}

/** 0.5 초마다 90 초. STEP 1 램프업 · 2 안정화 · 3 식각 · 4 디척 */
const T = Array.from({ length: 181 }, (_, i) => i * 0.5)
const stepOf = (t: number) => (t < 20 ? 1 : t < 55 ? 2 : t < 86 ? 3 : 4)
/** 한계는 STEP 2 · 3 에만 건다(램프업 · 디척은 값이 0 근처를 지난다) */
const limited = (st: number) => st === 2 || st === 3

const round = (v: number, dec: number) => Math.round(v * 10 ** (dec + 1)) / 10 ** (dec + 1)

const cache = new Map<string, number[]>()
/** 웨이퍼 하나의 파형. 모양은 시안 그대로, 크기는 파라미터 범위에 맞춘다 */
function wave(lot: string, param: Param, slot: number): number[] {
  const key = `${lot}|${param.name}|${slot}`
  const hit = cache.get(key)
  if (hit) return hit
  const rnd = rng(key)
  const s = (param.ucl - param.lcl) / 45
  const off = (rng(`${lot}|${param.name}|off|${slot}`)() - 0.5) * 4.5
  let ys = T.map((t) => {
    const n = ((rnd() - 0.5) * 1.2 + off) * s
    if (t < 20) return param.nominal * (1 - Math.exp(-t / 5)) * 0.92 + n
    if (t < 55) return param.nominal - s + (2.2 * Math.exp(-((t - 31) ** 2) / 2) - 2 * Math.exp(-((t - 41) ** 2) / 1.5) + 1.5 * Math.exp(-((t - 47) ** 2) / 2)) * s + n
    if (t < 86) return param.nominal + n
    return param.nominal * 0.12 + n * 0.5
  })
  const [, , , spike, peak] = lotOf(lot)
  if (param.name === 'RF_REF_PWR' && slot === spike) {
    // 시안의 W12: 59 초부터 3.5 초 동안 치솟고, 천천히 내려오다 75 초에 떨어진다
    const long = peak > 70
    ys = ys.map((b, i) => {
      const t = T[i]
      if (t < 59) return b
      if (t < 62.5) return b + (peak - b) * ((t - 59) / 3.5)
      if (long && t < 74) return peak - (t - 62.5) * 0.85 + (rnd() - 0.5)
      if (long && t < 75) return 70 - (t - 74) * 45
      if (!long && t < 64) return peak - (t - 62.5) * 4
      return b
    })
  }
  const out = ys.map((v) => round(v, param.dec))
  cache.set(key, out)
  return out
}

const stepVals = (ys: number[], step: number) => ys.filter((_, i) => stepOf(T[i]) === step)
const maxIn = (lot: string, param: Param, slot: number, step: number) => Math.max(...stepVals(wave(lot, param, slot), step))
const stepNum = (v: Vars) => Math.min(4, Math.max(1, Number(v.step) || 3))
const waferNum = (v: Vars) => Math.min(25, Math.max(1, Number(v.wafer) || 1))

function slope(ys: number[]): number {
  const n = ys.length
  const mx = (n - 1) / 2
  const my = ys.reduce((a, b) => a + b, 0) / n
  const num = ys.reduce((a, v, i) => a + (i - mx) * (v - my), 0)
  const den = ys.reduce((a, _, i) => a + (i - mx) ** 2, 0)
  return num / den / 0.5 // 점 간격 0.5 초 → 초당
}

// 알람 규칙: 파라미터 · STEP · 지속 · 조치 (심한 순)
const RULES: [string, number, string][] = [
  ['RF_REF_PWR', 3, 'CHAMBER DOWN'],
  ['RF_FWD_PWR', 3, 'CHAMBER DOWN'],
  ['CH_PRESSURE', 5, 'LOT HOLD'],
  ['MFC1_FLOW', 5, 'LOT HOLD'],
  ['ESC_HE_PRESS', 10, '알림'],
  ['CHILLER_TEMP', 30, '알림'],
]
const BOARD_PARAMS = ['RF_FWD_PWR', 'RF_REF_PWR', 'RF_VPP', 'CH_PRESSURE', 'APC_ANGLE', 'MFC1_FLOW', 'ESC_HE_PRESS', 'CHILLER_TEMP']

/** 넘은 시간(초): 고른 STEP 에서 UCL 위 · LCL 아래였던 점 수 × 0.5 */
function overSec(lot: string, param: Param, slot: number): number {
  const ys = wave(lot, param, slot)
  return ys.filter((v, i) => limited(stepOf(T[i])) && (v > param.ucl || v < param.lcl)).length * 0.5
}

export const fdcFixtures: Record<string, (v: Vars) => FdcFixture> = {
  card_fdc_lots: () =>
    ok(
      200,
      [col('lot_id'), col('wafers', 'number'), col('started'), col('alarms', 'number')],
      LOTS.map(([lot, started, alarms]) => [lot, 25, started, alarms]),
    ),

  card_fdc_wmap: (v) => {
    const param = paramOf(v.param ?? '')
    const step = stepNum(v)
    const rows: Cell[][] = []
    for (let slot = 1; slot <= 25; slot++) rows.push([(slot - 1) % 5, 4 - Math.floor((slot - 1) / 5), maxIn(v.lot_id ?? '', param, slot, step), slot])
    return ok(400, [col('col', 'number'), col('row_no', 'number'), col('mx', 'number'), col('slot', 'number')], rows)
  },

  card_fdc_params: (v) => {
    const lot = v.lot_id ?? ''
    const slot = waferNum(v)
    const step = stepNum(v)
    const rows = BOARD_PARAMS.map((name) => {
      const p = paramOf(name)
      const mx = maxIn(lot, p, slot, step)
      return { p, mx, k: (mx - p.lcl) / (p.ucl - p.lcl) }
    })
      .sort((a, b) => b.k - a.k)
      .map(({ p, mx }) => [p.name, mx, p.lcl, p.ucl])
    return ok(300, [col('param'), col('mx', 'number'), col('lcl', 'number'), col('ucl', 'number')], rows)
  },

  card_fdc_trace: (v) => {
    const lot = v.lot_id ?? ''
    const p = paramOf(v.param ?? '')
    const rows: Cell[][] = []
    for (let slot = 1; slot <= 25; slot++) {
      const ys = wave(lot, p, slot)
      T.forEach((t, i) => {
        const st = stepOf(t)
        rows.push([t, slot, ys[i], `STEP ${st}`, limited(st) ? p.lcl : null, limited(st) ? p.ucl : null])
      })
    }
    return ok(1100, [col('ts_sec', 'number'), col('slot', 'number'), col('value', 'number'), col('step_nm'), col('lcl', 'number'), col('ucl', 'number')], rows)
  },

  card_fdc_summary: (v) => {
    const p = paramOf(v.param ?? '')
    const ys = stepVals(wave(v.lot_id ?? '', p, waferNum(v)), stepNum(v))
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length
    const sl = (p.ucl - p.lcl) / 20
    return ok(
      300,
      [col('k'), col('v', 'number'), col('lcl', 'number'), col('ucl', 'number')],
      [
        ['MEAN', round(mean, p.dec), p.lcl, p.ucl],
        ['MAX', Math.max(...ys), p.lcl, p.ucl],
        ['SLOPE', round(slope(ys), 2), round(-sl, 2), round(sl, 2)],
      ],
    )
  },

  card_fdc_status: () => {
    const p = paramOf('RF_REF_PWR')
    const peak = maxIn('L2611-07', p, 12, 3)
    return ok(
      200,
      [col('what'), col('status'), col('value', 'number'), col('ucl', 'number'), col('over_sec', 'number'), col('action'), col('ts')],
      [[`RF_REF_PWR · W12 · ${overSec('L2611-07', p, 12)} s · CHAMBER DOWN`, 'FAULT', peak, p.ucl, overSec('L2611-07', p, 12), 'CHAMBER DOWN', '11-10 14:37:12']],
    )
  },

  card_fdc_rules: (v) => {
    const lot = v.lot_id ?? ''
    const slot = waferNum(v)
    return ok(
      200,
      [col('param'), col('step'), col('lcl', 'number'), col('ucl', 'number'), col('duration_s', 'number'), col('action'), col('w_max', 'number')],
      RULES.map(([name, dur, action]) => {
        const p = paramOf(name)
        return [p.name, '2 · 3', p.lcl, p.ucl, dur, action, maxIn(lot, p, slot, 3)]
      }),
    )
  },

  card_fdc_alarms: () =>
    ok(
      300,
      [col('ts'), col('lot_id'), col('slot', 'number'), col('param'), col('action')],
      [
        ['11-10 14:37:12', 'L2611-07', 12, 'RF_REF_PWR', 'CHAMBER DOWN'],
        ['11-10 13:55:40', 'L2611-06', 7, 'RF_REF_PWR', '알림'],
        ['11-07 09:12:05', 'L2609-03', 3, 'CH_PRESSURE', 'LOT HOLD'],
        ['11-02 22:40:51', 'L2604-11', 18, 'ESC_HE_PRESS', '알림'],
        ['10-29 17:03:22', 'L2598-02', 21, 'MFC1_FLOW', 'LOT HOLD'],
        ['10-21 08:44:10', 'L2590-07', 9, 'CHILLER_TEMP', '알림'],
      ],
    ),

  card_fdc_svid30: (v) => {
    const lot = v.lot_id ?? ''
    const slot = waferNum(v)
    const step = stepNum(v)
    return ok(
      500,
      [col('svid'), col('grp'), col('value', 'number'), col('unit'), col('lcl', 'number'), col('ucl', 'number')],
      PARAMS.map((p) => [p.name, p.group, maxIn(lot, p, slot, step), p.unit, p.lcl, p.ucl]),
    )
  },
}
