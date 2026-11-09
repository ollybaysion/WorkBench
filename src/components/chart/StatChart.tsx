import { fmtVal, type StatTile } from '../../lib/chartData'
import { overOf } from '../../lib/marks'
import { copyOnClick } from '../board/copy'
import type { RowHooks } from './Chart'

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
 * 범위 막대: LCL~UCL 을 막대 가운데 80 % 에 두고 값 자리에 점을 찍는다. 넘으면 점이 막대 끝 바깥에 선다.
 * 한계가 하나뿐이면 그 한계를 막대 끝에 둔다.
 */
function RangeBar({ v, lcl, ucl, showText }: { v: number | null; lcl: number | null; ucl: number | null; showText: boolean }) {
  const lo = lcl ?? (ucl !== null && v !== null ? Math.min(v, 0) : 0)
  const hi = ucl ?? (lcl !== null && v !== null ? Math.max(v, lcl * 2) : 1)
  const span = hi - lo || 1
  const p = v === null ? null : Math.max(-0.1, Math.min(1.1, (v - lo) / span))
  const pos = p === null ? null : 10 + p * 80
  return (
    <span className="stat-rg">
      <span className="stat-trk">
        <span className="stat-in" />
        {pos !== null && <b style={{ left: `${pos}%` }} />}
      </span>
      {showText && (
        <span className="stat-rgt">
          {lcl !== null ? fmtStat(lcl) : '—'} ~ {ucl !== null ? fmtStat(ucl) : '—'}
        </span>
      )}
    </span>
  )
}

const OverIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18v.5" />
  </svg>
)

/**
 * 숫자 타일(Grafana Stat 패널 참고). 값 하나를 큰 숫자 하나로.
 * 시간 열이면 마지막 값 · 처음 대비 변화량 · 추세선, 이름 열이면 행마다 타일. 값이 글자면 글자(상태)를 크게.
 * 한계 열이 있으면 범위 막대를 붙이고, 넘으면 빨간 테두리 + 아이콘 + "UCL 넘음" 글자로 보인다.
 * 누르면 값이 복사된다. 고르기 규칙이 있으면 그 행의 값을 변수에 넣는다.
 * 오르면 좋은지 알 수 없으므로 변화량은 상태색 없이 ▲▼ 와 글자색으로만 보인다.
 */
export default function StatChart({ tiles, rows, width, height }: { tiles: StatTile[]; rows?: RowHooks; width: number; height: number }) {
  const { cols, w, h } = layout(tiles.length, width, height)
  const pick = rows?.pick
  return (
    <div className="stat-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: Math.floor(h), gap: GAP }}>
      {tiles.map((t, i) => {
        const text = t.value !== null ? fmtStat(t.value) : (t.text ?? '—')
        const ranged = t.lcl !== undefined || t.ucl !== undefined
        const over = ranged ? overOf(t.cmp, t.lcl, t.ucl) : undefined
        const hasSpark = !!t.spark && h > 70
        const hasDelta = t.delta !== undefined && h > 56
        const hasRange = ranged && h > 44
        // 큰 숫자: 타일 높이에서 여백 · 이름표 · 줄 사이 · 추세선 · 변화량 줄 · 범위 막대를 뺀 만큼(줄 높이 1.1), 너비에 글자가 들어가는 만큼
        const tight = h < 50
        const sparkH = Math.max(16, Math.min(40, h * 0.24))
        const parts = [hasSpark ? sparkH + 2 : 0, hasDelta ? 15 : 0, hasRange ? 8 : 0].filter((x) => x > 0)
        const used = (tight ? 8 : 14) + (tight ? 13 : 15) + parts.reduce((a, b) => a + b, 0) + (parts.length + 1) * (tight ? 1 : 2)
        // 범위 글자(LCL ~ UCL)는 그 줄을 빼고도 큰 숫자가 20px 이상일 때만
        const rangeText = hasRange && (h - used - 14) / 1.1 >= 20
        const room = h - used - (rangeText ? 14 : 0)
        const valueSize = Math.max(11, Math.min(44, room / 1.1, (w - 20) / Math.max(3, text.length * 0.62)))
        const sel = t.row !== undefined && rows?.isSel(t.row)
        const overText = over === 'ucl' ? 'UCL 넘음' : over === 'lcl' ? 'LCL 아래' : ''
        const tip = `${t.label} · ${t.value === null ? (t.text ?? 'NULL') : fmtVal(t.value)}${ranged ? ` · 범위 ${t.lcl ?? '—'} ~ ${t.ucl ?? '—'}` : ''}${overText ? ` · ${overText}` : ''}`
        return (
          <button
            key={`${t.label}-${i}`}
            type="button"
            className={'stat' + (over ? ' over' : '') + (sel ? ' sel' : '') + (pick ? ' pickable' : '') + (h < 50 ? ' tight' : '')}
            title={pick && t.row !== undefined ? `${tip} · 눌러서 ${rows!.hint(t.row)} 넣기` : `${tip} · 눌러서 값 복사`}
            onClick={
              pick && t.row !== undefined
                ? (e) => {
                    e.stopPropagation()
                    pick(t.row!)
                  }
                : copyOnClick(t.value === null ? (t.text ?? '') : String(t.value), '값')
            }
          >
            <span className="stat-l">
              {over && (
                <span className="stat-x">
                  <OverIcon />
                  {w > 120 && overText}
                </span>
              )}
              {t.label}
            </span>
            <span className={'stat-v' + (t.text !== undefined ? ' txt' : '')} style={{ fontSize: valueSize }}>
              {text}
            </span>
            {hasDelta && t.delta !== undefined && (
              <span className="stat-d">
                {t.delta > 0 ? '▲' : t.delta < 0 ? '▼' : '■'} {fmtStat(Math.abs(t.delta))} <em>{t.from ? `${t.from} 대비` : '처음 대비'}</em>
              </span>
            )}
            {hasRange && <RangeBar v={t.cmp ?? null} lcl={t.lcl ?? null} ucl={t.ucl ?? null} showText={rangeText} />}
            {hasSpark && <Sparkline values={t.spark!} w={Math.max(20, w - 20)} h={sparkH} />}
          </button>
        )
      })}
    </div>
  )
}
