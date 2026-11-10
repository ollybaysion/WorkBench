import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { groupNames, groupOf } from '../lib/boardGroup'
import BoardOptions from '../components/board/BoardOptions'
import type { Board, BoardCell, Card } from '../types'
import { COLS, append, compact, place } from '../lib/layout'
import { now, uid } from '../lib/util'
import { resolveConn } from '../lib/conn'
import Topbar from '../components/Topbar'
import SettingsTabs from '../components/SettingsTabs'
import EditGrid from '../components/board/EditGrid'
import CardForm from '../components/board/CardForm'
import type { Placed } from '../components/board/BoardGrid'

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'ko')
const newCardId = () => `card_${uid().slice(0, 8)}`
const DISCARD = '저장하지 않은 수정이 있습니다. 버리고 넘어갈까요?'

/** 설정 › 작업대 편집. 작업판을 고르고 카드 배치 · 카드 내용을 고친다 */
export default function BoardEditPage() {
  const { id } = useParams()
  const boards = useStore((s) => s.boards)
  if (!id) {
    const first = [...boards].sort(byTitle)[0]
    if (first) return <Navigate to={`/settings/board/${first.id}`} replace />
    return (
      <>
        <Topbar title="설정" />
        <SettingsTabs />
        <div className="panel">
          <div className="empty">작업판이 없습니다</div>
        </div>
      </>
    )
  }
  const board = boards.find((b) => b.id === id)
  if (!board) return <Navigate to="/settings/board" replace />
  return <BoardEditor key={board.id} board={board} />
}

/** 폼에 띄운 카드: 저장된 카드(id) 또는 아직 저장하지 않은 새 카드(draft) */
type Selection = { id: string } | { draft: Card; size: { w: number; h: number } }

