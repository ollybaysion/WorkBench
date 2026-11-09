import { fmtVal, type StatTile } from '../../lib/chartData'
import { copyOnClick } from '../board/copy'

const GAP = 8
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en', { maximumFractionDigits: 3 })

/** 타일 값: 1만 아래는 자리 구분(1,284), 그 위는 줄여서(12.9K · 4.2M) */
const fmtStat = (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : plain.format(v))

/** 판 크기와 타일 수로 열 수를 고른다: 타일이 가로로 너무 길거나 납작해지지 않게 */
function layout(n: number, width: number, height: number) {
  let best = { cols: 1, w: width, h: height / n, score: -1 }
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const w = (width - GAP * (cols - 1)) / cols
    const h = (height - GAP * (rows - 1)) / rows
    const score = Math.min(w / 1.7, h)
    if (score > best.score) best = { cols, w, h, score }
  }
  return best
}

function Sparkline({ values, w, h }: { values: (number | null)[]; w: number; h: number }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null)
  if (pts.length < 2) return null
  const lo = Math.min(...pts.map((p) => p[1]))
  const hi = Math.max(...pts.map((p) => p[1]))
  const x = (i: number) => 2 + ((w - 4) * i) / (values.length - 1)
  const y = (v: number) => 2 + (h - 4) * (hi > lo ? 1 - (v - lo) / (hi - lo) : 0.5)
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const [li, lv] = pts[pts.length - 1]
  return (
    <svg className="stat-spark" width={w} height={h} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" opacity={0.7} />
      <circle cx={x(li)} cy={y(lv)} r={3} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  )
}

/**
 * 숫자 타일(Grafana Stat 패널 참고). 값 하나를 큰 숫자 하나로.
 * 시간 열이면 마지막 값 · 처음 대비 변화량 · 추세선, 이름 열이면 행마다 타일. 누르면 값이 복사된다.
 * 오르면 좋은지 알 수 없으므로 변화량은 상태색 없이 ▲▼ 와 글자색으로만 보인다.
 */
export default function StatChart({ tiles, width, height }: { tiles: StatTile[]; width: number; height: number }) {
  const { cols, w, h } = layout(tiles.length, width, height)
  return (
    <div className="stat-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: Math.floor(h), gap: GAP }}>
      {tiles.map((t, i) => {
        const text = t.value === null ? '—' : fmtStat(t.value)
        const hasSpark = !!t.spark && h > 70
        // 큰 숫자: 타일 높이에서 이름표 · 여백(약 30px) · 추세선 · 변화량 줄을 뺀 만큼, 너비에 글자가 들어가는 만큼
        const room = h - 30 - (hasSpark ? Math.min(40, h * 0.24) + 4 : 0) - (t.delta !== undefined && h > 56 ? 16 : 0)
        const valueSize = Math.max(12, Math.min(44, room * 0.95, (w - 20) / Math.max(3, text.length * 0.62)))
        return (
          <button
            key={`${t.label}-${i}`}
            type="button"
            className="stat"
            title={`${t.label} · ${t.value === null ? 'NULL' : fmtVal(t.value)} · 눌러서 값 복사`}
            onClick={copyOnClick(t.value === null ? '' : String(t.value), '값')}
          >
            <span className="stat-l">{t.label}</span>
            <span className="stat-v" style={{ fontSize: valueSize }}>
              {text}
            </span>
            {t.delta !== undefined && h > 56 && (
              <span className="stat-d">
                {t.delta > 0 ? '▲' : t.delta < 0 ? '▼' : '■'} {fmtStat(Math.abs(t.delta))} <em>{t.from ? `${t.from} 대비` : '처음 대비'}</em>
              </span>
            )}
            {hasSpark && <Sparkline values={t.spark!} w={Math.max(20, w - 20)} h={Math.max(16, Math.min(40, h * 0.24))} />}
          </button>
        )
      })}
    </div>
  )
}
