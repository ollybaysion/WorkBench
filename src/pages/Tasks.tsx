import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import type { Repeat, Task, TaskStatus } from '../types'
import { now, parseTags, relTime, uid } from '../lib/util'
import Topbar from '../components/Topbar'
import { REPEAT_LABEL, isOverdue, setTaskStatus } from '../components/tasks'

const COLS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: '📥 할 일' },
  { status: 'doing', label: '🚧 진행 중' },
  { status: 'done', label: '✅ 완료' },
]
const ORDER: TaskStatus[] = ['todo', 'doing', 'done']

const emptyForm = { title: '', tags: '', due: '', repeat: 'none' as Repeat, noteId: '', runbookId: '' }

export default function Tasks() {
  const tasks = useStore((s) => s.tasks)
  const notes = useStore((s) => s.notes)
  const runbooks = useStore((s) => s.runbooks)
  const runs = useStore((s) => s.runs)
  const upsertTask = useStore((s) => s.upsertTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const showToast = useStore((s) => s.showToast)
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [q, setQ] = useState('')
  const [showAllDone, setShowAllDone] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return tasks.filter((t) => !s || t.title.toLowerCase().includes(s) || t.tags.some((x) => x.toLowerCase().includes(s)))
  }, [tasks, q])

  const add = async () => {
    if (!form.title.trim()) return showToast('제목을 입력하세요')
    const t = now()
    const task: Task = {
      id: uid(),
      createdAt: t,
      updatedAt: t,
      title: form.title.trim(),
      tags: parseTags(form.tags),
      status: 'todo',
      repeat: form.repeat,
      ...(form.due ? { due: form.due } : {}),
      ...(form.noteId ? { noteId: form.noteId } : {}),
      ...(form.runbookId ? { runbookId: form.runbookId } : {}),
    }
    await upsertTask(task)
    setForm(emptyForm)
    showToast('업무를 추가했습니다')
  }

  const move = (t: Task, d: -1 | 1) => {
    const next = ORDER[ORDER.indexOf(t.status) + d]
    if (next) void setTaskStatus(t, next)
  }

  const sortCol = (list: Task[], status: TaskStatus) =>
    status === 'done'
      ? [...list].sort((a, b) => ((a.doneAt ?? '') < (b.doneAt ?? '') ? 1 : -1))
      : [...list].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))

  return (
    <>
      <Topbar title="업무 보드" search="업무 검색">
        <input className="input" style={{ width: 160 }} placeholder="보드 필터" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
          + 업무
        </button>
      </Topbar>

      {showForm && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="form-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>
              제목
              <input value={form.title} autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void add()} />
            </label>
            <label className="field">
              태그
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </label>
            <label className="field">
              마감일
              <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </label>
            <label className="field">
              반복
              <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as Repeat })}>
                {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              노트 연결
              <select value={form.noteId} onChange={(e) => setForm({ ...form, noteId: e.target.value })}>
                <option value="">(없음)</option>
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              런북 연결
              <select value={form.runbookId} onChange={(e) => setForm({ ...form, runbookId: e.target.value })}>
                <option value="">(없음)</option>
                {runbooks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void add()}>
              추가
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              닫기
            </button>
            <span className="small muted">반복 업무를 완료하면 다음 회차가 자동으로 생성됩니다.</span>
          </div>
        </div>
      )}

      <div className="kanban">
        {COLS.map((col) => {
          const all = sortCol(
            filtered.filter((t) => t.status === col.status),
            col.status,
          )
          const list = col.status === 'done' && !showAllDone ? all.slice(0, 15) : all
          return (
            <div key={col.status} className="col">
              <h5>
                {col.label} <span className="n">{all.length}</span>
              </h5>
              {list.map((t) => {
                const note = t.noteId ? notes.find((n) => n.id === t.noteId) : undefined
                const rb = t.runbookId ? runbooks.find((r) => r.id === t.runbookId) : undefined
                const run = rb ? runs.find((r) => r.runbookId === rb.id && r.status === 'in_progress') : undefined
                return (
                  <div key={t.id} className={'tcard' + (isOverdue(t) ? ' overdue' : '')} style={t.status === 'done' ? { opacity: 0.7 } : undefined}>
                    <div className="tt">{t.title}</div>
                    <div className="tm">
                      {t.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                      {t.due && t.status !== 'done' && <span style={isOverdue(t) ? { color: 'var(--danger)' } : undefined}>⏰ {t.due}</span>}
                      {t.repeat !== 'none' && <span>🔁 {REPEAT_LABEL[t.repeat]}</span>}
                      {t.status === 'done' && t.doneAt && <span>{relTime(t.doneAt)}</span>}
                      {note && <Link to={`/notes/${note.id}`}>📚 {note.title}</Link>}
                      {rb && (
                        <Link to={`/runbooks/${rb.id}`}>
                          🔁 {rb.title}
                          {run && ` (${run.doneSteps.length}/${rb.steps.length})`}
                        </Link>
                      )}
                      <span className="btn-row">
                        <button type="button" className="btn small ghost" disabled={t.status === 'todo'} onClick={() => move(t, -1)} title="이전 단계">
                          ◀
                        </button>
                        <button type="button" className="btn small ghost" disabled={t.status === 'done'} onClick={() => move(t, 1)} title="다음 단계">
                          ▶
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          title="삭제"
                          onClick={() => {
                            if (window.confirm(`"${t.title}" 업무를 삭제할까요?`)) void deleteTask(t.id)
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  </div>
                )
              })}
              {col.status === 'done' && all.length > 15 && (
                <button type="button" className="btn small ghost" onClick={() => setShowAllDone((v) => !v)}>
                  {showAllDone ? '접기' : `${all.length - 15}개 더 보기`}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
