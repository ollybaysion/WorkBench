import type { Board, Card, CardView, Command, Connection, Limits, PickRule, QueryCard } from '../types'
import { now } from './util'

// 작업대 시드 — 시안 mockups/card/gen.py · mockups/kit.py 의 값을 옮겼다.
// 카드 id 는 lib/fixtures.ts 의 가짜 결과 키와 같다.

const t = now()
const base = (id: string, tags: string[] = []) => ({ id, createdAt: t, updatedAt: t, tags })

const oracle = (id: string, name: string, envId: string, host: string, service: string, schema: string, user: string, readOnly: boolean): Connection => ({
  ...base(id),
  name,
  driver: 'oracle',
  envId,
  host,
  port: 1521,
  service,
  schema,
  user,
  readOnly,
})

export const seedConnections: Connection[] = [
  oracle('conn_fdc_l1_prod', 'FDC-L1', 'env_prod', 'db-l1.fab.internal', 'FDCL1', 'FDC_L1', 'fdc_ro', true),
  oracle('conn_fdc_l1_dev', 'FDC-L1', 'env_dev', 'db-l1.dev.fab.internal', 'FDCL1', 'FDC_L1', 'fdc_ro', true),
  oracle('conn_fdc_l2_prod', 'FDC-L2', 'env_prod', 'db-l2.fab.internal', 'FDCL2', 'FDC_L2', 'fdc_ops', false),
  oracle('conn_logdb_prod', 'LOGDB', 'env_prod', 'logdb.fab.internal', 'APPLOG', 'APPLOG', 'log_ro', true),
]

/** FDC 확인 작업판 연결. alias 를 붙이기 전까지 가짜 결과(lib/fixturesFdc.ts)를 쓴다 */
export const seedFdcConnections: Connection[] = [oracle('conn_fdc_demo', 'FDC-DEMO', 'env_prod', 'db-l1.fab.internal', 'FDCL1', 'FDC_L1', 'fdc_ro', true)]

/** 명령 카드가 가리키는 Command. 기존 seedCommands 에도 들어가고, 이미 쓰는 브라우저에는 작업대 시드 때 없는 것만 더한다 */
export const seedBoardCommands: Command[] = [
  {
    ...base('cmd_fdc_restart', ['fdc']),
    title: '수집기 재시작',
    description: '수집기를 재시작합니다. 수집 중이면 그 로트의 데이터가 끊깁니다. 되돌리기: sudo systemctl start akg-collector@L1',
    template: 'ssh {{host}} "sudo systemctl restart akg-collector@{{line}}"',
    vars: [
      { name: 'host', description: '수집기 서버 (환경 프리셋)' },
      { name: 'line', default: 'L1', description: '라인 코드' },
    ],
    risk: 'destroy',
    precheck: ['현재 수집이 끝났는지 확인했다', '담당자에게 재시작을 알렸다'],
    favorite: false,
    usageCount: 4,
  },
  {
    ...base('cmd_fdc_grep', ['fdc']),
    title: '앱 로그 grep',
    template: 'ssh {{host}} "grep \'{{eqp_id}}\' /var/log/fdc/app-{{date}}.log | tail -n 200"',
    vars: [
      { name: 'host', description: '앱 서버 (환경 프리셋)' },
      { name: 'eqp_id', description: '설비 ID (변수 띠)' },
      { name: 'date', default: '$(date +%F)', description: '로그 날짜 YYYY-MM-DD' },
    ],
    risk: 'read',
    precheck: [],
    favorite: false,
    usageCount: 31,
  },
]

const query = (id: string, title: string, connection: string, sql: string, view: CardView, keyColumns: string[] = []): Card => ({
  ...base(id),
  kind: 'query',
  title,
  connection,
  sql,
  keyColumns,
  view,
})

