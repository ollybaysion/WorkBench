import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Card, CardView, ChartType, Connection, Limits } from '../../types'
import { formatPicks, parsePicks, type Marks } from '../../lib/marks'
import { runner, type QueryState } from '../../lib/runner'
import { extractBinds, pickBinds } from '../../lib/sql'
import { render } from '../../lib/template'
import { now } from '../../lib/util'
import { useStore } from '../../store'
import { RISK_LABEL, RISK_PILL } from '../vars'
import { QueryBody, QueryFoot } from './QueryCardView'
import { resolveCommandVars, varsOf } from './command'

const CHART_TYPES: [ChartType, string][] = [
  ['line', '선'],
  ['step', '계단'],
  ['area', '영역'],
  ['bar', '막대'],
  ['stacked-bar', '누적 막대'],
  ['scatter', '산점도'],
  ['histogram', '히스토그램'],
  ['heatmap', '히트맵'],
  ['box', '상자 그림'],
  ['stat', '숫자 타일'],
]

/** 폼이 고치는 값. 조회 · 명령 두 모양을 함께 들고 있어서 종류를 바꿔도 입력이 남는다 */
interface Draft {
  kind: Card['kind']
  title: string
  description: string
  sql: string
  view: CardView['kind']
  chartType: ChartType
  x: string
  y: string // 쉼표로 나눈 열 이름
  series: string
  focus: string // 겹침 변수
  phase: string // 구간 열
  band: string // 강조 구간 열
  picks: string // "lot_id, slot:wafer"
  lcl: string
  ucl: string
  limValue: string // 표가 한계와 견줄 열
  commandId: string
}

const LINE_TYPES: ChartType[] = ['line', 'step', 'area', 'scatter']

function toDraft(c: Card): Draft {
  const q = c.kind === 'query' ? c : undefined
  const chart = q?.view.kind === 'chart' ? q.view : undefined
  return {
    kind: c.kind,
    title: c.title,
    description: c.description ?? '',
    sql: q?.sql ?? '',
    view: chart ? 'chart' : 'table',
    chartType: chart?.type ?? 'line',
    x: chart?.x ?? '',
    y: chart?.y.join(', ') ?? '',
    series: chart?.series ?? '',
    focus: chart?.focus ?? '',
    phase: chart?.phase ?? '',
    band: chart?.band ?? '',
    picks: formatPicks(q?.picks),
    lcl: q?.limits?.lcl ?? '',
    ucl: q?.limits?.ucl ?? '',
    limValue: q?.limits?.value ?? '',
    commandId: c.kind === 'command' ? c.commandId : '',
  }
}

const splitCols = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/** 그래프 설정. 겹침 · 구간은 선 계열 그래프에만 싣는다 */
function viewOf(d: Draft): CardView {
  if (d.view === 'table') return { kind: 'table' }
  const series = d.series.trim()
  const line = LINE_TYPES.includes(d.chartType)
  const focus = line ? d.focus.trim() : ''
  const phase = line ? d.phase.trim() : ''
  const band = line ? d.band.trim() : ''
  return { kind: 'chart', type: d.chartType, x: d.x.trim(), y: splitCols(d.y), ...(series ? { series } : {}), ...(focus ? { focus } : {}), ...(phase ? { phase } : {}), ...(band ? { band } : {}) }
}

function limitsOf(d: Draft): Limits | undefined {
  const lcl = d.lcl.trim()
  const ucl = d.ucl.trim()
  const value = d.limValue.trim()
  if (!lcl && !ucl) return undefined
  return { ...(lcl ? { lcl } : {}), ...(ucl ? { ucl } : {}), ...(value ? { value } : {}) }
}

function fromDraft(d: Draft, base: Card): Card {
  const description = d.description.trim()
  const common = {
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    tags: base.tags,
    title: d.title.trim(),
    ...(description ? { description } : {}),
  }
  if (d.kind === 'command') return { ...common, kind: 'command', commandId: d.commandId }
  const picks = parsePicks(d.picks)
  const limits = limitsOf(d)
  return {
    ...common,
    kind: 'query',
    sql: d.sql,
    keyColumns: base.kind === 'query' ? base.keyColumns : [],
    view: viewOf(d),
    ...(picks.length ? { picks } : {}),
    ...(limits ? { limits } : {}),
  }
}

