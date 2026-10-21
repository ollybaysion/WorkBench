import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'

interface Hit {
  kind: string
  title: string
  sub: string
  to: string
}

export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const setPalette = useStore((s) => s.setPalette)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!useStore.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  if (!open) return null
  return <PaletteDialog onClose={() => setPalette(false)} />
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const notes = useStore((s) => s.notes)
  const commands = useStore((s) => s.commands)
  const runbooks = useStore((s) => s.runbooks)
  const tasks = useStore((s) => s.tasks)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase()
    const m = (...fields: (string | undefined)[]) => !s || fields.some((f) => f?.toLowerCase().includes(s))
    const out: Hit[] = []
    for (const n of notes) if (m(n.title, n.content, n.tags.join(' '))) out.push({ kind: '📚 노트', title: n.title, sub: n.folder, to: `/notes/${n.id}` })
    for (const c of commands) if (m(c.title, c.template, c.tags.join(' '))) out.push({ kind: '⌘ 명령', title: c.title, sub: c.template, to: `/commands/${c.id}` })
    for (const r of runbooks) if (m(r.title, r.description, r.tags.join(' '))) out.push({ kind: '🔁 런북', title: r.title, sub: r.description ?? '', to: `/runbooks/${r.id}` })
    for (const t of tasks) if (m(t.title, t.tags.join(' '))) out.push({ kind: '📋 업무', title: t.title, sub: t.due ?? '', to: '/tasks' })
    return out.slice(0, 50)
  }, [q, notes, commands, runbooks, tasks])

  const go = (h: Hit | undefined) => {
    if (!h) return
    navigate(h.to)
    onClose()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(hits[sel])
    }
  }

  return (
    <div className="palette-bg" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          placeholder="노트·명령·런북·업무 검색…  (↑↓ 이동 · Enter 열기 · Esc 닫기)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setSel(0)
          }}
          onKeyDown={onKeyDown}
        />
        <ul>
          {hits.length === 0 && <li className="muted">검색 결과가 없습니다</li>}
          {hits.map((h, i) => (
            <li key={h.to + i} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
              <span className="k">{h.kind}</span>
              <span className="t">{h.title}</span>
              <span className="s mono">{h.sub}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
