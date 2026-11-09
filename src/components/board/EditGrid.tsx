import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { BoardCell } from '../../types'
import { COLS, clampMove, clampResize, place, sameCell } from '../../lib/layout'
import { useStore } from '../../store'
import type { Placed } from './BoardGrid'

/** 편집 격자의 칸 높이 · 간격(px). index.css 의 .egrid 와 맞춘다 */
const ROW_H = 88
const GAP = 10

interface Drag {
  id: string
  mode: 'move' | 'resize'
  x0: number
  y0: number
  origin: BoardCell
  target: BoardCell
  moved: boolean
}

const KEY_DIR: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

interface Props {
  cells: Placed[]
  selectedId?: string
  onSelect: (cardId: string) => void
  onChange: (cells: BoardCell[]) => void
  onLower: (cardId: string) => void
}

/** 작업판 배치 편집. 타일을 끌어 옮기고, 오른쪽 아래 모서리를 당겨 크기를 바꾼다. 키보드는 방향키 · Shift+방향키 */
export default function EditGrid({ cells, selectedId, onSelect, onChange, onLower }: Props) {
  const connections = useStore((s) => s.connections)
  const commands = useStore((s) => s.commands)
  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<{ id: string; cells: BoardCell[] } | null>(null)

  const base = cells.map((p) => p.cell)
  const shown = preview?.cells ?? base
  const rows = Math.max(1, ...shown.map((c) => c.y + c.h)) + 1 // 맨 아래 한 줄은 놓을 자리로 비워 둔다

  const start = (e: PointerEvent<HTMLElement>, cell: BoardCell, mode: Drag['mode']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: cell.cardId, mode, x0: e.clientX, y0: e.clientY, origin: cell, target: cell, moved: false }
  }

  const move = (e: PointerEvent) => {
    const d = drag.current
    const grid = gridRef.current
    if (!d || !grid) return
    const dx = e.clientX - d.x0
    const dy = e.clientY - d.y0
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    const col = (grid.clientWidth + GAP) / COLS
    const row = ROW_H + GAP
    const o = d.origin
    const t =
      d.mode === 'move'
        ? clampMove({ ...o, x: o.x + Math.round(dx / col), y: o.y + Math.round(dy / row) })
        : clampResize({ ...o, w: o.w + Math.round(dx / col), h: o.h + Math.round(dy / row) })
    if (d.moved && sameCell(t, d.target)) return
    d.moved = true
    d.target = t
    setPreview({ id: d.id, cells: place(base, t) })
  }

  const end = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setPreview(null)
    if (!d.moved) {
      if (d.mode === 'move') onSelect(d.id)
    } else if (!sameCell(d.target, d.origin)) onChange(place(base, d.target))
  }

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  const onKey = (e: KeyboardEvent, cell: BoardCell) => {
    if (e.key === 'Escape' && drag.current) return cancel()
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      return onSelect(cell.cardId)
    }
    const dir = KEY_DIR[e.key]
    if (!dir) return
    e.preventDefault()
    const [dx, dy] = dir
    const t = e.shiftKey ? clampResize({ ...cell, w: cell.w + dx, h: cell.h + dy }) : clampMove({ ...cell, x: cell.x + dx, y: cell.y + dy })
    if (!sameCell(t, cell)) onChange(place(base, t))
  }

  const byId = new Map(cells.map((p) => [p.card.id, p.card]))

  return (
    <div
      ref={gridRef}
      className="egrid"
      style={{ gridTemplateRows: `repeat(${rows}, ${ROW_H}px)` }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
    >
      {shown.map((cell) => {
        const card = byId.get(cell.cardId)
        if (!card) return null
        const ghost = preview?.id === cell.cardId
        const meta =
          card.kind === 'query'
            ? `⛁ ${card.id} · ${connections.find((c) => c.id === card.connectionId)?.name ?? '연결 없음'}`
            : `⌘ ${card.id} · ${commands.find((c) => c.id === card.commandId)?.title ?? '명령 없음'}`
        return (
          <div
            key={cell.cardId}
            className={'etile' + (card.id === selectedId ? ' sel' : '') + (ghost ? ' ghost' : '')}
            style={{ gridColumn: `${cell.x + 1} / span ${cell.w}`, gridRow: `${cell.y + 1} / span ${cell.h}` }}
            tabIndex={0}
            aria-label={`${card.title} · 폭 ${cell.w} 높이 ${cell.h} · ${cell.x + 1} 열 ${cell.y + 1} 행`}
            aria-current={card.id === selectedId ? 'true' : undefined}
            onPointerDown={(e) => start(e, cell, 'move')}
            onKeyDown={(e) => onKey(e, cell)}
          >
            {ghost ? (
              <span className="et-ghost">
                여기에 놓기 · {cell.w}×{cell.h}
              </span>
            ) : (
              <>
                <div className="et-head">
                  <span className="et-grip" aria-hidden="true">
                    ⠿
                  </span>
                  <span className="et-title" title={card.title}>
                    {card.title}
                  </span>
                  <button
                    type="button"
                    className="et-x"
                    title="보관함으로 내리기"
                    aria-label={`${card.title} 보관함으로 내리기`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={() => onLower(card.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="et-meta mono" title={meta}>
                  {meta}
                </div>
                <span className="et-size mono">
                  {cell.w}×{cell.h}
                </span>
              </>
            )}
            <span className="et-resize" title="끌어서 크기 바꾸기" onPointerDown={(e) => start(e, cell, 'resize')} />
          </div>
        )
      })}
    </div>
  )
}
