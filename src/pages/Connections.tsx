import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import type { Connection } from '../types'
import { connNames, resolveConn } from '../lib/conn'
import { now, uid } from '../lib/util'
import { agentStatus, pingAlias, type AgentStatus } from '../lib/agentDb'
import Topbar from '../components/Topbar'
import SettingsTabs from '../components/SettingsTabs'

const DISCARD = '저장하지 않은 수정이 있습니다. 버리고 넘어갈까요?'

/** 펼친 줄: 저장된 연결(id) 또는 아직 저장하지 않은 새 연결(draft) */
type Open = { id: string } | { draft: Connection }

/** 설정 › DB 연결(W5). 환경을 고르면 그 환경의 연결이 섭니다. 줄을 펼치면 Oracle 폼이 섭니다 */
export default function ConnectionsPage() {
  const envs = useStore((s) => s.envs)
  const connections = useStore((s) => s.connections)
  const activeEnvId = useStore((s) => s.settings.activeEnvId)
  const [envId, setEnvId] = useState(() => activeEnvId ?? envs[0]?.id ?? '')
  const [open, setOpen] = useState<Open | null>(null)
  const [dirty, setDirty] = useState(false)
  // agent-db 상태와 alias 목록. null 은 확인하는 중
  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const refreshAgent = useCallback(() => {
    setAgent(null)
    void agentStatus().then(setAgent)
  }, [])
  useEffect(() => {
    let alive = true
    void agentStatus().then((s) => alive && setAgent(s))
    return () => {
      alive = false
    }
  }, [])
  const aliases = agent?.ok ? agent.connections.map((c) => c.alias) : []

  const go = (next: Open | null) => {
    if (dirty && !window.confirm(DISCARD)) return false
    setDirty(false)
    setOpen(next)
    return true
  }

  const inEnv = connections.filter((c) => c.envId === envId).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const missing = connNames(connections).filter((n) => !inEnv.some((c) => c.name === n))
  const openId = open && ('id' in open ? open.id : open.draft.id)
  const close = () => {
    setDirty(false)
    setOpen(null)
  }
  /** 저장한 연결의 환경으로 옮겨 그 줄을 펼친다(폼에서 환경을 바꿨을 수 있다) */
  const saved = (c: Pick<Connection, 'id' | 'envId'>) => {
    setDirty(false)
    setEnvId(c.envId)
    setOpen({ id: c.id })
  }

  const newDraft = (name = ''): Connection => {
    const sib = connections.find((c) => c.name === name) // 다른 환경의 같은 이름 연결에서 포트 · 서비스 · 스키마 · 사용자를 빌려 온다
    const t = now()
    return {
      id: `conn_${uid().slice(0, 8)}`,
      createdAt: t,
      updatedAt: t,
      tags: [],
      name,
      driver: 'oracle',
      envId,
      host: '',
      port: sib?.port ?? 1521,
      service: sib?.service ?? '',
      schema: sib?.schema ?? '',
      user: sib?.user ?? '',
      readOnly: true,
    }
  }

  return (
    <>
      <Topbar title="설정" />
      <SettingsTabs />
      <AgentPanel status={agent} onRefresh={refreshAgent} />
      <div className="panel form-col" style={{ marginTop: 14 }}>
        <div className="btn-row">
          <h4 style={{ margin: 0 }}>DB 연결</h4>
          <span className="pill green">Oracle</span>
          <div className="seg" role="radiogroup" aria-label="환경">
            {envs.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={e.id === envId}
                className={e.id === envId ? 'on' : undefined}
                onClick={() => e.id !== envId && go(null) && setEnvId(e.id)}
              >
                {e.name} <span className="muted">{connections.filter((c) => c.envId === e.id).length}</span>
              </button>
            ))}
          </div>
          <span className="small muted">환경을 고르면 그 환경의 연결이 섭니다.</span>
          <span className="sp" />
          <button type="button" className="btn primary" onClick={() => go({ draft: newDraft() })}>
            + 연결 추가
          </button>
        </div>

        <div>
          {open && 'draft' in open && (
            <div className="crow open">
              <div className="crow-h static">
                <span className="nm">새 연결</span>
              </div>
              <div className="crow-b">
                <ConnForm key={open.draft.id} conn={open.draft} isNew aliases={aliases} onDirty={setDirty} onClose={close} onSaved={saved} />
              </div>
            </div>
          )}
          {inEnv.map((c) => (
            <ConnRow key={c.id} conn={c} open={openId === c.id} onToggle={() => go(openId === c.id ? null : { id: c.id })}>
              <ConnForm key={`${c.id}:${c.updatedAt}`} conn={c} isNew={false} aliases={aliases} onDirty={setDirty} onClose={close} onSaved={saved} />
            </ConnRow>
          ))}
          {missing.map((n) => (
            <div key={n} className="crow missing">
              <div className="crow-h static">
                <span className="nm">{n}</span>
                <span className="addr">이 환경에 {n} 연결이 비어 있습니다</span>
                <button type="button" className="btn small" onClick={() => go({ draft: newDraft(n) })}>
                  + 설정
                </button>
              </div>
            </div>
          ))}
          {inEnv.length === 0 && missing.length === 0 && !(open && 'draft' in open) && <div className="empty">연결이 없습니다. + 연결 추가를 누르세요.</div>}
        </div>

        <div className="note-box">
          카드는 연결 <b>이름</b>(FDC-L1 · LOGDB …)만 가리킵니다. 작업대는 이름마다 어느 환경의 연결에 붙을지 따로 고릅니다(작업대 위 연결 띠). 연결에 agent-db
          alias 를 고르면 그 연결의 카드는 agent-db 로 Oracle 을 조회합니다. alias 가 없는 연결은 가짜 결과를 씁니다.
        </div>
      </div>
    </>
  )
}

