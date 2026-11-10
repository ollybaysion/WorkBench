/**
 * WorkBench MCP 서버(stdio). agent(opencode 등)가 작업판을 읽고 만든다.
 * 개발 서버와 같은 저장 폴더(WORKBENCH_DATA, 기본 ~/.workbench/data)의 JSON 파일을 다룬다(dataFiles.ts).
 * 개발 서버가 켜져 있으면 화면이 바뀐 파일을 바로 다시 읽는다.
 *
 * 띄우기: node server/mcp.ts   (Node 22.18 이상. 타입만 지우고 돌린다)
 *   WORKBENCH_DATA  저장 폴더
 *   WORKBENCH_URL   화면 주소. 작업판 링크에 쓴다. 기본 http://127.0.0.1:5173
 *
 * 조회는 여기서 하지 않는다. get_board 가 카드마다 SQL · 바인드 값 · agent-db alias 를 주므로
 * agent 가 agent-db MCP 의 run_query 로 같은 데이터를 받는다.
 */
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { Board, BoardCell, BoardSnapshot, Card, CardView, Command, Connection, QueryCard } from '../src/types.ts'
import { append } from '../src/lib/layout.ts'
import { groupBoards } from '../src/lib/boardGroup.ts'
import { extractBinds, pickBinds } from '../src/lib/sql.ts'
import { UserError, apply, readTable, type Row } from './dataFiles.ts'

const APP_URL = (process.env.WORKBENCH_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '')
const boardUrl = (id: string) => `${APP_URL}/#/board/${id}`
const now = () => new Date().toISOString()
const shortId = () => randomUUID().replace(/-/g, '').slice(0, 8)

const CHART_TYPES = ['line', 'step', 'area', 'bar', 'stacked-bar', 'scatter', 'histogram', 'heatmap', 'box', 'stat'] as const

const chartSchema = z
  .object({
    type: z.enum(CHART_TYPES).describe('line 선 · step 계단 · area 영역 · bar 막대 · stacked-bar 누적 막대 · scatter 산점도 · histogram · heatmap · box 상자 그림 · stat 숫자 타일'),
    x: z.string().default('').describe('x 열. stat 은 비우면 y 열마다 타일 하나(첫 행 값)'),
    y: z.array(z.string()).min(1).describe('y 열들'),
    series: z.string().optional().describe('시리즈 열. 값마다 선 하나(선 그래프) · 타일 하나(stat + 시간 x)'),
    focus: z.string().optional().describe('겹침 변수 이름. 이 변수 값과 이름이 같은 시리즈만 진하게(선 그래프)'),
    phase: z.string().optional().describe('구간 열(STEP 같은). 값이 바뀌는 x 에 세로 선(선 그래프)'),
    band: z.string().optional().describe('강조 구간 열. 값이 있는 x 를 칠한다(선 그래프)'),
  })
  .describe('없으면 표로 보인다')

const cardSchema = z.object({
  card_id: z.string().optional().describe('보관함에 이미 있는 카드를 올릴 때 그 id. 주면 title · sql · chart 등은 쓰지 않는다'),
  title: z.string().optional().describe('카드 제목(새 카드는 필수)'),
  description: z.string().optional(),
  sql: z.string().optional().describe('Oracle SQL(새 카드는 필수). 바인드는 :이름. 값은 작업판 변수(vars)에서 온다'),
  chart: chartSchema.optional(),
  picks: z
    .array(z.object({ col: z.string(), var: z.string() }))
    .optional()
    .describe('표 행 · 타일 · 히트맵 칸을 누르면 열 col 의 값을 변수 var 에 넣는다'),
  limits: z
    .object({ lcl: z.string().optional(), ucl: z.string().optional(), value: z.string().optional() })
    .optional()
    .describe('관리 한계 열 이름. 범위를 넘은 행 · 타일을 표시하고 선 그래프에 선을 그린다'),
  w: z.number().int().min(1).max(4).default(2).describe('폭(4 열 격자에서 1~4)'),
  h: z.number().int().min(1).max(2).default(1).describe('높이 1~2'),
})
type CardSpec = z.infer<typeof cardSchema>