export const seedCards: Card[] = [
  query(
    'card_sensor_trace',
    '센서 트렌드',
    'FDC-L1',
    'select ts, snsr_id, value\nfrom fdc_trace\nwhere eqp_id = :eqp_id\n  and ts between :from and :to\norder by ts',
    { kind: 'chart', type: 'line', x: 'ts', y: ['value'], series: 'snsr_id' },
    ['ts', 'snsr_id'],
  ),
  query(
    'card_voc_same_eqp',
    '같은 설비 VOC 티켓',
    'LOGDB',
    "select ticket_no as ticket, to_char(opened_at, 'MM-DD') as opened, status, title\nfrom voc_ticket\nwhere eqp_id = :eqp_id\norder by case when ticket_no = :ticket then 0 else 1 end, opened_at desc",
    { kind: 'table' },
    ['ticket'],
  ),
  query(
    'card_lot_count',
    '10 분 단위 로트 수',
    'FDC-L1',
    "select to_char(trunc(start_ts, 'HH24') + floor(to_char(start_ts, 'MI') / 10) * 10 / 1440, 'HH24:MI') as ts,\n       count(*) as lots\nfrom fdc_lot\nwhere line_id = :line\n  and start_ts between :from and :to\ngroup by trunc(start_ts, 'HH24') + floor(to_char(start_ts, 'MI') / 10) * 10 / 1440\norder by 1",
    { kind: 'chart', type: 'bar', x: 'ts', y: ['lots'] },
    ['ts'],
  ),
  query(
    'card_alarm_dist',
    '알람 코드 분포(7 일)',
    'FDC-L1',
    'select alarm_cd, count(*) as cnt, round(100 * ratio_to_report(count(*)) over ()) as pct\nfrom fdc_alarm\nwhere eqp_id = :eqp_id\n  and ts >= sysdate - 7\ngroup by alarm_cd\norder by cnt desc',
    { kind: 'chart', type: 'bar', x: 'alarm_cd', y: ['cnt'] },
    ['alarm_cd'],
  ),
  query(
    'card_alarm_hist',
    '알람 이력',
    'FDC-L1',
    'select ts, alarm_cd, level, message\nfrom fdc_alarm\nwhere eqp_id = :eqp_id\n  and ts between :from and :to\norder by sev desc, ts desc',
    { kind: 'table' },
    ['ts', 'alarm_cd'],
  ),
  query(
    'card_recipe_chg',
    '레시피 변경',
    'FDC-L1',
    'select old_val as "before", new_val as "after", chg_by as who, chg_ts as ts\nfrom fdc_recipe_hist\nwhere eqp_id = :eqp_id\n  and chg_ts >= :from\norder by chg_ts desc',
    { kind: 'table' },
    ['ts', 'before'],
  ),
  query(
    'card_wafer_map',
    '웨이퍼 결함 맵',
    'FDC-L1',
    'select die_x, die_y, defects\nfrom fdc_wafer_defect\nwhere lot_id = :lot_id\norder by die_y, die_x',
    { kind: 'chart', type: 'heatmap', x: 'die_x', y: ['die_y', 'defects'] },
    ['die_x', 'die_y'],
  ),
  {
    ...base('card_m_restart'),
    kind: 'command',
    title: '수집기 재시작',
    commandId: 'cmd_fdc_restart',
  },
  query(
    'card_log_err',
    '앱 오류 로그(최근 200)',
    'LOGDB',
    "select * from (\n  select log_ts as ts, level_cd as level, message\n  from app_log\n  where eqp_id = :eqp_id\n    and log_ts >= :from\n    and level_cd in ('ERROR', 'FATAL')\n  order by log_ts desc\n) where rownum <= 200",
    { kind: 'table' },
    ['ts'],
  ),
  {
    ...base('card_m_grep'),
    kind: 'command',
    title: '앱 로그 grep',
    commandId: 'cmd_fdc_grep',
  },
  query(
    'card_sess_count',
    'DB 세션 수',
    'FDC-L2',
    "select machine, count(*) as sessions\nfrom v$session\nwhere username = 'FDC_' || :line\ngroup by machine\norder by sessions desc",
    { kind: 'table' },
    ['machine'],
  ),
]

