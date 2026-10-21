import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Notes from './pages/Notes'
import Commands from './pages/Commands'
import Runbooks from './pages/Runbooks'
import Toolbox from './pages/Toolbox'
import Tasks from './pages/Tasks'
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
          <Route path="notes" element={<Notes />} />
          <Route path="notes/:id" element={<Notes />} />
          <Route path="commands" element={<Commands />} />
          <Route path="commands/:id" element={<Commands />} />
          <Route path="runbooks" element={<Runbooks />} />
          <Route path="runbooks/:id" element={<Runbooks />} />
          <Route path="toolbox" element={<Toolbox />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