function ConnRow({ conn, open, onToggle, children }: { conn: Connection; open: boolean; onToggle: () => void; children: ReactNode }) {
  const uses = useStore((s) => s.cards.filter((c) => c.kind === 'query' && c.connection === conn.name).length)
  return (
    <div className={'crow' + (open ? ' open' : '')}>
      <button type="button" className="crow-h" aria-expanded={open} onClick={onToggle}>
        <span className="chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="nm">{conn.name}</span>
        <span className="addr mono">
          {conn.host}:{conn.port}/{conn.service}
        </span>
        <span className="mono small muted">{conn.user}</span>
        {conn.alias ? (
          <span className="pill green mono">agent-db · {conn.alias}</span>
        ) : (
          <span className="pill amber">가짜 결과</span>
        )}
        <span className="small muted">카드 {uses}</span>
      </button>
      {open && <div className="crow-b">{children}</div>}
    </div>
  )
}

interface FormProps {
  conn: Connection
  isNew: boolean
  /** agent-db 가 알려 준 alias 목록 */
  aliases: string[]
  onDirty: (dirty: boolean) => void
  onClose: () => void
  onSaved: (c: Pick<Connection, 'id' | 'envId'>) => void
}

function ConnForm({ conn, isNew, aliases, onDirty, onClose, onSaved }: FormProps) {
  const connections = useStore((s) => s.connections)
  const envs = useStore((s) => s.envs)
  const cards = useStore((s) => s.cards)
  const boards = useStore((s) => s.boards)
  const upsertConnection = useStore((s) => s.upsertConnection)
  const deleteConnection = useStore((s) => s.deleteConnection)
  const upsertCard = useStore((s) => s.upsertCard)
  const upsertBoard = useStore((s) => s.upsertBoard)
  const showToast = useStore((s) => s.showToast)
  const [d, setD] = useState(conn)
  const [port, setPort] = useState(String(conn.port))
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<{ busy: true } | { busy: false; ok: boolean; msg: string } | null>(null)

  const set = (patch: Partial<Connection>) => {
    setD((x) => ({ ...x, ...patch }))
    onDirty(true)
  }
  const envName = envs.find((e) => e.id === d.envId)?.name ?? d.envId
  const name = d.name.trim()
  const portN = Number(port)
  const problem = !name
    ? '이름을 넣으세요'
    : connections.some((c) => c.id !== d.id && c.envId === d.envId && c.name === name)
      ? `${envName} 에 ${name} 연결이 이미 있습니다`
      : !d.alias && !d.host.trim()
        ? 'agent-db alias 를 고르거나 호스트를 넣으세요'
        : port.trim() !== '' && !(Number.isInteger(portN) && portN >= 1 && portN <= 65535)
          ? '포트는 1~65535 정수입니다'
          : undefined

  const runTest = async () => {
    if (!d.alias) return
    setTest({ busy: true })
    try {
      setTest({ busy: false, ok: true, msg: `연결됨 ${await pingAlias(d.alias)} ms · agent-db ${d.alias} · SELECT 1 FROM dual` })
    } catch (e) {
      setTest({ busy: false, ok: false, msg: e instanceof Error ? e.message : String(e) })
    }
  }

  const oldName = conn.name
  const usedBy = cards.filter((c) => c.kind === 'query' && c.connection === oldName)
  const boardsOn = boards.filter((b) => resolveConn(oldName, b, connections, envs)?.id === conn.id)
  // 이 연결이 그 이름의 마지막 연결이면, 이름을 바꾸거나 지울 때 카드가 연결을 잃는다
  const lastOfName = !connections.some((c) => c.id !== conn.id && c.name === oldName)

  const save = async () => {
    if (problem || busy) return
    const renamed = !isNew && name !== oldName
    if (renamed && lastOfName && usedBy.length && !window.confirm(`카드 ${usedBy.length} 개가 ${oldName} 를 씁니다. 카드도 ${name} 로 바꿀까요?`)) return
    setBusy(true)
    try {
      await upsertConnection({ ...d, name, host: d.host.trim(), port: portN, service: d.service.trim(), schema: d.schema.trim(), user: d.user.trim() })
      if (renamed && lastOfName) {
        for (const c of usedBy) await upsertCard({ ...c, connection: name } as typeof c)
        for (const b of boards) {
          const picked = b.conns?.[oldName]
          if (picked === undefined) continue
          const { [oldName]: _old, ...rest } = b.conns ?? {}
          await upsertBoard({ ...b, conns: { ...rest, [name]: picked } })
        }
      }
      showToast(isNew ? '연결을 더했습니다' : '연결을 저장했습니다')
      onSaved(d)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (isNew) return onClose()
    const warn = lastOfName && usedBy.length ? ` 카드 ${usedBy.length} 개가 ${oldName} 연결을 잃습니다.` : ''
    if (!window.confirm(`${envName} 의 ${oldName} 연결을 지울까요?${warn}`)) return
    await deleteConnection(conn.id)
    showToast('연결을 지웠습니다')
    onClose()
  }

  return (
    <form
      className="form-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="conn-grid">
        <label className="field">
          이름 (카드가 가리키는 이름)
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} list="conn-names" placeholder="FDC-L1" spellCheck={false} />
          <datalist id="conn-names">
            {connNames(connections).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="field">
          환경
          <select value={d.envId} onChange={(e) => set({ envId: e.target.value })}>
            {envs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          agent-db alias (조회 통로)
          <select
            value={d.alias ?? ''}
            onChange={(e) => {
              const { alias: _old, ...rest } = d
              setD(e.target.value ? { ...rest, alias: e.target.value } : rest)
              setTest(null)
              onDirty(true)
            }}
          >
            <option value="">없음 · 가짜 결과</option>
            {[...new Set([...aliases, ...(d.alias ? [d.alias] : [])])].map((a) => (
              <option key={a} value={a}>
                {a}
                {aliases.includes(a) ? '' : ' (agent-db 에 없음)'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          사용자
          <input className="mono" value={d.user} onChange={(e) => set({ user: e.target.value })} placeholder="fdc_ro" spellCheck={false} autoComplete="off" />
        </label>
        <label className="field">
          호스트
          <input className="mono" value={d.host} onChange={(e) => set({ host: e.target.value })} placeholder="db-l1.fab.internal" spellCheck={false} />
        </label>
        <label className="field">
          포트
          <input
            className="mono"
            inputMode="numeric"
            value={port}
            onChange={(e) => {
              setPort(e.target.value)
              onDirty(true)
            }}
          />
        </label>
        <label className="field">
          서비스 이름
          <input className="mono" value={d.service} onChange={(e) => set({ service: e.target.value })} placeholder="FDCL1" spellCheck={false} />
        </label>
        <label className="field">
          스키마 (세션 시작 때 지정)
          <input className="mono" value={d.schema} onChange={(e) => set({ schema: e.target.value })} placeholder="FDC_L1" spellCheck={false} />
        </label>
        <div className="field">
          <span>읽기 전용</span>
          <label className="check">
            <input type="checkbox" checked={d.readOnly} onChange={(e) => set({ readOnly: e.target.checked })} />
            SELECT · WITH 한 문장만 돌립니다
          </label>
        </div>
        <div className="field">
          <span>연결 문자열</span>
          <code className="conn-str">
            {d.user || 'user'}@{d.host || 'host'}:{port || '1521'}/{d.service || 'service'}
          </code>
        </div>
      </div>
      {!d.readOnly && !d.alias && <div className="note-box warn">읽기 전용이 꺼져 있습니다. 운영 연결은 켜기를 권합니다.</div>}
      {d.alias && (
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void runTest()} disabled={test?.busy === true}>
            ▶ 연결 테스트
          </button>
          {test && (
            <span className={'tres' + (test.busy ? '' : test.ok ? ' ok' : ' bad')} role="status">
              {test.busy ? '붙어 보는 중…' : test.msg}
            </span>
          )}
        </div>
      )}

      {!isNew && (
        <div className="field">
          <span>
            이 연결 이름을 쓰는 카드 {usedBy.length}
            {boardsOn.length > 0 && <span>이 연결에 붙은 작업판: {boardsOn.map((b) => b.title).join(', ')}</span>}
          </span>
          {usedBy.length ? (
            <div className="chips">
              {usedBy.map((c) => (
                <span key={c.id} className="chip" title={c.id}>
                  {c.title}
                </span>
              ))}
            </div>
          ) : (
            <span className="small muted">이 이름을 쓰는 카드가 없습니다</span>
          )}
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn danger" onClick={() => void remove()}>
          {isNew ? '버리기' : '삭제'}
        </button>
        <span className="sp" />
        {problem && <span className="cf-err">{problem}</span>}
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="submit" className="btn primary" disabled={!!problem || busy}>
          저장
        </button>
      </div>
    </form>
  )
}

/** agent-db 상태: 띄우는 명령, alias 목록과 비밀번호 상태 */
function AgentPanel({ status, onRefresh }: { status: AgentStatus | null; onRefresh: () => void }) {
  return (
    <div className="panel form-col">
      <h4>
        🔌 agent-db
        {status === null ? (
          <span className="pill gray">확인하는 중…</span>
        ) : status.ok ? (
          <span className="pill green">연결됨 · alias {status.connections.length}</span>
        ) : (
          <span className="pill red">붙지 못함</span>
        )}
        <span className="small muted" style={{ fontWeight: 400 }}>
          npm run dev 가 agent-db 를 띄워 Oracle 을 읽기 전용으로 조회합니다. 행은 1000 까지 받습니다.
        </span>
        <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={onRefresh} disabled={status === null}>
          ↻ 다시 확인
        </button>
      </h4>
      {status?.command && <code className="conn-str">{status.command}</code>}
      {status && !status.ok && <div className="tres bad">{status.error}</div>}
      {status?.ok && (
        <>
          {status.connections.length ? (
            <div className="chips">
              {status.connections.map((c) => (
                <span key={c.alias} className={'chip mono' + (c.passwordStatus === 'set' ? '' : ' warn')} title={`${c.user} · 비밀번호 ${c.passwordStatus}${c.description ? ` · ${c.description}` : ''}`}>
                  {c.alias}
                  {c.passwordStatus === 'set' ? '' : ` · 비밀번호 ${c.passwordStatus}`}
                </span>
              ))}
            </div>
          ) : (
            <span className="small muted">agent-db 에 alias 가 없습니다. connections.json 을 확인하세요.</span>
          )}
          {[...status.errors, ...(status.hint ? [status.hint] : [])].map((m) => (
            <div key={String(m)} className="note-box warn">
              {String(m)}
            </div>
          ))}
        </>
      )}
      {status && !status.ok && (
        <div className="note-box">
          명령은 AGENT_DB_COMMAND · AGENT_DB_SERVER 환경 변수로 바꿉니다(기본 <code>node.exe C:/tools/agent-db/server.mjs</code>). 바꾼 뒤 npm run dev 를 다시 켜세요.
        </div>
      )}
    </div>
  )
}
