import Dexie, { type Table } from 'dexie'
import type { Note, Command, Runbook, RunbookRun, Task, EnvPreset } from './types'

export interface KV {
  key: string
  value: unknown
}

export class WorkBenchDB extends Dexie {
  notes!: Table<Note, string>
  commands!: Table<Command, string>
  runbooks!: Table<Runbook, string>
  runs!: Table<RunbookRun, string>
  tasks!: Table<Task, string>
  envs!: Table<EnvPreset, string>
  kv!: Table<KV, string>

  constructor() {
    super('workbench')
    this.version(1).stores({
      notes: 'id, folder, updatedAt',
      commands: 'id, risk, favorite, updatedAt',
      runbooks: 'id, updatedAt',
      runs: 'id, runbookId, status, startedAt',
      tasks: 'id, status, due, updatedAt',
      envs: 'id',
      kv: 'key',
    })
  }
}

export const db = new WorkBenchDB()