const ok = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] })
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] })
/** 도구 처리 중 오류를 agent 가 읽을 글로 돌려준다 */
const tool =
  <A>(fn: (args: A) => Promise<unknown>) =>
  async (args: A) => {
    try {
      return ok(await fn(args))
    } catch (e) {
      return fail(e)
    }
  }

const load = async <T>(t: 'boards' | 'cards' | 'connections' | 'commands' | 'snapshots') => (await readTable(t)) as unknown as T[]
const put = (table: 'boards' | 'cards', rows: unknown[]) => apply([{ op: 'put', table, rows: rows as Row[] }])

async function boardOf(id: string): Promise<Board> {
  const b = (await load<Board>('boards')).find((x) => x.id === id)
  if (!b) throw new UserError(`작업판 ${id} 이 없습니다. list_boards 로 id 를 확인하세요`)
  return b
}

function viewOf(chart: CardSpec['chart']): CardView {
  if (!chart) return { kind: 'table' }
  if (chart.type !== 'stat' && !chart.x.trim()) throw new UserError(`${chart.type} 그래프는 x 열이 있어야 합니다`)
  const opt = (k: 'series' | 'focus' | 'phase' | 'band') => (chart[k]?.trim() ? { [k]: chart[k]!.trim() } : {})
  return { kind: 'chart', type: chart.type, x: chart.x.trim(), y: chart.y.map((s) => s.trim()).filter(Boolean), ...opt('series'), ...opt('focus'), ...opt('phase'), ...opt('band') }
}

/** 새 카드를 만들거나 보관함 카드를 찾는다. 돌려준 카드 중 isNew 인 것만 파일에 쓴다 */
function cardFrom(spec: CardSpec, library: Card[]): { card: Card; isNew: boolean } {
  if (spec.card_id) {
    const c = library.find((x) => x.id === spec.card_id)
    if (!c) throw new UserError(`카드 ${spec.card_id} 이 없습니다`)
    return { card: c, isNew: false }
  }
  if (!spec.title?.trim()) throw new UserError('새 카드는 title 이 있어야 합니다')
  if (!spec.sql?.trim()) throw new UserError(`카드 "${spec.title}" 에 sql 이 없습니다`)
  const t = now()
  const card: QueryCard = {
    id: `card_${shortId()}`,
    createdAt: t,
    updatedAt: t,
    tags: [],
    kind: 'query',
    title: spec.title.trim(),
    ...(spec.description?.trim() ? { description: spec.description.trim() } : {}),
    sql: spec.sql.trim(),
    keyColumns: [],
    view: viewOf(spec.chart),
    ...(spec.picks?.length ? { picks: spec.picks } : {}),
    ...(spec.limits && Object.values(spec.limits).some(Boolean) ? { limits: spec.limits } : {}),
  }
  return { card, isNew: true }
}

/** 카드들을 작업판 아래에 차례로 붙인다(빈 자리는 위로 붙는다) */
async function placeCards(cells: BoardCell[], specs: CardSpec[]): Promise<{ cells: BoardCell[]; cards: Card[]; created: Card[] }> {
  const library = await load<Card>('cards')
  const cards: Card[] = []
  const created: Card[] = []
  for (const spec of specs) {
    const { card, isNew } = cardFrom(spec, library)
    if (cells.some((c) => c.cardId === card.id)) throw new UserError(`카드 ${card.id} 은 이미 이 작업판에 있습니다`)
    cells = append(cells, { cardId: card.id, x: 0, y: 0, w: spec.w, h: spec.h })
    cards.push(card)
    if (isNew) created.push(card)
  }
  return { cells, cards, created }
}

async function connectionCheck(id: string | undefined) {
  if (!id) return
  if (!(await load<Connection>('connections')).some((c) => c.id === id)) throw new UserError(`연결 ${id} 이 없습니다. list_connections 로 id 를 확인하세요`)
}