// ===== FDC 확인 작업판(mockups/fdc) =====
// 카드에서 로트 → 웨이퍼 → 파라미터를 눌러 고르면 변수 띠가 바뀌고, ⟳ 바뀐 카드 조회로 파형 · 요약값이 따라온다.

const fdc = (id: string, title: string, sql: string, view: CardView, extra: { picks?: PickRule[]; limits?: Limits } = {}): QueryCard => ({
  ...base(id, ['fdc']),
  kind: 'query',
  title,
  connection: 'FDC-DEMO',
  sql,
  keyColumns: [],
  view,
  ...extra,
})
const pick = (col: string, v = col): PickRule => ({ col, var: v })

export const seedFdcCards: Card[] = [
  fdc(
    'card_fdc_lots',
    '로트 목록',
    'select lot_id, count(*) as wafers, to_char(min(start_ts), \'MM-DD HH24:MI\') as started, sum(alarm_cnt) as alarms\nfrom fdc_wafer\nwhere eqp_id = :eqp_id and chamber = :chamber\ngroup by lot_id\norder by min(start_ts) desc',
    { kind: 'table' },
    { picks: [pick('lot_id')] },
  ),
  fdc(
    'card_fdc_wmap',
    '웨이퍼 지도',
    'select mod(slot - 1, 5) as col, 4 - floor((slot - 1) / 5) as row_no, max(value) as mx, slot\nfrom fdc_trace\nwhere lot_id = :lot_id and param = :param and step = :step\ngroup by slot\norder by slot',
    { kind: 'chart', type: 'heatmap', x: 'col', y: ['row_no', 'mx'] },
    { picks: [pick('slot', 'wafer')] },
  ),
  fdc(
    'card_fdc_params',
    '파라미터 · 한계 가까운 순',
    'select t.param, max(t.value) as mx, r.lcl, r.ucl\nfrom fdc_trace t\njoin fdc_alarm_rule r on r.param = t.param and r.step = t.step\nwhere t.lot_id = :lot_id and t.slot = :wafer and t.step = :step\ngroup by t.param, r.lcl, r.ucl\norder by (max(t.value) - r.lcl) / (r.ucl - r.lcl) desc',
    { kind: 'table' },
    { picks: [pick('param')], limits: { value: 'mx', lcl: 'lcl', ucl: 'ucl' } },
  ),
  fdc(
    'card_fdc_trace',
    '겹친 파형 · 25 웨이퍼',
    'select v.ts_sec, v.slot, v.value, \'STEP \' || v.step as step_nm, r.lcl, r.ucl\nfrom fdc_trace_v v\nleft join fdc_alarm_rule r on r.param = v.param and r.step = v.step\nwhere v.lot_id = :lot_id and v.param = :param\norder by v.slot, v.ts_sec',
    { kind: 'chart', type: 'line', x: 'ts_sec', y: ['value'], series: 'slot', focus: 'wafer', phase: 'step_nm' },
    { limits: { lcl: 'lcl', ucl: 'ucl' } },
  ),
  fdc(
    'card_fdc_summary',
    '요약값 · 지금 웨이퍼',
    "select 'MEAN' as k, round(avg(t.value), 2) as v, r.lcl, r.ucl from fdc_trace t join fdc_alarm_rule r on r.param = t.param and r.step = t.step\n  where t.lot_id = :lot_id and t.slot = :wafer and t.param = :param and t.step = :step group by r.lcl, r.ucl\nunion all\nselect 'MAX', max(t.value), r.lcl, r.ucl from fdc_trace t join fdc_alarm_rule r on r.param = t.param and r.step = t.step\n  where t.lot_id = :lot_id and t.slot = :wafer and t.param = :param and t.step = :step group by r.lcl, r.ucl\nunion all\nselect 'SLOPE', round(regr_slope(t.value, t.ts_sec), 2), -r.slope_lim, r.slope_lim from fdc_trace t join fdc_alarm_rule r on r.param = t.param and r.step = t.step\n  where t.lot_id = :lot_id and t.slot = :wafer and t.param = :param and t.step = :step group by r.slope_lim",
    { kind: 'chart', type: 'stat', x: 'k', y: ['v'] },
    { limits: { lcl: 'lcl', ucl: 'ucl' } },
  ),
  fdc(
    'card_fdc_status',
    '설비 상태',
    "select a.param || ' · W' || a.slot || ' · ' || a.over_sec || ' s · ' || a.action as what,\n       a.status, a.value, a.ucl, a.over_sec, a.action, to_char(a.ts, 'MM-DD HH24:MI:SS') as ts\nfrom fdc_alarm a\nwhere a.eqp_id = :eqp_id and a.chamber = :chamber\norder by a.ts desc\nfetch first 1 rows only",
    { kind: 'chart', type: 'stat', x: 'what', y: ['status'] },
    { limits: { value: 'value', ucl: 'ucl' } },
  ),
  fdc(
    'card_fdc_rules',
    '알람 범위 · 지금 웨이퍼',
    'select r.param, r.steps as step, r.lcl, r.ucl, r.duration_s, r.action, max(t.value) as w_max\nfrom fdc_alarm_rule r\nleft join fdc_trace t on t.param = r.param and t.lot_id = :lot_id and t.slot = :wafer and t.step = 3\nwhere r.eqp_id = :eqp_id and r.chamber = :chamber\ngroup by r.param, r.steps, r.lcl, r.ucl, r.duration_s, r.action, r.severity\norder by r.severity desc',
    { kind: 'table' },
    { picks: [pick('param')], limits: { value: 'w_max', lcl: 'lcl', ucl: 'ucl' } },
  ),
  fdc(
    'card_fdc_alarms',
    '알람 기록',
    "select to_char(ts, 'MM-DD HH24:MI:SS') as ts, lot_id, slot, param, action\nfrom fdc_alarm\nwhere eqp_id = :eqp_id\norder by ts desc\nfetch first 50 rows only",
    { kind: 'table' },
    { picks: [pick('lot_id'), pick('slot', 'wafer'), pick('param')] },
  ),
  fdc(
    'card_fdc_svid30',
    '파라미터 30 개 · 지금 웨이퍼 STEP MAX',
    'select s.svid, s.grp, max(t.value) as value, s.unit, r.lcl, r.ucl\nfrom fdc_svid s\njoin fdc_trace t on t.param = s.svid\njoin fdc_alarm_rule r on r.param = s.svid and r.step = t.step\nwhere t.lot_id = :lot_id and t.slot = :wafer and t.step = :step\ngroup by s.svid, s.grp, s.unit, s.ord, r.lcl, r.ucl\norder by s.ord',
    { kind: 'chart', type: 'stat', x: 'svid', y: ['value'] },
    { picks: [pick('svid', 'param')], limits: { lcl: 'lcl', ucl: 'ucl' } },
  ),
]

