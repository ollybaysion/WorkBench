import type { CommandCard } from '../../types'
import { render } from '../../lib/template'
import { useStore } from '../../store'
import { RISK_LABEL, RISK_PILL } from '../vars'
import { copyCommand, resolveCommandVars, varsOf } from './command'

interface Props {
  card: CommandCard
  boardVars: Record<string, string>
  checks?: boolean[]
  onChecks: (checks: boolean[]) => void
  selected: boolean
  onOpen: () => void
}

export default function CommandCardView({ card, boardVars, checks: checksProp, onChecks, selected, onOpen }: Props) {
  const cmd = useStore((s) => s.commands.find((c) => c.id === card.commandId))
  const env = useStore((s) => s.activeEnv())
  if (!cmd)
    return (
      <article className={'qcard' + (selected ? ' sel' : '')} onClick={onOpen}>
        <div className="qc-head">
          <span className="qc-title">{card.title}</span>
        </div>
        <div className="qc-state">명령이 없습니다</div>
      </article>
    )
  const vars = varsOf(resolveCommandVars(cmd, env, boardVars))
  const output = render(cmd.template, vars)
  const checks = cmd.precheck.map((_, i) => checksProp?.[i] ?? false)
  const done = checks.filter(Boolean).length
  const allChecked = done === checks.length
  const destroy = cmd.risk === 'destroy'
  return (
    <article className={'qcard ccard' + (selected ? ' sel' : '') + (destroy ? ' destroy' : '')} onClick={onOpen}>
      <div className="qc-head">
        <span className="qc-title" title={card.title}>
          {card.title}
        </span>
        <span className={`pill ${RISK_PILL[cmd.risk]}`}>{RISK_LABEL[cmd.risk]}</span>
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
      <pre className="ccode" title={output}>
        {output}
      </pre>
      {destroy && (
        <div className="qc-checks" onClick={(e) => e.stopPropagation()}>
          {cmd.precheck.map((p, i) => (
            <label key={i} className={'check' + (checks[i] ? ' done' : '')}>
              <input type="checkbox" checked={checks[i]} onChange={(e) => onChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))} />
              {p}
            </label>
          ))}
        </div>
      )}
      <div className="qc-foot cfoot">
        {destroy ? (
          <span className="ckh">
            실행 전 체크 {done} / {checks.length}
          </span>
        ) : (
          <span>명령</span>
        )}
        <span className="uses">· 사용 {cmd.usageCount} 회</span>
        <span className="sp" />
        <button
          type="button"
          className="btn small primary"
          disabled={destroy && !allChecked}
          onClick={(e) => {
            e.stopPropagation()
            void copyCommand(cmd, vars, allChecked)
          }}
        >
          {cmd.risk === 'read' ? '복사' : '확인 후 복사'}
        </button>
      </div>
    </article>
  )
}
