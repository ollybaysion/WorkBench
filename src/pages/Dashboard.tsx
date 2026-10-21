import { Link } from 'react-router-dom'
import { useStore } from '../store'
import type { Command } from '../types'
import { render } from '../lib/template'
import { copyText, now, relTime, todayStr } from '../lib/util'
import Topbar from '../components/Topbar'
import { initialCommandVars } from '../components/vars'
import { setTaskStatus } from '../components/tasks'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return '좋은 아침입니다 👋'
  if (h < 18) return '좋은 오후입니다 👋'
  return '좋은 저녁입니다 👋'
}

export default function Dashboard() {
  const notes = useStore((s) => s.notes)
  const commands = useStore((s) => s.commands)
  const runbooks = useStore((s) => s.runbooks)
  const runs = useStore((s) => s.runs)
  const tasks = useStore((s) => s.tasks)
  const settings = useStore((s) => s.settings)
  const env = useStore((s) => s.activeEnv())
  const upsertCommand = useStore((s) => s.upsertCommand)
  const showToast = useStore((s) => s.showToast)

  const today = todayStr()
  const todayTasks = tasks.filter((t) => t.status !== 'done' && !!t.due && t.due <= today)
  const activeRuns = runs.filter((r) => r.status === 'in_progress')
  const totalCopies = commands.reduce((a, c) => a + c.usageCount, 0)
  const favorites = commands.filter((c) => c.favorite)
  const backupAgeDays = settings.lastBackupAt ? (Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000 : Infinity

  const copyCommand = async (c: Command) => {
    const text = render(c.template, initialCommandVars(c, env))
    if (c.risk === 'destroy' && !window.confirm(`파괴적 명령입니다. 복사할까요?\n\n${text}`)) return
    if (await copyText(text)) {
      await upsertCommand({ ...c, usageCount: c.usageCount + 1, lastUsedAt: now() })
      showToast('명령을 복사했습니다')
    } else showToast('복사에 실패했습니다')
  }

  return (
    <>
      <Topbar title={greeting()} />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="panel stat">
          <span className="v">{todayTasks.length}</span>
          <span className="l">오늘 할 일</span>
        </div>
        <div className="panel stat">
          <span className="v">{activeRuns.length}</span>
          <span className="l">진행 중 런북</span>
        </div>
        <div className="panel stat">
          <span className="v">{totalCopies}</span>
          <span className="l">총 명령 복사 횟수</span>
        </div>
        <div className="panel stat">
          <span className="v" style={{ color: backupAgeDays <= 7 ? 'var(--ok)' : 'var(--warn)' }}>{backupAgeDays <= 7 ? 'OK' : '필요'}</span>
          <span className="l">백업 상태 · {relTime(settings.lastBackupAt)}</span>
        </div>
      </div>

      <div className="grid g2">
        <div className="panel">
          <h4>
            🔁 진행 중인 런북 <Link className="more" to="/runbooks">모두 보기</Link>
          </h4>
          {activeRuns.length === 0 && <div className="empty">진행 중인 런북이 없습니다</div>}
          {activeRuns.map((run) => {
            const rb = runbooks.find((r) => r.id === run.runbookId)
            if (!rb) return null
            const total = rb.steps.length
            const done = run.doneSteps.filter((id) => rb.steps.some((s) => s.id === id)).length
            return (
              <div key={run.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <b>{rb.title}</b> · 단계 {done}/{total} · <span className="muted">{run.by || '익명'} · {relTime(run.startedAt)}</span>
                </div>
                <div className="progress">
                  <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </div>
                <Link className="btn small primary" to={`/runbooks/${rb.id}`}>
                  이어서 진행
                </Link>
              </div>
            )
          })}
        </div>

        <div className="panel">
          <h4>
            ⭐ 즐겨찾기 명령 <Link className="more" to="/commands">관리</Link>
          </h4>
          {favorites.length === 0 && <div className="empty">즐겨찾기한 명령이 없습니다</div>}
          {favorites.map((c) => (
            <div key={c.id} className="row-item" style={{ cursor: 'default' }}>
              <span className={`risk ${c.risk}`} />
              <div className="title">
                <Link to={`/commands/${c.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                  {c.title}
                </Link>
                <code>{render(c.template, initialCommandVars(c, env))}</code>
              </div>
              <button type="button" className="btn small" onClick={() => void copyCommand(c)}>
                복사
              </button>
            </div>
          ))}
        </div>

        <div className="panel">
          <h4>
            📋 오늘 할 일 <Link className="more" to="/tasks">업무 보드</Link>
          </h4>
          {todayTasks.length === 0 && <div className="empty">오늘 마감인 업무가 없습니다 🎉</div>}
          <ul className="list">
            {todayTasks.map((t) => (
              <li key={t.id}>
                <input type="checkbox" checked={false} onChange={() => void setTaskStatus(t, 'done')} />
                <span className="t">
                  {t.title}
                  {t.repeat !== 'none' && <span className="muted"> (반복)</span>}
                </span>
                {t.due && t.due < today && <span className="pill red">지연</span>}
                {t.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h4>
            📚 최근 노트 <Link className="more" to="/notes">전체</Link>
          </h4>
          <ul className="list">
            {notes.slice(0, 6).map((n) => (
              <li key={n.id}>
                <Link className="t" to={`/notes/${n.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                  {n.title}
                </Link>
                <span className="m">{relTime(n.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
