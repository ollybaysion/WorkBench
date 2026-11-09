import { useState } from 'react'
import type { QueryResult } from '../../types'
import { cellText, copyOnClick, rowText } from './copy'

/**
 * 행 카드 보기: 행 하나를 작은 카드 하나로, 안에 "열 이름 · 값" 을 격자로 늘어놓는다.
 * 열이 많은 결과(SELECT *)를 옆으로 밀지 않고 읽는다. 열 이름 · 값을 누르면 복사된다.
 */
export default function RecordList({ result, step = 100 }: { result: QueryResult; step?: number }) {
  const [limit, setLimit] = useState(step)
  const num = result.columns.map((c) => c.type === 'number')
  const rows = result.rows.slice(0, limit)
  return (
    <div className="records">
      {rows.map((row, ri) => (
        <section key={ri} className="rec" aria-label={`${ri + 1} 번째 행`}>
          <div className="rec-h">
            <span className="mono">#{ri + 1}</span>
            <button type="button" className="btn small ghost" onClick={copyOnClick(rowText(result, row), '행')} title="열 이름 · 값을 한 줄에 하나씩 복사">
              ⧉ 행 복사
            </button>
          </div>
          <dl className="rec-grid">
            {result.columns.map((c, ci) => {
              const v = row[ci]
              return (
                <div key={ci} className="rec-f">
                  <dt className="copyable" title="눌러서 열 이름 복사" onClick={copyOnClick(c.name, '열 이름')}>
                    {c.name}
                  </dt>
                  <dd className={'copyable' + (num[ci] ? ' num' : '')} title={v === null ? '눌러서 복사 (NULL)' : `${cellText(v)} · 눌러서 복사`} onClick={copyOnClick(cellText(v), '값')}>
                    {v === null ? <span className="null muted">NULL</span> : cellText(v)}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
      {result.rows.length > limit && (
        <button
          type="button"
          className="btn small rec-more"
          onClick={(e) => {
            e.stopPropagation()
            setLimit((l) => l + step)
          }}
        >
          {step} 행 더 보기 ({limit} / {result.rows.length})
        </button>
      )}
    </div>
  )
}
