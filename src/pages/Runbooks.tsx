import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Runbook, RunbookInput, RunbookRun, RunStatus, Step, StepTool } from '../types'
import { render } from '../lib/template'
import { copyText, fmtDate, now, parseLines, parseTags, relTime, uid } from '../lib/util'
import Topbar from '../components/Topbar'

const STATUS_LABEL: Record<RunStatus, string> = { in_progress: '진행 중', done: '완료', aborted: '중단' }
const STATUS_PILL: Record<RunStatus, string> = { in_progress: 'blue', done: 'green', aborted: 'gray' }
const TOOL_LABEL: Record<StepTool['type'], string> = { command: '⌘ 명령', template: '📝 템플릿', checklist: '☑ 체크리스트', timer: '⏱ 타이머', link: '🔗 링크' }

export default function Runbooks() {
  const { id } = useParams()
  const navigate = useNavigate()
  const runbooks = useStore((s) => s.runbooks)
  const runs = useStore((s) => s.runs)
  const upsertRunbook = useStore((s) => s.upsertRunbook)
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const current = runbooks.find((r) => r.id === id)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return runbooks.filter((r) => !s || [r.title, r.description ?? '', ...r.tags].some((f) => f.toLowerCase().includes(s)))
  }, [runbooks, q])

  const createNew = async () => {
    const t = now()
    const rb: Runbook = {
      id: uid(),
      createdAt: t,
      updatedAt: t,
      tags: [],
      title: '새 런북',
      description: '',
      inputs: [],
      steps: [{ id: uid(), title: '첫 단계', tool: { type: 'checklist', items: ['항목 1'] } }],
    }
    await upsertRunbook(rb)
    navigate(`/runbooks/${rb.id}`)
    setEditingId(rb.id)
  }

  const activeRun = current ? runs.find((r) => r.runbookId === current.id && r.status === 'in_progress') : undefined

  return (
    <>
      <Topbar
        title={
          <>
            {current ? `런북 · ${current.title}` : '런북'} {activeRun && <span className="pill blue">진행 중</span>}
          </>
        }
        search="런북 검색"
      >
        <button type="button" className="btn primary" onClick={() => void createNew()}>
          + 새 런북
        </button>
      </Topbar>
      <div className="split">
        <div className="panel">
          <input className="input" placeholder="런북 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          {filtered.length === 0 && <div className="empty">런북이 없습니다</div>}
          {filtered.map((r) => {
            const inProgress = runs.some((x) => x.runbookId === r.id && x.status === 'in_progress')
            return (
              <div key={r.id} className={'row-item' + (r.id === id ? ' on' : '')} onClick={() => navigate(`/runbooks/${r.id}`)}>
                <div className="title">
                  {r.title}
                  <code>
                    {r.steps.length}단계 {r.tags.length > 0 && `· ${r.tags.join(', ')}`}
                  </code>
                </div>
                {inProgress && <span className="pill blue">진행 중</span>}
              </div>
            )
          })}
        </div>
        <div>
          {!current && (
            <div className="panel">
              <div className="empty">왼쪽에서 런북을 선택하세요</div>
            </div>
          )}
          {current && editingId === current.id && <RunbookEditor key={current.id} rb={current} onDone={() => setEditingId(null)} />}
          {current && editingId !== current.id && <RunbookDetail key={`${current.id}:${activeRun?.id ?? ''}`} rb={current} run={activeRun} onEdit={() => setEditingId(current.id)} />}
        </div>
      </div>
    </>
  )
}

function defaultInputs(rb: Runbook): Record<string, string> {
  return Object.fromEntries(rb.inputs.map((i) => [i.name, i.default ?? i.options?.[0] ?? '']))
}

