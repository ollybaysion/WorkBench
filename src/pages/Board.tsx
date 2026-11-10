import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Board, Card, QueryCard } from '../types'
import { runner, type QueryState } from '../lib/runner'
import { extractBinds, pickBinds } from '../lib/sql'
import { resolveConn } from '../lib/conn'
import { fmtTime, now } from '../lib/util'
import Topbar from '../components/Topbar'
import VarBand from '../components/board/VarBand'
import ConnBand from '../components/board/ConnBand'
import BoardGrid, { type Placed } from '../components/board/BoardGrid'
import CardDrawer from '../components/board/CardDrawer'

const byTitle = (a: Board, b: Board) => a.title.localeCompare(b.title, 'ko')

/**
 * 작업판별 조회 상태. 모듈에 두어 다른 메뉴에 갔다 와도 결과가 남는다(새로고침하면 지워진다).
 * runs: 카드별 결과 · keys: 카드별 마지막 조회의 (연결 · sql · 바인드 값) 키 · seq: 카드별 마지막 실행 번호(늦게 온 옛 결과 무시)
 */
interface Session {
  runs: Record<string, QueryState>
  keys: Record<string, string>
  seq: Record<string, number>
}
const sessions = new Map<string, Session>()
function sessionOf(boardId: string): Session {
  let s = sessions.get(boardId)
  if (!s) {
    s = { runs: {}, keys: {}, seq: {} }
    sessions.set(boardId, s)
  }
  return s
}
/** 실행을 하나 시작한다: 번호를 올리고 키를 적는다. 돌려준 번호로 늦게 온 옛 결과를 가른다 */
function startRun(boardId: string, cardId: string, key: string): number {
  const s = sessionOf(boardId)
  const n = (s.seq[cardId] ?? 0) + 1
  s.seq[cardId] = n
  s.keys[cardId] = key
  return n
}
const isLatest = (boardId: string, cardId: string, n: number) => sessionOf(boardId).seq[cardId] === n
const lastKey = (boardId: string, cardId: string) => sessionOf(boardId).keys[cardId]
/** 결과를 세션에 쓰고 새 runs 를 돌려준다(화면을 떠난 뒤 온 결과도 세션에 남는다) */
function putRun(boardId: string, cardId: string, st: QueryState): Record<string, QueryState> {
  const s = sessionOf(boardId)
  s.runs = { ...s.runs, [cardId]: st }
  return s.runs
}

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
  const envs = useStore((s) => s.envs)
  const upsertBoard = useStore((s) => s.upsertBoard)
  const showToast = useStore((s) => s.showToast)
  // 카드에서 눌러 넣은 변수 이름(이 화면에서만). 변수 띠에서 파랗게 보인다
  const [picked, setPicked] = useState<string[]>([])

  // 조회는 사람이 ▶ 를 눌러야 돈다. 결과는 세션(모듈)에 두고 IndexedDB 에는 저장하지 않는다
  const boardId = board.id
  const [runs, setRuns] = useState<Record<string, QueryState>>(() => sessionOf(boardId).runs)
  const [checks, setChecks] = useState<Record<string, boolean[]>>({})
  const put = useCallback((cardId: string, st: QueryState) => setRuns(putRun(boardId, cardId, st)), [boardId])

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
  // 연결 띠: 작업판이 고른 연결 하나. 조회 카드는 모두 이 연결로 조회한다
  const conn = useMemo(() => resolveConn(board, connections, envs), [board, connections, envs])
  const connOf = useCallback((card: Card) => (card.kind === 'query' ? conn : undefined), [conn])

  /** 이 키가 마지막 조회와 다르면 결과가 낡았다(변수 · alias · SQL 이 바뀜) */
  const keyOf = useCallback(
    (card: QueryCard) => {
      const conn = connOf(card)
      return JSON.stringify([conn?.id, conn?.alias, card.sql, pickBinds(card.sql, board.vars)])
    },
    [connOf, board.vars],
  )

  const runCard = useCallback(
    (card: QueryCard) => {
      const n = startRun(boardId, card.id, keyOf(card))
      put(card.id, { status: 'loading' })
      const conn = connOf(card)
      const p = conn ? runner.run(card, conn, pickBinds(card.sql, board.vars)) : Promise.reject(new Error('연결이 없습니다. 설정 › DB 연결에서 만드세요'))
      p.then(
        (result) => {
          if (isLatest(boardId, card.id, n)) put(card.id, { status: 'ok', result, at: now() })
        },
        (e: unknown) => {
          if (isLatest(boardId, card.id, n)) put(card.id, { status: 'error', message: e instanceof Error ? e.message : String(e), at: now() })
        },
      )
    },
    [connOf, board.vars, keyOf, put, boardId],
  )

  // 조회한 뒤 변수 · alias · SQL 이 바뀐 카드. 자동으로 다시 돌리지 않고 "변수가 바뀜" 을 붙인다
  const stale = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const card of queryCards) {
      const r = runs[card.id]
      if (r && r.status !== 'loading' && lastKey(boardId, card.id) !== keyOf(card)) out[card.id] = true
    }
    return out
  }, [queryCards, runs, keyOf, boardId])
  const staleCount = Object.keys(stale).length

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
  const pickConn = useCallback(
    (connId: string) => {
      const b = useStore.getState().boards.find((x) => x.id === board.id)
      if (b) void upsertBoard({ ...b, connId })
    },
    [board.id, upsertBoard],
  )
  /** 카드의 행 · 칸 · 타일을 눌렀다: 그 행의 값을 변수 띠에 넣는다. 다시 조회는 사람이 누른다(⟳ 바뀐 카드) */
  const pickVars = useCallback(
    (patch: Record<string, string>) => {
      const b = useStore.getState().boards.find((x) => x.id === board.id)
      if (!b) return
      const changed = Object.keys(patch).filter((k) => (b.vars[k] ?? '') !== patch[k])
      setPicked((p) => [...new Set([...p, ...Object.keys(patch)])])
      if (changed.length === 0) return
      void upsertBoard({ ...b, vars: { ...b.vars, ...patch } })
      showToast(`변수 ${changed.map((k) => `${k} = ${patch[k] || '(빈 값)'}`).join(' · ')}`)
    },
    [board.id, upsertBoard, showToast],
  )
  const touchVar = useCallback((name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : p)), [])
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
          {staleCount > 0 && (
            <button type="button" className="btn" onClick={() => queryCards.filter((c) => stale[c.id]).forEach(runCard)} title="변수 · alias · SQL 이 바뀐 카드만 다시 조회">
              ⟳ 바뀐 카드 {staleCount} 조회
            </button>
          )}
          <button type="button" className="btn primary" onClick={runAll} disabled={queryCards.length === 0}>
            ▶ 전부 조회
          </button>
          <Link className="btn" to={`/settings/board/${board.id}`}>
            ✎ 편집
          </Link>
        </Topbar>
        {queryCards.length > 0 && <ConnBand conn={conn} onPick={pickConn} />}
        <VarBand names={bindNames} vars={board.vars} onSave={saveVars} picked={picked} onTouch={touchVar} />
      </div>
      <BoardGrid cells={cells} runs={runs} stale={stale} onRun={runCard} boardVars={board.vars} checks={checks} onChecks={setCardChecks} selectedId={selectedId} onOpen={open} onPick={pickVars} />
      {selected && (
        <CardDrawer
          card={selected}
          conn={connOf(selected)}
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