const server = new McpServer({ name: 'workbench', version: '1.0.0' })

server.registerTool(
  'list_boards',
  { description: '작업판 목록. 묶음(group) 별로, 묶음 없는 작업판 먼저. id · 제목 · 카드 수 · 화면 링크' },
  tool(async () =>
    groupBoards(await load<Board>('boards')).flatMap(({ group, boards }) =>
      boards.map((b) => ({ id: b.id, title: b.title, group: group || null, cards: b.cells.length, updatedAt: b.updatedAt, url: boardUrl(b.id) })),
    ),
  ),
)

server.registerTool(
  'list_connections',
  { description: 'DB 연결 목록. alias 가 있으면 agent-db 로 조회하고, 없으면 화면은 가짜 결과를 쓴다' },
  tool(async () => (await load<Connection>('connections')).map((c) => ({ id: c.id, name: c.name, alias: c.alias ?? null }))),
)

server.registerTool(
  'get_board',
  {
    description:
      '작업판 하나. 변수 값 · 연결(agent-db alias) · 카드마다 SQL · 보기 설정 · 바인드 값을 준다. ' +
      '같은 데이터를 보려면 agent-db MCP 의 run_query 에 db=alias, sql, binds 를 그대로 넘긴다',
    inputSchema: { board_id: z.string() },
  },
  tool(async ({ board_id }: { board_id: string }) => {
    const b = await boardOf(board_id)
    const [cards, conns, commands] = await Promise.all([load<Card>('cards'), load<Connection>('connections'), load<Command>('commands')])
    // 화면과 같은 규칙(lib/conn.ts resolveConn): 고른 연결, 없으면 alias 있는 연결 먼저
    const conn = conns.find((c) => c.id === b.connId) ?? [...conns].sort((x, y) => (x.alias ? 0 : 1) - (y.alias ? 0 : 1) || x.name.localeCompare(y.name, 'ko'))[0]
    return {
      id: b.id,
      title: b.title,
      group: b.group ?? null,
      url: boardUrl(b.id),
      vars: b.vars,
      connection: conn ? { id: conn.id, name: conn.name, alias: conn.alias ?? null, picked: conn.id === b.connId } : null,
      cards: b.cells.flatMap((cell): Row[] => {
        const c = cards.find((x) => x.id === cell.cardId)
        if (!c) return []
        const at = { x: cell.x, y: cell.y, w: cell.w, h: cell.h }
        if (c.kind === 'command') return [{ id: c.id, kind: 'command', title: c.title, cell: at, command: commands.find((x) => x.id === c.commandId)?.title ?? null }]
        return [{ id: c.id, kind: 'query', title: c.title, description: c.description, cell: at, sql: c.sql, binds: pickBinds(c.sql, b.vars), view: c.view, picks: c.picks, limits: c.limits }]
      }),
    }
  }),
)

server.registerTool(
  'create_board',
  {
    description: '새 작업판을 만든다. 카드는 순서대로 4 열 격자에 붙인다. 만든 작업판의 id · 화면 링크를 돌려준다',
    inputSchema: {
      title: z.string().min(1),
      group: z.string().max(30).optional().describe('기능 묶음 이름(TSUM · EVENT · INTERLOCK 같은). list_boards 의 group 을 다시 쓴다'),
      connection_id: z.string().optional().describe('조회할 연결(list_connections 의 id). 없으면 화면의 기본 규칙(alias 있는 연결 먼저)'),
      vars: z.record(z.string(), z.string()).optional().describe('변수 띠 처음 값. SQL 의 :이름 과 같은 이름'),
      cards: z.array(cardSchema).default([]),
    },
  },
  tool(async (a: { title: string; group?: string; connection_id?: string; vars?: Record<string, string>; cards: CardSpec[] }) => {
    await connectionCheck(a.connection_id)
    const { cells, cards, created } = await placeCards([], a.cards)
    const t = now()
    const binds = [...new Set(cards.flatMap((c) => (c.kind === 'query' ? extractBinds(c.sql) : [])))]
    const board: Board = {
      id: `board_${shortId()}`,
      createdAt: t,
      updatedAt: t,
      tags: [],
      title: a.title.trim(),
      ...(a.group?.trim() ? { group: a.group.trim() } : {}),
      cells,
      // SQL 의 바인드는 빈 값이라도 변수 띠에 둔다
      vars: { ...Object.fromEntries(binds.map((n) => [n, ''])), ...(a.vars ?? {}) },
      ...(a.connection_id ? { connId: a.connection_id } : {}),
    }
    await put('cards', created)
    await put('boards', [board])
    return { board_id: board.id, url: boardUrl(board.id), cards: cards.map((c) => ({ id: c.id, title: c.title })) }
  }),
)

