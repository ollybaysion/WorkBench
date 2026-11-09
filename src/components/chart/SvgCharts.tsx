import { useState, type ReactNode } from 'react'
import { fmtNum, fmtVal, niceTicks, type BoxGroup, type HeatCell, type XY } from '../../lib/chartData'
import { seriesVar } from './theme'
import type { RowHooks } from './Chart'

const M = { l: 52, r: 10, t: 8, b: 22 }

/** 위쪽만 둥근 막대(값 끝 4px). 음수면 아래쪽이 둥글다 */
function barPath(x: number, base: number, end: number, w: number, r = 4): string {
  const up = end <= base
  const h = Math.abs(base - end)
  const rr = Math.min(r, w / 2, h)
  if (up)
    return `M${x},${base}V${end + rr}Q${x},${end} ${x + rr},${end}H${x + w - rr}Q${x + w},${end} ${x + w},${end + rr}V${base}Z`
  return `M${x},${base}V${end - rr}Q${x},${end} ${x + rr},${end}H${x + w - rr}Q${x + w},${end} ${x + w},${end - rr}V${base}Z`
}

/** x 글자가 겹치지 않게 몇 개씩 건너뛸지 */
const labelStep = (n: number, iw: number) => Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 60))))
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s)

function YAxis({ ticks, y, width }: { ticks: number[]; y: (v: number) => number; width: number }) {
  return (
    <g className="ch-axis">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} className="ch-grid" />
          <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end">
            {fmtNum(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

function XLabels({ labels, cx, iw, height }: { labels: string[]; cx: (i: number) => number; iw: number; height: number }) {
  const step = labelStep(labels.length, iw)
  const max = Math.max(3, Math.floor(((iw / labels.length) * step) / 7))
  return (
    <g className="ch-axis">
      {labels.map((l, i) =>
        i % step === 0 ? (
          <text key={i} x={cx(i)} y={height - 6} textAnchor="middle">
            {clip(l, max)}
          </text>
        ) : null,
      )}
    </g>
  )
}

interface TipState {
  x: number
  y: number
  body: ReactNode
}

function Frame({ width, height, tip, children, legend }: { width: number; height: number; tip: TipState | null; children: ReactNode; legend?: ReactNode }) {
  const flip = tip ? tip.x > width - 170 : false
  return (
    <div className="ch-svg">
      {legend}
      <svg width={width} height={height} role="img">
        {children}
      </svg>
      {tip && (
        <div className="ch-tip" style={{ left: tip.x + (flip ? -12 : 12), top: tip.y + (legend ? 18 : 0), transform: flip ? 'translateX(-100%)' : undefined }}>
          {tip.body}
        </div>
      )}
    </div>
  )
}

function Legend({ names }: { names: { name: string; slot: number }[] }) {
  if (names.length < 2) return null
  return (
    <div className="ch-legend">
      {names.map((s) => (
        <span key={s.name}>
          <i style={{ background: seriesVar(s.slot) }} />
          {s.name}
        </span>
      ))}
    </div>
  )
}

/** 막대 · 누적 막대 · 히스토그램. 묶음 막대 사이와 누적 칸 사이는 2px 띄운다 */
export function BarChart({ data, stacked, width, height }: { data: XY; stacked: boolean; width: number; height: number }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const h = height - (data.series.length > 1 ? 18 : 0)
  const n = data.labels.length
  const iw = width - M.l - M.r
  const ih = h - M.t - M.b
  const sums = data.labels.map((_, i) => data.series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0))
  const vals = data.series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const hiV = stacked ? Math.max(0, ...sums) : Math.max(0, ...vals)
  const loV = Math.min(0, ...vals)
  const ticks = niceTicks(loV, hiV || 1)
  const lo = Math.min(loV, ticks[0])
  const hi = Math.max(hiV, ticks[ticks.length - 1], lo + 1)
  const y = (v: number) => M.t + ih * (1 - (v - lo) / (hi - lo))
  const band = iw / n
  const inner = band * 0.72
  const k = stacked ? 1 : data.series.length
  const sub = Math.max(1, (inner - 2 * (k - 1)) / k)
  const cx = (i: number) => M.l + band * i + band / 2

  const bars: ReactNode[] = []
  data.labels.forEach((_, i) => {
    let acc = 0
    data.series.forEach((s, j) => {
      const v = s.values[i]
      if (v === null) return
      const x = stacked ? cx(i) - inner / 2 : cx(i) - inner / 2 + j * (sub + 2)
      if (stacked) {
        const base = y(acc)
        const end = y(acc + v)
        acc += v
        const top = j === data.series.length - 1 || data.series.slice(j + 1).every((t) => !t.values[i])
        const gap = j > 0 ? 2 : 0 // 아래 칸과 2px 띄운다
        bars.push(<path key={`${i}-${j}`} d={top ? barPath(x, base - gap, end, sub) : `M${x},${base - gap}V${end}H${x + sub}V${base - gap}Z`} fill={seriesVar(s.slot)} />)
      } else bars.push(<path key={`${i}-${j}`} d={barPath(x, y(0), y(v), sub)} fill={seriesVar(s.slot)} />)
    })
  })

  return (
    <Frame width={width} height={h} tip={tip} legend={<Legend names={data.series} />}>
      <YAxis ticks={ticks} y={y} width={width} />
      <line x1={M.l} x2={width - M.r} y1={y(0)} y2={y(0)} className="ch-base" />
      {bars}
      <XLabels labels={data.labels} cx={cx} iw={iw} height={h} />
      {data.labels.map((l, i) => (
        <rect
          key={i}
          x={M.l + band * i}
          y={M.t}
          width={band}
          height={ih}
          fill="transparent"
          onMouseEnter={() =>
            setTip({
              x: cx(i),
              y: M.t,
              body: (
                <>
                  <b>{l}</b>
                  {data.series.map((s) => (
                    <span key={s.name}>
                      <i style={{ background: seriesVar(s.slot) }} />
                      {s.name} <em>{s.values[i] == null ? '—' : fmtVal(s.values[i]!)}</em>
                    </span>
                  ))}
                </>
              ),
            })
          }
          onMouseLeave={() => setTip(null)}
        />
      ))}
    </Frame>
  )
}

/** 히트맵: 한 색(파랑)의 진하기로 값을 보인다. y 첫 값이 아래 */
export function HeatmapChart({ xs, ys, cells, min, max, xName, yName, vName, rows, width, height }: { xs: string[]; ys: string[]; cells: HeatCell[]; min: number; max: number; xName: string; yName: string; vName: string; rows?: RowHooks; width: number; height: number }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const h = height - 18
  const iw = width - M.l - M.r
  const ih = h - M.t - M.b
  const cell = Math.min(iw / xs.length, ih / ys.length)
  const cw = cell
  const chh = cell
  const ox = M.l + (iw - cell * xs.length) / 2 // 가운데 맞춤
  const oy = M.t + (ih - cell * ys.length) / 2
  const gap = cell > 6 ? 1 : 0
  const t = (v: number) => (max > min ? (v - min) / (max - min) : 1)
  const yStep = labelStep(ys.length, cell * ys.length * 2.2)
  const cx = (c: HeatCell) => ox + c.xi * cw
  const cy = (c: HeatCell) => oy + (ys.length - 1 - c.yi) * chh
  const sel = rows ? cells.filter((c) => rows.isSel(c.row)) : []
  const pick = rows?.pick
  const legend = (
    <div className="ch-legend">
      <span>
        {vName} {fmtNum(min)}
      </span>
      <span className="ch-ramp" />
      <span>{fmtNum(max)}</span>
    </div>
  )
  return (
    <Frame width={width} height={h} tip={tip} legend={legend}>
      {cells.map((c) => (
        <rect
          key={`${c.xi}-${c.yi}`}
          x={cx(c) + gap / 2}
          y={cy(c) + gap / 2}
          width={Math.max(0.5, cw - gap)}
          height={Math.max(0.5, chh - gap)}
          fill={seriesVar(0)}
          fillOpacity={0.12 + 0.88 * t(c.v)}
          className={pick ? 'ch-pick' : undefined}
          onClick={
            pick
              ? (e) => {
                  e.stopPropagation()
                  pick(c.row)
                }
              : undefined
          }
          onMouseEnter={() =>
            setTip({
              x: ox + (c.xi + 0.5) * cw,
              y: oy + (ys.length - 1 - c.yi) * chh,
              body: (
                <>
                  <b>
                    {xName} {xs[c.xi]} · {yName} {ys[c.yi]}
                  </b>
                  <span>
                    {vName} <em>{fmtVal(c.v)}</em>
                  </span>
                  {pick && <span className="ch-tip-hint">눌러서 {rows!.hint(c.row)} 넣기</span>}
                </>
              ),
            })
          }
          onMouseLeave={() => setTip(null)}
        />
      ))}
      {sel.map((c) => (
        <rect key={`sel-${c.xi}-${c.yi}`} x={cx(c) + 1} y={cy(c) + 1} width={Math.max(0.5, cw - 2)} height={Math.max(0.5, chh - 2)} rx={2} className="ch-sel" />
      ))}
      <g className="ch-axis">
        {ys.map((l, i) =>
          i % yStep === 0 ? (
            <text key={i} x={ox - 6} y={oy + (ys.length - 1 - i + 0.5) * chh} dy="0.32em" textAnchor="end">
              {clip(l, 6)}
            </text>
          ) : null,
        )}
      </g>
      <XLabels labels={xs} cx={(i) => ox + (i + 0.5) * cw} iw={cell * xs.length} height={h} />
    </Frame>
  )
}

/** 상자 그림: 사분위 상자 · 가운데 값 · 1.5 IQR 수염 · 바깥 점 */
export function BoxChart({ groups, yName, width, height }: { groups: BoxGroup[]; yName: string; width: number; height: number }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const iw = width - M.l - M.r
  const ih = height - M.t - M.b
  const all = groups.flatMap((g) => [g.lo, g.hi, ...g.outliers])
  const ticks = niceTicks(Math.min(...all), Math.max(...all))
  const lo = Math.min(...all, ticks[0])
  const hi = Math.max(...all, ticks[ticks.length - 1], lo + 1e-9)
  const y = (v: number) => M.t + ih * (1 - (v - lo) / (hi - lo || 1))
  const band = iw / groups.length
  const bw = Math.min(48, band * 0.5)
  const cx = (i: number) => M.l + band * (i + 0.5)
  const c = seriesVar(0)
  return (
    <Frame width={width} height={height} tip={tip}>
      <YAxis ticks={ticks} y={y} width={width} />
      {groups.map((g, i) => (
        <g key={g.name}>
          <line x1={cx(i)} x2={cx(i)} y1={y(g.lo)} y2={y(g.q1)} stroke={c} strokeWidth={2} />
          <line x1={cx(i)} x2={cx(i)} y1={y(g.q3)} y2={y(g.hi)} stroke={c} strokeWidth={2} />
          <line x1={cx(i) - bw / 4} x2={cx(i) + bw / 4} y1={y(g.lo)} y2={y(g.lo)} stroke={c} strokeWidth={2} />
          <line x1={cx(i) - bw / 4} x2={cx(i) + bw / 4} y1={y(g.hi)} y2={y(g.hi)} stroke={c} strokeWidth={2} />
          <rect x={cx(i) - bw / 2} y={y(g.q3)} width={bw} height={Math.max(1, y(g.q1) - y(g.q3))} rx={4} fill={c} fillOpacity={0.22} stroke={c} strokeWidth={2} />
          <line x1={cx(i) - bw / 2} x2={cx(i) + bw / 2} y1={y(g.med)} y2={y(g.med)} className="ch-median" />
          {g.outliers.slice(0, 50).map((v, j) => (
            <circle key={j} cx={cx(i)} cy={y(v)} r={4} fill="var(--surface)" stroke={c} strokeWidth={2} />
          ))}
          <rect
            x={M.l + band * i}
            y={M.t}
            width={band}
            height={ih}
            fill="transparent"
            onMouseEnter={() =>
              setTip({
                x: cx(i),
                y: y(g.q3),
                body: (
                  <>
                    <b>
                      {g.name} · {g.n} 개
                    </b>
                    <span>
                      {yName} 가운데 <em>{fmtVal(g.med)}</em>
                    </span>
                    <span>
                      사분위 <em>{fmtVal(g.q1)} – {fmtVal(g.q3)}</em>
                    </span>
                    <span>
                      수염 <em>{fmtVal(g.lo)} – {fmtVal(g.hi)}</em>
                    </span>
                    {g.outliers.length > 0 && (
                      <span>
                        바깥 점 <em>{g.outliers.length}</em>
                      </span>
                    )}
                  </>
                ),
              })
            }
            onMouseLeave={() => setTip(null)}
          />
        </g>
      ))}
      <XLabels labels={groups.map((g) => g.name)} cx={cx} iw={iw} height={height} />
    </Frame>
  )
}

