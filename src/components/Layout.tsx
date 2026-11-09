import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../store'
import { relTime } from '../lib/util'
import { CHEATSHEETS } from '../lib/cheatsheets'
import CommandPalette from './CommandPalette'
import { exportBackup } from './backup'

const THEMES = ['system', 'light', 'dark'] as const
type Theme = (typeof THEMES)[number]
const THEME_ICON: Record<Theme, string> = { system: '🌓', light: '☀️', dark: '🌙' }
const THEME_LABEL: Record<Theme, string> = { system: '시스템', light: '라이트', dark: '다크' }

export default function Layout() {
  const commands = useStore((s) => s.commands.length)
  const runbooks = useStore((s) => s.runbooks.length)
  const boards = useStore((s) => s.boards.length)
  const envs = useStore((s) => s.envs)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const toast = useStore((s) => s.toast)

  const cls = ({ isActive }: { isActive: boolean }) => 'nav-item' + (isActive ? ' active' : '')
  const nextTheme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="logo" /> WorkBench
          <button
            type="button"
            className="btn small ghost"
            style={{ marginLeft: 'auto' }}
            title={`테마: ${THEME_LABEL[settings.theme]} → ${THEME_LABEL[nextTheme]}`}
            onClick={() => void setSettings({ theme: nextTheme })}
          >
            {THEME_ICON[settings.theme]}
          </button>
        </div>
        <NavLink to="/" end className={cls}>🏠 대시보드</NavLink>
        <NavLink to="/board" className={cls}>📊 작업대 <span className="n">{boards}</span></NavLink>
        <NavLink to="/akg" className={cls}>📖 AKG 문서</NavLink>
        <NavLink to="/commands" className={cls}>⌘ 명령어 <span className="n">{commands}</span></NavLink>
        <NavLink to="/runbooks" className={cls}>🔁 런북 <span className="n">{runbooks}</span></NavLink>
        <NavLink to="/toolbox" className={cls}>🧰 도구함</NavLink>
        <NavLink to="/settings" className={cls}>⚙️ 설정</NavLink>
        <div className="sec">치트시트</div>
        {CHEATSHEETS.map((c) => (
          <NavLink key={c.tool} to={`/cheatsheet/${c.tool}`} className={cls}>
            📄 {c.tool}
          </NavLink>
        ))}
        <div className="sec">환경</div>
        <div style={{ padding: '0 10px' }}>
          <select className="input" value={settings.activeEnvId ?? ''} onChange={(e) => void setSettings({ activeEnvId: e.target.value })}>
            {envs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="foot">
          <span>마지막 백업: {relTime(settings.lastBackupAt)}</span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              void exportBackup()
            }}
          >
            JSON 내보내기
          </a>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      {toast && <div className="toast">{toast}</div>}
      <CommandPalette />
    </div>
  )
}