/** 저장을 막는 첫 문제. 없으면 undefined */
function problemOf(d: Draft, cmdIds: string[]): string | undefined {
  if (!d.title.trim()) return '제목을 넣으세요'
  if (d.kind === 'command') return cmdIds.includes(d.commandId) ? undefined : '명령을 고르세요'
  if (!d.sql.trim()) return 'SQL 을 넣으세요'
  if (d.view === 'chart' && splitCols(d.y).length === 0) return '그래프의 y 열을 넣으세요'
  // 숫자 타일은 x 열을 비우면 y 열마다 타일 하나를 보인다
  if (d.view === 'chart' && d.chartType !== 'stat' && !d.x.trim()) return '그래프의 x 열을 넣으세요'
  if (d.view === 'table' && (d.lcl.trim() || d.ucl.trim()) && !d.limValue.trim()) return '표는 한계와 견줄 값 열을 넣으세요'
  return undefined
}

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'on' : undefined} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

interface Props {
  card: Card
  isNew: boolean
  /** 작업판 위 크기. 보관함 카드는 undefined */
  size?: { w: number; h: number }
  boardVars: Record<string, string>
  /** 미리보기가 쓸 연결(작업판의 연결 띠) */
  boardConn?: Connection
  onSave: (card: Card) => Promise<void>
  onCancel: () => void
  onDelete: () => void
  onDuplicate?: () => void
  onSize: (w: number, h: number) => void
  onDirty: (dirty: boolean) => void
}

