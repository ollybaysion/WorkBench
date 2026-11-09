import { useEffect, useId, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { fmtNum, fmtVal, type LineExtras, type Panel } from '../../lib/chartData'
import { cssVar, seriesVar, useThemeVersion } from './theme'

type LineType = 'line' | 'step' | 'area' | 'scatter'

const LEGEND_H = 18
const X_AXIS_H = 24
const PHASE_H = 16 // 구간 이름 줄
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

/** 넘은 폭: 시간 축이면 초 · 분, 아니면 x 단위 그대로 */
function widthText(w: number, time: boolean): string {
  if (!time) return fmtNum(w)
  return w < 120 ? `${fmtNum(w)} s` : `${fmtNum(w / 60)} m`
}

const hasLimitLines = (e?: LineExtras) => !!(e?.lcl || e?.ucl)
const needsLegend = (p: Panel) => p.title !== undefined || p.data.series.length > 1 || hasLimitLines(p.extras) || !!p.extras?.focus

/** 선 · 계단 · 영역 · 산점도(uPlot). 패널이 여럿이면 위아래로 쌓고 커서를 맞춘다. x 축은 맨 아래 패널에만 */
export default function LineChart({ type, panels, width, height }: { type: LineType; panels: Panel[]; width: number; height: number }) {
  const syncKey = useId()
  const legends: number[] = panels.map((p) => (needsLegend(p) ? LEGEND_H : 0))
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

/** 범례: 시리즈 · 겹침(고른 것 + 회색 N 개) · 한계선 · 가장 많이 넘은 점 */
function PanelLegend({ panel, time }: { panel: Panel; time: boolean }) {
  const { data, extras } = panel
  const focus = extras?.focus
  const peak = extras?.peak
  return (
    <div className="ch-legend">
      {focus ? (
        <>
          {focus.found && (
            <span>
              <i style={{ background: seriesVar(0) }} />
              {focus.var} {focus.value}
            </span>
          )}
          {focus.others > 0 && (
            <span>
              <i className="muted-line" />
              그 외 {focus.others} 개
            </span>
          )}
        </>
      ) : (
        data.series.length > 1 &&
        data.series.map((s) => (
          <span key={s.name}>
            <i style={{ background: seriesVar(s.slot) }} />
            {s.name}
          </span>
        ))
      )}
      {panel.title !== undefined && data.series.length === 1 && !focus && (
        <span>
          <i style={{ background: seriesVar(data.series[0].slot) }} />
          {panel.title}
        </span>
      )}
      {hasLimitLines(extras) && (
        <span>
          <i className="dash-line" />
          {[extras?.lcl && 'LCL', extras?.ucl && 'UCL'].filter(Boolean).join(' · ')}
        </span>
      )}
      {peak && (
        <span className="ch-peak">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
            <path d="M12 3l10 18H2z" />
            <path d="M12 10v5M12 18v.5" />
          </svg>
          {fmtVal(peak.v)} {peak.side === 'ucl' ? '>' : '<'} {peak.side === 'ucl' ? 'UCL' : 'LCL'} {fmtVal(peak.limit)} · 넘은 폭 {widthText(peak.width, time)}
        </span>
      )}
    </div>
  )
}

function LinePanel({ type, panel, width, height, showX, legend, syncKey }: { type: LineType; panel: Panel; width: number; height: number; showX: boolean; legend: boolean; syncKey: string }) {
  const { data, extras } = panel
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
    const danger = cssVar('--danger')
    const cat = data.xKind === 'cat'
    const r = devicePixelRatio
    const axis = { stroke: muted, font: FONT, grid: { stroke: grid, width: 1 }, ticks: { show: false } }
    const limitSeries: uPlot.Series[] = []
    const limitData: (number | null)[][] = []
    // 한계선: x 마다 값이 다를 수 있으므로(STEP 마다 한계) 계단 선으로
    if (extras?.ucl) {
      limitSeries.push({ label: 'UCL', stroke: danger, width: 1.5, dash: [5 * r, 4 * r], spanGaps: true, paths: uPlot.paths.stepped!({ align: 1 }), points: { show: false } })
      limitData.push(extras.ucl)
    }
    if (extras?.lcl) {
      limitSeries.push({ label: 'LCL', stroke: muted, width: 1.5, dash: [5 * r, 4 * r], spanGaps: true, paths: uPlot.paths.stepped!({ align: 1 }), points: { show: false } })
      limitData.push(extras.lcl)
    }
    const focusIdx = extras?.focus?.found ? data.series.length : -1 // uPlot 시리즈 번호(0 은 x). 고른 시리즈는 맨 끝
    const phases = extras?.phases ?? []
    const over = extras?.over ?? []
    const opts: uPlot.Options = {
      ...size.current,
      padding: [phases.length ? 6 + PHASE_H : 6, 10, 0, 0],
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
          // 겹침 모드의 회색 시리즈: 얇고 흐리게, 커서 점 없이
          if (s.muted) return { label: s.name, stroke: `${muted}66`, width: 1, spanGaps: true, points: { show: false }, ...(type === 'step' ? { paths: uPlot.paths.stepped!({ align: 1 }) } : {}) }
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
        ...limitSeries,
      ],
      hooks: {
        // 시리즈 아래: 넘은 구간 칠하기 · 구간 경계 세로 선
        drawAxes: [
          (u) => {
            const { ctx, bbox } = u
            ctx.save()
            ctx.fillStyle = `${danger}1f`
            for (const o of over) {
              const x0 = Math.max(bbox.left, u.valToPos(o.from, 'x', true))
              const x1 = Math.min(bbox.left + bbox.width, u.valToPos(o.to, 'x', true))
              if (x1 > x0) ctx.fillRect(x0, bbox.top, Math.max(1, x1 - x0), bbox.height)
            }
            ctx.strokeStyle = `${muted}99`
            ctx.lineWidth = r
            for (const p of phases.slice(1)) {
              const x = Math.round(u.valToPos(p.from, 'x', true)) + 0.5
              ctx.beginPath()
              ctx.moveTo(x, bbox.top - PHASE_H * r)
              ctx.lineTo(x, bbox.top + bbox.height)
              ctx.stroke()
            }
            ctx.restore()
          },
        ],
        // 시리즈 위: 고른 시리즈의 넘은 부분을 빨강으로 다시 긋기 · 구간 이름
        draw: [
          (u) => {
            const { ctx, bbox } = u
            ctx.save()
            const path = focusIdx > 0 ? (u.series[focusIdx] as unknown as { _paths?: { stroke?: Path2D } })._paths?.stroke : undefined
            if (path && (extras?.ucl || extras?.lcl)) {
              const clip = new Path2D()
              const xs = data.xs
              xs.forEach((x, i) => {
                const a = u.valToPos(i > 0 ? (xs[i - 1] + x) / 2 : x, 'x', true)
                const b = u.valToPos(i < xs.length - 1 ? (x + xs[i + 1]) / 2 : x, 'x', true)
                const ucl = extras.ucl?.[i]
                const lcl = extras.lcl?.[i]
                if (ucl != null) clip.rect(a, bbox.top, b - a + 0.5, u.valToPos(ucl, 'y', true) - bbox.top)
                if (lcl != null) {
                  const y = u.valToPos(lcl, 'y', true)
                  clip.rect(a, y, b - a + 0.5, bbox.top + bbox.height - y)
                }
              })
              ctx.save()
              ctx.clip(clip)
              ctx.setLineDash([])
              ctx.strokeStyle = danger
              ctx.lineWidth = 2.6 * r
              ctx.lineJoin = 'round'
              ctx.stroke(path)
              ctx.restore()
            }
            if (phases.length) {
              ctx.fillStyle = muted
              ctx.font = `600 ${10.5 * r}px "JetBrains Mono", Consolas, monospace`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              phases.forEach((p, i) => {
                const a = u.valToPos(p.from, 'x', true)
                const b = u.valToPos(i < phases.length - 1 ? phases[i + 1].from : p.to, 'x', true)
                if (b - a < 30 * r) return
                ctx.fillText(p.name, (a + b) / 2, bbox.top - (PHASE_H / 2) * r)
              })
            }
            ctx.restore()
          },
        ],
        setCursor: [
          (u) => {
            const idx = u.cursor.idx
            const left = u.cursor.left ?? -1
            setTip(idx == null || left < 0 ? null : { idx, left: u.bbox.left / r + left, top: u.bbox.top / r + (u.cursor.top ?? 0), plotRight: (u.bbox.left + u.bbox.width) / r })
          },
        ],
      },
    }
    const u = new uPlot(opts, [data.xs, ...data.series.map((s) => s.values), ...limitData] as uPlot.AlignedData, el)
    plot.current = u
    return () => {
      u.destroy()
      plot.current = null
    }
  }, [data, extras, type, showX, syncKey, theme])

  useEffect(() => {
    plot.current?.setSize({ width, height })
  }, [width, height])

  const flip = tip ? tip.left > tip.plotRight - 170 : false
  // 겹침 모드의 툴팁은 고른 시리즈만(회색 시리즈는 수만)
  const tipSeries = extras?.focus ? data.series.filter((s) => !s.muted) : data.series
  const phaseAt = (i: number) => {
    const x = data.xs[i]
    return extras?.phases?.find((p, k, all) => x >= p.from && (k === all.length - 1 || x < all[k + 1].from))?.name
  }

  return (
    <div className="ch-panel" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {legend && <PanelLegend panel={panel} time={data.xKind === 'time'} />}
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
          <b>
            {data.labels[tip.idx]}
            {extras?.phases && ` · ${phaseAt(tip.idx) ?? ''}`}
          </b>
          {tipSeries.map((s) => (
            <span key={s.name}>
              <i style={{ background: seriesVar(s.slot) }} />
              {s.name} <em>{s.values[tip.idx] == null ? '—' : fmtVal(s.values[tip.idx]!)}</em>
            </span>
          ))}
          {extras?.focus && extras.focus.others > 0 && <span className="muted">그 외 {extras.focus.others} 개 회색</span>}
          {extras?.ucl?.[tip.idx] != null && (
            <span>
              UCL <em>{fmtVal(extras.ucl[tip.idx]!)}</em>
            </span>
          )}
          {extras?.lcl?.[tip.idx] != null && (
            <span>
              LCL <em>{fmtVal(extras.lcl[tip.idx]!)}</em>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