function BoardEditor({ board }: { board: Board }) {
  const navigate = useNavigate()
  const boards = useStore((s) => s.boards)
  const cards = useStore((s) => s.cards)
  const connections = useStore((s) => s.connections)
  const envs = useStore((s) => s.envs)
  const upsertBoard = useStore((s) => s.upsertBoard)
  const deleteBoard = useStore((s) => s.deleteBoard)
  const upsertCard = useStore((s) => s.upsertCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const showToast = useStore((s) => s.showToast)

  const [sel, setSel] = useState<Selection | null>(null)
  const [renaming, setRenaming] = useState(false)
  const dirty = useRef(false)
  const onDirty = useCallback((v: boolean) => {
    dirty.current = v
  }, [])

  // 카드가 없는 칸(지운 카드의 자리)은 버린다
  const placed = useMemo<Placed[]>(
    () =>
      board.cells.flatMap((cell) => {
        const card = cards.find((c) => c.id === cell.cardId)
        return card ? [{ cell, card }] : []
      }),
    [board.cells, cards],
  )
  const base = placed.map((p) => p.cell)
  const shelf = useMemo(() => cards.filter((c) => !placed.some((p) => p.card.id === c.id)).sort(byTitle), [cards, placed])

  const setCells = async (cells: BoardCell[]) => {
    const b = useStore.getState().boards.find((x) => x.id === board.id)
    if (b) await upsertBoard({ ...b, cells })
  }

  /** 다른 카드로 옮기기 전에 고친 내용을 버릴지 묻는다 */
  const pick = (next: Selection | null) => {
    if (dirty.current && !window.confirm(DISCARD)) return
    dirty.current = false
    setSel(next)
  }

  const draftSel = sel !== null && 'draft' in sel ? sel : undefined
  const card = draftSel ? draftSel.draft : sel ? cards.find((c) => 'id' in sel && c.id === sel.id) : undefined
  const cell = card && base.find((c) => c.cardId === card.id)
  const size = draftSel ? draftSel.size : cell && { w: cell.w, h: cell.h }

  // 작업판만 지운다. 카드는 보관함에 남아 다른 작업판에 다시 올릴 수 있다
  const removeBoard = async () => {
    const n = board.cells.length
    const msg = `"${board.title}" 작업판을 지울까요?` + (n ? ` 올려 둔 카드 ${n} 장은 보관함에 남습니다.` : '')
    if (!window.confirm(msg)) return
    dirty.current = false
    await deleteBoard(board.id)
    showToast(`"${board.title}" 작업판을 지웠습니다`)
    navigate('/settings/board')
  }

  const addCard = () => {
    const t = now()
    const draft: Card = {
      id: newCardId(),
      createdAt: t,
      updatedAt: t,
      tags: [],
      kind: 'query',
      title: '',
      sql: '',
      keyColumns: [],
      view: { kind: 'table' },
    }
    pick({ draft, size: { w: 2, h: 1 } })
  }

  const duplicate = (c: Card) => {
    const t = now()
    pick({ draft: { ...c, id: newCardId(), title: `${c.title} (복제)`, createdAt: t, updatedAt: t }, size: cell ? { w: cell.w, h: cell.h } : { w: 1, h: 1 } })
  }

  const save = async (c: Card) => {
    await upsertCard(c)
    if (draftSel) await setCells(append(base, { cardId: c.id, x: 0, y: 0, ...draftSel.size }))
    dirty.current = false
    setSel({ id: c.id })
    showToast(draftSel ? '카드를 저장하고 작업판에 올렸습니다' : '카드를 저장했습니다')
  }

  const remove = async (c: Card) => {
    if (draftSel) {
      dirty.current = false
      return setSel(null)
    }
    const on = boards.filter((b) => b.cells.some((x) => x.cardId === c.id)).length
    if (!window.confirm(`"${c.title}" 카드를 지울까요?${on > 1 ? ` 작업판 ${on} 곳에서 함께 빠집니다.` : ''} 되돌릴 수 없습니다.`)) return
    await deleteCard(c.id)
    dirty.current = false
    setSel(null)
    showToast('카드를 지웠습니다')
  }

  const resize = (w: number, h: number) => {
    if (draftSel) return setSel({ ...draftSel, size: { w, h } })
    if (cell) void setCells(place(base, { ...cell, w, h, x: Math.min(cell.x, COLS - w) }))
  }

  const lift = (c: Card) => void setCells(append(base, { cardId: c.id, x: 0, y: 0, w: 1, h: 1 }))
  const lower = (cardId: string) => void setCells(compact(base.filter((c) => c.cardId !== cardId)))

  return (
    <>
      <Topbar title="설정" />
      <SettingsTabs />
      <div className="bedit">
        <div className="panel form-col">
          <div className="btn-row">
            <label className="small muted" htmlFor="bedit-board">
              작업판
            </label>
            {renaming ? (
              <BoardRename board={board} onDone={() => setRenaming(false)} />
            ) : (
              <>
                <select
                  id="bedit-board"
                  className="input"
                  style={{ width: 'auto' }}
                  value={board.id}
                  onChange={(e) => {
                    if (dirty.current && !window.confirm(DISCARD)) return
                    navigate(`/settings/board/${e.target.value}`)
                  }}
                >
                  <BoardOptions boards={boards} />
                </select>
                <button type="button" className="btn small" onClick={() => setRenaming(true)}>
                  ✎ 이름 바꾸기
                </button>
                <BoardGroupInput key={board.id} board={board} boards={boards} />
              </>
            )}
            <span className="sp" />
            <button type="button" className="btn primary" onClick={addCard}>
              + 카드 추가
            </button>
            <Link className="btn" to={`/board/${board.id}`}>
              작업대에서 보기
            </Link>
            <button type="button" className="btn danger" onClick={() => void removeBoard()}>
              작업판 지우기
            </button>
          </div>

          {placed.length ? (
            <EditGrid cells={placed} selectedId={card?.id} onSelect={(id) => id !== card?.id && pick({ id })} onChange={(c) => void setCells(c)} onLower={lower} />
          ) : (
            <div className="empty">작업판이 비었습니다. 아래 보관함에서 카드를 올리거나 + 카드 추가를 누르세요.</div>
          )}
          <div className="small muted">
            카드를 끌어 옮기고 모서리를 당겨 크기를 바꿉니다 · 폭 1~4 · 높이 1~2 · 빈 자리는 위로 붙습니다. 키보드는 방향키로 옮기고 Shift+방향키로 크기를 바꿉니다.
          </div>

          <h4>
            🗄 보관함
            <span className="small muted" style={{ fontWeight: 400 }}>
              이 작업판에 올리지 않은 카드 {shelf.length}
            </span>
          </h4>
          {shelf.length ? (
            <div>
              {shelf.map((c) => (
                <div
                  key={c.id}
                  className={'row-item' + (c.id === card?.id ? ' on' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => c.id !== card?.id && pick({ id: c.id })}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                      e.preventDefault()
                      if (c.id !== card?.id) pick({ id: c.id })
                    }
                  }}
                >
                  <span aria-hidden="true">{c.kind === 'query' ? '⛁' : '⌘'}</span>
                  <span className="title">
                    {c.title}
                    <code>{c.id}</code>
                  </span>
                  <button
                    type="button"
                    className="btn small"
                    onClick={(e) => {
                      e.stopPropagation()
                      lift(c)
                    }}
                  >
                    + 올리기
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">모든 카드가 이 작업판에 있습니다</div>
          )}
        </div>

        <div className="panel bedit-form">
          {card ? (
            <CardForm
              key={draftSel ? card.id : `${card.id}:${card.updatedAt}`}
              card={card}
              isNew={!!draftSel}
              size={size}
              boardVars={board.vars}
              boardConn={resolveConn(board, connections, envs)}
              onSave={save}
              onCancel={() => {
                dirty.current = false
                if (draftSel) setSel(null)
              }}
              onDelete={() => void remove(card)}
              onDuplicate={draftSel ? undefined : () => duplicate(card)}
              onSize={resize}
              onDirty={onDirty}
            />
          ) : (
            <div className="empty">작업판의 카드를 누르거나 + 카드 추가를 누르세요</div>
          )}
        </div>
      </div>
    </>
  )
}

const TITLE_MAX = 60
const GROUP_MAX = 30

/** 작업판 묶음 이름. Enter 나 칸을 떠날 때 저장한다. 비우면 묶음 없음. 쓰던 묶음 이름을 고를 수 있다 */
function BoardGroupInput({ board, boards }: { board: Board; boards: Board[] }) {
  const upsertBoard = useStore((s) => s.upsertBoard)
  const showToast = useStore((s) => s.showToast)
  const [value, setValue] = useState(groupOf(board))
  const save = async () => {
    const next = value.trim().slice(0, GROUP_MAX)
    if (next === groupOf(board)) return setValue(next)
    // 변수 띠가 그 사이 값을 바꿨을 수 있으니 저장소의 최신 작업판에 묶음만 얹는다
    const b = useStore.getState().boards.find((x) => x.id === board.id) ?? board
    const { group: _old, ...rest } = b
    await upsertBoard(next ? { ...rest, group: next } : rest)
    setValue(next)
    showToast(next ? `묶음을 "${next}" 로 정했습니다` : '묶음을 비웠습니다')
  }
  return (
    <span className="board-group">
      <label className="small muted" htmlFor="bedit-group">
        묶음
      </label>
      <input
        id="bedit-group"
        className="input"
        list="bedit-groups"
        value={value}
        maxLength={GROUP_MAX}
        placeholder="없음 · 예: TSUM"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setValue(groupOf(board))
        }}
      />
      <datalist id="bedit-groups">
        {groupNames(boards).map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
    </span>
  )
}

/** 작업판 이름 바꾸기. Enter 로 저장, Esc 로 취소. 빈 이름은 받지 않는다 */
function BoardRename({ board, onDone }: { board: Board; onDone: () => void }) {
  const upsertBoard = useStore((s) => s.upsertBoard)
  const showToast = useStore((s) => s.showToast)
  const [title, setTitle] = useState(board.title)
  const [busy, setBusy] = useState(false)
  const next = title.trim()
  const problem = !next ? '이름을 넣으세요' : next.length > TITLE_MAX ? `이름은 ${TITLE_MAX} 자까지입니다` : undefined

  const save = async () => {
    if (problem || busy) return
    if (next === board.title) return onDone()
    setBusy(true)
    try {
      // 변수 띠가 그 사이 값을 바꿨을 수 있으니 저장소의 최신 작업판에 이름만 얹는다
      const b = useStore.getState().boards.find((x) => x.id === board.id) ?? board
      await upsertBoard({ ...b, title: next })
      showToast(`작업판 이름을 "${next}" 로 바꿨습니다`)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="board-rename"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <input
        id="bedit-board"
        className="input"
        value={title}
        maxLength={TITLE_MAX + 20}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone()
        }}
        aria-invalid={!!problem}
        aria-describedby={problem ? 'bedit-board-err' : undefined}
        autoFocus
      />
      <button type="submit" className="btn small primary" disabled={!!problem || busy}>
        저장
      </button>
      <button type="button" className="btn small" onClick={onDone}>
        취소
      </button>
      {problem && (
        <span id="bedit-board-err" className="cf-err">
          {problem}
        </span>
      )}
    </form>
  )
}