server.registerTool(
  'add_cards',
  {
    description: '작업판 아래에 카드를 붙인다. 새 카드를 만들거나, card_id 로 보관함 카드를 올린다',
    inputSchema: { board_id: z.string(), cards: z.array(cardSchema).min(1) },
  },
  tool(async (a: { board_id: string; cards: CardSpec[] }) => {
    const b = await boardOf(a.board_id)
    const { cells, cards, created } = await placeCards(b.cells, a.cards)
    const binds = cards.flatMap((c) => (c.kind === 'query' ? extractBinds(c.sql) : []))
    const vars = { ...Object.fromEntries(binds.filter((n) => !(n in b.vars)).map((n) => [n, ''])), ...b.vars }
    await put('cards', created)
    await put('boards', [{ ...b, cells, vars, updatedAt: now() }])
    return { board_id: b.id, url: boardUrl(b.id), cards: cards.map((c) => ({ id: c.id, title: c.title })) }
  }),
)

server.registerTool(
  'update_card',
  {
    description: '조회 카드의 제목 · SQL · 보기를 고친다. 준 칸만 바꾼다. chart 에 null 을 주면 표로 바꾼다. 이 카드를 올린 모든 작업판에 반영된다',
    inputSchema: {
      card_id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      sql: z.string().optional(),
      chart: chartSchema.nullable().optional(),
      picks: cardSchema.shape.picks,
      limits: cardSchema.shape.limits,
    },
  },
  tool(async (a: { card_id: string; title?: string; description?: string; sql?: string; chart?: CardSpec['chart'] | null; picks?: CardSpec['picks']; limits?: CardSpec['limits'] }) => {
    const c = (await load<Card>('cards')).find((x) => x.id === a.card_id)
    if (!c) throw new UserError(`카드 ${a.card_id} 이 없습니다`)
    if (c.kind !== 'query') throw new UserError('명령 카드는 고칠 수 없습니다')
    if (a.sql !== undefined && !a.sql.trim()) throw new UserError('sql 을 비울 수 없습니다')
    const next: QueryCard = {
      ...c,
      ...(a.title?.trim() ? { title: a.title.trim() } : {}),
      ...(a.description !== undefined ? { description: a.description.trim() || undefined } : {}),
      ...(a.sql !== undefined ? { sql: a.sql.trim() } : {}),
      ...(a.chart !== undefined ? { view: viewOf(a.chart ?? undefined) } : {}),
      ...(a.picks !== undefined ? { picks: a.picks.length ? a.picks : undefined } : {}),
      ...(a.limits !== undefined ? { limits: Object.values(a.limits).some(Boolean) ? a.limits : undefined } : {}),
      updatedAt: now(),
    }
    await put('cards', [next])
    return { card_id: next.id, title: next.title, view: next.view }
  }),
)

