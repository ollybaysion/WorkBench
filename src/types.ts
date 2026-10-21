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
}
