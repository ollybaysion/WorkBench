import { create } from 'zustand'
import { db } from './db'
import type { Command, Runbook, RunbookRun, EnvPreset, Settings, ExportBundle, Connection, Card, Board, BoardSnapshot } from './types'
import { seedCommands, seedEnvs, seedRunbooks } from './lib/seed'
import { seedBoardCommands, seedBoards, seedCards, seedConnections, seedFdcBoard, seedFdcCards, seedFdcConnections, seedTsumBoard, seedTsumCards } from './lib/seedBoard'
import { now, uid } from './lib/util'
import { migrateConns } from './lib/conn'
import { FILE_TABLES, LOCAL_KV, attachFiles, fileReadAll, onFileError, withMirrorPaused, type FileTable } from './lib/fileStore'

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
  snapshots: BoardSnapshot[]
  settings: Settings
  toast: string | null
  paletteOpen: boolean
  /** 파일 저장소 폴더. 없으면 이 브라우저(IndexedDB)에만 저장한다 */
  fileDir?: string

  init: () => Promise<void>
  /** 다른 프로그램(MCP 서버 · 편집기)이 바꾼 테이블을 파일에서 다시 읽는다 */
  reloadTables: (tables: string[]) => Promise<void>
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
  /** 빈 작업판을 만든다. 이름은 "새 작업판", 겹치면 뒤에 번호를 붙인다 */
  createBoard: () => Promise<Board>
  deleteBoard: (id: string) => Promise<void>
  upsertSnapshot: (s: BoardSnapshot) => Promise<void>
  deleteSnapshot: (id: string) => Promise<void>

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
const ALL_TABLES = [db.commands, db.runbooks, db.runs, db.envs, db.connections, db.cards, db.boards, db.snapshots, db.kv]