server.registerTool(
  'update_board',
  {
    description: '작업판의 제목 · 묶음 · 변수 값 · 연결을 바꾼다. vars 는 준 이름만 바꾼다. group 에 빈 글자를 주면 묶음을 뺀다',
    inputSchema: {
      board_id: z.string(),
      title: z.string().optional(),
      group: z.string().max(30).optional(),
      vars: z.record(z.string(), z.string()).optional(),
      connection_id: z.string().optional().describe('list_connections 의 id'),
    },
  },
  tool(async (a: { board_id: string; title?: string; group?: string; vars?: Record<string, string>; connection_id?: string }) => {
    const b = await boardOf(a.board_id)
    await connectionCheck(a.connection_id)
    const { group: oldGroup, ...rest } = b
    const group = a.group === undefined ? oldGroup : a.group.trim() || undefined
    const next: Board = {
      ...rest,
      ...(group ? { group } : {}),
      ...(a.title?.trim() ? { title: a.title.trim() } : {}),
      vars: { ...b.vars, ...(a.vars ?? {}) },
      ...(a.connection_id ? { connId: a.connection_id } : {}),
      updatedAt: now(),
    }
    await put('boards', [next])
    return { board_id: next.id, title: next.title, group: next.group ?? null, vars: next.vars, url: boardUrl(next.id) }
  }),
)

server.registerTool(
  'list_snapshots',
  { description: '저장한 화면 목록. 사람이 작업판에서 "📷 화면 저장" 으로 남긴 그 시각의 변수 · 조회 결과', inputSchema: { board_id: z.string().optional().describe('이 작업판 것만') } },
  tool(async ({ board_id }: { board_id?: string }) =>
    (await load<BoardSnapshot>('snapshots'))
      .filter((x) => !board_id || x.boardId === board_id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((x) => ({ id: x.id, title: x.title, boardId: x.boardId, boardTitle: x.boardTitle, savedAt: x.createdAt, cards: Object.keys(x.results).length, url: `${APP_URL}/#/snapshot/${x.id}` })),
  ),
)

server.registerTool(
  'get_snapshot',
  {
    description: '저장한 화면 하나. 카드마다 SQL · 그때 넣은 바인드 값 · 조회 결과(열 · 행)를 준다. 다시 조회하지 않고 사람이 본 그 데이터로 분석할 때 쓴다',
    inputSchema: {
      snapshot_id: z.string(),
      card_id: z.string().optional().describe('이 카드만'),
      max_rows: z.number().int().min(0).max(1000).default(200).describe('카드마다 돌려줄 행 수의 끝. 넘으면 truncated'),
    },
  },
  tool(async (a: { snapshot_id: string; card_id?: string; max_rows: number }) => {
    const x = (await load<BoardSnapshot>('snapshots')).find((y) => y.id === a.snapshot_id)
    if (!x) throw new UserError(`저장한 화면 ${a.snapshot_id} 이 없습니다. list_snapshots 로 id 를 확인하세요`)
    return {
      id: x.id,
      title: x.title,
      savedAt: x.createdAt,
      board: { id: x.boardId, title: x.boardTitle },
      vars: x.vars,
      connection: x.conn ?? null,
      cards: x.cells.flatMap((cell): Row[] => {
        const c = x.cards.find((y) => y.id === cell.cardId)
        if (!c || c.kind !== 'query' || (a.card_id && c.id !== a.card_id)) return []
        const r = x.results[c.id]
        const base = { id: c.id, title: c.title, sql: c.sql, view: c.view, cell: { x: cell.x, y: cell.y, w: cell.w, h: cell.h } }
        if (!r) return [{ ...base, status: 'not_run' }]
        if (r.status === 'error') return [{ ...base, status: 'error', message: r.message, at: r.at, binds: r.binds }]
        const rows = r.result.rows
        return [
          {
            ...base,
            status: 'ok',
            at: r.at,
            binds: r.binds,
            columns: r.result.columns,
            rowCount: rows.length,
            rows: rows.slice(0, a.max_rows),
            truncated: rows.length > a.max_rows || r.result.truncated,
          },
        ]
      }),
    }
  }),
)

await server.connect(new StdioServerTransport())
