import Dexie, { type Table } from 'dexie'
import type { Note, Command, Runbook, RunbookRun, Task, EnvPreset, Connection, Card, Board } from './types'

export interface KV {
  key: string
  value: unknown
}

const STORES_V1 = {
  notes: 'id, folder, updatedAt',
  commands: 'id, risk, favorite, updatedAt',
  runbooks: 'id, updatedAt',
  runs: 'id, runbookId, status, startedAt',
  tasks: 'id, status, due, updatedAt',
  envs: 'id',
  kv: 'key',
}

export class WorkBenchDB extends Dexie {
  notes!: Table<Note, string>
  commands!: Table<Command, string>
  runbooks!: Table<Runbook, string>
  runs!: Table<RunbookRun, string>
  tasks!: Table<Task, string>
  envs!: Table<EnvPreset, string>
  kv!: Table<KV, string>
  connections!: Table<Connection, string>
  cards!: Table<Card, string>
  boards!: Table<Board, string>

  constructor() {
    super('workbench')
    this.version(1).stores(STORES_V1)
    this.version(2).stores({
      ...STORES_V1,
      connections: 'id, name, envId, updatedAt',
      cards: 'id, kind, connectionId, updatedAt',
      boards: 'id, updatedAt',
    })
  }
}

export const db = new WorkBenchDB()
