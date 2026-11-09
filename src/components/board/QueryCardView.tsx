import { useEffect, useRef, useState } from 'react'
import type { Connection, QueryCard } from '../../types'
import type { QueryState } from '../../lib/runner'
import { fmtSec } from '../../lib/util'
import { useStore } from '../../store'
import ResultTable, { ROW_H_COMPACT } from './ResultTable'
import Chart from '../chart/Chart'
import type { CardView } from '../../types'

/** 연결 태그 `FDC-L1 · production`. 좁은 카드에서는 환경 이름을 숨긴다(index.css 컨테이너 쿼리) */
export function ConnTag({ conn, name }: { conn?: Connection; name: string }) {
  const env = useStore((s) => s.envs.find((e) => e.id === conn?.envId))
  if (!conn) return <span className="qc-conn err">⛁ {name || '연결'} 없음</span>
  return (
    <span className="qc-conn" title={`${conn.host}:${conn.port}/${conn.service} · ${conn.user}`}>
      ⛁ {conn.name}
      <span className="env"> · {env?.name ?? conn.envId}</span>
    </span>
  )
}

export function QueryStatus({ run }: { run?: QueryState }) {
  if (!run || run.status === 'loading') return <span className="qc-status">조회 중…</span>
  if (run.status === 'error') return <span className="qc-status err">오류</span>
  return <span className="qc-status">{fmtSec(run.result.elapsedMs)}</span>
}

/** 상태 셋: 조회 중 · 0 행 · 오류. 그 외에는 표, 그래프 보기면 그래프 */
export function QueryBody({ run, compact, maxRows, view }: { run?: QueryState; compact?: boolean; maxRows?: number; view?: CardView }) {
  if (!run || run.status === 'loading') return <div className="qc-state">조회 중…</div>
  if (run.status === 'error')
    return (
      <div className="qc-state">
        <div className="note-box danger">{run.message}</div>
      </div>
    )
  if (run.result.rows.length === 0) return <div className="qc-state">결과 없음</div>
  if (view?.kind === 'chart') return <Chart result={run.result} spec={view} />
  return <ResultTable result={run.result} compact={compact} maxRows={maxRows} />
}

export function QueryFoot({ run }: { run?: QueryState }) {
  if (!run || run.status === 'loading') return <span>조회 중…</span>
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

export default function QueryCardView({ card, conn, run, selected, onOpen }: { card: QueryCard; conn?: Connection; run?: QueryState; selected: boolean; onOpen: () => void }) {
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
  // 그래프 카드는 머리의 단추로 표 · 그래프를 오간다(이 화면에서만, 저장하지 않는다)
  const [asTable, setAsTable] = useState(false)
  const chart = card.view.kind === 'chart'
  const cls = 'qcard' + (selected ? ' sel' : '') + (run?.status === 'error' ? ' err' : '')
  return (
    <article className={cls} onClick={onOpen}>
      <div className="qc-head">
        <span className="qc-title" title={card.title}>
          {card.title}
        </span>
        {card.view.kind === 'chart' && (
          <span className="qc-seg" role="group" aria-label="보기">
            <button
              type="button"
              aria-pressed={asTable}
              title="표로 보기"
              onClick={(e) => {
                e.stopPropagation()
                setAsTable(true)
              }}
            >
              ▦
            </button>
            <button
              type="button"
              aria-pressed={!asTable}
              title={`그래프(${card.view.type})로 보기`}
              onClick={(e) => {
                e.stopPropagation()
                setAsTable(false)
              }}
            >
              ⌇
            </button>
          </span>
        )}
        <ConnTag conn={conn} name={card.connection} />
        <QueryStatus run={run} />
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
      <div className="qc-body" ref={bodyRef}>
        <QueryBody run={run} compact maxRows={maxRows} view={chart && !asTable ? card.view : undefined} />
      </div>
      <div className="qc-foot">
        <QueryFoot run={run} />
      </div>
    </article>
  )
}
