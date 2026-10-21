import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Command, CommandVar, Risk } from '../types'
import { extractVars, missingVars, render } from '../lib/template'
import { copyText, fmtDate, now, parseLines, parseTags, relTime, uid } from '../lib/util'
import Topbar from '../components/Topbar'
import { RISK_LABEL, RISK_PILL, initialCommandVars } from '../components/vars'

export default function Commands() {
  const { id } = useParams()
  const navigate = useNavigate()
  const commands = useStore((s) => s.commands)
  const env = useStore((s) => s.activeEnv())
  const upsertCommand = useStore((s) => s.upsertCommand)
  const [q, setQ] = useState('')
  const [riskFilter, setRiskFilter] = useState<Risk | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const current = commands.find((c) => c.id === id)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return commands
      .filter((c) => (!riskFilter || c.risk === riskFilter) && (!s || [c.title, c.template, c.description ?? '', ...c.tags].some((f) => f.toLowerCase().includes(s))))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite))
  }, [commands, q, riskFilter])

  const createNew = async () => {
    const t = now()
    const c: Command = { id: uid(), createdAt: t, updatedAt: t, tags: [], title: '새 명령', template: 'echo {{msg}}', vars: [{ name: 'msg', default: 'hello' }], risk: 'read', precheck: [], favorite: false, usageCount: 0 }
    await upsertCommand(c)
    navigate(`/commands/${c.id}`)
    setEditingId(c.id)
  }

  return (
    <>
      <Topbar title="명령어 보관함" search="명령 검색">
        <button type="button" className="btn primary" onClick={() => void createNew()}>
          + 새 명령
        </button>
      </Topbar>
      <div className="split wide">
        <div className="panel">
          <input className="input" placeholder="제목·명령·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="btn-row small" style={{ marginBottom: 10 }}>
            {(['read', 'change', 'destroy'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`pill ${RISK_PILL[r]}`}
                style={{ border: riskFilter === r ? '1px solid currentColor' : '1px solid transparent', cursor: 'pointer' }}
                onClick={() => setRiskFilter(riskFilter === r ? null : r)}
              >
                ● {RISK_LABEL[r]}
              </button>
            ))}
          </div>
          {filtered.length === 0 && <div className="empty">명령이 없습니다</div>}
          {filtered.map((c) => (
            <div key={c.id} className={'row-item' + (c.id === id ? ' on' : '')} onClick={() => navigate(`/commands/${c.id}`)}>
              <span className={`risk ${c.risk}`} title={RISK_LABEL[c.risk]} />
              <div className="title">
                {c.title}
                <code>{c.template}</code>
              </div>
              <button
                type="button"
                className="btn small ghost"
                title="즐겨찾기"
                onClick={(e) => {
                  e.stopPropagation()
                  void upsertCommand({ ...c, favorite: !c.favorite })
                }}
              >
                {c.favorite ? '⭐' : '☆'}
              </button>
            </div>
          ))}
        </div>
        <div className="panel">
          {!current && <div className="empty">왼쪽에서 명령을 선택하세요</div>}
          {current && editingId === current.id && <CommandEditor key={current.id} cmd={current} onDone={() => setEditingId(null)} />}
          {current && editingId !== current.id && <CommandDetail key={`${current.id}:${env?.id ?? ''}`} cmd={current} onEdit={() => setEditingId(current.id)} />}
        </div>
      </div>
    </>
  )
}

function CommandDetail({ cmd, onEdit }: { cmd: Command; onEdit: () => void }) {
  const navigate = useNavigate()
  const env = useStore((s) => s.activeEnv())
  const upsertCommand = useStore((s) => s.upsertCommand)
  const deleteCommand = useStore((s) => s.deleteCommand)
  const showToast = useStore((s) => s.showToast)
  const [vars, setVars] = useState<Record<string, string>>(() => initialCommandVars(cmd, env))
  const [checks, setChecks] = useState<boolean[]>(() => cmd.precheck.map(() => false))

  const names = Object.keys(vars)
  const output = render(cmd.template, vars)
  const missing = missingVars(cmd.template, vars)
  const allChecked = checks.every(Boolean)

  const copy = async () => {
    if (cmd.risk === 'destroy') {
      if (!allChecked) return showToast('실행 전 체크 항목을 모두 확인하세요')
      if (!window.confirm(`⚠ 파괴적 명령입니다. 정말 복사할까요?\n\n${output}`)) return
    }
    if (!(await copyText(output))) return showToast('복사에 실패했습니다')
    await upsertCommand({ ...cmd, usageCount: cmd.usageCount + 1, lastUsedAt: now() })
    showToast(missing.length ? `복사했습니다 (미입력 변수: ${missing.join(', ')})` : '명령을 복사했습니다')
  }

  const remove = async () => {
    if (!window.confirm(`"${cmd.title}" 명령을 삭제할까요?`)) return
    await deleteCommand(cmd.id)
    navigate('/commands')
    showToast('삭제했습니다')
  }

  return (
    <>
      <h4>
        {cmd.favorite && '⭐'} {cmd.title} <span className={`pill ${RISK_PILL[cmd.risk]}`}>{RISK_LABEL[cmd.risk]}</span>
        {cmd.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
        <span className="btn-row" style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn small" onClick={onEdit}>
            편집
          </button>
          <button type="button" className="btn small danger" onClick={() => void remove()}>
            삭제
          </button>
        </span>
      </h4>
      {cmd.description && <p className="muted small">{cmd.description}</p>}
      <p className="muted small" style={{ marginBottom: 10 }}>
        환경 프리셋 <b>{env?.name ?? '-'}</b> 값이 자동 주입됩니다. 변수를 바꾸면 명령이 즉시 갱신됩니다.
      </p>
      {names.length > 0 && (
        <div className="form-row">
          {names.map((n) => {
            const desc = cmd.vars.find((v) => v.name === n)?.description
            return (
              <label key={n} className="field">
                <span>
                  {n} {env?.vars[n] !== undefined && <span className="pill blue">env</span>}
                </span>
                <input className="mono" value={vars[n]} placeholder={desc} onChange={(e) => setVars({ ...vars, [n]: e.target.value })} />
              </label>
            )
          })}
        </div>
      )}
      <div className="codebox">
        <pre className="code">{output}</pre>
        <div className="copy">
          <button type="button" className="btn small primary" disabled={cmd.risk === 'destroy' && !allChecked} onClick={() => void copy()}>
            {cmd.risk === 'read' ? '복사' : '확인 후 복사'}
          </button>
        </div>
      </div>
      {missing.length > 0 && <div className="note-box warn">미입력 변수: {missing.join(', ')}</div>}
      {cmd.risk === 'destroy' && <div className="note-box danger">파괴적 명령입니다. 모든 실행 전 체크를 확인해야 복사할 수 있습니다.</div>}
      {cmd.precheck.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <b className="small">실행 전 체크</b>
          {cmd.precheck.map((p, i) => (
            <label key={i} className={'check' + (checks[i] ? ' done' : '')}>
              <input type="checkbox" checked={checks[i]} onChange={(e) => setChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))} />
              {p}
            </label>
          ))}
        </div>
      )}
      <div className="small muted" style={{ marginTop: 10 }}>
        최근 사용: {cmd.lastUsedAt ? `${fmtDate(cmd.lastUsedAt)} (${relTime(cmd.lastUsedAt)})` : '-'} · 총 {cmd.usageCount}회
      </div>
    </>
  )
}

