import type { Board, Card, CardView, Command, Connection } from '../types'
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
