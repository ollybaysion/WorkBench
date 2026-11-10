export interface Base {
  id: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

export type Risk = 'read' | 'change' | 'destroy'

export interface CommandVar {
  name: string
  default?: string
  description?: string
}

export interface Command extends Base {
  title: string
  description?: string
  template: string
  vars: CommandVar[]
  risk: Risk
  precheck: string[]
  favorite: boolean
  usageCount: number
  lastUsedAt?: string
}

export interface RunbookInput {
  name: string
  default?: string
  options?: string[]
}

export type StepTool =
  | { type: 'command'; template: string }
  | { type: 'template'; body: string }
  | { type: 'checklist'; items: string[] }
  | { type: 'timer'; minutes: number; link?: string }
  | { type: 'link'; url: string; label?: string }

export interface Step {
  id: string
  title: string
  description?: string
  tool?: StepTool
}

export interface Runbook extends Base {
  title: string
  description?: string
  inputs: RunbookInput[]
  steps: Step[]
}

export type RunStatus = 'in_progress' | 'done' | 'aborted'

export interface RunbookRun {
  id: string
  runbookId: string
  startedAt: string
  finishedAt?: string
  by: string
  inputs: Record<string, string>
  doneSteps: string[]
  checklist: Record<string, boolean[]>
  status: RunStatus
}

export interface EnvPreset {
  id: string
  name: string
  vars: Record<string, string>
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  userName: string
  activeEnvId?: string
  lastBackupAt?: string
  /** 왼쪽 패널을 아이콘 줄로 접는다(넓은 화면만) */
  sideMini?: boolean
  /** 사이드바에서 접어 둔 작업판 묶음 */
  sideGroupsClosed?: string[]
  /** AKG 지식 허브 주소. 끝 슬래시 없이 저장한다. 예 http://akg.fdc.localhost:8000 */
  akgUrl?: string
  /** AKG 개인 읽기 토큰(akgr_…). 비밀이므로 JSON 내보내기 · 가져오기에 싣지 않는다. */
  akgToken?: string
}

// ===== 작업대 =====

export interface Connection extends Base {
  name: string // 연결 이름 'FDC-L1'. 환경이 달라도 같은 이름이면 같은 논리 DB. 카드는 이 이름만 가리킨다
  driver: 'oracle'
  envId: string // EnvPreset.id
  host: string
  port: number
  service: string // Oracle 서비스 이름
  schema: string
  user: string
  readOnly: boolean
  /** agent-db 의 alias(connections.json). 있으면 카드를 agent-db 로 조회하고, 없으면 가짜 결과를 쓴다 */
  alias?: string
} // 비밀번호는 agent-db 가 passwordEnv 로 읽는다. 브라우저 저장소에는 없다.

export type ChartType = 'line' | 'step' | 'area' | 'bar' | 'stacked-bar' | 'scatter' | 'histogram' | 'heatmap' | 'box' | 'stat'
export type CardView =
  | { kind: 'table' }
  | {
      kind: 'chart'
      type: ChartType
      x: string
      y: string[]
      series?: string
      /** 겹침 모드: 이 변수 값과 이름이 같은 시리즈만 진하게, 나머지는 회색으로 깐다(선 그래프) */
      focus?: string
      /** 구간 열(STEP 같은). 값이 바뀌는 x 에 세로 선과 구간 이름을 그린다(선 그래프) */
      phase?: string
      /** 강조 구간 열(TSUM 구간 같은). 값이 있는 x 를 칠하고 그 값을 이름으로 보인다(선 그래프) */
      band?: string
    }

/** 눌러서 변수 넣기: 결과 열 col 의 값을 변수 var 에 넣는다 */
export interface PickRule {
  col: string
  var: string
}
/** 관리 한계 열 이름. 행마다 읽는다. value 는 표가 한계와 견줄 열(그래프 · 숫자 타일은 y 값과 견준다) */
export interface Limits {
  lcl?: string
  ucl?: string
  value?: string
}

interface CardBase extends Base {
  title: string
  description?: string
}
export interface QueryCard extends CardBase {
  kind: 'query'
  sql: string // 바인드는 `:이름`. 변수 목록은 SQL 에서 자동 추출한다(저장하지 않는다)
  keyColumns: string[] // 비교 때 행을 맞출 열. 지금은 저장만
  view: CardView
  /** 표 · 히트맵 칸 · 숫자 타일을 누르면 그 행의 값이 변수 띠에 들어간다. 없으면 누를 때 값을 복사한다 */
  picks?: PickRule[]
  /** 범위를 넘은 행 · 칸 · 타일을 표시하고, 선 그래프에 LCL · UCL 선을 그린다 */
  limits?: Limits
}
export interface CommandCard extends CardBase {
  kind: 'command'
  commandId: string // 기존 Command 를 가리킨다
}
export type Card = QueryCard | CommandCard

export interface BoardCell {
  cardId: string
  x: number // 0~3
  y: number
  w: number // 1~4, x+w ≤ 4
  h: number // 1~2
}
export interface Board extends Base {
  title: string
  /** 기능 묶음 이름(TSUM · EVENT · INTERLOCK 같은). 사이드바 · 선택 상자가 묶어 보인다. 없으면 묶음 없음 */
  group?: string
  cells: BoardCell[]
  vars: Record<string, string> // 변수 띠 값
  /** 이 작업판이 조회할 연결(Connection.id). 조회 카드는 모두 이 연결로 조회한다. 없으면 lib/conn.ts 의 기본 규칙 */
  connId?: string
}

/** 저장한 화면의 카드 결과. binds 는 그 조회에 넣은 바인드 값 */
export type SnapResult = ({ status: 'ok'; result: QueryResult; at: string } | { status: 'error'; message: string; at: string }) & { binds?: Record<string, string> }

/** 저장한 화면: 그 시각의 작업판(변수 · 연결 · 배치 · 카드 사본)과 조회 결과. 다시 조회하지 않고 읽기만 한다 */
export interface BoardSnapshot extends Base {
  title: string
  boardId: string
  boardTitle: string
  vars: Record<string, string>
  /** 그때 쓴 연결. 연결을 지워도 이름이 남는다 */
  conn?: { id: string; name: string; alias?: string }
  cells: BoardCell[]
  cards: Card[]
  /** 카드 id → 결과. 조회하지 않은 카드는 없다 */
  results: Record<string, SnapResult>
}

export interface Column {
  name: string
  type: 'string' | 'number' | 'date'
}
export type Cell = string | number | null
export interface QueryResult {
  columns: Column[]
  rows: Cell[][]
  truncated: boolean
  elapsedMs: number
  /** 잘린 까닭 같은 짧은 안내(agent-db 의 hint) */
  note?: string
} // fdc-agent-be 의 Table 과 같은 모양

export interface ExportBundle {
  app: 'workbench'
  version: 1
  exportedAt: string
  commands: Command[]
  runbooks: Runbook[]
  runs: RunbookRun[]
  envs: EnvPreset[]
  settings: Settings
  // 예전 백업 파일에는 아래 셋이 없다
  connections?: Connection[]
  cards?: Card[]
  boards?: Board[]
  snapshots?: BoardSnapshot[]
  // 예전 백업 파일에만 있다(지식 베이스 노트 · 업무 보드). 가져오기는 이 둘을 읽지 않는다
  notes?: unknown[]
  tasks?: unknown[]
}