function CommandEditor({ cmd, onDone }: { cmd: Command; onDone: () => void }) {
  const upsertCommand = useStore((s) => s.upsertCommand)
  const showToast = useStore((s) => s.showToast)
  const [title, setTitle] = useState(cmd.title)
  const [description, setDescription] = useState(cmd.description ?? '')
  const [template, setTemplate] = useState(cmd.template)
  const [risk, setRisk] = useState<Risk>(cmd.risk)
  const [precheck, setPrecheck] = useState(cmd.precheck.join('\n'))
  const [tags, setTags] = useState(cmd.tags.join(', '))
  const [favorite, setFavorite] = useState(cmd.favorite)
  const [varMeta, setVarMeta] = useState<Record<string, CommandVar>>(() => Object.fromEntries(cmd.vars.map((v) => [v.name, v])))

  const names = extractVars(template)
  const setVar = (name: string, patch: Partial<CommandVar>) => setVarMeta({ ...varMeta, [name]: { ...(varMeta[name] ?? { name }), ...patch } })

  const save = async () => {
    if (!title.trim() || !template.trim()) return showToast('제목과 템플릿을 입력하세요')
    const vars: CommandVar[] = names.map((n) => {
      const m = varMeta[n]
      return { name: n, ...(m?.default ? { default: m.default } : {}), ...(m?.description ? { description: m.description } : {}) }
    })
    await upsertCommand({ ...cmd, title: title.trim(), description: description.trim() || undefined, template, vars, risk, precheck: parseLines(precheck), tags: parseTags(tags), favorite })
    showToast('저장했습니다')
    onDone()
  }

  return (
    <div className="form-col">
      <h4>명령 편집</h4>
      <div className="form-row" style={{ marginBottom: 0 }}>
        <label className="field">
          제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          위험도
          <select value={risk} onChange={(e) => setRisk(e.target.value as Risk)}>
            <option value="read">읽기 (read)</option>
            <option value="change">변경 (change)</option>
            <option value="destroy">파괴 (destroy)</option>
          </select>
        </label>
      </div>
      <label className="field">
        설명
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        <span>
          템플릿 <span>{'{{변수}}'} 형식으로 변수 지정</span>
        </span>
        <textarea className="mono" rows={5} value={template} onChange={(e) => setTemplate(e.target.value)} />
      </label>
      {names.length > 0 && (
        <div>
          <b className="small">변수 기본값</b>
          {names.map((n) => (
            <div key={n} className="form-row" style={{ marginBottom: 6, marginTop: 4 }}>
              <label className="field">
                이름
                <input className="mono" value={n} disabled />
              </label>
              <label className="field">
                기본값
                <input className="mono" value={varMeta[n]?.default ?? ''} onChange={(e) => setVar(n, { default: e.target.value })} />
              </label>
              <label className="field">
                설명
                <input value={varMeta[n]?.description ?? ''} onChange={(e) => setVar(n, { description: e.target.value })} />
              </label>
            </div>
          ))}
        </div>
      )}
      <label className="field">
        실행 전 체크 (한 줄에 하나)
        <textarea rows={3} value={precheck} onChange={(e) => setPrecheck(e.target.value)} />
      </label>
      <label className="field">
        태그 (쉼표/공백 구분)
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> 즐겨찾기
      </label>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={() => void save()}>
          저장
        </button>
        <button type="button" className="btn" onClick={onDone}>
          취소
        </button>
      </div>
    </div>
  )
}