function RunbookDetail({ rb, run, onEdit }: { rb: Runbook; run?: RunbookRun; onEdit: () => void }) {
  const navigate = useNavigate()
  const env = useStore((s) => s.activeEnv())
  const settings = useStore((s) => s.settings)
  const allRuns = useStore((s) => s.runs)
  const upsertRun = useStore((s) => s.upsertRun)
  const deleteRun = useStore((s) => s.deleteRun)
  const deleteRunbook = useStore((s) => s.deleteRunbook)
  const showToast = useStore((s) => s.showToast)
  const [inputs, setInputs] = useState<Record<string, string>>(() => ({ ...defaultInputs(rb), ...(run?.inputs ?? {}) }))

  const vars: Record<string, string> = { ...(env?.vars ?? {}), ...inputs, who: settings.userName || inputs.who || '' }
  const history = allRuns.filter((r) => r.runbookId === rb.id)
  const total = rb.steps.length
  const doneCount = run ? run.doneSteps.filter((sid) => rb.steps.some((s) => s.id === sid)).length : 0

  const start = async () => {
    const r: RunbookRun = { id: uid(), runbookId: rb.id, startedAt: now(), by: settings.userName || inputs.who || '', inputs: { ...inputs }, doneSteps: [], checklist: {}, status: 'in_progress' }
    await upsertRun(r)
    showToast('실행을 시작했습니다')
  }

  const finish = async (status: RunStatus) => {
    if (!run) return
    if (status === 'aborted' && !window.confirm('실행을 중단할까요?')) return
    if (status === 'done' && doneCount < total && !window.confirm(`${total - doneCount}개 단계가 남았습니다. 완료 처리할까요?`)) return
    await upsertRun({ ...run, status, finishedAt: now() })
    showToast(status === 'done' ? '런북 실행을 완료했습니다 ✅' : '실행을 중단했습니다')
  }

  const toggleStep = async (sid: string, on: boolean) => {
    if (!run) return
    const doneSteps = on ? [...new Set([...run.doneSteps, sid])] : run.doneSteps.filter((x) => x !== sid)
    await upsertRun({ ...run, doneSteps })
  }

  const toggleCheck = async (sid: string, idx: number, len: number, on: boolean) => {
    if (!run) return
    const arr = Array.from({ length: len }, (_v, i) => run.checklist[sid]?.[i] ?? false)
    arr[idx] = on
    await upsertRun({ ...run, checklist: { ...run.checklist, [sid]: arr } })
  }

  const remove = async () => {
    if (!window.confirm(`"${rb.title}" 런북과 실행 이력을 삭제할까요?`)) return
    await deleteRunbook(rb.id)
    navigate('/runbooks')
    showToast('삭제했습니다')
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="panel">
        <h4>
          {rb.title}
          {rb.tags.map((t) => (
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
        {rb.description && <p className="muted">{rb.description}</p>}

        {rb.inputs.length > 0 && (
          <div className="form-row">
            {rb.inputs.map((inp) => (
              <label key={inp.name} className="field">
                {inp.name}
                {inp.options && inp.options.length > 0 ? (
                  <select value={inputs[inp.name] ?? ''} disabled={!!run} onChange={(e) => setInputs({ ...inputs, [inp.name]: e.target.value })}>
                    {inp.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input className="mono" value={inputs[inp.name] ?? ''} disabled={!!run} onChange={(e) => setInputs({ ...inputs, [inp.name]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
        )}
        <div className="small muted" style={{ marginBottom: 8 }}>
          환경 <b>{env?.name ?? '-'}</b> 변수가 함께 적용됩니다 · 담당자: <b>{vars.who || '(설정에서 이름 지정)'}</b>
        </div>

        {run ? (
          <>
            <div className="small">
              실행 중 · {run.by || '익명'} · {relTime(run.startedAt)} 시작 · {doneCount} / {total} 단계
            </div>
            <div className="progress">
              <i style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
            </div>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={() => void finish('done')}>
                완료
              </button>
              <button type="button" className="btn danger" onClick={() => void finish('aborted')}>
                중단
              </button>
            </div>
          </>
        ) : (
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void start()}>
              ▶ 실행 시작
            </button>
            <span className="small muted">실행을 시작하면 단계·체크리스트 진행 상황이 이력에 저장됩니다.</span>
          </div>
        )}
      </div>

      <div className="steps">
        {rb.steps.map((s, i) => {
          const done = !!run?.doneSteps.includes(s.id)
          return (
            <div key={s.id} className={'step' + (done ? ' done' : '')}>
              <input type="checkbox" checked={done} disabled={!run} title={run ? '단계 완료' : '실행 시작 후 체크할 수 있습니다'} onChange={(e) => void toggleStep(s.id, e.target.checked)} />
              <div style={{ minWidth: 0 }}>
                <div className="title">
                  {i + 1}. {render(s.title, vars)}
                </div>
                {s.description && <div className="desc">{render(s.description, vars)}</div>}
                {s.tool && <StepToolView step={s} tool={s.tool} vars={vars} checks={run?.checklist[s.id]} canCheck={!!run} onCheck={(idx, len, on) => void toggleCheck(s.id, idx, len, on)} />}
              </div>
            </div>
          )
        })}
      </div>

      <div className="panel">
        <h4>🕘 실행 이력</h4>
        {history.length === 0 && <div className="empty">실행 이력이 없습니다</div>}
        <ul className="list">
          {history.map((h) => {
            const d = h.doneSteps.filter((sid) => rb.steps.some((s) => s.id === sid)).length
            return (
              <li key={h.id}>
                <span className={`pill ${STATUS_PILL[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                <span className="t">
                  {h.by || '익명'} · {fmtDate(h.startedAt)}
                  {h.finishedAt && ` → ${fmtDate(h.finishedAt)}`}
                  <span className="muted">
                    {' '}
                    · {d}/{total} 단계 · {Object.entries(h.inputs)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(' ')}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => {
                    if (window.confirm('이 실행 이력을 삭제할까요?')) void deleteRun(h.id)
                  }}
                >
                  삭제
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function StepToolView({
  step,
  tool,
  vars,
  checks,
  canCheck,
  onCheck,
}: {
  step: Step
  tool: StepTool
  vars: Record<string, string>
  checks?: boolean[]
  canCheck: boolean
  onCheck: (idx: number, len: number, on: boolean) => void
}) {
  const showToast = useStore((s) => s.showToast)
  const copy = async (text: string) => showToast((await copyText(text)) ? '복사했습니다' : '복사에 실패했습니다')

  switch (tool.type) {
    case 'command': {
      const text = render(tool.template, vars)
      return (
        <div className="tool command">
          <div className="tool-h">
            {TOOL_LABEL.command}
            <span className="btn-row">
              <button type="button" className="btn small" onClick={() => void copy(text)}>
                복사
              </button>
            </span>
          </div>
          <pre className="code">{text}</pre>
        </div>
      )
    }
    case 'template': {
      const text = render(tool.body, vars)
      return (
        <div className="tool">
          <div className="tool-h">
            {TOOL_LABEL.template}
            <span className="btn-row">
              <button type="button" className="btn small" onClick={() => void copy(text)}>
                복사
              </button>
            </span>
          </div>
          <div className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12.5 }}>
            {text}
          </div>
        </div>
      )
    }
    case 'checklist': {
      const len = tool.items.length
      const doneN = tool.items.filter((_it, i) => checks?.[i]).length
      return (
        <div className="tool checklist">
          <div className="tool-h">
            {TOOL_LABEL.checklist} {doneN}/{len} 완료
          </div>
          {tool.items.map((it, i) => (
            <label key={`${step.id}-${i}`} className={'check' + (checks?.[i] ? ' done' : '')}>
              <input type="checkbox" checked={!!checks?.[i]} disabled={!canCheck} onChange={(e) => onCheck(i, len, e.target.checked)} />
              {render(it, vars)}
            </label>
          ))}
        </div>
      )
    }
    case 'timer':
      return <TimerTool minutes={tool.minutes} link={tool.link} />
    case 'link':
      return (
        <div className="tool link">
          <div className="tool-h">{TOOL_LABEL.link}</div>
          <a href={render(tool.url, vars)} target="_blank" rel="noreferrer">
            {tool.label || tool.url} ↗
          </a>
        </div>
      )
  }
}

function TimerTool({ minutes, link }: { minutes: number; link?: string }) {
  const showToast = useStore((s) => s.showToast)
  const totalSec = Math.max(0, Math.round(minutes * 60))
  const [left, setLeft] = useState(totalSec)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [running])

  useEffect(() => {
    if (running && left === 0) {
      setRunning(false)
      showToast('⏱ 타이머가 끝났습니다')
    }
  }, [running, left, showToast])

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  return (
    <div className="tool timer">
      <div className="tool-h">
        {TOOL_LABEL.timer} {minutes}분
        <span className="btn-row">
          {running ? (
            <button type="button" className="btn small" onClick={() => setRunning(false)}>
              일시정지
            </button>
          ) : (
            <button type="button" className="btn small" disabled={left === 0} onClick={() => setRunning(true)}>
              시작
            </button>
          )}
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setRunning(false)
              setLeft(totalSec)
            }}
          >
            리셋
          </button>
        </span>
      </div>
      <div className="btn-row">
        <span className="timer-display">
          {mm}:{ss}
        </span>
        {link && (
          <a href={link} target="_blank" rel="noreferrer">
            대시보드 열기 ↗
          </a>
        )}
      </div>
    </div>
  )
}

/* ===================== 편집 ===================== */

interface InputDraft {
  name: string
  default: string
  options: string
}

type ToolType = StepTool['type'] | 'none'

interface StepDraft {
  id: string
  title: string
  description: string
  type: ToolType
  template: string
  body: string
  items: string
  minutes: string
  url: string
  label: string
}

function toStepDraft(s: Step): StepDraft {
  const t = s.tool
  return {
    id: s.id,
    title: s.title,
    description: s.description ?? '',
    type: t?.type ?? 'none',
    template: t?.type === 'command' ? t.template : '',
    body: t?.type === 'template' ? t.body : '',
    items: t?.type === 'checklist' ? t.items.join('\n') : '',
    minutes: t?.type === 'timer' ? String(t.minutes) : '10',
    url: t?.type === 'link' ? t.url : t?.type === 'timer' ? (t.link ?? '') : '',
    label: t?.type === 'link' ? (t.label ?? '') : '',
  }
}

function fromStepDraft(d: StepDraft): Step {
  let tool: StepTool | undefined
  switch (d.type) {
    case 'command':
      tool = { type: 'command', template: d.template }
      break
    case 'template':
      tool = { type: 'template', body: d.body }
      break
    case 'checklist':
      tool = { type: 'checklist', items: parseLines(d.items) }
      break
    case 'timer':
      tool = { type: 'timer', minutes: Number(d.minutes) || 1, ...(d.url.trim() ? { link: d.url.trim() } : {}) }
      break
    case 'link':
      tool = { type: 'link', url: d.url.trim(), ...(d.label.trim() ? { label: d.label.trim() } : {}) }
      break
    case 'none':
      tool = undefined
  }
  return { id: d.id, title: d.title.trim() || '(제목 없음)', ...(d.description.trim() ? { description: d.description.trim() } : {}), ...(tool ? { tool } : {}) }
}

function RunbookEditor({ rb, onDone }: { rb: Runbook; onDone: () => void }) {
  const upsertRunbook = useStore((s) => s.upsertRunbook)
  const showToast = useStore((s) => s.showToast)
  const [title, setTitle] = useState(rb.title)
  const [description, setDescription] = useState(rb.description ?? '')
  const [tags, setTags] = useState(rb.tags.join(', '))
  const [inputs, setInputs] = useState<InputDraft[]>(() => rb.inputs.map((i) => ({ name: i.name, default: i.default ?? '', options: (i.options ?? []).join(', ') })))
  const [steps, setSteps] = useState<StepDraft[]>(() => rb.steps.map(toStepDraft))

  const patchInput = (i: number, p: Partial<InputDraft>) => setInputs(inputs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const patchStep = (i: number, p: Partial<StepDraft>) => setSteps(steps.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const moveStep = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSteps(next)
  }
  const addStep = () => setSteps([...steps, toStepDraft({ id: uid(), title: '', tool: { type: 'command', template: '' } })])

  const save = async () => {
    if (!title.trim()) return showToast('제목을 입력하세요')
    const ins: RunbookInput[] = inputs
      .filter((i) => i.name.trim())
      .map((i) => {
        const options = i.options
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
        return { name: i.name.trim(), ...(i.default ? { default: i.default } : {}), ...(options.length ? { options } : {}) }
      })
    await upsertRunbook({ ...rb, title: title.trim(), description: description.trim() || undefined, tags: parseTags(tags), inputs: ins, steps: steps.map(fromStepDraft) })
    showToast('저장했습니다')
    onDone()
  }

  return (
    <div className="panel form-col">
      <h4>런북 편집</h4>
      <div className="form-row" style={{ marginBottom: 0 }}>
        <label className="field">
          제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          태그 (쉼표/공백 구분)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      <label className="field">
        설명
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <div>
        <b className="small">입력 변수</b> <span className="small muted">— 단계 내용에서 {'{{이름}}'}으로 사용. {'{{who}}'}는 설정의 사용자 이름.</span>
        {inputs.map((inp, i) => (
          <div key={i} className="form-row" style={{ marginTop: 6, marginBottom: 0, alignItems: 'end' }}>
            <label className="field">
              이름
              <input className="mono" value={inp.name} onChange={(e) => patchInput(i, { name: e.target.value })} />
            </label>
            <label className="field">
              기본값
              <input className="mono" value={inp.default} onChange={(e) => patchInput(i, { default: e.target.value })} />
            </label>
            <label className="field">
              선택지 (쉼표 구분, 선택)
              <input value={inp.options} onChange={(e) => patchInput(i, { options: e.target.value })} />
            </label>
            <div>
              <button type="button" className="btn small danger" onClick={() => setInputs(inputs.filter((_x, j) => j !== i))}>
                삭제
              </button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 6 }}>
          <button type="button" className="btn small" onClick={() => setInputs([...inputs, { name: '', default: '', options: '' }])}>
            + 입력 변수
          </button>
        </div>
      </div>

      <div>
        <b className="small">단계</b>
        <div className="steps" style={{ marginTop: 6 }}>
          {steps.map((s, i) => (
            <div key={s.id} className="step" style={{ gridTemplateColumns: '24px 1fr' }}>
              <b>{i + 1}</b>
              <div className="form-col" style={{ gap: 6 }}>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label className="field">
                    단계 제목
                    <input value={s.title} onChange={(e) => patchStep(i, { title: e.target.value })} />
                  </label>
                  <label className="field">
                    도구
                    <select value={s.type} onChange={(e) => patchStep(i, { type: e.target.value as ToolType })}>
                      <option value="none">없음</option>
                      <option value="command">명령 (command)</option>
                      <option value="template">템플릿 (template)</option>
                      <option value="checklist">체크리스트 (checklist)</option>
                      <option value="timer">타이머 (timer)</option>
                      <option value="link">링크 (link)</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  설명
                  <input value={s.description} onChange={(e) => patchStep(i, { description: e.target.value })} />
                </label>
                {s.type === 'command' && (
                  <label className="field">
                    명령 템플릿
                    <textarea className="mono" rows={3} value={s.template} onChange={(e) => patchStep(i, { template: e.target.value })} />
                  </label>
                )}
                {s.type === 'template' && (
                  <label className="field">
                    텍스트 템플릿
                    <textarea className="mono" rows={4} value={s.body} onChange={(e) => patchStep(i, { body: e.target.value })} />
                  </label>
                )}
                {s.type === 'checklist' && (
                  <label className="field">
                    체크 항목 (한 줄에 하나)
                    <textarea rows={4} value={s.items} onChange={(e) => patchStep(i, { items: e.target.value })} />
                  </label>
                )}
                {s.type === 'timer' && (
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label className="field">
                      분
                      <input type="number" min={1} value={s.minutes} onChange={(e) => patchStep(i, { minutes: e.target.value })} />
                    </label>
                    <label className="field">
                      링크 (선택)
                      <input value={s.url} onChange={(e) => patchStep(i, { url: e.target.value })} />
                    </label>
                  </div>
                )}
                {s.type === 'link' && (
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label className="field">
                      URL
                      <input value={s.url} onChange={(e) => patchStep(i, { url: e.target.value })} />
                    </label>
                    <label className="field">
                      표시 이름
                      <input value={s.label} onChange={(e) => patchStep(i, { label: e.target.value })} />
                    </label>
                  </div>
                )}
                <div className="btn-row">
                  <button type="button" className="btn small" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                    ▲ 위로
                  </button>
                  <button type="button" className="btn small" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>
                    ▼ 아래로
                  </button>
                  <button type="button" className="btn small danger" onClick={() => setSteps(steps.filter((_x, j) => j !== i))}>
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6 }}>
          <button type="button" className="btn small" onClick={addStep}>
            + 단계 추가
          </button>
        </div>
      </div>

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