export const useStore = create<State>((set, get) => ({
  ready: false,
  commands: [],
  runbooks: [],
  runs: [],
  envs: [],
  connections: [],
  cards: [],
  boards: [],
  snapshots: [],
  settings: defaultSettings,
  toast: null,
  paletteOpen: false,

  init: async () => {
    onFileError((msg) => get().showToast(`파일에 저장하지 못했습니다: ${msg}`))
    // 파일 저장소(npm run dev)에 붙으면 파일 내용으로 IndexedDB 를 채운다. 그 뒤의 쓰기는 파일에도 간다
    const files = await attachFiles(async () => Object.fromEntries(await Promise.all(FILE_TABLES.map(async (t) => [t, await db.table(t).toArray()]))) as Record<FileTable, Record<string, unknown>[]>)
    const fromFiles = files.tables
    if (fromFiles) {
      await withMirrorPaused(() =>
        db.transaction(
          'rw',
          FILE_TABLES.map((t) => db.table(t)),
          async () => {
            for (const t of FILE_TABLES) {
              // 설정(kv 의 settings)은 브라우저에만 있으므로 남긴다
              if (t === 'kv') await db.kv.where('key').noneOf([...LOCAL_KV]).delete()
              else await db.table(t).clear()
              await db.table(t).bulkPut(fromFiles[t])
            }
          },
        ),
      )
    }
    if (files.errors.length) console.warn('[file-store] 읽지 못한 파일', files.errors)
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
    // FDC 확인 작업판: 한 번만 넣는다(지운 뒤 다시 생기지 않게 kv 에 적는다). 같은 id 가 이미 있으면 그대로 둔다
    if (!(await db.kv.get('seededFdcTrace'))) {
      await db.transaction('rw', [db.connections, db.cards, db.boards, db.kv], async () => {
        const [conns, cards, board] = await Promise.all([
          db.connections.bulkGet(seedFdcConnections.map((c) => c.id)),
          db.cards.bulkGet(seedFdcCards.map((c) => c.id)),
          db.boards.get(seedFdcBoard.id),
        ])
        await db.connections.bulkPut(seedFdcConnections.filter((_, i) => !conns[i]))
        await db.cards.bulkPut(seedFdcCards.filter((_, i) => !cards[i]))
        if (!board) await db.boards.put(seedFdcBoard)
        await db.kv.put({ key: 'seededFdcTrace', value: true })
      })
    }
    // TSUM 확인 작업판: FDC-DEMO 연결을 같이 쓴다. 한 번만 넣고, 같은 id 가 이미 있으면 그대로 둔다
    if (!(await db.kv.get('seededTsum'))) {
      await db.transaction('rw', [db.connections, db.cards, db.boards, db.kv], async () => {
        const [conns, cards, board] = await Promise.all([
          db.connections.bulkGet(seedFdcConnections.map((c) => c.id)),
          db.cards.bulkGet(seedTsumCards.map((c) => c.id)),
          db.boards.get(seedTsumBoard.id),
        ])
        await db.connections.bulkPut(seedFdcConnections.filter((_, i) => !conns[i]))
        await db.cards.bulkPut(seedTsumCards.filter((_, i) => !cards[i]))
        if (!board) await db.boards.put(seedTsumBoard)
        await db.kv.put({ key: 'seededTsum', value: true })
      })
    }
    const [commands, runbooks, runs, envs, connections, loadedCards, loadedBoards, snapshots, s] = await Promise.all([
      db.commands.toArray(),
      db.runbooks.toArray(),
      db.runs.toArray(),
      db.envs.toArray(),
      db.connections.toArray(),
      db.cards.toArray(),
      db.boards.toArray(),
      db.snapshots.toArray(),
      db.kv.get('settings'),
    ])
    // 예전 저장 모양(카드마다 연결)을 작업판마다 연결 하나로 옮긴다. 예전 백업 파일을 가져온 뒤에도 이 길을 탄다
    let cards = loadedCards
    let boards = loadedBoards
    const fixed = migrateConns(cards, boards, connections, envs)
    if (fixed.cards.length || fixed.boards.length) {
      await db.transaction('rw', [db.cards, db.boards], async () => {
        await db.cards.bulkPut(fixed.cards)
        await db.boards.bulkPut(fixed.boards)
      })
      const replace = <T extends { id: string }>(all: T[], next: T[]) => all.map((x) => next.find((f) => f.id === x.id) ?? x)
      cards = replace(cards, fixed.cards)
      boards = replace(boards, fixed.boards)
    }
    set({
      ready: true,
      fileDir: files.status.ok ? files.status.dir : undefined,
      commands: sortByUpdated(commands),
      runbooks: sortByUpdated(runbooks),
      runs: [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
      envs,
      connections: sortByUpdated(connections),
      cards: sortByUpdated(cards),
      boards: sortByUpdated(boards),
      snapshots: sortByUpdated(snapshots),
      settings: { ...defaultSettings, ...((s?.value as Partial<Settings>) ?? {}) },
    })
  },

  reloadTables: async (names) => {
    if (!get().ready || !get().fileDir) return
    // kv(시드 표시)는 앱을 켤 때만 읽는다
    const tables = FILE_TABLES.filter((t) => t !== 'kv' && names.includes(t))
    if (!tables.length) return
    const { tables: rows } = await fileReadAll()
    await withMirrorPaused(() =>
      db.transaction(
        'rw',
        tables.map((t) => db.table(t)),
        async () => {
          for (const t of tables) {
            await db.table(t).clear()
            await db.table(t).bulkPut(rows[t])
          }
        },
      ),
    )
    const patch: Partial<State> = {}
    for (const t of tables) {
      if (t === 'runs') patch.runs = [...(rows.runs as unknown as RunbookRun[])].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      else if (t === 'envs') patch.envs = rows.envs as unknown as EnvPreset[]
      else Object.assign(patch, { [t]: sortByUpdated(rows[t] as unknown as { updatedAt: string }[]) })
    }
    set(patch)
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
    // 이 연결을 고른 작업판은 선택을 비운다(기본 규칙의 연결로 넘어간다)
    const touched = get()
      .boards.filter((b) => b.connId === id)
      .map(({ connId: _c, ...b }) => ({ ...b, updatedAt: now() }))
    await db.transaction('rw', [db.connections, db.boards], async () => {
      await db.connections.delete(id)
      await db.boards.bulkPut(touched)
    })
    const ids = new Set(touched.map((b) => b.id))
    set({ connections: get().connections.filter((x) => x.id !== id), boards: sortByUpdated([...touched, ...get().boards.filter((b) => !ids.has(b.id))]) })
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
  createBoard: async () => {
    const titles = new Set(get().boards.map((b) => b.title))
    let title = '새 작업판'
    for (let n = 2; titles.has(title); n++) title = `새 작업판 ${n}`
    const t = now()
    const b: Board = { id: `board_${uid().slice(0, 8)}`, createdAt: t, updatedAt: t, tags: [], title, cells: [], vars: {} }
    await db.boards.put(b)
    set({ boards: sortByUpdated([b, ...get().boards]) })
    return b
  },
  deleteBoard: async (id) => {
    await db.boards.delete(id)
    set({ boards: get().boards.filter((x) => x.id !== id) })
  },

  upsertSnapshot: async (x) => {
    await db.snapshots.put(x)
    set({ snapshots: sortByUpdated([x, ...get().snapshots.filter((y) => y.id !== x.id)]) })
  },
  deleteSnapshot: async (id) => {
    await db.snapshots.delete(id)
    set({ snapshots: get().snapshots.filter((x) => x.id !== id) })
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
      snapshots: s.snapshots,
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
      await db.snapshots.bulkPut(b.snapshots ?? [])
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

// 다른 프로그램이 저장 폴더의 파일을 바꾸면 개발 서버가 알린다(server/fileStore.ts)
if (import.meta.hot) {
  import.meta.hot.on('workbench:files', (d: { tables: string[] }) => void useStore.getState().reloadTables(d.tables))
}
