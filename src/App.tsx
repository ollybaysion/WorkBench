import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import BoardPage from './pages/Board'
import AkgDocs from './pages/AkgDocs'
import Cheatsheet from './pages/Cheatsheet'
import Commands from './pages/Commands'
import Runbooks from './pages/Runbooks'
import Toolbox from './pages/Toolbox'
import SettingsPage from './pages/Settings'

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const theme = useStore((s) => s.settings.theme)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const el = document.documentElement
    if (theme === 'system') el.removeAttribute('data-theme')
    else el.setAttribute('data-theme', theme)
  }, [theme])

  if (!ready) return <div className="loading">불러오는 중…</div>

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="board/:id" element={<BoardPage />} />
          <Route path="akg" element={<AkgDocs />} />
          <Route path="cheatsheet" element={<Cheatsheet />} />
          <Route path="cheatsheet/:tool" element={<Cheatsheet />} />
          <Route path="commands" element={<Commands />} />
          <Route path="commands/:id" element={<Commands />} />
          <Route path="runbooks" element={<Runbooks />} />
          <Route path="runbooks/:id" element={<Runbooks />} />
          <Route path="toolbox" element={<Toolbox />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
