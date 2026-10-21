import { create } from 'zustand'
import { db } from './db'
import type { Note, Command, Runbook, RunbookRun, Task, EnvPreset, Settings, ExportBundle } from './types'
import { seedCommands, seedEnvs, seedNotes, seedRunbooks, seedTasks } from './lib/seed'
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

  activeEnv: () => EnvPreset | undefined
  exportBundle: () => ExportBundle
  importBundle: (b: ExportBundle, mode: 'merge' | 'replace') => Promise<void>
  resetToSeed: () => Promise<void>
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

function sortByUpdated<T extends { updatedAt: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  notes: [],
  commands: [],
  runbooks: [],
  runs: [],
  tasks: [],
  envs: [],
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
        await db.kv.put({ key: 'settings', value: defaultSettings })
      })
    }
    const [notes, commands, runbooks, runs, tasks, envs, s] = await Promise.all([
      db.notes.toArray(),
      db.commands.toArray(),
      db.runbooks.toArray(),
      db.runs.toArray(),
      db.tasks.toArray(),
      db.envs.toArray(),
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
    }
  },

  importBundle: async (b, mode) => {
    if (b.app !== 'workbench') throw new Error('WorkBench 내보내기 파일이 아닙니다.')
    await db.transaction('rw', [db.notes, db.commands, db.runbooks, db.runs, db.tasks, db.envs, db.kv], async () => {
      if (mode === 'replace') {
        await Promise.all([db.notes.clear(), db.commands.clear(), db.runbooks.clear(), db.runs.clear(), db.tasks.clear(), db.envs.clear()])
      }
      await db.notes.bulkPut(b.notes ?? [])
      await db.commands.bulkPut(b.commands ?? [])
      await db.runbooks.bulkPut(b.runbooks ?? [])
      await db.runs.bulkPut(b.runs ?? [])
      await db.tasks.bulkPut(b.tasks ?? [])
      await db.envs.bulkPut(b.envs ?? [])
      if (mode === 'replace' && b.settings) await db.kv.put({ key: 'settings', value: b.settings })
      await db.kv.put({ key: 'seeded', value: true })
    })
    await get().init()
  },

  resetToSeed: async () => {
    await db.transaction('rw', [db.notes, db.commands, db.runbooks, db.runs, db.tasks, db.envs, db.kv], async () => {
      await Promise.all([db.notes.clear(), db.commands.clear(), db.runbooks.clear(), db.runs.clear(), db.tasks.clear(), db.envs.clear(), db.kv.clear()])
    })
    await get().init()
  },
}))