const FDC_PLACE: [string, number, number, number, number][] = [
  ['card_fdc_lots', 0, 0, 1, 1],
  ['card_fdc_trace', 1, 0, 2, 2],
  ['card_fdc_summary', 3, 0, 1, 1],
  ['card_fdc_wmap', 0, 1, 1, 2],
  ['card_fdc_status', 3, 1, 1, 1],
  ['card_fdc_rules', 1, 2, 2, 1],
  ['card_fdc_alarms', 3, 2, 1, 1],
  ['card_fdc_params', 0, 3, 1, 2],
  ['card_fdc_svid30', 1, 3, 3, 2],
]

export const seedFdcBoard: Board = {
  ...base('board_fdc_trace', ['fdc']),
  title: 'FDC 확인 · ETCH-03',
  cells: FDC_PLACE.map(([cardId, x, y, w, h]) => ({ cardId, x, y, w, h })),
  vars: { eqp_id: 'ETCH-03', chamber: 'CH-A', lot_id: 'L2611-07', wafer: '12', param: 'RF_REF_PWR', step: '3' },
  conns: { 'FDC-DEMO': 'conn_fdc_demo' },
}

// ===== TSUM 확인 작업판 =====
// TSUM 은 trace 의 한 구간(recipe · start step ~ end step)을 통계 하나로 줄인 값이다.
// 기준 정보에서 TSUM 항목을 누르면 tsum_id · sensor 가 바뀌고, 구간은 SQL 이 기준 정보에서 읽는다.
// 웨이퍼별 값에서 웨이퍼를, 구간 통계에서 센서를 눌러 고른다.

