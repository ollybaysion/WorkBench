import { create } from 'zustand'
import { db } from './db'
import type { Command, Runbook, RunbookRun, EnvPreset, Settings, ExportBundle, Connection, Card, Board } from './types'
import { seedCommands, seedEnvs, seedRunbooks } from './lib/seed'
import { seedBoardCommands, seedBoards, seedCards, seedConnections } from './lib/seedBoard'
import { now } from './lib/util'

const defaultSettings: Settings = { theme: 'system', userName: '', activeEnvId: 'env_prod' }

interface State {
  ready: boolean
  commands: Command[]
  runbooks: Runbook[]
  runs: RunbookRun[]
  envs: EnvPreset[]
  connections: Connection[]
  cards: Card[]
  boards: Board[]
  settings: Settings
  toast: string | null
  paletteOpen: boolean

  init: () => Promise<void>
  showToast: (msg: string) => void
  setPalette: (open: boolean) => void
  setSettings: (patch: Partial<Settings>) => Promise<void>

  upsertCommand: (c: Command) => Promise<void>
  deleteCommand: (id: string) => Promise<void>
  upsertRunbook: (r: Runbook) => Promise<void>
  deleteRunbook: (id: string) => Promise<void>
  upsertRun: (r: RunbookRun) => Promise<void>
  deleteRun: (id: string) => Promise<void>
  upsertEnv: (e: EnvPreset) => Promise<void>
  deleteEnv: (id: string) => Promise<void>
  upsertConnection: (c: Connection) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  upsertCard: (c: Card) => Promise<void>
  deleteCard: (id: string) => Promise<void>
  upsertBoard: (b: Board) => Promise<void>
  deleteBoard: (id: string) => Promise<void>

