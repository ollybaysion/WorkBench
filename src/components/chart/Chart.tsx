import { useMemo } from 'react'
import type { QueryResult } from '../../types'
import { prepare, type ChartSpec } from '../../lib/chartData'
import { isPicked, pickCols, pickPatch, type Marks } from '../../lib/marks'
import { useSize } from './useSize'
import LineChart from './LineChart'
import { BarChart, BoxChart, HeatmapChart } from './SvgCharts'
import StatChart from './StatChart'

/** 칸 · 타일이 쓰는 행 손잡이: 그 행이 고른 행인지, 누르면 변수에 넣는 함수(복사 모드면 없음) */
export interface RowHooks {
  isSel: (row: number) => boolean
  pick?: (row: number) => void
  /** 누를 때 넣을 값(툴팁 글자) "wafer = 12" */
  hint: (row: number) => string
}

/** 카드 · 서랍 · 폼 미리보기가 함께 쓰는 그래프. 부모가 준 칸을 꽉 채운다 */
export default function Chart({ result, spec, marks }: { result: QueryResult; spec: ChartSpec; marks?: Marks }) {
  const focusValue = spec.focus ? (marks?.vars[spec.focus] ?? '') : undefined
  // spec 은 폼에서 매번 새로 만들어지므로 내용(key)으로 묶는다
  const key = JSON.stringify([spec, marks?.limits ?? null, focusValue ?? null])
  const prepared = useMemo(() => {
    const [s, limits, fv] = JSON.parse(key) as [ChartSpec, Marks['limits'] | null, string | null]
    return prepare(result, s, { limits: limits ?? undefined, focusValue: fv ?? undefined })
  }, [result, key])
  const rows = useMemo<RowHooks>(() => {
    const cols = pickCols(result, marks?.picks)
    const vars = marks?.vars ?? {}
    const onPick = marks?.onPick
    return {
      isSel: (ri) => isPicked(result.rows[ri], cols, vars),
      pick: onPick && cols.length ? (ri) => onPick(pickPatch(result.rows[ri], cols)) : undefined,
      hint: (ri) =>
        Object.entries(pickPatch(result.rows[ri], cols))
          .map(([k, v]) => `${k} = ${v || '(빈 값)'}`)
          .join(' · '),
    }
  }, [result, marks?.picks, marks?.vars, marks?.onPick])
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const note = 'note' in prepared ? prepared.note : undefined
  const ch = h - (note ? 16 : 0)
  return (
    <div className="chart" ref={ref}>
      {prepared.kind === 'error' ? (
        <div className="qc-state">
          <div className="note-box warn">{prepared.message}</div>
        </div>
      ) : (
        w > 0 &&
        ch > 40 && (
          <>
            {prepared.kind === 'lines' && <LineChart type={prepared.type} panels={prepared.panels} width={w} height={ch} />}
            {prepared.kind === 'bars' && <BarChart data={prepared.data} stacked={prepared.stacked} width={w} height={ch} />}
            {prepared.kind === 'heatmap' && <HeatmapChart {...prepared} rows={rows} width={w} height={ch} />}
            {prepared.kind === 'box' && <BoxChart groups={prepared.groups} yName={prepared.yName} width={w} height={ch} />}
            {prepared.kind === 'stat' && <StatChart tiles={prepared.tiles} rows={rows} width={w} height={ch} />}
            {note && <div className="ch-note">{note}</div>}
          </>
        )
      )}
    </div>
  )
}
