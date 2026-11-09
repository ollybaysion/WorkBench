import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import cronstrue from 'cronstrue'
import 'cronstrue/locales/ko'
import { dump, load } from 'js-yaml'
import { useStore } from '../store'
import { copyText, download, todayStr, uid } from '../lib/util'
import Topbar from '../components/Topbar'

type ToolId = 'cron' | 'json' | 'b64' | 'time' | 'tpl' | 'regex' | 'gen' | 'diff'

const TOOLS: { id: ToolId; name: string; desc: string }[] = [
  { id: 'cron', name: '⏰ Cron 빌더', desc: '표현식 ↔ 한국어 설명' },
  { id: 'json', name: '{ } JSON ↔ YAML', desc: '정리 · 압축 · 변환' },
  { id: 'b64', name: '🔐 Base64 / URL', desc: '인코딩 · 디코딩' },
  { id: 'time', name: '🕒 시간 변환', desc: 'Epoch ↔ KST/UTC/PT' },
  { id: 'tpl', name: '📝 템플릿 생성', desc: '장애 보고 · 배포 공지' },
  { id: 'regex', name: '.* 정규식 테스터', desc: '매치 하이라이트' },
  { id: 'gen', name: '🎲 UUID / 비밀번호', desc: '랜덤 값 생성' },
  { id: 'diff', name: '± 텍스트 Diff', desc: '줄 단위 비교' },
]

function useCopy() {
  const showToast = useStore((s) => s.showToast)
  return async (text: string) => showToast((await copyText(text)) ? '복사했습니다' : '복사에 실패했습니다')
}

export default function Toolbox() {
  const [tool, setTool] = useState<ToolId>('cron')
  return (
    <>
      <Topbar title="자동화 도구함" />
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={'tool-tile' + (tool === t.id ? ' on' : '')} onClick={() => setTool(t.id)}>
            <b>{t.name}</b>
            <span>{t.desc}</span>
          </button>
        ))}
      </div>
      <div className="panel">
        {tool === 'cron' && <CronTool />}
        {tool === 'json' && <JsonTool />}
        {tool === 'b64' && <EncodeTool />}
        {tool === 'time' && <TimeTool />}
        {tool === 'tpl' && <TemplateTool />}
        {tool === 'regex' && <RegexTool />}
        {tool === 'gen' && <GenTool />}
        {tool === 'diff' && <DiffTool />}
      </div>
    </>
  )
}

/* ---------- Cron ---------- */
const CRON_FIELDS = ['분', '시', '일', '월', '요일'] as const
const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: '매분', expr: '* * * * *' },
  { label: '매시 정각', expr: '0 * * * *' },
  { label: '매일 03:00', expr: '0 3 * * *' },
  { label: '평일 09:00', expr: '0 9 * * 1-5' },
  { label: '매주 월 10:00', expr: '0 10 * * 1' },
  { label: '매월 1일 00:00', expr: '0 0 1 * *' },
  { label: '5분마다', expr: '*/5 * * * *' },
]