const tsum = (id: string, title: string, sql: string, view: CardView, extra: { picks?: PickRule[]; limits?: Limits } = {}): QueryCard => ({
  ...base(id, ['fdc', 'tsum']),
  kind: 'query',
  title,
  connection: 'FDC-DEMO',
  sql,
  keyColumns: [],
  view,
  ...extra,
})

export const seedTsumCards: Card[] = [
  tsum(
    'card_tsum_items',
    'TSUM 기준 정보',
    'select i.tsum_id, i.recipe, i.sensor, i.start_step, i.end_step, i.stat, i.lsl, i.usl\nfrom tsum_item i\nwhere i.eqp_id = :eqp_id and i.chamber = :chamber\norder by i.tsum_id',
    { kind: 'table' },
    { picks: [pick('tsum_id'), pick('sensor')] },
  ),
  tsum(
    'card_tsum_value',
    'TSUM 값 · 지금 웨이퍼',
    "select '저장 ' || i.tsum_id || ' ' || i.stat as k, r.tsum_value as v, i.lsl, i.usl\nfrom tsum_result r join tsum_item i on i.tsum_id = r.tsum_id\nwhere r.lot_id = :lot_id and r.slot = :wafer and r.tsum_id = :tsum_id\nunion all\nselect 'trace 로 다시 계산', case i.stat when 'MAX' then max(t.value) when 'MIN' then min(t.value)\n         when 'AVG' then avg(t.value) else max(t.value) - min(t.value) end, i.lsl, i.usl\nfrom fdc_trace t join tsum_item i on i.tsum_id = :tsum_id and t.param = i.sensor\nwhere t.lot_id = :lot_id and t.slot = :wafer and t.step between i.start_step and i.end_step\ngroup by i.stat, i.lsl, i.usl",
    { kind: 'chart', type: 'stat', x: 'k', y: ['v'] },
    { limits: { lcl: 'lsl', ucl: 'usl' } },
  ),
  tsum(
    'card_tsum_wafers',
    '웨이퍼별 TSUM 값',
    "select r.slot, r.tsum_value, i.lsl, i.usl, to_char(r.calc_ts, 'HH24:MI:SS.FF3') as calc_ts\nfrom tsum_result r join tsum_item i on i.tsum_id = r.tsum_id\nwhere r.lot_id = :lot_id and r.tsum_id = :tsum_id\norder by r.slot",
    { kind: 'table' },
    { picks: [pick('slot', 'wafer')], limits: { value: 'tsum_value', lcl: 'lsl', ucl: 'usl' } },
  ),
  tsum(
    'card_tsum_trace',
    'Trace · 지금 웨이퍼',
    "select to_char(t.ts, 'YYYY-MM-DD HH24:MI:SS.FF3') as ts, t.value, 'STEP ' || t.step as step_nm,\n       case when t.step between i.start_step and i.end_step\n            then 'TSUM ' || i.tsum_id || ' · STEP ' || i.start_step || '~' || i.end_step end as tsum_win\nfrom fdc_trace t join tsum_item i on i.tsum_id = :tsum_id\nwhere t.lot_id = :lot_id and t.slot = :wafer and t.param = :sensor\norder by t.ts",
    { kind: 'chart', type: 'line', x: 'ts', y: ['value'], phase: 'step_nm', band: 'tsum_win' },
  ),
  tsum(
    'card_tsum_stats',
    '구간 통계 · 센서별',
    'select t.param as sensor, count(*) as n, round(avg(t.value), 4) as avg, min(t.value) as min, max(t.value) as max,\n       max(t.value) - min(t.value) as max_min, round(stddev(t.value), 4) as std,\n       round((max(t.ts) - min(t.ts)) * 86400000) as win_ms\nfrom fdc_trace t join tsum_item i on i.tsum_id = :tsum_id\nwhere t.lot_id = :lot_id and t.slot = :wafer and t.step between i.start_step and i.end_step\ngroup by t.param\norder by t.param',
    { kind: 'table' },
    { picks: [pick('sensor')] },
  ),
  tsum(
    'card_tsum_ctx',
    'Chamber Context History',
    "select to_char(h.ts, 'YYYY-MM-DD HH24:MI:SS.FF3') as ts, h.slot, h.event, h.step, h.detail\nfrom chamber_ctx_hist h\nwhere h.eqp_id = :eqp_id and h.chamber = :chamber and h.lot_id = :lot_id\n  and h.slot between :wafer - 1 and :wafer + 1\norder by h.ts",
    { kind: 'table' },
    { picks: [pick('slot', 'wafer')] },
  ),
]

