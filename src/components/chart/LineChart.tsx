import { useEffect, useId, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { fmtNum, fmtVal, type Panel } from '../../lib/chartData'
import { cssVar, seriesVar, useThemeVersion } from './theme'

type LineType = 'line' | 'step' | 'area' | 'scatter'

const LEGEND_H = 18
const X_AXIS_H = 24
const FONT = '11px "JetBrains Mono", Consolas, monospace'

const pad = (n: number) => String(n).padStart(2, '0')

/** 시간 축 글자: 하루 안이면 14:00, 넘으면 10-28 14:00 */
function timeLabel(xs: number[]) {
  const span = xs.length ? xs[xs.length - 1] - xs[0] : 0
  return (t: number) => {
    const d = new Date(t * 1000)
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    return span < 86400 ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
  }
}

/** 선 · 계단 · 영역 · 산점도(uPlot). 패널이 여럿이면 위아래로 쌓고 커서를 맞춘다. x 축은 맨 아래 패널에만 */
export default function LineChart({ type, panels, width, height }: { type: LineType; panels: Panel[]; width: number; height: number }) {
  const syncKey = useId()
  const legends: number[] = panels.map((p) => (p.title !== undefined || p.data.series.length > 1 ? LEGEND_H : 0))
  const plotH = Math.max(60, Math.floor((height - legends.reduce((a, b) => a + b, 0) - X_AXIS_H) / panels.length))
  return (
    <div className="ch-lines">
      {panels.map((p, i) => (
        <LinePanel key={p.title ?? i} type={type} panel={p} width={width} height={plotH + (i === panels.length - 1 ? X_AXIS_H : 0)} showX={i === panels.length - 1} legend={legends[i] > 0} syncKey={syncKey} />
      ))}
    </div>
  )
}

/** 커서 자리(패널 안 px)와 그 자리의 x 번호. 그림 영역 오른쪽 끝은 툴팁을 뒤집을 때 쓴다 */
interface Tip {
  idx: number
  left: number
  top: number
  plotRight: number
}

function LinePanel({ type, panel, width, height, showX, legend, syncKey }: { type: LineType; panel: Panel; width: number; height: number; showX: boolean; legend: boolean; syncKey: string }) {
  const { data } = panel
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const size = useRef({ width, height })
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState(false)
  const theme = useThemeVersion()

  // 그래프를 새로 만들 때 쓸 지금 크기(아래 효과보다 먼저 돈다)
  useEffect(() => {
    size.current = { width, height }
  }, [width, height])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const muted = cssVar('--muted')
    const grid = cssVar('--border')
    const surface = cssVar('--surface')
    const cat = data.xKind === 'cat'
    const axis = { stroke: muted, font: FONT, grid: { stroke: grid, width: 1 }, ticks: { show: false } }
    const opts: uPlot.Options = {
      ...size.current,
      padding: [6, 10, 0, 0],
      legend: { show: false },
      scales: { x: { time: data.xKind === 'time' } },
      cursor: { sync: { key: syncKey }, drag: { x: false, y: false }, points: { size: 8, width: 2 } },
      axes: [
        {
          ...axis,
          show: showX,
          size: showX ? X_AXIS_H : 0,
          space: 64,
          ...(cat ? { incrs: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], values: (_u: uPlot, splits: number[]) => splits.map((v) => (Number.isInteger(v) ? (data.labels[v] ?? '') : '')) } : {}),
          ...(data.xKind === 'time' ? { values: (_u: uPlot, splits: number[]) => splits.map(timeLabel(data.xs)) } : {}),
        },
        { ...axis, size: 52, space: 28, values: (_u: uPlot, splits: number[]) => splits.map(fmtNum) },
      ],
      series: [
        {},
        ...data.series.map((s) => {
          const c = cssVar(`--series-${(s.slot % 8) + 1}`)
          return {
            label: s.name,
            stroke: c,
            width: 2,
            spanGaps: true,
            ...(type === 'area' ? { fill: `${c}2e` } : {}),
            ...(type === 'step' ? { paths: uPlot.paths.stepped!({ align: 1 }) } : {}),
            ...(type === 'scatter' ? { paths: () => null, points: { show: true, size: 8, width: 2, stroke: surface, fill: c } } : {}),
          }
        }),
      ],
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx
            const left = u.cursor.left ?? -1
            const r = devicePixelRatio
            setTip(idx == null || left < 0 ? null : { idx, left: u.bbox.left / r + left, top: u.bbox.top / r + (u.cursor.top ?? 0), plotRight: (u.bbox.left + u.bbox.width) / r })
          },
        ],
      },
    }
    const u = new uPlot(opts, [data.xs, ...data.series.map((s) => s.values)] as uPlot.AlignedData, el)
    plot.current = u
    return () => {
      u.destroy()
      plot.current = null
    }
  }, [data, type, showX, syncKey, theme])

  useEffect(() => {
    plot.current?.setSize({ width, height })
  }, [width, height])

  const flip = tip ? tip.left > tip.plotRight - 170 : false

  return (
    <div className="ch-panel" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {legend && (
        <div className="ch-legend">
          {data.series.map((s) => (
            <span key={s.name}>
              <i style={{ background: seriesVar(s.slot) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={host} className="ch-host" />
      {hover && tip && (
        <div
          className="ch-tip"
          style={{
            left: tip.left + (flip ? -12 : 12),
            top: Math.max(0, tip.top - 10) + (legend ? LEGEND_H : 0),
            transform: flip ? 'translateX(-100%)' : undefined,
          }}
        >
          <b>{data.labels[tip.idx]}</b>
          {data.series.map((s) => (
            <span key={s.name}>
              <i style={{ background: seriesVar(s.slot) }} />
              {s.name} <em>{s.values[tip.idx] == null ? '—' : fmtVal(s.values[tip.idx]!)}</em>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
