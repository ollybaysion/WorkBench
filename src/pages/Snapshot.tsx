import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { BoardSnapshot } from '../types'
import type { QueryState } from '../lib/runner'
import { fmtDate } from '../lib/util'
import Topbar from '../components/Topbar'
import BoardGrid, { type Placed } from '../components/board/BoardGrid'
import CardDrawer from '../components/board/CardDrawer'

/** 저장한 화면 보기. 그때의 변수 · 연결 · 배치 · 카드 · 조회 결과를 그대로 보인다. 다시 조회하지 않는다 */
export default function SnapshotPage() {
  const { id } = useParams()
  const snap = useStore((s) => s.snapshots.find((x) => x.id === id))
  const ready = useStore((s) => s.ready)
  if (!snap) return ready ? <Navigate to="/board" replace /> : null
  return <SnapshotView key={snap.id} snap={snap} />
}

function SnapshotView({ snap }: { snap: BoardSnapshot }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const boardExists = useStore((s) => s.boards.some((b) => b.id === snap.boardId))
  const connections = useStore((s) => s.connections)
  const upsertSnapshot = useStore((s) => s.upsertSnapshot)
  const deleteSnapshot = useStore((s) => s.deleteSnapshot)
  const showToast = useStore((s) => s.showToast)
  const [checks, setChecks] = useState<Record<string, boolean[]>>({})

  const cells = useMemo<Placed[]>(
    () =>
      snap.cells
        .flatMap((cell) => {
          const card = snap.cards.find((c) => c.id === cell.cardId)
          return card ? [{ cell, card }] : []
        })
        .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x),
    [snap],
  )
  const runs = snap.results as Record<string, QueryState>
  const varNames = Object.keys(snap.vars)
  // 크게 보기의 연결 표시는 지금 연결 목록에서 찾는다. 지운 연결이면 표시하지 않는다
  const conn = connections.find((c) => c.id === snap.conn?.id)
  const lastAt = Object.values(snap.results).reduce<string | undefined>((m, r) => (!m || r.at > m ? r.at : m), undefined)

  const selectedId = params.get('card') ?? undefined
  const selected = selectedId ? cells.find((p) => p.card.id === selectedId)?.card : undefined
  const close = useCallback(() => setParams({}), [setParams])
  const noPick = useCallback(() => showToast('저장한 화면에서는 변수를 바꾸지 않습니다'), [showToast])

  const rename = async () => {
    const name = window.prompt('이름', snap.title)
    if (name === null || !name.trim() || name.trim() === snap.title) return
    await upsertSnapshot({ ...snap, title: name.trim(), updatedAt: new Date().toISOString() })
  }
  const remove = async () => {
    if (!window.confirm(`저장한 화면 "${snap.title}" 을 지울까요?`)) return
    await deleteSnapshot(snap.id)
    showToast('저장한 화면을 지웠습니다')
    navigate(boardExists ? `/board/${snap.boardId}` : '/board')
  }

  return (
    <>
      <div className="board-sticky">
        <Topbar title={`📷 ${snap.title}`}>
          <span className="muted small mono">저장 {fmtDate(snap.createdAt)} · 조회 {fmtDate(lastAt)}</span>
          <button type="button" className="btn" onClick={() => void rename()}>
            ✎ 이름 바꾸기
          </button>
          <button type="button" className="btn danger" onClick={() => void remove()}>
            지우기
          </button>
          {boardExists && (
            <Link className="btn primary" to={`/board/${snap.boardId}`}>
              작업판 열기
            </Link>
          )}
        </Topbar>
        <div className="vband snap-band">
          <span className="lbl">연결</span>
          <span className="vpill" title={snap.conn?.alias ? `agent-db ${snap.conn.alias}` : '가짜 결과'}>
            <span className="v">{snap.conn ? `${snap.conn.name} · ${snap.conn.alias ?? '가짜 결과'}` : '연결 없음'}</span>
          </span>
          <span className="lbl">작업판</span>
          <span className="vpill">
            <span className="v">{snap.boardTitle}</span>
          </span>
        </div>
        {varNames.length > 0 && (
          <div className="vband snap-band">
            <span className="lbl">변수</span>
            {varNames.map((k) => (
              <span key={k} className="vpill">
                <span className="k">{k}</span>
                <span className="v mono">{snap.vars[k] || '(빈 값)'}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <BoardGrid
        cells={cells}
        runs={runs}
        stale={{}}
        boardVars={snap.vars}
        checks={checks}
        onChecks={(cardId, c) => setChecks((all) => ({ ...all, [cardId]: c }))}
        selectedId={selectedId}
        onOpen={(cardId) => setParams({ card: cardId })}
        onPick={noPick}
      />
      {selected && (
        <CardDrawer
          card={selected}
          conn={selected.kind === 'query' ? conn : undefined}
          run={runs[selected.id]}
          boardVars={snap.vars}
          checks={checks[selected.id]}
          onChecks={(c) => setChecks((all) => ({ ...all, [selected.id]: c }))}
          onClose={close}
        />
      )}
    </>
  )
}
