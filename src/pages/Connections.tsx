import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import type { Connection } from '../types'
import { connNames } from '../lib/conn'
import { now, uid } from '../lib/util'
import { agentStatus, pingAlias, type AgentConn, type AgentStatus } from '../lib/agentDb'
import Topbar from '../components/Topbar'
import SettingsTabs from '../components/SettingsTabs'

/**
 * 설정 › DB 연결. agent-db 의 alias 목록을 보여 주고, alias 마다 이름(FDC-L1 · LOGDB …)을 붙인다.
 * 카드는 이름을 가리키고, 작업대 연결 띠가 같은 이름의 alias 중 하나를 고른다.
 * 접속 주소 · 사용자 · 비밀번호는 agent-db 의 connections.json 이 가진다.
 */
export default function ConnectionsPage() {
  const connections = useStore((s) => s.connections)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const refresh = useCallback(() => {
    setStatus(null)
    void agentStatus().then(setStatus)
  }, [])
  useEffect(() => {
    let alive = true
    void agentStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  const aliases = status?.ok ? status.connections : []
  const known = new Set(aliases.map((a) => a.alias))
  // alias 가 없는 연결(가짜 결과)과 agent-db 가 모르는 alias 의 연결
  const others = status?.ok ? connections.filter((c) => !c.alias || !known.has(c.alias)) : []
  const names = connNames(connections)

  return (
    <>
      <Topbar title="설정" />
      <SettingsTabs />
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
            alias 에 이름을 붙이면 그 이름을 쓰는 카드가 agent-db 로 Oracle 을 조회합니다.
          </span>
          <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={refresh} disabled={status === null}>
            ↻ 다시 확인
          </button>
        </h4>
        {status?.command && <code className="conn-str">{status.command}</code>}
        {status && !status.ok && (
          <>
            <div className="tres bad">{status.error}</div>
            <div className="note-box">
              명령은 AGENT_DB_COMMAND · AGENT_DB_SERVER 환경 변수로 바꿉니다(기본 <code>node.exe C:/tools/agent-db/server.mjs</code>). 바꾼 뒤 npm run dev 를 다시 켜세요.
            </div>
          </>
        )}
        {status?.ok &&
          [...status.errors, ...(status.hint ? [status.hint] : [])].map((m) => (
            <div key={String(m)} className="note-box warn">
              {String(m)}
            </div>
          ))}

        <datalist id="conn-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {status?.ok &&
          (aliases.length ? (
            <div className="alias-list">
              <div className="arow head">
                <span>alias</span>
                <span>이름 (카드가 가리키는 묶음)</span>
                <span>쓰는 카드</span>
                <span />
              </div>
              {aliases.map((a) => {
                const conn = connections.find((c) => c.alias === a.alias)
                return <AliasRow key={`${a.alias}:${conn?.updatedAt ?? ''}`} info={a} conn={conn} />
              })}
            </div>
          ) : (
            <div className="empty">agent-db 에 alias 가 없습니다. connections.json 을 확인하세요.</div>
          ))}

        <div className="note-box">
          같은 DB 의 alias 들(예: <code>fdc-l1-prod</code> · <code>fdc-l1-dev</code>)에 같은 이름(<code>FDC-L1</code>)을 붙이세요. 작업대 위 연결 띠에서 이름마다 어느 alias
          로 조회할지 고릅니다. 이름을 비우면 그 alias 는 카드에서 쓰이지 않습니다.
        </div>
      </div>

      {others.length > 0 && <OtherConnections list={others} />}
      {status && !status.ok && connections.length > 0 && <OtherConnections list={connections} offline />}
    </>
  )
}

function AliasRow({ info, conn }: { info: AgentConn; conn?: Connection }) {
  const connections = useStore((s) => s.connections)
  const cards = useStore((s) => s.cards)
  const boards = useStore((s) => s.boards)
  const upsertConnection = useStore((s) => s.upsertConnection)
  const deleteConnection = useStore((s) => s.deleteConnection)
  const upsertCard = useStore((s) => s.upsertCard)
  const upsertBoard = useStore((s) => s.upsertBoard)
  const showToast = useStore((s) => s.showToast)
  const [name, setName] = useState(conn?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<{ busy: true } | { busy: false; ok: boolean; msg: string } | null>(null)

  const oldName = conn?.name ?? ''
  const next = name.trim()
  const dirty = next !== oldName
  const usedBy = (n: string) => cards.filter((c) => c.kind === 'query' && c.connection === n)
  const uses = oldName ? usedBy(oldName).length : 0
  // 이 alias 가 그 이름의 마지막 연결이면, 이름을 바꾸거나 비울 때 카드가 연결을 잃는다
  const lastOfName = !!conn && !connections.some((c) => c.id !== conn.id && c.name === oldName)

  const save = async () => {
    if (!dirty || busy) return
    const users = oldName ? usedBy(oldName) : []
    setBusy(true)
    try {
      if (!next) {
        if (!conn) return
        if (lastOfName && users.length && !window.confirm(`카드 ${users.length} 개가 ${oldName} 를 씁니다. 이름을 비우면 이 카드들은 연결을 잃습니다. 비울까요?`)) return setName(oldName)
        await deleteConnection(conn.id)
        return showToast(`${info.alias} 의 이름을 비웠습니다`)
      }
      if (!conn) {
        const t = now()
        await upsertConnection({
          id: `conn_${uid().slice(0, 8)}`,
          createdAt: t,
          updatedAt: t,
          tags: [],
          name: next,
          alias: info.alias,
          driver: 'oracle',
          envId: '',
          host: '',
          port: 1521,
          service: '',
          schema: '',
          user: info.user,
          readOnly: true,
        })
        return showToast(`${info.alias} 를 ${next} 로 붙였습니다`)
      }
      const follow = lastOfName && users.length > 0 && window.confirm(`카드 ${users.length} 개가 ${oldName} 를 씁니다. 카드도 ${next} 로 바꿀까요?`)
      await upsertConnection({ ...conn, name: next })
      if (follow) {
        for (const c of users) await upsertCard({ ...c, connection: next } as typeof c)
        for (const b of boards) {
          const picked = b.conns?.[oldName]
          if (picked === undefined) continue
          const { [oldName]: _old, ...rest } = b.conns ?? {}
          await upsertBoard({ ...b, conns: { ...rest, [next]: picked } })
        }
      }
      showToast(`${info.alias} 의 이름을 ${next} 로 바꿨습니다`)
    } finally {
      setBusy(false)
    }
  }

  const runTest = async () => {
    setTest({ busy: true })
    try {
      setTest({ busy: false, ok: true, msg: `연결됨 ${await pingAlias(info.alias)} ms` })
    } catch (e) {
      setTest({ busy: false, ok: false, msg: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className={'arow' + (oldName ? ' named' : '')}>
      <div className="alias-cell">
        <code>{info.alias}</code>
        <span className="small muted">
          {info.user}
          {info.description ? ` · ${info.description}` : ''}
        </span>
        {info.passwordStatus !== 'set' && <span className="pill amber">비밀번호 {info.passwordStatus}</span>}
      </div>
      <form
        className="alias-name"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input className="input mono" list="conn-names" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 없음 · 예: FDC-L1" aria-label={`${info.alias} 이름`} spellCheck={false} />
        {dirty && (
          <>
            <button type="submit" className="btn small primary" disabled={busy}>
              저장
            </button>
            <button type="button" className="btn small" onClick={() => setName(oldName)}>
              취소
            </button>
          </>
        )}
      </form>
      <span className="small muted">{oldName ? `카드 ${uses}` : '-'}</span>
      <div className="alias-test">
        <button type="button" className="btn small" onClick={() => void runTest()} disabled={test?.busy === true}>
          ▶ 연결 테스트
        </button>
        {test && (
          <span className={'tres' + (test.busy ? '' : test.ok ? ' ok' : ' bad')} role="status">
            {test.busy ? '붙어 보는 중…' : test.msg}
          </span>
        )}
      </div>
    </div>
  )
}

/** alias 가 없거나 agent-db 가 모르는 alias 의 연결. 그 이름의 카드는 가짜 결과를 쓴다 */
function OtherConnections({ list, offline }: { list: Connection[]; offline?: boolean }) {
  const cards = useStore((s) => s.cards)
  const connections = useStore((s) => s.connections)
  const deleteConnection = useStore((s) => s.deleteConnection)
  const showToast = useStore((s) => s.showToast)
  const envs = useStore((s) => s.envs)
  const envName = (id: string) => envs.find((e) => e.id === id)?.name ?? ''

  const remove = async (c: Connection) => {
    const users = cards.filter((x) => x.kind === 'query' && x.connection === c.name).length
    const last = !connections.some((x) => x.id !== c.id && x.name === c.name)
    const warn = last && users ? ` 카드 ${users} 개가 ${c.name} 연결을 잃습니다.` : ''
    if (!window.confirm(`${c.name} 의 이 연결을 지울까요?${warn}`)) return
    await deleteConnection(c.id)
    showToast('연결을 지웠습니다')
  }

  return (
    <div className="panel form-col" style={{ marginTop: 14 }}>
      <h4>
        {offline ? 'WorkBench 에 저장된 연결' : '가짜 결과 연결'}
        <span className="small muted" style={{ fontWeight: 400 }}>
          {offline ? 'agent-db 에 붙으면 alias 목록과 함께 보입니다.' : 'alias 가 없거나 agent-db 가 모르는 alias 입니다. 이 연결을 고른 작업대는 가짜 결과를 씁니다.'}
        </span>
      </h4>
      <div className="alias-list">
        {list.map((c) => (
          <div key={c.id} className="arow other">
            <div className="alias-cell">
              <b>{c.name || '(이름 없음)'}</b>
              <span className="small muted">{c.alias ? `alias ${c.alias}${offline ? '' : ' · agent-db 에 없음'}` : `가짜 결과${envName(c.envId) ? ` · ${envName(c.envId)}` : ''}`}</span>
            </div>
            <span />
            <span className="small muted">카드 {cards.filter((x) => x.kind === 'query' && x.connection === c.name).length}</span>
            <div className="alias-test">
              <button type="button" className="btn small danger" onClick={() => void remove(c)}>
                지우기
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
