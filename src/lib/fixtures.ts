import type { Cell, Column, QueryResult } from '../types'

// 가짜 결과 — mockups/kit.py 의 ALARM_MORE · TEMP · PRESS · TABLES · LOTS · DIST 를 옮겼다. 키는 시드 카드 id.

export type Fixture = { delayMs: number; result: QueryResult } | { delayMs: number; error: string }

const col = (name: string, type: Column['type'] = 'string'): Column => ({ name, type })
const ok = (delayMs: number, columns: Column[], rows: Cell[][], truncated = false): Fixture => ({
  delayMs,
  result: { columns, rows, truncated, elapsedMs: delayMs },
})
const pad = (n: number) => String(n).padStart(2, '0')
const r1 = (v: number) => Math.round(v * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000

// 알람 이력: level 순 · ts 역순. 결과는 10000 행에서 잘렸다(알람 폭주)
const alarmRows: Cell[][] = [
  ['14:37:02', 'E-9001', 'CRIT', 'TEMP 상한 초과'],
  ['14:52:57', 'E-4471', 'WARN', null],
  ['14:52:41', 'E-4471', 'WARN', '챔버 압력 높음'],
  ['14:44:19', 'E-3105', 'WARN', '가스 유량 낮음'],
  ['14:37:40', 'E-4471', 'WARN', '챔버 압력 높음'],
  ['14:26:33', 'E-4471', 'WARN', '챔버 압력 높음'],
  ['14:09:48', 'E-4471', 'WARN', '챔버 압력 높음'],
  ['14:02:11', 'E-4471', 'WARN', '챔버 압력 높음'],
]
for (let i = 0; i < 30; i++) {
  const s = 2 * 60 + 11 - (i + 1) * 4
  const warn = i % 5 !== 0
  alarmRows.push([`14:${pad(Math.floor(s / 60))}:${pad(s % 60)}`, warn ? 'E-4471' : 'E-2210', warn ? 'WARN' : 'INFO', warn ? '챔버 압력 높음' : '도어 열림'])
}

// 센서 트렌드 60 점(14:00~14:59), 14:37 TEMP 튐
const TEMP = Array.from({ length: 60 }, (_, i) => r1(180.6 + 0.9 * Math.sin(i / 4) + 0.4 * Math.sin(i * 1.7)))
TEMP[37] = 196.2
TEMP[38] = 188.4
TEMP[39] = 182.9
const PRESS = Array.from({ length: 60 }, (_, i) => r3(2.41 + 0.025 * Math.sin(i / 5 + 1) + 0.01 * Math.sin(i * 2.3)))
PRESS[37] = 2.33
PRESS[38] = 2.36
const traceRows: Cell[][] = []
for (let i = 0; i < 60; i++) {
  traceRows.push([`14:${pad(i)}:00`, 'TEMP', TEMP[i]], [`14:${pad(i)}:00`, 'PRESS', PRESS[i]])
}

// 웨이퍼 맵: 지름 15 다이 원 안. 오른쪽 위 가장자리에 결함이 몰린다
const waferRows: Cell[][] = []
for (let x = 0; x < 15; x++)
  for (let y = 0; y < 15; y++) {
    const dx = x - 7
    const dy = y - 7
    if (dx * dx + dy * dy > 52) continue
    const hot = Math.max(0, 6 - Math.hypot(x - 11.5, y - 11))
    waferRows.push([x, y, Math.round(hot * 1.6 + ((x * 7 + y * 13) % 5 === 0 ? 1 : 0))])
  }
const LOTS: Cell[][] = [
  ['14:00', 12],
  ['14:10', 11],
  ['14:20', 13],
  ['14:30', 0],
  ['14:40', 9],
  ['14:50', 12],
]
const DIST: Cell[][] = [
  ['E-4471', 539, 42],
  ['E-3105', 231, 18],
  ['E-2210', 180, 14],
  ['E-9001', 141, 11],
  ['E-1802', 116, 9],
  ['기타', 77, 6],
]

const logRows: Cell[][] = [
  ['14:52:58', 'ERROR', 'collector: E-4471 message empty (EQP-A12)'],
  ['14:37:03', 'FATAL', 'collector: TEMP 196.2 over limit, lot LT2610-0417 aborted'],
  ['14:37:02', 'ERROR', 'alarm-sink: write timeout 30 s (FDC-L1)'],
  ['14:12:40', 'ERROR', 'recipe-sync: RCP-A12 v8 checksum mismatch'],
]

export const fixtures: Record<string, Fixture> = {
  card_alarm_hist: ok(400, [col('ts'), col('alarm_cd'), col('level'), col('message')], alarmRows, true),
  card_sensor_trace: ok(900, [col('ts'), col('snsr_id'), col('value', 'number')], traceRows),
  card_recipe_chg: ok(
    200,
    [col('before'), col('after'), col('who'), col('ts')],
    [
      ['RCP-A12 v7', 'RCP-A12 v8', 'kim.j', '10-28 13:52'],
      ['TEMP_SP 180', 'TEMP_SP 182', 'kim.j', '10-28 13:52'],
      ['STEP3 45 s', 'STEP3 50 s', 'lee.s', '10-27 09:10'],
    ],
  ),
  card_lot_count: ok(300, [col('ts'), col('lots', 'number')], LOTS),
  card_voc_same_eqp: ok(
    200,
    [col('ticket'), col('opened'), col('status'), col('title')],
    [
      ['VOC-2318', '10-28', '열림', '14시대 알람 반복'],
      ['VOC-2290', '10-21', '닫힘', 'TEMP 튐 1 회'],
      ['VOC-2251', '10-14', '닫힘', '레시피 롤백 요청'],
      ['VOC-2207', '10-03', '닫힘', 'PRESS 센서 교체'],
      ['VOC-2154', '09-22', '닫힘', 'E-4471 반복'],
    ],
  ),
  card_alarm_dist: ok(1600, [col('alarm_cd'), col('cnt', 'number'), col('pct', 'number')], DIST),
  card_wafer_map: ok(300, [col('die_x', 'number'), col('die_y', 'number'), col('defects', 'number')], waferRows),
  card_sess_count: { delayMs: 300, error: 'ORA-12170: TNS:Connect timeout occurred' },
  card_log_err: ok(8000, [col('ts'), col('level'), col('message')], logRows), // 조회 중 상태 확인용
}
