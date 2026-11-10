import { Fragment } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { relTime } from '../lib/util'
import { CHEATSHEETS } from '../lib/cheatsheets'
import { groupBoards } from '../lib/boardGroup'
import CommandPalette from './CommandPalette'
import { exportBackup } from './backup'

const THEMES = ['system', 'light', 'dark'] as const
type Theme = (typeof THEMES)[number]
const THEME_ICON: Record<Theme, string> = { system: '🌓', light: '☀️', dark: '🌙' }
const THEME_LABEL: Record<Theme, string> = { system: '시스템', light: '라이트', dark: '다크' }

export default function Layout() {
  const commands = useStore((s) => s.commands.length)
  const runbooks = useStore((s) => s.runbooks.length)
  const boards = useStore((s) => s.boards)
  const envs = useStore((s) => s.envs)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const toast = useStore((s) => s.toast)
  const createBoard = useStore((s) => s.createBoard)
  const showToast = useStore((s) => s.showToast)
  const navigate = useNavigate()

  // 빈 작업판을 만들고 편집 화면으로 간다. 이름 바꾸기 · 카드 올리기는 편집 화면에서 한다
  const addBoard = async () => {
    const b = await createBoard()
    showToast(`"${b.title}" 을 만들었습니다`)
    navigate(`/settings/board/${b.id}`)
  }

  const cls = ({ isActive }: { isActive: boolean }) => 'nav-item' + (isActive ? ' active' : '')
  const nextTheme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]
  // 접으면 아이콘만 남는다. 이름은 마우스를 올리면 title 로 보인다
  const mini = !!settings.sideMini
  const tip = (label: string) => (mini ? label : undefined)
  // 작업판 묶음: 접은 묶음은 이름만 보인다. 지금 연 작업판이 든 묶음은 접어도 강조한다
  const closed = new Set(settings.sideGroupsClosed ?? [])
  const toggleGroup = (g: string) => void setSettings({ sideGroupsClosed: closed.has(g) ? [...closed].filter((x) => x !== g) : [...closed, g] })
  const openId = useLocation().pathname.match(/^\/board\/([^/]+)/)?.[1]

  return (
    <div className={'app' + (mini ? ' side-mini' : '')}>
      <aside className="side">
        <div className="brand">
          <span className="logo" /> <span className="lb">WorkBench</span>
          <button
            type="button"
            className="btn small ghost side-theme"
            title={`테마: ${THEME_LABEL[settings.theme]} → ${THEME_LABEL[nextTheme]}`}
            onClick={() => void setSettings({ theme: nextTheme })}
          >
            {THEME_ICON[settings.theme]}
          </button>
          <button
            type="button"
            className="btn small ghost side-toggle"
            title={mini ? '왼쪽 패널 펼치기' : '왼쪽 패널 접기'}
            aria-expanded={!mini}
            onClick={() => void setSettings({ sideMini: !mini })}
          >
            {mini ? '»' : '«'}
          </button>
        </div>
        <NavLink to="/" end className={cls} title={tip('대시보드')}>
          <span className="ic">🏠</span>
          <span className="lb">대시보드</span>
        </NavLink>
        {/* 접으면 작업판 목록이 숨으므로 작업판을 볼 때도 이 아이콘을 강조한다 */}
        <NavLink to="/board" end={!mini} className={cls} title={tip('작업대')}>
          <span className="ic">📊</span>
          <span className="lb">작업대</span> <span className="n">{boards.length}</span>
        </NavLink>
        {/* 작업판 목록: 묶음 없는 작업판 먼저, 그다음 묶음별. 작업대 화면 위 선택 상자와 같은 순서 */}
        {groupBoards(boards).map(({ group, boards: list }) => (
          <Fragment key={group || '-'}>
            {group && (
              <button
                type="button"
                className={'nav-item sub nav-group' + (closed.has(group) && list.some((b) => b.id === openId) ? ' active' : '')}
                aria-expanded={!closed.has(group)}
                onClick={() => toggleGroup(group)}
                title={group}
              >
                <span className="caret">{closed.has(group) ? '▸' : '▾'}</span>
                <span className="sub-t">{group}</span>
                <span className="n">{list.length}</span>
              </button>
            )}
            {!(group && closed.has(group)) &&
              list.map((b) => (
                <NavLink key={b.id} to={`/board/${b.id}`} className={(p) => cls(p) + ' sub' + (group ? ' in-group' : '')} title={b.title}>
                  <span className="sub-t">{b.title}</span>
                  <span className="n">{b.cells.length}</span>
                </NavLink>
              ))}
          </Fragment>
        ))}
        <button type="button" className="nav-item sub nav-add" onClick={() => void addBoard()}>
          + 새 작업판
        </button>
        <NavLink to="/akg" className={cls} title={tip('AKG 문서')}>
          <span className="ic">📖</span>
          <span className="lb">AKG 문서</span>
        </NavLink>
        <NavLink to="/commands" className={cls} title={tip('명령어')}>
          <span className="ic">⌘</span>
          <span className="lb">명령어</span> <span className="n">{commands}</span>
        </NavLink>
        <NavLink to="/runbooks" className={cls} title={tip('런북')}>
          <span className="ic">🔁</span>
          <span className="lb">런북</span> <span className="n">{runbooks}</span>
        </NavLink>
        <NavLink to="/toolbox" className={cls} title={tip('도구함')}>
          <span className="ic">🧰</span>
          <span className="lb">도구함</span>
        </NavLink>
        <NavLink to="/settings" className={cls} title={tip('설정')}>
          <span className="ic">⚙️</span>
          <span className="lb">설정</span>
        </NavLink>
        <div className="sec">치트시트</div>
        {CHEATSHEETS.map((c) => (
          <NavLink key={c.tool} to={`/cheatsheet/${c.tool}`} className={(p) => cls(p) + ' cheat'}>
            📄 {c.tool}
          </NavLink>
        ))}
        <div className="sec">환경</div>
        <div className="side-env">
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
