import { useEffect, useRef, useState } from 'react'
import type { Connection, QueryCard } from '../../types'
import type { QueryState } from '../../lib/runner'
import { fmtSec } from '../../lib/util'
import { useStore } from '../../store'
import { connLabel } from '../../lib/conn'
import ResultTable, { ROW_H_COMPACT } from './ResultTable'
import Chart from '../chart/Chart'
import RecordList from './RecordList'
import type { CardView } from '../../types'

/** 연결 태그 `FDC-L1 · production`. 좁은 카드에서는 환경 이름을 숨긴다(index.css 컨테이너 쿼리) */
export function ConnTag({ conn, name }: { conn?: Connection; name: string }) {
  const envs = useStore((s) => s.envs)
  if (!conn) return <span className="qc-conn err">⛁ {name || '연결'} 없음</span>
  return (
    <span className={'qc-conn' + (conn.alias ? '' : ' fake')} title={conn.alias ? `agent-db ${conn.alias} 로 조회` : '가짜 결과'}>
      ⛁ {conn.name}
      <span className="env"> · {connLabel(conn, envs)}</span>
    </span>
  )
}

export function QueryStatus({ run }: { run?: QueryState }) {
  if (!run) return <span className="qc-status idle">조회 전</span>
  if (run.status === 'loading') return <span className="qc-status">조회 중…</span>
  if (run.status === 'error') return <span className="qc-status err">오류</span>
  return <span className="qc-status">{fmtSec(run.result.elapsedMs)}</span>
}

/** 결과를 보는 모양: 그래프 · 표 · 행 카드(행 하나를 카드 하나로) */
export type ResultMode = 'chart' | 'table' | 'records'

/** 카드 머리 · 서랍이 함께 쓰는 보기 단추. chart 가 false 면 표 · 행 카드 둘만 */
export function ModeSeg({ mode, chart, onMode, chartType }: { mode: ResultMode; chart: boolean; onMode: (m: ResultMode) => void; chartType?: string }) {
  const opts: [ResultMode, string, string][] = [
    ...(chart ? ([['chart', '⌇', `그래프${chartType ? `(${chartType})` : ''}로 보기`]] as [ResultMode, string, string][]) : []),
    ['table', '▦', '표로 보기'],
    ['records', '▤', '행 카드로 보기(행 하나를 카드 하나로)'],
  ]
  return (
    <span className="qc-seg" role="group" aria-label="보기">
      {opts.map(([m, icon, title]) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          title={title}
          aria-label={title}
          onClick={(e) => {
            e.stopPropagation()
            onMode(m)
          }}
        >
          {icon}
        </button>
      ))}
    </span>
  )
}

/** 상태 셋: 조회 중 · 0 행 · 오류. 그 외에는 표, 그래프 보기면 그래프, 행 카드 보기면 행 카드 */
export function QueryBody({ run, compact, maxRows, view, records, onRun }: { run?: QueryState; compact?: boolean; maxRows?: number; view?: CardView; records?: boolean; onRun?: () => void }) {
  if (!run)
    return (
      <div className="qc-state idle">
        {onRun ? (
          <button
            type="button"
            className="btn small primary"
            onClick={(e) => {
              e.stopPropagation()
              onRun()
            }}
          >
            ▶ 조회
          </button>
        ) : (
          '조회 전'
        )}
      </div>
    )
  if (run.status === 'loading') return <div className="qc-state">조회 중…</div>
  if (run.status === 'error')
    return (
      <div className="qc-state">
        <div className="note-box danger">{run.message}</div>
      </div>
    )
  if (run.result.rows.length === 0) return <div className="qc-state">결과 없음</div>
  if (view?.kind === 'chart') return <Chart result={run.result} spec={view} />
  if (records) return <RecordList result={run.result} step={compact ? 20 : 100} />
  return <ResultTable result={run.result} compact={compact} maxRows={maxRows} />
}

export function QueryFoot({ run }: { run?: QueryState }) {
  if (!run) return <span>조회 전 · ▶ 를 누르면 조회합니다</span>
  if (run.status === 'loading') return <span>조회 중…</span>
  if (run.status === 'error') return <span className="err">오류</span>
  return (
    <>
      <span>{run.result.rows.length} 행</span>
      {run.result.truncated && (
        <span className="trunc" title={run.result.note}>
          ⚠ {run.result.rows.length} 행에서 잘림
        </span>
      )}
      <span className="sp" />
      <span>{fmtSec(run.result.elapsedMs)}</span>
    </>
  )
}

export default function QueryCardView({ card, conn, run, stale, selected, onOpen, onRun }: { card: QueryCard; conn?: Connection; run?: QueryState; stale: boolean; selected: boolean; onOpen: () => void; onRun: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // 표는 들어가는 만큼만: 몸통 높이에서 머리 행을 빼고 행 높이로 나눈다
  const [maxRows, setMaxRows] = useState<number>()
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setMaxRows(Math.max(1, Math.floor((el.clientHeight - ROW_H_COMPACT) / ROW_H_COMPACT))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 머리의 단추로 그래프 · 표 · 행 카드를 오간다(이 화면에서만, 저장하지 않는다)
  const chart = card.view.kind === 'chart'
  const [mode, setMode] = useState<ResultMode>(chart ? 'chart' : 'table')
  const cls = 'qcard' + (selected ? ' sel' : '') + (run?.status === 'error' ? ' err' : '')
  return (
    <article className={cls} onClick={onOpen}>
      <div className="qc-head">
        <span className="qc-title" title={card.title}>
          {card.title}
        </span>
        <ModeSeg mode={mode} chart={chart} onMode={setMode} chartType={card.view.kind === 'chart' ? card.view.type : undefined} />
        <ConnTag conn={conn} name={card.connection} />
        <QueryStatus run={run} />
        <button
          type="button"
          className="qc-xp qc-run"
          title={run ? '다시 조회' : '조회'}
          aria-label={run ? '다시 조회' : '조회'}
          disabled={run?.status === 'loading'}
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
        >
          ▶
        </button>
        <button
          type="button"
          className="qc-xp"
          title="자세히"
          aria-label="자세히"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          ⤢
        </button>
      </div>
      <div className={'qc-body' + (mode === 'records' ? ' records' : '')} ref={bodyRef}>
        <QueryBody run={run} compact maxRows={maxRows} view={mode === 'chart' ? card.view : undefined} records={mode === 'records'} onRun={onRun} />
      </div>
      <div className="qc-foot">
        {stale ? (
          <button
            type="button"
            className="qc-stale"
            title="조회한 뒤 변수 · alias · SQL 이 바뀌었습니다"
            onClick={(e) => {
              e.stopPropagation()
              onRun()
            }}
          >
            ⟳ 변수가 바뀜 · 다시 조회
          </button>
        ) : (
          <QueryFoot run={run} />
        )}
      </div>
    </article>
  )
}