  activeEnv: () => EnvPreset | undefined
  exportBundle: () => ExportBundle
  importBundle: (b: ExportBundle, mode: 'merge' | 'replace') => Promise<void>
  resetToSeed: () => Promise<void>
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

/** 읽기 토큰을 뺀 설정. 내보내기 파일과 가져오기 파일은 토큰을 싣지 않는다. */
function withoutToken(s: Settings): Settings {
  const { akgToken: _secret, ...rest } = s
  return rest
}

function sortByUpdated<T extends { updatedAt: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

// 옛 notes · tasks 테이블은 넣지 않는다. 가져오기(교체) · 초기화가 그 데이터를 지우지 않게 한다
const ALL_TABLES = [db.commands, db.runbooks, db.runs, db.envs, db.connections, db.cards, db.boards, db.kv]

export const useStore = create<State>((set, get) => ({
  ready: false,
  commands: [],
  runbooks: [],
  runs: [],
  envs: [],
  connections: [],
  cards: [],
  boards: [],
  settings: defaultSettings,
  toast: null,
  paletteOpen: false,

  init: async () => {
    const seeded = await db.kv.get('seeded')
    if (!seeded) {
      await db.transaction('rw', [db.commands, db.runbooks, db.envs, db.kv], async () => {
        await db.commands.bulkPut(seedCommands)
        await db.runbooks.bulkPut(seedRunbooks)
        await db.envs.bulkPut(seedEnvs)
        await db.kv.put({ key: 'seeded', value: true })
        await db.kv.put({ key: 'settings', value: defaultSettings })
      })
    }
    // 작업대 시드는 `seeded` 와 별개로 cards 테이블이 비어 있으면 넣는다(이미 쓰는 브라우저에도 들어가야 하므로)
    if ((await db.cards.count()) === 0) {
      await db.transaction('rw', [db.connections, db.cards, db.boards, db.commands], async () => {
        await db.connections.bulkPut(seedConnections)
        await db.cards.bulkPut(seedCards)
        await db.boards.bulkPut(seedBoards)
        const have = await db.commands.bulkGet(seedBoardCommands.map((c) => c.id))
        await db.commands.bulkPut(seedBoardCommands.filter((_, i) => !have[i]))
      })
    }
    const [commands, runbooks, runs, envs, connections, cards, boards, s] = await Promise.all([
      db.commands.toArray(),
      db.runbooks.toArray(),
      db.runs.toArray(),
      db.envs.toArray(),
      db.connections.toArray(),
      db.cards.toArray(),
      db.boards.toArray(),
      db.kv.get('settings'),
    ])
    set({
      ready: true,
      commands: sortByUpdated(commands),
      runbooks: sortByUpdated(runbooks),
      runs: [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
      envs,
      connections: sortByUpdated(connections),
      cards: sortByUpdated(cards),
      boards: sortByUpdated(boards),
      settings: { ...defaultSettings, ...((s?.value as Partial<Settings>) ?? {}) },
    })
  },

  showToast: (msg) => {
    set({ toast: msg })
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ toast: null }), 1600)
  },
  setPalette: (open) => set({ paletteOpen: open }),

  setSettings: async (patch) => {
    const settings = { ...get().settings, ...patch }
    await db.kv.put({ key: 'settings', value: settings })
    set({ settings })
  },

  upsertCommand: async (c) => {
    c = { ...c, updatedAt: now() }
    await db.commands.put(c)
    set({ commands: sortByUpdated([c, ...get().commands.filter((x) => x.id !== c.id)]) })
  },
  deleteCommand: async (id) => {
    await db.commands.delete(id)
    set({ commands: get().commands.filter((x) => x.id !== id) })
  },
  upsertRunbook: async (r) => {
    r = { ...r, updatedAt: now() }
    await db.runbooks.put(r)
    set({ runbooks: sortByUpdated([r, ...get().runbooks.filter((x) => x.id !== r.id)]) })
  },
  deleteRunbook: async (id) => {
    await db.runbooks.delete(id)
    await db.runs.where('runbookId').equals(id).delete()
    set({ runbooks: get().runbooks.filter((x) => x.id !== id), runs: get().runs.filter((x) => x.runbookId !== id) })
  },
  upsertRun: async (r) => {
    await db.runs.put(r)
    const runs = [r, ...get().runs.filter((x) => x.id !== r.id)].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    set({ runs })
  },
  deleteRun: async (id) => {
    await db.runs.delete(id)
    set({ runs: get().runs.filter((x) => x.id !== id) })
  },
  upsertEnv: async (e) => {
    await db.envs.put(e)
    const exists = get().envs.some((x) => x.id === e.id)
    set({ envs: exists ? get().envs.map((x) => (x.id === e.id ? e : x)) : [...get().envs, e] })
  },
  deleteEnv: async (id) => {
    await db.envs.delete(id)
    set({ envs: get().envs.filter((x) => x.id !== id) })
    if (get().settings.activeEnvId === id) await get().setSettings({ activeEnvId: get().envs[0]?.id })
  },
  upsertConnection: async (c) => {
    c = { ...c, updatedAt: now() }
    await db.connections.put(c)
    set({ connections: sortByUpdated([c, ...get().connections.filter((x) => x.id !== c.id)]) })
  },
  deleteConnection: async (id) => {
    await db.connections.delete(id)
    set({ connections: get().connections.filter((x) => x.id !== id) })
  },
  upsertCard: async (c) => {
    c = { ...c, updatedAt: now() }
    await db.cards.put(c)
    set({ cards: sortByUpdated([c, ...get().cards.filter((x) => x.id !== c.id)]) })
  },
  deleteCard: async (id) => {
    // 모든 보드의 cells 에서도 뺀다
    const touched = get()
      .boards.filter((b) => b.cells.some((cell) => cell.cardId === id))
      .map((b) => ({ ...b, cells: b.cells.filter((cell) => cell.cardId !== id), updatedAt: now() }))
    await db.transaction('rw', [db.cards, db.boards], async () => {
      await db.cards.delete(id)
      await db.boards.bulkPut(touched)
    })
    const ids = new Set(touched.map((b) => b.id))
    set({ cards: get().cards.filter((x) => x.id !== id), boards: sortByUpdated([...touched, ...get().boards.filter((b) => !ids.has(b.id))]) })
  },
  upsertBoard: async (b) => {
    b = { ...b, updatedAt: now() }
    await db.boards.put(b)
    set({ boards: sortByUpdated([b, ...get().boards.filter((x) => x.id !== b.id)]) })
  },
  deleteBoard: async (id) => {
    await db.boards.delete(id)
    set({ boards: get().boards.filter((x) => x.id !== id) })
  },

  activeEnv: () => {
    const { envs, settings } = get()
    return envs.find((e) => e.id === settings.activeEnvId) ?? envs[0]
  },

  exportBundle: () => {
    const s = get()
    return {
      app: 'workbench',
      version: 1,
      exportedAt: now(),
      commands: s.commands,
      runbooks: s.runbooks,
      runs: s.runs,
      envs: s.envs,
      settings: withoutToken(s.settings),
      connections: s.connections,
      cards: s.cards,
      boards: s.boards,
    }
  },

  importBundle: async (b, mode) => {
    if (b.app !== 'workbench') throw new Error('WorkBench 내보내기 파일이 아닙니다.')
    const token = get().settings.akgToken
    const keepToken = token ? { akgToken: token } : {}
    await db.transaction('rw', ALL_TABLES, async () => {
      if (mode === 'replace') {
        await Promise.all(ALL_TABLES.filter((t) => t !== db.kv).map((t) => t.clear()))
      }
      await db.commands.bulkPut(b.commands ?? [])
      await db.runbooks.bulkPut(b.runbooks ?? [])
      await db.runs.bulkPut(b.runs ?? [])
      await db.envs.bulkPut(b.envs ?? [])
      await db.connections.bulkPut(b.connections ?? [])
      await db.cards.bulkPut(b.cards ?? [])
      await db.boards.bulkPut(b.boards ?? [])
      // 읽기 토큰은 파일에서 받지 않는다. 지금 브라우저의 토큰을 그대로 둔다.
      if (mode === 'replace' && b.settings) await db.kv.put({ key: 'settings', value: { ...withoutToken(b.settings), ...keepToken } })
      await db.kv.put({ key: 'seeded', value: true })
    })
    await get().init()
  },

  resetToSeed: async () => {
    await db.transaction('rw', ALL_TABLES, async () => {
      await Promise.all(ALL_TABLES.map((t) => t.clear()))
    })
    await get().init()
  },
}))
