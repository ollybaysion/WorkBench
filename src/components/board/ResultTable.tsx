import { useMemo } from 'react'
import type { QueryResult } from '../../types'

/** 행 높이(px). index.css 의 .rtable 과 같다 */
export const ROW_H = 26
export const ROW_H_COMPACT = 22

/** 열 너비(px): 머리 글자와 앞 50 행의 글자 길이로 정한다. 64~240 */
const MIN_W = 64
const MAX_W = 240
const SAMPLE = 50

function colWidths(result: QueryResult, compact: boolean): number[] {
  const ch = compact ? 6.6 : 7.2 // 고정폭 글꼴 한 글자 폭(대략)
  return result.columns.map((c, i) => {
    let len = c.name.length
    for (const row of result.rows.slice(0, SAMPLE)) {
      const v = row[i]
      if (v !== null) len = Math.max(len, String(v).length)
    }
    return Math.round(Math.min(MAX_W, Math.max(MIN_W, len * ch + 14)))
  })
}

/**
 * 결과 표. 머리 행 sticky, 숫자 오른쪽 정렬, NULL 은 흐리게. maxRows 가 있으면 그만큼만 그린다(카드 안).
 * 열 너비의 합이 칸보다 넓으면 표가 넓어지고, 감싼 상자가 가로로 스크롤된다.
 */
export default function ResultTable({ result, compact = false, maxRows }: { result: QueryResult; compact?: boolean; maxRows?: number }) {
  const num = result.columns.map((c) => c.type === 'number')
  const rows = maxRows === undefined ? result.rows : result.rows.slice(0, maxRows)
  const widths = useMemo(() => colWidths(result, compact), [result, compact])
  const total = widths.reduce((a, b) => a + b, 0)
  return (
    <table className={'rtable' + (compact ? ' compact' : '')} style={{ width: `max(100%, ${total}px)` }}>
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {/* JOIN 의 SELECT * 는 열 이름이 겹칠 수 있다. key 는 자리 번호로 */}
          {result.columns.map((c, i) => (
            <th key={i} className={num[i] ? 'num' : undefined} title={c.name}>
              {c.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((v, ci) => (
              <td key={ci} className={num[ci] ? 'num' : undefined} title={v === null ? undefined : String(v)}>
                {v === null ? <span className="null muted">NULL</span> : String(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
