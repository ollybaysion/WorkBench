import type { Board, Card, Connection, EnvPreset } from '../types'

/** 연결 이름 목록(가나다순, 중복 없이) */
export function connNames(connections: Connection[]): string[] {
  return [...new Set(connections.map((c) => c.name))].sort((a, b) => a.localeCompare(b, 'ko'))
}

/** 같은 이름의 연결들. agent-db alias 가 있는 것 먼저(alias 순), 그다음 가짜 결과 연결(환경 프리셋 순) */
export function connsNamed(name: string, connections: Connection[], envs: EnvPreset[]): Connection[] {
  const order = (c: Connection) => {
    const i = envs.findIndex((e) => e.id === c.envId)
    return i < 0 ? envs.length : i
  }
  return connections
    .filter((c) => c.name === name)
    .sort((a, b) => (a.alias ? 0 : 1) - (b.alias ? 0 : 1) || (a.alias ?? '').localeCompare(b.alias ?? '') || order(a) - order(b))
}

/** 연결 띠 · 카드 머리에 보일 글자: alias, 없으면 "가짜 결과(환경)" */
export function connLabel(c: Connection, envs: EnvPreset[]): string {
  if (c.alias) return c.alias
  const env = envs.find((e) => e.id === c.envId)?.name
  return env ? `가짜 결과 · ${env}` : '가짜 결과'
}

/**
 * 작업판이 연결 이름에 쓰는 실제 연결.
 * 작업판이 고른 연결(board.conns)이 먼저다. 고른 것이 없거나 지워졌으면 connsNamed 의 첫 연결(alias 있는 것 먼저)을 쓴다.
 * 고른 연결이 가짜 결과이고 같은 이름에 alias 연결이 있으면 alias 연결을 쓴다(alias 에 이름만 붙이면 바로 조회된다).
 * 사이드바의 환경 프리셋(명령 변수용)과는 따로 움직인다.
 */
export function resolveConn(name: string, board: Pick<Board, 'conns'>, connections: Connection[], envs: EnvPreset[]): Connection | undefined {
  const picked = connections.find((c) => c.id === board.conns?.[name] && c.name === name)
  const first = connsNamed(name, connections, envs)[0]
  if (picked && (picked.alias || !first?.alias)) return picked
  return first
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