const TSUM_PLACE: [string, number, number, number, number][] = [
  ['card_tsum_items', 0, 0, 2, 1],
  ['card_tsum_value', 2, 0, 1, 1],
  ['card_tsum_wafers', 3, 0, 1, 3],
  ['card_tsum_trace', 0, 1, 3, 2],
  ['card_tsum_stats', 0, 3, 2, 2],
  ['card_tsum_ctx', 2, 3, 2, 2],
]

export const seedTsumBoard: Board = {
  ...base('board_tsum', ['fdc', 'tsum']),
  title: 'TSUM 확인 · ETCH-03',
  cells: TSUM_PLACE.map(([cardId, x, y, w, h]) => ({ cardId, x, y, w, h })),
  vars: { eqp_id: 'ETCH-03', chamber: 'CH-A', lot_id: 'L2611-07', wafer: '12', tsum_id: 'T01', sensor: 'RF_REF_PWR' },
  conns: { 'FDC-DEMO': 'conn_fdc_demo' },
}

// gen.py PLACE — (카드, 열, 줄, 폭, 높이)
const PLACE: [string, number, number, number, number][] = [
  ['card_sensor_trace', 0, 0, 2, 2],
  ['card_voc_same_eqp', 2, 0, 2, 1],
  ['card_lot_count', 2, 1, 1, 1],
  ['card_alarm_dist', 3, 1, 1, 1],
  ['card_alarm_hist', 0, 2, 2, 1],
  ['card_recipe_chg', 2, 2, 1, 1],
  ['card_wafer_map', 3, 2, 1, 1],
  ['card_m_restart', 0, 3, 1, 1],
  ['card_log_err', 1, 3, 1, 1],
  ['card_m_grep', 2, 3, 1, 1],
  ['card_sess_count', 3, 3, 1, 1],
]

export const seedBoards: Board[] = [
  {
    ...base('board_fdc', ['fdc']),
    title: 'FDC 운영 작업대',
    cells: PLACE.map(([cardId, x, y, w, h]) => ({ cardId, x, y, w, h })),
    // kit.VARS 기본값
    vars: { line: 'L1', eqp_id: 'EQP-A12', from: '2026-10-28 14:00', to: '2026-10-28 15:00', ticket: 'VOC-2318', lot_id: '' },
    conns: { 'FDC-L1': 'conn_fdc_l1_prod', 'FDC-L2': 'conn_fdc_l2_prod', LOGDB: 'conn_logdb_prod' },
  },
]
