import { useMemo } from 'react'
import type { QueryResult } from '../../types'
import { cellText, copyOnClick } from './copy'
import { isPicked, limitCols, pickCols, pickPatch, rowOver, type Marks } from '../../lib/marks'

/** 행 높이(px). index.css 의 .rtable 과 같다 */
export const ROW_H = 26
export const ROW_H_COMPACT = 22

/** 열 너비(px): 머리 글자와 앞 50 행의 글자 길이로 정한다. 64~240 */
const MIN_W = 64
const MAX_W = 240
const SAMPLE = 50

function colWidths(result: QueryResult, compact: boolean): number[] {
  const ch = compact ? 7.0 : 7.4 // 고정폭 글꼴 한 글자 폭(대략, 0.6em)
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
 * 머리 칸을 누르면 열 이름, 칸을 누르면 값이 복사된다.
 * marks 가 있으면: 변수 값과 같은 행에 띠(고름), 한계를 넘은 행에 빨간 띠 + 견준 값 앞에 ▲▼(넘음).
 * 고르기 규칙이 있고 onPick 이 있으면 칸을 누를 때 복사하지 않고 그 행의 값을 변수에 넣는다.
 */
export default function ResultTable({ result, compact = false, maxRows, marks }: { result: QueryResult; compact?: boolean; maxRows?: number; marks?: Marks }) {
  const num = result.columns.map((c) => c.type === 'number')
  const rows = maxRows === undefined ? result.rows : result.rows.slice(0, maxRows)
  const pc = useMemo(() => pickCols(result, marks?.picks), [result, marks?.picks])
  const lc = useMemo(() => limitCols(result, marks?.limits), [result, marks?.limits])
  const vars = marks?.vars ?? {}
  const onPick = pc.length ? marks?.onPick : undefined
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
            <th key={i} className={'copyable' + (num[i] ? ' num' : '')} title={`${c.name} · 눌러서 열 이름 복사`} onClick={copyOnClick(c.name, '열 이름')}>
              {c.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => {
          const over = rowOver(row, lc)
          const sel = isPicked(row, pc, vars)
          return (
            <tr key={ri} className={(sel ? 'sel' : '') + (over ? ' over' : '') || undefined}>
              {row.map((v, ci) => {
                const mark = over && ci === lc.value ? (over === 'ucl' ? '▲ ' : '▼ ') : ''
                const what = over && ci === lc.value ? (over === 'ucl' ? ' · UCL 넘음' : ' · LCL 아래') : ''
                return (
                  <td
                    key={ci}
                    className={(onPick ? 'pickable' : 'copyable') + (num[ci] ? ' num' : '') + (mark ? ' overv' : '')}
                    title={onPick ? `${cellText(v) || 'NULL'}${what} · 눌러서 ${Object.entries(pickPatch(row, pc)).map(([k, x]) => `${k} = ${x || '(빈 값)'}`).join(' · ')} 넣기` : v === null ? '눌러서 복사 (NULL)' : `${cellText(v)}${what} · 눌러서 복사`}
                    onClick={
                      onPick
                        ? (e) => {
                            e.stopPropagation()
                            onPick(pickPatch(row, pc))
                          }
                        : copyOnClick(cellText(v), '값')
                    }
                  >
                    {mark}
                    {v === null ? <span className="null muted">NULL</span> : String(v)}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
