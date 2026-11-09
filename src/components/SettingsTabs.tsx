import { NavLink } from 'react-router-dom'

/** 설정 화면의 갈래: 일반(사용자 · 백업 · AKG · 환경) · 작업대 편집 */
export default function SettingsTabs() {
  return (
    <nav className="subtabs" aria-label="설정 갈래">
      <NavLink to="/settings" end>
        일반
      </NavLink>
      <NavLink to="/settings/board">작업대 편집</NavLink>
    </nav>
  )
}
