import type { ReactNode } from 'react'
import { useStore } from '../store'

export function SearchButton({ label = '노트·명령·런북 검색' }: { label?: string }) {
  const setPalette = useStore((s) => s.setPalette)
  return (
    <button type="button" className="search-btn" onClick={() => setPalette(true)}>
      🔍 {label} <kbd>Ctrl K</kbd>
    </button>
  )
}

export default function Topbar({ title, children, search }: { title: ReactNode; children?: ReactNode; search?: string }) {
  return (
    <div className="topbar">
      <h2>{title}</h2>
      <SearchButton label={search} />
      {children}
    </div>
  )
}
