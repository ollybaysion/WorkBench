import type { QueryResult } from '../../types'

/** 행 높이(px). index.css 의 .rtable 과 같다 */
export const ROW_H = 26
export const ROW_H_COMPACT = 22

/** 결과 표. 머리 행 sticky, 숫자 오른쪽 정렬, NULL 은 흐리게. maxRows 가 있으면 그만큼만 그린다(카드 안) */
export default function ResultTable({ result, compact = false, maxRows }: { result: QueryResult; compact?: boolean; maxRows?: number }) {
  const num = result.columns.map((c) => c.type === 'number')
  const rows = maxRows === undefined ? result.rows : result.rows.slice(0, maxRows)
  return (
    <table className={'rtable' + (compact ? ' compact' : '')}>
      <thead>
        <tr>
          {result.columns.map((c, i) => (
            <th key={c.name} className={num[i] ? 'num' : undefined}>
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
