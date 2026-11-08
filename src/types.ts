export interface Base {
  id: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

export interface Note extends Base {
  title: string
  folder: string
  content: string
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

export type TaskStatus = 'todo' | 'doing' | 'done'
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Task extends Base {
  title: string
  status: TaskStatus
  due?: string
  repeat: Repeat
  noteId?: string
  runbookId?: string
  doneAt?: string
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
}

// ===== 작업대 =====

export interface Connection extends Base {
  name: string // 'FDC-L1'. 환경이 달라도 같은 이름이면 같은 논리 DB(나중에 운영 · 개발 비교에 쓴다)
  driver: 'oracle'
  envId: string // EnvPreset.id
  host: string
  port: number
  service: string // Oracle 서비스 이름
  schema: string
  user: string
  readOnly: boolean
} // 비밀번호는 서버에만 둔다. 브라우저 저장소에는 없다.

export type ChartType = 'line' | 'step' | 'area' | 'bar' | 'stacked-bar' | 'scatter' | 'histogram' | 'heatmap' | 'box'
export type CardView = { kind: 'table' } | { kind: 'chart'; type: ChartType; x: string; y: string[]; series?: string }

interface CardBase extends Base {
  title: string
  description?: string
}
export interface QueryCard extends CardBase {
  kind: 'query'
  connectionId: string
  sql: string // 바인드는 `:이름`. 변수 목록은 SQL 에서 자동 추출한다(저장하지 않는다)
  keyColumns: string[] // 비교 때 행을 맞출 열. 지금은 저장만
  view: CardView
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
  cells: BoardCell[]
  vars: Record<string, string> // 변수 띠 값
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
} // fdc-agent-be 의 Table 과 같은 모양

export interface ExportBundle {
  app: 'workbench'
  version: 1
  exportedAt: string
  notes: Note[]
  commands: Command[]
  runbooks: Runbook[]
  runs: RunbookRun[]
  tasks: Task[]
  envs: EnvPreset[]
  settings: Settings
  // 예전 백업 파일에는 아래 셋이 없다
  connections?: Connection[]
  cards?: Card[]
  boards?: Board[]
}
