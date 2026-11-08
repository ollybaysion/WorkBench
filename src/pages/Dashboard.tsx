import { Link } from 'react-router-dom'
import { useStore } from '../store'
import type { Command } from '../types'
import { render } from '../lib/template'
import { copyText, now, relTime } from '../lib/util'
import Topbar from '../components/Topbar'
import { initialCommandVars, RUN_STATUS_LABEL, RUN_STATUS_PILL } from '../components/vars'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return '좋은 아침입니다 👋'
  if (h < 18) return '좋은 오후입니다 👋'
  return '좋은 저녁입니다 👋'
}

export default function Dashboard() {
  const commands = useStore((s) => s.commands)
  const runbooks = useStore((s) => s.runbooks)
  const runs = useStore((s) => s.runs)
  const boards = useStore((s) => s.boards)
  const settings = useStore((s) => s.settings)
  const env = useStore((s) => s.activeEnv())
  const upsertCommand = useStore((s) => s.upsertCommand)
  const showToast = useStore((s) => s.showToast)

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
          <span className="v">{activeRuns.length}</span>
          <span className="l">진행 중 런북</span>
        </div>
        <div className="panel stat">
          <span className="v">{runs.length}</span>
          <span className="l">런북 실행 기록</span>
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

      <div className="dash">
        <div className="dash-col">
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
        </div>
        <div className="dash-col">
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
              📊 작업대 <Link className="more" to="/board">모두 보기</Link>
            </h4>
            {boards.length === 0 && <div className="empty">작업대가 없습니다</div>}
            <ul className="list">
              {boards.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Link className="t" to={`/board/${b.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                    {b.title}
                  </Link>
                  <span className="m">카드 {b.cells.length} · {relTime(b.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h4>
              🕘 최근 실행 <Link className="more" to="/runbooks">런북</Link>
            </h4>
            {runs.length === 0 && <div className="empty">런북 실행 기록이 없습니다</div>}
            <ul className="list">
              {runs.slice(0, 6).map((run) => {
                const rb = runbooks.find((r) => r.id === run.runbookId)
                return (
                  <li key={run.id}>
                    <span className={`pill ${RUN_STATUS_PILL[run.status]}`}>{RUN_STATUS_LABEL[run.status]}</span>
                    {rb ? (
                      <Link className="t" to={`/runbooks/${rb.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                        {rb.title}
                      </Link>
                    ) : (
                      <span className="t muted">지운 런북</span>
                    )}
                    <span className="m">
                      {run.by || '익명'} · {relTime(run.startedAt)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
