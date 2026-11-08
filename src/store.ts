import { create } from 'zustand'
import { db } from './db'
import type { Note, Command, Runbook, RunbookRun, Task, EnvPreset, Settings, ExportBundle, Connection, Card, Board } from './types'
import { seedCommands, seedEnvs, seedNotes, seedRunbooks, seedTasks } from './lib/seed'
import { seedBoardCommands, seedBoards, seedCards, seedConnections } from './lib/seedBoard'
import { cheatsheetNotes } from './lib/cheatsheets'
import { now } from './lib/util'

const defaultSettings: Settings = { theme: 'system', userName: '', activeEnvId: 'env_prod' }

interface State {
  ready: boolean
  notes: Note[]
  commands: Command[]
  runbooks: Runbook[]
  runs: RunbookRun[]
  tasks: Task[]
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

  upsertNote: (n: Note) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  upsertCommand: (c: Command) => Promise<void>
  deleteCommand: (id: string) => Promise<void>
  upsertRunbook: (r: Runbook) => Promise<void>
  deleteRunbook: (id: string) => Promise<void>
  upsertRun: (r: RunbookRun) => Promise<void>
  deleteRun: (id: string) => Promise<void>
  upsertTask: (t: Task) => Promise<void>
  deleteTask: (id: string) => Promise<void>
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

function sortByUpdated<T extends { updatedAt: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

const ALL_TABLES = [db.notes, db.commands, db.runbooks, db.runs, db.tasks, db.envs, db.connections, db.cards, db.boards, db.kv]

export const useStore = create<State>((set, get) => ({
  ready: false,
  notes: [],
  commands: [],
  runbooks: [],
  runs: [],
  tasks: [],
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
      await db.transaction('rw', [db.notes, db.commands, db.runbooks, db.tasks, db.envs, db.kv], async () => {
        await db.notes.bulkPut(seedNotes)
        await db.commands.bulkPut(seedCommands)
        await db.runbooks.bulkPut(seedRunbooks)
        await db.tasks.bulkPut(seedTasks)
        await db.envs.bulkPut(seedEnvs)
        await db.kv.put({ key: 'seeded', value: true })
        await db.kv.put({ key: 'seeded_cheatsheet', value: true })
        await db.kv.put({ key: 'settings', value: defaultSettings })
      })
    } else if (!(await db.kv.get('seeded_cheatsheet'))) {
      // 이미 쓰던 브라우저: 치트시트 노트를 한 번만 더한다. 있는 id 는 건드리지 않는다.
      await db.transaction('rw', [db.notes, db.kv], async () => {
        const have = await db.notes.bulkGet(cheatsheetNotes.map((n) => n.id))
        await db.notes.bulkPut(cheatsheetNotes.filter((_, i) => !have[i]))
        await db.kv.put({ key: 'seeded_cheatsheet', value: true })
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
    const [notes, commands, runbooks, runs, tasks, envs, connections, cards, boards, s] = await Promise.all([
      db.notes.toArray(),
      db.commands.toArray(),
      db.runbooks.toArray(),
      db.runs.toArray(),
      db.tasks.toArray(),
      db.envs.toArray(),
      db.connections.toArray(),
      db.cards.toArray(),
      db.boards.toArray(),
      db.kv.get('settings'),
    ])
    set({
      ready: true,
      notes: sortByUpdated(notes),
      commands: sortByUpdated(commands),
      runbooks: sortByUpdated(runbooks),
      runs: [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
      tasks: sortByUpdated(tasks),
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

  upsertNote: async (n) => {
    n = { ...n, updatedAt: now() }
    await db.notes.put(n)
    set({ notes: sortByUpdated([n, ...get().notes.filter((x) => x.id !== n.id)]) })
  },
  deleteNote: async (id) => {
    await db.notes.delete(id)
    set({ notes: get().notes.filter((x) => x.id !== id) })
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
  upsertTask: async (t) => {
    t = { ...t, updatedAt: now() }
    await db.tasks.put(t)
    set({ tasks: sortByUpdated([t, ...get().tasks.filter((x) => x.id !== t.id)]) })
  },
  deleteTask: async (id) => {
    await db.tasks.delete(id)
    set({ tasks: get().tasks.filter((x) => x.id !== id) })
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
      notes: s.notes,
      commands: s.commands,
      runbooks: s.runbooks,
      runs: s.runs,
      tasks: s.tasks,
      envs: s.envs,
      settings: s.settings,
      connections: s.connections,
      cards: s.cards,
      boards: s.boards,
    }
  },

  importBundle: async (b, mode) => {
    if (b.app !== 'workbench') throw new Error('WorkBench 내보내기 파일이 아닙니다.')
    await db.transaction('rw', ALL_TABLES, async () => {
      if (mode === 'replace') {
        await Promise.all(ALL_TABLES.filter((t) => t !== db.kv).map((t) => t.clear()))
      }
      await db.notes.bulkPut(b.notes ?? [])
      await db.commands.bulkPut(b.commands ?? [])
      await db.runbooks.bulkPut(b.runbooks ?? [])
      await db.runs.bulkPut(b.runs ?? [])
      await db.tasks.bulkPut(b.tasks ?? [])
      await db.envs.bulkPut(b.envs ?? [])
      await db.connections.bulkPut(b.connections ?? [])
      await db.cards.bulkPut(b.cards ?? [])
      await db.boards.bulkPut(b.boards ?? [])
      if (mode === 'replace' && b.settings) await db.kv.put({ key: 'settings', value: b.settings })
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
