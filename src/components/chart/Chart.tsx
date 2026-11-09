import { useMemo } from 'react'
import type { QueryResult } from '../../types'
import { prepare, type ChartSpec } from '../../lib/chartData'
import { useSize } from './useSize'
import LineChart from './LineChart'
import { BarChart, BoxChart, HeatmapChart } from './SvgCharts'

/** 카드 · 서랍 · 폼 미리보기가 함께 쓰는 그래프. 부모가 준 칸을 꽉 채운다 */
export default function Chart({ result, spec }: { result: QueryResult; spec: ChartSpec }) {
  const key = JSON.stringify(spec)
  // spec 은 폼에서 매번 새로 만들어지므로 내용(key)으로 묶는다
  const prepared = useMemo(() => prepare(result, JSON.parse(key) as ChartSpec), [result, key])
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
            {prepared.kind === 'heatmap' && <HeatmapChart {...prepared} width={w} height={ch} />}
            {prepared.kind === 'box' && <BoxChart groups={prepared.groups} yName={prepared.yName} width={w} height={ch} />}
            {note && <div className="ch-note">{note}</div>}
          </>
        )
      )}
    </div>
  )
}
