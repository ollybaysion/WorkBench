import Dexie, { type Table } from 'dexie'
import type { Command, Runbook, RunbookRun, EnvPreset, Connection, Card, Board } from './types'

export interface KV {
  key: string
  value: unknown
}

// notes(지식 베이스) · tasks(업무 보드) 는 앱이 읽지도 쓰지도 않는다.
// 선언은 둔다. 선언을 지우면 기존 브라우저에 든 데이터가 함께 지워질 수 있다.
const STORES_V1 = {
  notes: 'id, folder, updatedAt', // 쓰지 않음, 기존 데이터 보존
  commands: 'id, risk, favorite, updatedAt',
  runbooks: 'id, updatedAt',
  runs: 'id, runbookId, status, startedAt',
  tasks: 'id, status, due, updatedAt', // 쓰지 않음, 기존 데이터 보존
  envs: 'id',
  kv: 'key',
}

export class WorkBenchDB extends Dexie {
  commands!: Table<Command, string>
  runbooks!: Table<Runbook, string>
  runs!: Table<RunbookRun, string>
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
