import type { Board, Card, Connection, EnvPreset } from '../types'

/** 연결 띠에 보일 순서. agent-db alias 가 있는 것 먼저(이름 순), 그다음 가짜 결과 연결(환경 프리셋 순) */
export function connOptions(connections: Connection[], envs: EnvPreset[]): Connection[] {
  const order = (c: Connection) => {
    const i = envs.findIndex((e) => e.id === c.envId)
    return i < 0 ? envs.length : i
  }
  return [...connections].sort((a, b) => (a.alias ? 0 : 1) - (b.alias ? 0 : 1) || a.name.localeCompare(b.name, 'ko') || order(a) - order(b))
}

/** 연결 띠 · 카드 머리에 보일 글자: alias, 없으면 "가짜 결과(환경)" */
export function connLabel(c: Connection, envs: EnvPreset[]): string {
  if (c.alias) return c.alias
  const env = envs.find((e) => e.id === c.envId)?.name
  return env ? `가짜 결과 · ${env}` : '가짜 결과'
}

/**
 * 작업판이 쓰는 연결. 작업판의 조회 카드는 모두 이 연결로 조회한다.
 * 작업판이 고른 연결(board.connId)이 먼저다. 고른 것이 없거나 지워졌으면 connOptions 의 첫 연결(alias 있는 것 먼저)을 쓴다.
 * 사이드바의 환경 프리셋(명령 변수용)과는 따로 움직인다.
 */
export function resolveConn(board: Pick<Board, 'connId'>, connections: Connection[], envs: EnvPreset[]): Connection | undefined {
  return connections.find((c) => c.id === board.connId) ?? connOptions(connections, envs)[0]
}

/** 예전 저장 모양: 카드가 연결 이름(connection) 또는 연결 id(connectionId)를 들고, 작업판이 이름마다 연결을 골랐다(conns) */
type OldCard = Card & { connection?: string; connectionId?: string }
type OldBoard = Board & { conns?: Record<string, string> }

/**
 * 예전 저장 모양을 지금 모양으로 옮긴다. 바뀐 카드 · 작업판만 돌려준다.
 * 작업판은 카드 순서대로 처음 찾은 연결 하나를 고른다: 작업판이 그 이름에 고른 연결, 그 이름의 첫 연결, 카드의 예전 연결 id 순.
 * 카드에서는 연결 필드를 지운다. 예전 백업 파일을 가져온 뒤에도 이 길을 탄다.
 */
export function migrateConns(cards: Card[], boards: Board[], connections: Connection[], envs: EnvPreset[]): { cards: Card[]; boards: Board[] } {
  const byId = new Map(cards.map((c) => [c.id, c as OldCard]))
  const exists = (id?: string) => !!id && connections.some((c) => c.id === id)
  const outBoards: Board[] = []
  for (const b of boards as OldBoard[]) {
    const olds = b.cells.map((cell) => byId.get(cell.cardId)).filter((c): c is OldCard => c?.kind === 'query')
    const legacy = 'conns' in b || (!b.connId && olds.some((c) => 'connection' in c || 'connectionId' in c))
    if (!legacy) continue
    const { conns = {}, ...rest } = b
    const names = olds.map((c) => c.connection ?? '').filter(Boolean)
    const connId =
      (b.connId && exists(b.connId) ? b.connId : undefined) ??
      names.map((n) => conns[n]).find(exists) ??
      names.map((n) => connOptions(connections, envs).find((c) => c.name === n)?.id).find(exists) ??
      olds.map((c) => c.connectionId).find(exists)
    outBoards.push(connId ? { ...rest, connId } : rest)
  }
  const outCards: Card[] = []
  for (const c of cards as OldCard[]) {
    if (!('connection' in c) && !('connectionId' in c)) continue
    const { connection: _n, connectionId: _i, ...rest } = c
    outCards.push(rest as Card)
  }
  return { cards: outCards, boards: outBoards }
}
