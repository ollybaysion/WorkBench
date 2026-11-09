import { useEffect, useRef } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { DEFAULT_CHEATSHEET, findCheatsheet } from '../lib/cheatsheets'
import Markdown from '../components/Markdown'
import Topbar from '../components/Topbar'

/** 번들에 든 치트시트 한 장을 읽기 전용으로 그린다. */
export default function Cheatsheet() {
  const { tool } = useParams()
  const sheet = findCheatsheet(tool)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 다른 도구로 옮기면 맨 위부터 보인다
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tool])

  if (!sheet) return <Navigate to={`/cheatsheet/${DEFAULT_CHEATSHEET}`} replace />

  // HashRouter 가 주소의 # 를 쓰므로 목차는 앵커 대신 n 번째 H2 로 스크롤한다
  const jump = (i: number) => bodyRef.current?.querySelectorAll('.md > h2')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <Topbar title={sheet.title} />
      <div className="cs">
        <div className="panel cs-body" ref={bodyRef}>
          <Markdown content={sheet.body} />
        </div>
        {sheet.sections.length > 0 && (
          <nav className="panel cs-toc" aria-label="목차">
            <h4>목차</h4>
            {sheet.sections.map((s, i) => (
              <button key={i} type="button" onClick={() => jump(i)}>
                {s}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  )
}