/** 카드 폼(W4 조회 · W9 명령). 크기는 작업판에 바로 반영하고, 나머지는 저장할 때 반영한다 */
export default function CardForm({ card, isNew, size, boardVars, boardConn, onSave, onCancel, onDelete, onDuplicate, onSize, onDirty }: Props) {
  const commands = useStore((s) => s.commands)
  const env = useStore((s) => s.activeEnv())
  const [initial] = useState(() => toDraft(card))
  const [d, setD] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<QueryState>()
  const seq = useRef(0)

  const dirty = isNew || JSON.stringify(d) !== JSON.stringify(initial)
  useEffect(() => onDirty(dirty), [dirty, onDirty])

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const problem = problemOf(
    d,
    commands.map((c) => c.id),
  )
  const binds = d.kind === 'query' ? extractBinds(d.sql) : []
  // 미리보기 그래프는 지금 고친 그래프 열 · 고르기 · 한계로 바로 다시 그린다
  const previewView: CardView | undefined = d.view === 'chart' ? viewOf(d) : undefined
  const previewMarks: Marks = { vars: boardVars, picks: parsePicks(d.picks), limits: limitsOf(d) }
  const cmd = d.kind === 'command' ? commands.find((c) => c.id === d.commandId) : undefined
  const previewConn = d.kind === 'query' ? boardConn : undefined

  const runPreview = () => {
    const next = fromDraft(d, card)
    if (next.kind !== 'query') return
    const n = ++seq.current
    setPreview({ status: 'loading' })
    const conn = previewConn
    const p = conn ? runner.run(next, conn, pickBinds(next.sql, boardVars)) : Promise.reject(new Error('연결이 없습니다'))
    p.then(
      (result) => n === seq.current && setPreview({ status: 'ok', result, at: now() }),
      (e: unknown) => n === seq.current && setPreview({ status: 'error', message: e instanceof Error ? e.message : String(e), at: now() }),
    )
  }

  const save = async () => {
    if (problem || busy) return
    setBusy(true)
    try {
      await onSave(fromDraft(d, card))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="form-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="cf-head">
        <h4>{isNew ? '새 카드' : '카드'}</h4>
        <code className="small muted">{card.id}</code>
        <span className="sp" />
        <Seg
          label="카드 종류"
          value={d.kind}
          options={[
            ['query', '조회'],
            ['command', '명령'],
          ]}
          onChange={(kind) => set({ kind })}
        />
        {onDuplicate && (
          <button type="button" className="btn small" onClick={onDuplicate}>
            복제
          </button>
        )}
      </div>

      <label className="field">
        제목
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 설비 센서 추이" />
      </label>
      <label className="field">
        설명 (선택)
        <input value={d.description} onChange={(e) => set({ description: e.target.value })} />
      </label>

      {d.kind === 'query' ? (
        <>
          <label className="field">
            SQL (바인드는 :이름)
            <textarea className="mono" rows={7} value={d.sql} onChange={(e) => set({ sql: e.target.value })} spellCheck={false} />
          </label>
          <div className="field">
            <span>바인드 변수 (SQL 에서 뽑음)</span>
            {binds.length ? (
              <div className="chips">
                {binds.map((b) => (
                  <span key={b} className="chip mono">
                    :{b}
                  </span>
                ))}
              </div>
            ) : (
              <span className="small muted">바인드가 없습니다</span>
            )}
            <span className="small muted">값은 작업대 맨 위 변수 띠에서 한 번 넣습니다.</span>
          </div>
          <div className="field">
            <span>결과 모양</span>
            <Seg
              label="결과 모양"
              value={d.view}
              options={[
                ['table', '표'],
                ['chart', '그래프'],
              ]}
              onChange={(view) => set({ view })}
            />
          </div>
          {d.view === 'chart' && (
            <div className="cf-chart">
              <label className="field">
                그래프 종류
                <select value={d.chartType} onChange={(e) => set({ chartType: e.target.value as ChartType })}>
                  {CHART_TYPES.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t} ({v})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {d.chartType === 'stat' ? 'x 열 (비우면 열마다 타일)' : 'x 열'}
                <input className="mono" value={d.x} onChange={(e) => set({ x: e.target.value })} placeholder={d.chartType === 'stat' ? '비움 · eqp_id · ts' : 'ts'} spellCheck={false} />
                {d.chartType === 'stat' && <span className="small muted">비우면 y 열마다 타일 하나(첫 행 값). 이름 열이면 행마다, 시간 열이면 시리즈마다 타일 하나.</span>}
              </label>
              <label className="field">
                y 열 (쉼표로 여럿)
                <input className="mono" value={d.y} onChange={(e) => set({ y: e.target.value })} placeholder="value" spellCheck={false} />
              </label>
              <label className="field">
                시리즈 열 (선택)
                <input className="mono" value={d.series} onChange={(e) => set({ series: e.target.value })} placeholder="snsr_id" spellCheck={false} />
              </label>
              {LINE_TYPES.includes(d.chartType) && (
                <>
                  <label className="field">
                    겹침 변수 (선택)
                    <input className="mono" value={d.focus} onChange={(e) => set({ focus: e.target.value })} placeholder="wafer" spellCheck={false} />
                    <span className="small muted">이 변수 값과 이름이 같은 시리즈만 진하게, 나머지는 회색으로 깝니다.</span>
                  </label>
                  <label className="field">
                    구간 열 (선택)
                    <input className="mono" value={d.phase} onChange={(e) => set({ phase: e.target.value })} placeholder="step" spellCheck={false} />
                    <span className="small muted">값이 바뀌는 자리에 세로 선과 구간 이름을 그립니다.</span>
                  </label>
                  <label className="field">
                    강조 구간 열 (선택)
                    <input className="mono" value={d.band} onChange={(e) => set({ band: e.target.value })} placeholder="tsum_win" spellCheck={false} />
                    <span className="small muted">값이 있는 행의 x 구간을 옅게 칠하고, 그 값을 범례에 보입니다.</span>
                  </label>
                </>
              )}
            </div>
          )}
          <div className="cf-chart">
            <label className="field">
              LCL 열 (선택)
              <input className="mono" value={d.lcl} onChange={(e) => set({ lcl: e.target.value })} placeholder="lcl" spellCheck={false} />
            </label>
            <label className="field">
              UCL 열 (선택)
              <input className="mono" value={d.ucl} onChange={(e) => set({ ucl: e.target.value })} placeholder="ucl" spellCheck={false} />
            </label>
            <label className="field">
              한계와 견줄 열 {d.view === 'table' ? '' : '(선택)'}
              <input className="mono" value={d.limValue} onChange={(e) => set({ limValue: e.target.value })} placeholder={d.view === 'table' ? 'mx' : 'y 값'} spellCheck={false} />
            </label>
            <span className="small muted cf-wide">
              한계는 행마다 읽습니다. 넘은 행 · 타일은 빨간 띠와 ▲ UCL 넘음 · ▼ LCL 아래로, 선 그래프는 점선과 칠한 구간으로 보입니다. 그래프 · 숫자 타일은 비우면 y 값과 견줍니다.
            </span>
          </div>
          <label className="field">
            누르면 넣을 변수 (선택)
            <input className="mono" value={d.picks} onChange={(e) => set({ picks: e.target.value })} placeholder="lot_id, slot:wafer" spellCheck={false} />
            <span className="small muted">
              표의 행 · 히트맵 칸 · 숫자 타일을 누르면 그 행의 열 값이 변수 띠에 들어갑니다. "열:변수" 로 적고, 이름이 같으면 열 이름만 적습니다. 비우면 누를 때 값을 복사합니다.
            </span>
          </label>
        </>
      ) : (
        <>
          <label className="field">
            명령
            <select value={d.commandId} onChange={(e) => set({ commandId: e.target.value })}>
              <option value="">고르세요</option>
              {commands.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {cmd && (
            <div className="field">
              <span>
                <span>
                  템플릿 <span className={`pill ${RISK_PILL[cmd.risk]}`}>{RISK_LABEL[cmd.risk]}</span>
                </span>
                <Link to={`/commands/${cmd.id}`}>명령 편집 ↗</Link>
              </span>
              <pre className="code">{render(cmd.template, varsOf(resolveCommandVars(cmd, env, boardVars)))}</pre>
              <span className="small muted">
                변수 · 위험도 · 실행 전 체크는 명령어 화면에서 고칩니다. 값은 환경 프리셋 › 변수 띠 › 기본값 순서로 채웁니다.
              </span>
            </div>
          )}
        </>
      )}

      {size && (
        <div className="cf-size">
          <div className="field">
            <span>폭</span>
            <Seg
              label="폭"
              value={size.w}
              options={[
                [1, '1'],
                [2, '2'],
                [3, '3'],
                [4, '4'],
              ]}
              onChange={(w) => onSize(w, size.h)}
            />
          </div>
          <div className="field">
            <span>높이</span>
            <Seg
              label="높이"
              value={size.h}
              options={[
                [1, '1'],
                [2, '2'],
              ]}
              onChange={(h) => onSize(size.w, h)}
            />
          </div>
        </div>
      )}

      {d.kind === 'query' && (
        <div className="field">
          <span>
            <span>미리보기 (변수 띠 값으로)</span>
            <button type="button" className="btn small" onClick={runPreview} disabled={!!problem}>
              ▶ 미리보기 실행
            </button>
          </span>
          {preview && (
            <>
              <div className={'cf-preview' + (d.view === 'chart' ? ' chart' : '')}>
                <QueryBody run={preview} compact view={previewView} marks={previewMarks} />
              </div>
              <div className="qc-foot">
                <QueryFoot run={preview} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="btn-row cf-actions">
        <button type="button" className="btn danger" onClick={onDelete}>
          {isNew ? '버리기' : '삭제'}
        </button>
        <span className="sp" />
        {problem && <span className="cf-err">{problem}</span>}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setD(initial)
            setPreview(undefined)
            onCancel()
          }}
        >
          취소
        </button>
        <button type="submit" className="btn primary" disabled={!!problem || busy || !dirty}>
          저장
        </button>
      </div>
    </form>
  )
}
