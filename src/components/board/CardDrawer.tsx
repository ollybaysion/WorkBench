import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Card, CommandCard, Connection, QueryCard } from '../../types'
import type { QueryState } from '../../lib/runner'
import type { Marks } from '../../lib/marks'
import { bindSpans, extractBinds, fillBinds } from '../../lib/sql'
import { render } from '../../lib/template'
import { fmtSec, fmtTime } from '../../lib/util'
import { useStore } from '../../store'
import { RISK_LABEL, RISK_PILL } from '../vars'
import { ConnTag, ModeSeg, QueryBody, type ResultMode } from './QueryCardView'
import { copyWithToast, resultTsv } from './copy'
import Chart from '../chart/Chart'
import { copyCommand, resolveCommandVars, varsOf } from './command'

interface Props {
  card: Card
  conn?: Connection
  run?: QueryState
  boardVars: Record<string, string>
  checks?: boolean[]
  onChecks: (checks: boolean[]) => void
  onClose: () => void
  onRerun: () => void
}

/** 카드 크게 보기. 화면 전체를 덮고, 고른 카드 자리에서 커지며 열린다. ✕ · Esc 로 닫힌다 */
export default function CardDrawer({ card, conn, run, boardVars, checks, onChecks, onClose, onRerun }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLElement>(null)
  // 커지는 애니메이션의 기준점을 작업판에서 고른 카드의 가운데에 둔다
  useLayoutEffect(() => {
    const r = document.querySelector('.qcard.sel')?.getBoundingClientRect()
    if (r && boxRef.current) boxRef.current.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`
  }, [])
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const cmd = useStore((s) => (card.kind === 'command' ? s.commands.find((c) => c.id === card.commandId) : undefined))

  return (
    <aside ref={boxRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="drawer-head">
        <h3 id="drawer-title" title={card.title}>
          {card.title}
        </h3>
        {card.kind === 'query' ? (
          <>
            {card.view.kind === 'chart' && <span className="pill gray">{card.view.type}</span>}
            <ConnTag conn={conn} name={card.connection} />
            <button type="button" className="btn small" onClick={onRerun} disabled={run?.status === 'loading'}>
              ↻ 다시 조회
            </button>
          </>
        ) : (
          cmd && <span className={`pill ${RISK_PILL[cmd.risk]}`}>{RISK_LABEL[cmd.risk]}</span>
        )}
        <button ref={closeRef} type="button" className="btn small ghost" aria-label="닫기" title="닫기 (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
      {card.kind === 'query' ? (
        <QueryDrawer card={card} run={run} boardVars={boardVars} connName={conn?.name} onRerun={onRerun} />
      ) : (
        <CommandDrawer card={card} boardVars={boardVars} checks={checks} onChecks={onChecks} />
      )}
    </aside>
  )
}

/** SQL 의 `:이름` 바인드 자리를 강조. 주석 · 문자열 안은 그대로 */
function highlightBinds(sql: string): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const s of bindSpans(sql)) {
    out.push(sql.slice(at, s.start), <b key={s.start} className="bind">{sql.slice(s.start, s.end)}</b>)
    at = s.end
  }
  out.push(sql.slice(at))
  return out
}

function QueryDrawer({ card, run, boardVars, connName, onRerun }: { card: QueryCard; run?: QueryState; boardVars: Record<string, string>; connName?: string; onRerun: () => void }) {
  const binds = extractBinds(card.sql)
  const ok = run?.status === 'ok' ? run.result : undefined
  // 열이 많으면 행 카드로 먼저 연다
  const [mode, setMode] = useState<ResultMode>(() => (ok && ok.columns.length > 12 ? 'records' : 'table'))
  // 서랍에서는 누르면 복사한다. 고른 행 · 넘은 행 표시는 카드와 같다
  const marks = useMemo<Marks>(() => ({ vars: boardVars, picks: card.picks, limits: card.limits }), [boardVars, card.picks, card.limits])
  let foot: ReactNode
  if (!run) foot = <span>조회 전</span>
  else if (run.status === 'loading') foot = <span>조회 중…</span>
  else if (run.status === 'error') foot = <span className="err">오류 · 마지막 조회 {fmtTime(run.at)}</span>
  else
    foot = (
      <>
        <span>
          {run.result.rows.length} 행 · {run.result.elapsedMs} ms
        </span>
        <span className="sp" />
        <span>마지막 조회 {fmtTime(run.at)}</span>
      </>
    )
  return (
    <>
      <div className="drawer-body">
        <div className="btn-row">
          {binds.map((b) => (
            <span key={b} className="pill blue mono">
              {b} {boardVars[b] || '비어 있음'}
            </span>
          ))}
          <span className="muted small">
            {connName ?? '-'}
            {ok && ` · ${fmtSec(ok.elapsedMs)} · ${ok.columns.length} 열`}
          </span>
          <span className="sp" />
          {ok?.truncated && (
            <span className="trunc" title={ok.note}>
              ⚠ {ok.rows.length} 행에서 잘림
            </span>
          )}
        </div>
        {card.view.kind === 'chart' && ok && ok.rows.length > 0 && (
          <div className="drawer-chart">
            <Chart result={ok} spec={card.view} marks={marks} zoom />
          </div>
        )}
        <div className="btn-row drawer-tbar">
          <ModeSeg mode={mode} chart={false} onMode={setMode} />
          <span className="small muted">칸을 누르면 값, 열 이름을 누르면 열 이름이 복사됩니다</span>
          <span className="sp" />
          {ok && ok.rows.length > 0 && (
            <button type="button" className="btn small" onClick={() => void copyWithToast(resultTsv(ok), `${ok.rows.length} 행(TSV)`)} title="머리 행과 모든 행을 탭으로 나눠 복사(엑셀에 바로 붙습니다)">
              ⧉ 표 복사
            </button>
          )}
        </div>
        <div className={'tbox drawer-table' + (mode === 'records' ? ' records' : '')}>
          <QueryBody run={run} records={mode === 'records'} onRun={onRerun} marks={marks} />
        </div>
        <details className="sqlbox" open>
          <summary>
            <b>SQL</b> <span className="muted">바인드 {binds.length}</span>
          </summary>
          <pre className="code">{highlightBinds(card.sql)}</pre>
          <div className="btn-row">
            <button type="button" className="btn small" onClick={() => void copyWithToast(card.sql, 'SQL')}>
              ⧉ SQL 복사
            </button>
            {binds.length > 0 && (
              <button type="button" className="btn small" onClick={() => void copyWithToast(fillBinds(card.sql, boardVars), '값 넣은 SQL')} title="변수 띠 값을 바인드 자리에 넣은 SQL. 빈 값은 NULL">
                ⧉ 값 넣어 복사
              </button>
            )}
          </div>
          {binds.length > 0 && (
            <div className="tbox">
              <table className="rtable compact">
                <thead>
                  <tr>
                    <th>변수</th>
                    <th>값</th>
                  </tr>
                </thead>
                <tbody>
                  {binds.map((b) => (
                    <tr key={b}>
                      <td>{b}</td>
                      <td>{boardVars[b] || <span className="null muted">비어 있음</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </div>
      <div className="drawer-foot">{foot}</div>
    </>
  )
}

function CommandDrawer({ card, boardVars, checks: checksProp, onChecks }: { card: CommandCard; boardVars: Record<string, string>; checks?: boolean[]; onChecks: (c: boolean[]) => void }) {
  const cmd = useStore((s) => s.commands.find((c) => c.id === card.commandId))
  const env = useStore((s) => s.activeEnv())
  if (!cmd)
    return (
      <div className="drawer-body">
        <div className="empty">명령이 없습니다 (commandId: {card.commandId})</div>
      </div>
    )
  const resolved = resolveCommandVars(cmd, env, boardVars)
  const vars = varsOf(resolved)
  const output = render(cmd.template, vars)
  const checks = cmd.precheck.map((_, i) => checksProp?.[i] ?? false)
  const done = checks.filter(Boolean).length
  const allChecked = done === checks.length
  const destroy = cmd.risk === 'destroy'
  return (
    <>
      <div className="drawer-body">
        <section>
          <h5>변수</h5>
          <div className="tbox">
            <table className="rtable compact">
              <thead>
                <tr>
                  <th>변수</th>
                  <th>값</th>
                  <th>출처 · 환경 &gt; 변수 띠 &gt; 기본값</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((v) => (
                  <tr key={v.name}>
                    <td>{v.name}</td>
                    <td title={v.value}>{v.value || <span className="null muted">비어 있음</span>}</td>
                    <td>{v.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h5>완성된 명령 · 환경 {env?.name ?? '-'}</h5>
          <div className="codebox">
            <pre className="code">{output}</pre>
          </div>
        </section>
        {cmd.precheck.length > 0 && (
          <section>
            <h5>
              실행 전 체크 {done} / {checks.length}
            </h5>
            {cmd.precheck.map((p, i) => (
              <label key={i} className={'check' + (checks[i] ? ' done' : '')}>
                <input type="checkbox" checked={checks[i]} onChange={(e) => onChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))} />
                {p}
              </label>
            ))}
            {destroy && <p className="muted small">모두 체크하면 복사가 켜집니다. 복사 뒤 확인 창이 한 번 더 뜹니다.</p>}
          </section>
        )}
        {cmd.description && (
          <section>
            <h5>설명</h5>
            <p className="small">{cmd.description}</p>
          </section>
        )}
        <p className="muted small">
          템플릿 <code>{cmd.template}</code> · <Link to={`/commands/${cmd.id}`}>명령어 보관함에서 열기</Link>
        </p>
      </div>
      <div className="drawer-foot">
        {destroy ? (
          <span className="ckh">
            실행 전 체크 {done} / {checks.length}
          </span>
        ) : (
          <span>명령</span>
        )}
        <span>
          · 사용 {cmd.usageCount} 회 · {RISK_LABEL[cmd.risk]}
        </span>
        <span className="sp" />
        <button type="button" className="btn small primary" disabled={destroy && !allChecked} onClick={() => void copyCommand(cmd, vars, allChecked)}>
          {cmd.risk === 'read' ? '복사' : '확인 후 복사'}
        </button>
      </div>
    </>
  )
}
