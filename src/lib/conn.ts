import type { Board, Card, Connection, EnvPreset } from '../types'

/** 연결 이름 목록(가나다순, 중복 없이) */
export function connNames(connections: Connection[]): string[] {
  return [...new Set(connections.map((c) => c.name))].sort((a, b) => a.localeCompare(b, 'ko'))
}

/** 같은 이름의 연결들을 환경 프리셋 순서대로 */
export function connsNamed(name: string, connections: Connection[], envs: EnvPreset[]): Connection[] {
  const order = (c: Connection) => {
    const i = envs.findIndex((e) => e.id === c.envId)
    return i < 0 ? envs.length : i
  }
  return connections.filter((c) => c.name === name).sort((a, b) => order(a) - order(b))
}

/**
 * 작업판이 연결 이름에 쓰는 실제 연결.
 * 작업판이 고른 연결(board.conns)이 먼저다. 고른 것이 없거나 지워졌으면 환경 프리셋 순서로 첫 연결을 쓴다.
 * 사이드바의 환경 프리셋(명령 변수용)과는 따로 움직인다.
 */
export function resolveConn(name: string, board: Pick<Board, 'conns'>, connections: Connection[], envs: EnvPreset[]): Connection | undefined {
  const picked = board.conns?.[name]
  return connections.find((c) => c.id === picked && c.name === name) ?? connsNamed(name, connections, envs)[0]
}

/** 예전 카드(connectionId)를 연결 이름으로 옮긴다. 바뀐 카드만 돌려준다 */
export function migrateCards(cards: Card[], connections: Connection[]): Card[] {
  const out: Card[] = []
  for (const c of cards) {
    if (c.kind !== 'query' || typeof c.connection === 'string') continue
    const { connectionId, ...rest } = c as Card & { connectionId?: string }
    out.push({ ...rest, connection: connections.find((x) => x.id === connectionId)?.name ?? '' } as Card)
  }
  return out
}

/** 예전 카드가 가리키던 연결 id 를 작업판의 연결 선택으로 남긴다(같은 연결에 계속 붙게) */
export function migrateBoards(boards: Board[], oldCards: Card[], connections: Connection[]): Board[] {
  const byCard = new Map<string, string>()
  for (const c of oldCards) {
    const id = (c as Card & { connectionId?: string }).connectionId
    if (id) byCard.set(c.id, id)
  }
  const out: Board[] = []
  for (const b of boards) {
    if (b.conns) continue
    const conns: Record<string, string> = {}
    for (const cell of b.cells) {
      const conn = connections.find((x) => x.id === byCard.get(cell.cardId))
      if (conn && !conns[conn.name]) conns[conn.name] = conn.id
    }
    out.push({ ...b, conns })
  }
  return out
}
