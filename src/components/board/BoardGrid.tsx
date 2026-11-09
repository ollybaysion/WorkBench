import type { BoardCell, Card, Connection, QueryCard } from '../../types'
import type { QueryState } from '../../lib/runner'
import QueryCardView from './QueryCardView'
import CommandCardView from './CommandCardView'

export interface Placed {
  cell: BoardCell
  card: Card
}

interface Props {
  cells: Placed[]
  connOf: (card: Card) => Connection | undefined
  runs: Record<string, QueryState>
  /** 조회한 뒤 변수 · alias · SQL 이 바뀐 카드 */
  stale: Record<string, boolean>
  onRun: (card: QueryCard) => void
  boardVars: Record<string, string>
  checks: Record<string, boolean[]>
  onChecks: (cardId: string, checks: boolean[]) => void
  selectedId?: string
  onOpen: (cardId: string) => void
}

/** CSS grid 4 열 · 칸 높이 184 · 간격 12. 칸은 x,y,w,h 로 놓인다 */
export default function BoardGrid({ cells, connOf, runs, stale, onRun, boardVars, checks, onChecks, selectedId, onOpen }: Props) {
  return (
    <div className="bgrid">
      {cells.map(({ cell, card }) => (
        <div key={card.id} className="bcell" style={{ gridColumn: `${cell.x + 1} / span ${cell.w}`, gridRow: `${cell.y + 1} / span ${cell.h}` }}>
          {card.kind === 'query' ? (
            <QueryCardView card={card} conn={connOf(card)} run={runs[card.id]} stale={!!stale[card.id]} onRun={() => onRun(card)} selected={card.id === selectedId} onOpen={() => onOpen(card.id)} />
          ) : (
            <CommandCardView
              card={card}
              boardVars={boardVars}
              checks={checks[card.id]}
              onChecks={(c) => onChecks(card.id, c)}
              selected={card.id === selectedId}
              onOpen={() => onOpen(card.id)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
