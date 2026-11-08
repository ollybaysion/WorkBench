import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Board, QueryCard } from '../types'
import { fixtureRunner, type QueryState, type Runner } from '../lib/runner'
import { extractBinds, pickBinds } from '../lib/sql'
import { fmtTime, now } from '../lib/util'
import Topbar from '../components/Topbar'
import VarBand from '../components/board/VarBand'
import BoardGrid, { type Placed } from '../components/board/BoardGrid'
import CardDrawer from '../components/board/CardDrawer'

// 6 단계에서 서버 실행기로 바꿔 끼운다. 페이지는 Runner 인터페이스만 쓴다
const runner: Runner = fixtureRunner

const byTitle = (a: Board, b: Board) => a.title.localeCompare(b.title, 'ko')

export default function BoardPage() {
  const { id } = useParams()
  const boards = useStore((s) => s.boards)
  if (!id) {
    const first = [...boards].sort(byTitle)[0]
    if (first) return <Navigate to={`/board/${first.id}`} replace />
    return (
      <>
        <Topbar title="작업대" />
        <div className="panel">
          <div className="empty">보드가 없습니다</div>
        </div>
      </>
    )
  }
  const board = boards.find((b) => b.id === id)
  if (!board) return <Navigate to="/board" replace />
  return <BoardView key={board.id} board={board} />
}

function BoardView({ board }: { board: Board }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const boards = useStore((s) => s.boards)
  const cards = useStore((s) => s.cards)
  const connections = useStore((s) => s.connections)
  const upsertBoard = useStore((s) => s.upsertBoard)

  // 조회 결과 · 상태는 페이지 로컬. IndexedDB 에 저장하지 않는다
  const [runs, setRuns] = useState<Record<string, QueryState>>({})
  const [checks, setChecks] = useState<Record<string, boolean[]>>({})
  const seq = useRef<Record<string, number>>({}) // 카드별 마지막 실행 번호(늦게 온 옛 결과 무시)
  const keys = useRef<Record<string, string>>({}) // 카드별 마지막 조회의 (sql · 연결 · 바인드 값) 키

  const cells = useMemo<Placed[]>(
    () =>
      board.cells
        .flatMap((cell) => {
          const card = cards.find((c) => c.id === cell.cardId)
          return card ? [{ cell, card }] : []
        })
        .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x),
    [board.cells, cards],
  )
  const queryCards = useMemo(() => cells.map((p) => p.card).filter((c): c is QueryCard => c.kind === 'query'), [cells])
  // 변수 띠: 모든 조회 카드의 바인드를 처음 나온 순서로
  const bindNames = useMemo(() => {
    const out: string[] = []
    for (const c of queryCards) for (const b of extractBinds(c.sql)) if (!out.includes(b)) out.push(b)
    return out
  }, [queryCards])

  const runCard = useCallback(
    (card: QueryCard) => {
      const n = (seq.current[card.id] ?? 0) + 1
      seq.current[card.id] = n
      setRuns((r) => ({ ...r, [card.id]: { status: 'loading' } }))
      const conn = connections.find((c) => c.id === card.connectionId)
      const p = conn ? runner.run(card, conn, pickBinds(card.sql, board.vars)) : Promise.reject(new Error('연결이 없습니다'))
      p.then(
        (result) => {
          if (seq.current[card.id] === n) setRuns((r) => ({ ...r, [card.id]: { status: 'ok', result, at: now() } }))
        },
        (e: unknown) => {
          if (seq.current[card.id] === n) setRuns((r) => ({ ...r, [card.id]: { status: 'error', message: e instanceof Error ? e.message : String(e), at: now() } }))
        },
      )
    },
    [connections, board.vars],
  )

  // 처음 열 때 전부, 그 뒤에는 쓰는 변수 값(또는 SQL · 연결)이 바뀐 카드만 다시 조회
  useEffect(() => {
    for (const card of queryCards) {
      const key = JSON.stringify([card.connectionId, card.sql, pickBinds(card.sql, board.vars)])
      if (keys.current[card.id] !== key) {
        keys.current[card.id] = key
        runCard(card)
      }
    }
  }, [queryCards, board.vars, runCard])

  const runAll = () => queryCards.forEach(runCard)
  const lastAt = Object.values(runs).reduce<string | undefined>((m, r) => (r.status !== 'loading' && (!m || r.at > m) ? r.at : m), undefined)

  const selectedId = params.get('card') ?? undefined
  const selected = selectedId ? cells.find((p) => p.card.id === selectedId)?.card : undefined
  const open = (cardId: string) => setParams({ card: cardId })
  const close = useCallback(() => setParams({}), [setParams])

  const saveVars = useCallback(
    (vars: Record<string, string>) => {
      const b = useStore.getState().boards.find((x) => x.id === board.id)
      if (b) void upsertBoard({ ...b, vars })
    },
    [board.id, upsertBoard],
  )
  const setCardChecks = (cardId: string, c: boolean[]) => setChecks((all) => ({ ...all, [cardId]: c }))

  const title =
    boards.length > 1 ? (
      <select className="input board-select" value={board.id} onChange={(e) => navigate(`/board/${e.target.value}`)} aria-label="보드 선택">
        {[...boards].sort(byTitle).map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
          </option>
        ))}
      </select>
    ) : (
      board.title
    )

  return (
    <>
      <div className="board-sticky">
        <Topbar title={title} search="카드 · 명령 · 런북 검색">
          <span className="muted small mono">마지막 조회 {fmtTime(lastAt)}</span>
          <button type="button" className="btn" onClick={runAll}>
            ↻ 다시 조회
          </button>
        </Topbar>
        <VarBand names={bindNames} vars={board.vars} onSave={saveVars} />
      </div>
      <BoardGrid cells={cells} runs={runs} boardVars={board.vars} checks={checks} onChecks={setCardChecks} selectedId={selectedId} onOpen={open} />
      {selected && (
        <CardDrawer
          card={selected}
          run={runs[selected.id]}
          boardVars={board.vars}
          checks={checks[selected.id]}
          onChecks={(c) => setCardChecks(selected.id, c)}
          onClose={close}
          onRerun={() => selected.kind === 'query' && runCard(selected)}
        />
      )}
    </>
  )
}