function CronTool() {
  const copy = useCopy()
  const [f, setF] = useState(['0', '3', '*', '*', '1-5'])
  const expr = f.map((x) => x.trim() || '*').join(' ')
  let desc = ''
  let err = ''
  try {
    desc = cronstrue.toString(expr, { locale: 'ko', use24HourTimeFormat: true })
  } catch (e) {
    err = String(e)
  }
  return (
    <>
      <h4>⏰ Cron 빌더</h4>
      <div className="form-row">
        {CRON_FIELDS.map((name, i) => (
          <label key={name} className="field">
            {name}
            <input className="mono" value={f[i]} onChange={(e) => setF(f.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      <div className="btn-row">
        {CRON_PRESETS.map((p) => (
          <button key={p.expr} type="button" className="btn small" onClick={() => setF(p.expr.split(' '))}>
            {p.label}
          </button>
        ))}
      </div>
      <div className={'out' + (err ? ' err' : '')}>{err ? err : `${expr}\n\n→ ${desc}`}</div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => void copy(expr)}>
          표현식 복사
        </button>
        <button type="button" className="btn small" onClick={() => void copy(`${expr} /path/to/script.sh >> /var/log/job.log 2>&1`)}>
          crontab 줄 복사
        </button>
      </div>
    </>
  )
}

/* ---------- JSON / YAML ---------- */
function JsonTool() {
  const copy = useCopy()
  const [input, setInput] = useState('{"service":"api","replicas":3,"env":{"LOG_LEVEL":"info"},"ports":[80,443]}')
  const [out, setOut] = useState('')
  const [err, setErr] = useState(false)

  const run = (fn: () => string) => {
    try {
      setOut(fn())
      setErr(false)
    } catch (e) {
      setOut(e instanceof Error ? e.message : String(e))
      setErr(true)
    }
  }

  return (
    <>
      <h4>{'{ }'} JSON ↔ YAML</h4>
      <label className="field">
        입력 (JSON 또는 YAML)
        <textarea className="mono" rows={8} value={input} onChange={(e) => setInput(e.target.value)} />
      </label>
      <div className="btn-row" style={{ margin: '8px 0' }}>
        <button type="button" className="btn small" onClick={() => run(() => JSON.stringify(JSON.parse(input), null, 2))}>
          JSON 정리
        </button>
        <button type="button" className="btn small" onClick={() => run(() => JSON.stringify(JSON.parse(input)))}>
          JSON 압축
        </button>
        <button type="button" className="btn small" onClick={() => run(() => dump(JSON.parse(input)))}>
          JSON → YAML
        </button>
        <button type="button" className="btn small" onClick={() => run(() => JSON.stringify(load(input), null, 2))}>
          YAML → JSON
        </button>
        <button type="button" className="btn small" disabled={!out || err} onClick={() => void copy(out)}>
          결과 복사
        </button>
        <button type="button" className="btn small" disabled={!out || err} onClick={() => setInput(out)}>
          결과를 입력으로
        </button>
      </div>
      <div className={'out' + (err ? ' err' : '')}>{out || '버튼을 눌러 변환하세요'}</div>
    </>
  )
}

/* ---------- Base64 / URL ---------- */
function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
function b64decode(s: string): string {
  const bin = atob(s.trim().replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

function EncodeTool() {
  const copy = useCopy()
  const [input, setInput] = useState('user:p@ssw0rd')
  const [out, setOut] = useState('')
  const [err, setErr] = useState(false)
  const run = (fn: (s: string) => string) => {
    try {
      setOut(fn(input))
      setErr(false)
    } catch (e) {
      setOut(`변환 실패: ${e instanceof Error ? e.message : String(e)}`)
      setErr(true)
    }
  }
  return (
    <>
      <h4>🔐 Base64 / URL 인코더</h4>
      <label className="field">
        입력
        <textarea className="mono" rows={3} value={input} onChange={(e) => setInput(e.target.value)} />
      </label>
      <div className="btn-row" style={{ margin: '8px 0' }}>
        <button type="button" className="btn small" onClick={() => run(b64encode)}>
          Base64 인코딩
        </button>
        <button type="button" className="btn small" onClick={() => run(b64decode)}>
          Base64 디코딩
        </button>
        <button type="button" className="btn small" onClick={() => run(encodeURIComponent)}>
          URL 인코딩
        </button>
        <button type="button" className="btn small" onClick={() => run(decodeURIComponent)}>
          URL 디코딩
        </button>
        <button type="button" className="btn small" disabled={!out || err} onClick={() => void copy(out)}>
          결과 복사
        </button>
      </div>
      <div className={'out' + (err ? ' err' : '')}>{out}</div>
    </>
  )
}

/* ---------- 시간 변환 ---------- */
function fmtTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short', timeZoneName: 'short' }).format(d)
}

function TimeTool() {
  const [input, setInput] = useState(() => String(Math.floor(Date.now() / 1000)))
  const result = useMemo(() => {
    const s = input.trim()
    if (!s) return { err: false, text: '' }
    let d: Date
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s)
      d = new Date(s.replace(/^-/, '').split('.')[0].length >= 13 ? n : n * 1000)
    } else d = new Date(s)
    if (Number.isNaN(d.getTime())) return { err: true, text: '해석할 수 없는 값입니다. Epoch(초/밀리초) 또는 ISO 8601 문자열을 입력하세요.' }
    return {
      err: false,
      text: [
        `KST (Asia/Seoul)          ${fmtTz(d, 'Asia/Seoul')}`,
        `UTC                       ${fmtTz(d, 'UTC')}`,
        `US-Pacific (Los_Angeles)  ${fmtTz(d, 'America/Los_Angeles')}`,
        '',
        `ISO 8601                  ${d.toISOString()}`,
        `Epoch (초)                ${Math.floor(d.getTime() / 1000)}`,
        `Epoch (밀리초)            ${d.getTime()}`,
      ].join('\n'),
    }
  }, [input])
  return (
    <>
      <h4>🕒 시간 변환</h4>
      <label className="field">
        Epoch(초/밀리초) 또는 ISO 문자열
        <input className="mono" value={input} placeholder="1761004800 또는 2026-10-21T09:00:00Z" onChange={(e) => setInput(e.target.value)} />
      </label>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>
          지금 (Epoch)
        </button>
        <button type="button" className="btn small" onClick={() => setInput(new Date().toISOString())}>
          지금 (ISO)
        </button>
      </div>
      <div className={'out' + (result.err ? ' err' : '')}>{result.text}</div>
    </>
  )
}

/* ---------- 템플릿 생성 ---------- */
type TplKind = 'incident' | 'deploy'

function TemplateTool() {
  const userName = useStore((s) => s.settings.userName)
  const showToast = useStore((s) => s.showToast)
  const [kind, setKind] = useState<TplKind>('incident')
  const [inc, setInc] = useState({ svc: '결제 API', sev: 'SEV-2', dur: '14:02 ~ 14:31 (29분)', impact: '결제 요청의 약 12% 타임아웃', cause: '', action: '', prevent: '' })
  const [dep, setDep] = useState({ svc: 'API 서버', version: '2.14.0', env: 'production', when: '오늘 15:00', impact: '없음 (롤링 업데이트)', changes: '- 기능 A 추가\n- 버그 B 수정' })

  const title = kind === 'incident' ? `${todayStr()} 장애 보고: ${inc.svc}` : `${todayStr()} 배포 공지: ${dep.svc} v${dep.version}`
  const md =
    kind === 'incident'
      ? `# 장애 보고: ${inc.svc} (${inc.sev})

- **작성자**: ${userName || '-'}
- **영향 시간**: ${inc.dur}
- **영향 범위**: ${inc.impact}
- **원인(Root cause)**: ${inc.cause || 'TBD'}
- **조치**: ${inc.action || 'TBD'}
- **재발 방지**: ${inc.prevent || 'TBD'}

## 타임라인
- HH:MM 알람 수신
- HH:MM 원인 식별
- HH:MM 복구 확인
`
      : `# [${dep.env}] ${dep.svc} v${dep.version} 배포 공지

- **배포 일시**: ${dep.when}
- **담당자**: ${userName || '-'}
- **영향**: ${dep.impact}

## 변경 사항
${dep.changes}

## 롤백 계획
문제 발생 시 이전 버전으로 즉시 롤백합니다.
`

  const outRef = useRef<HTMLDivElement>(null)

  // 복사가 안 되면 본문을 선택해 둔다. 사용자는 Ctrl+C 로 복사한다
  const copyMd = async () => {
    if (await copyText(md)) return showToast('Markdown 을 복사했습니다')
    const el = outRef.current
    const sel = window.getSelection()
    if (el && sel) {
      sel.selectAllChildren(el)
      showToast('복사하지 못했습니다. 본문을 선택했으니 Ctrl+C 로 복사하세요')
    } else showToast('복사하지 못했습니다')
  }

  const downloadMd = () => {
    // 파일 이름에 쓸 수 없는 글자는 - 로 바꾼다
    download(`${title.replace(/[\\/:*?"<>|]+/g, '-')}.md`, md, 'text/markdown;charset=utf-8')
    showToast('.md 파일을 내려받았습니다')
  }

  const fieldI = (k: keyof typeof inc, label: string) => (
    <label className="field">
      {label}
      <input value={inc[k]} onChange={(e) => setInc({ ...inc, [k]: e.target.value })} />
    </label>
  )
  const fieldD = (k: keyof typeof dep, label: string) => (
    <label className="field">
      {label}
      <input value={dep[k]} onChange={(e) => setDep({ ...dep, [k]: e.target.value })} />
    </label>
  )

  return (
    <>
      <h4>
        📝 템플릿 생성
        <span className="btn-row" style={{ marginLeft: 'auto' }}>
          <button type="button" className={'btn small' + (kind === 'incident' ? ' primary' : '')} onClick={() => setKind('incident')}>
            장애 보고서
          </button>
          <button type="button" className={'btn small' + (kind === 'deploy' ? ' primary' : '')} onClick={() => setKind('deploy')}>
            배포 공지
          </button>
        </span>
      </h4>
      {kind === 'incident' ? (
        <div className="form-row">
          {fieldI('svc', '서비스')}
          <label className="field">
            심각도
            <select value={inc.sev} onChange={(e) => setInc({ ...inc, sev: e.target.value })}>
              <option>SEV-1</option>
              <option>SEV-2</option>
              <option>SEV-3</option>
            </select>
          </label>
          {fieldI('dur', '영향 시간')}
          {fieldI('impact', '영향 범위')}
          {fieldI('cause', '원인')}
          {fieldI('action', '조치')}
          {fieldI('prevent', '재발 방지')}
        </div>
      ) : (
        <>
          <div className="form-row">
            {fieldD('svc', '서비스')}
            {fieldD('version', '버전')}
            <label className="field">
              환경
              <select value={dep.env} onChange={(e) => setDep({ ...dep, env: e.target.value })}>
                <option>dev</option>
                <option>staging</option>
                <option>production</option>
              </select>
            </label>
            {fieldD('when', '배포 일시')}
            {fieldD('impact', '영향')}
          </div>
          <label className="field">
            변경 사항
            <textarea rows={3} value={dep.changes} onChange={(e) => setDep({ ...dep, changes: e.target.value })} />
          </label>
        </>
      )}
      <div className="out" ref={outRef}>
        {md}
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small primary" onClick={() => void copyMd()}>
          Markdown 복사
        </button>
        <button type="button" className="btn small" onClick={downloadMd}>
          .md 받기
        </button>
        <span className="small muted">AKG 에 올릴 때 이 본문을 씁니다.</span>
      </div>
    </>
  )
}

/* ---------- 정규식 ---------- */
function RegexTool() {
  const [pattern, setPattern] = useState('ERROR\\s+\\[(\\w+)\\]')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('2026-10-21 14:02:11 ERROR [payment] timeout after 30s\n2026-10-21 14:02:12 INFO  [payment] retry 1\n2026-10-21 14:02:45 ERROR [gateway] upstream 502')

  const result = useMemo(() => {
    let re: RegExp
    try {
      re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
    if (!pattern) return { error: '패턴을 입력하세요' }
    const matches = [...text.matchAll(re)].filter((m) => m[0].length > 0)
    const parts: ReactNode[] = []
    let last = 0
    matches.forEach((m, i) => {
      const idx = m.index ?? 0
      parts.push(text.slice(last, idx))
      parts.push(
        <mark key={i} style={{ background: 'var(--warn)', color: '#000', borderRadius: 3 }}>
          {m[0]}
        </mark>,
      )
      last = idx + m[0].length
    })
    parts.push(text.slice(last))
    return { matches, parts }
  }, [pattern, flags, text])

  return (
    <>
      <h4>.* 정규식 테스터</h4>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 100px' }}>
        <label className="field">
          패턴
          <input className="mono" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </label>
        <label className="field">
          플래그
          <input className="mono" value={flags} onChange={(e) => setFlags(e.target.value.replace(/[^dgimsuyv]/g, ''))} />
        </label>
      </div>
      <label className="field">
        텍스트
        <textarea className="mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {'error' in result ? (
        <div className="out err">{result.error}</div>
      ) : (
        <>
          <div className="out">{result.parts}</div>
          <div className="out">
            {result.matches.length === 0
              ? '매치 없음'
              : `${result.matches.length}개 매치\n` +
                result.matches
                  .map((m, i) => `#${i + 1} @${m.index}: ${JSON.stringify(m[0])}` + (m.length > 1 ? `  그룹: ${m.slice(1).map((g) => JSON.stringify(g ?? null)).join(', ')}` : ''))
                  .join('\n')}
          </div>
        </>
      )}
    </>
  )
}

/* ---------- UUID / 비밀번호 ---------- */
function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

function GenTool() {
  const copy = useCopy()
  const [count, setCount] = useState(5)
  const [len, setLen] = useState(20)
  const [opt, setOpt] = useState({ lower: true, upper: true, digit: true, symbol: true })
  const [out, setOut] = useState('')

  const genPw = () => {
    const sets = [opt.lower && 'abcdefghijkmnopqrstuvwxyz', opt.upper && 'ABCDEFGHJKLMNPQRSTUVWXYZ', opt.digit && '23456789', opt.symbol && '!@#$%^&*-_=+?'].filter((x): x is string => !!x)
    if (sets.length === 0) return setOut('문자 종류를 하나 이상 선택하세요')
    const all = sets.join('')
    const lines: string[] = []
    for (let n = 0; n < count; n++) {
      const chars = sets.map((s) => s[randomInt(s.length)])
      while (chars.length < len) chars.push(all[randomInt(all.length)])
      for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1)
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
      }
      lines.push(chars.slice(0, len).join(''))
    }
    setOut(lines.join('\n'))
  }

  return (
    <>
      <h4>🎲 UUID / 비밀번호 생성기</h4>
      <div className="form-row">
        <label className="field">
          개수
          <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          비밀번호 길이
          <input type="number" min={4} max={128} value={len} onChange={(e) => setLen(Math.min(128, Math.max(4, Number(e.target.value) || 4)))} />
        </label>
      </div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        {(
          [
            ['lower', '소문자'],
            ['upper', '대문자'],
            ['digit', '숫자'],
            ['symbol', '특수문자'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={opt[k]} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" className="btn small" onClick={() => setOut(Array.from({ length: count }, () => uid()).join('\n'))}>
          UUID v4 생성
        </button>
        <button type="button" className="btn small" onClick={genPw}>
          비밀번호 생성
        </button>
        <button type="button" className="btn small" disabled={!out} onClick={() => void copy(out)}>
          결과 복사
        </button>
      </div>
      <div className="out">{out}</div>
      <p className="small muted" style={{ marginTop: 8 }}>
        crypto.getRandomValues 기반으로 브라우저에서만 생성되며 저장되지 않습니다.
      </p>
    </>
  )
}

/* ---------- Diff ---------- */
type DiffLine = { op: ' ' | '+' | '-'; text: string }

function diffLines(a: string[], b: string[]): DiffLine[] {
  const n = a.length
  const m = b.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: '-', text: a[i++] })
    else out.push({ op: '+', text: b[j++] })
  }
  while (i < n) out.push({ op: '-', text: a[i++] })
  while (j < m) out.push({ op: '+', text: b[j++] })
  return out
}

function DiffTool() {
  const [left, setLeft] = useState('replicas: 2\nimage: api:2.13.0\nLOG_LEVEL: info\ntimeout: 30s')
  const [right, setRight] = useState('replicas: 3\nimage: api:2.14.0\nLOG_LEVEL: info\ntimeout: 10s\nretry: 1')

  const result = useMemo(() => {
    const a = left.split('\n')
    const b = right.split('\n')
    if (a.length * b.length > 4_000_000) return null
    return diffLines(a, b)
  }, [left, right])

  const added = result?.filter((l) => l.op === '+').length ?? 0
  const removed = result?.filter((l) => l.op === '-').length ?? 0

  return (
    <>
      <h4>± 텍스트 Diff</h4>
      <div className="grid g2">
        <label className="field">
          원본 (A)
          <textarea className="mono" rows={8} value={left} onChange={(e) => setLeft(e.target.value)} />
        </label>
        <label className="field">
          변경본 (B)
          <textarea className="mono" rows={8} value={right} onChange={(e) => setRight(e.target.value)} />
        </label>
      </div>
      {result === null ? (
        <div className="out err">입력이 너무 큽니다 (줄 수 곱이 400만 초과)</div>
      ) : (
        <>
          <div className="small muted" style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--ok)' }}>+{added}</span> / <span style={{ color: 'var(--danger)' }}>-{removed}</span> 줄
          </div>
          <div className="out" style={{ whiteSpace: 'pre' , overflowX: 'auto' }}>
            {result.map((l, i) => (
              <div key={i} style={{ color: l.op === '+' ? '#7ee2a8' : l.op === '-' ? '#ff9b9b' : undefined, background: l.op === '+' ? 'rgba(63,196,121,.12)' : l.op === '-' ? 'rgba(240,106,106,.12)' : undefined }}>
                {l.op} {l.text}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
