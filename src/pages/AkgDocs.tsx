import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { AkgError, akgClient, akgTokenPage, toAkgError } from '../lib/akg'
import type { AkgDoc, AkgType } from '../lib/akg'
import { relTime } from '../lib/util'
import Topbar from '../components/Topbar'
import TypeBadge from '../components/akg/TypeBadge'
import AkgDrawer from '../components/akg/AkgDrawer'

/** 제목 앞에 id 를 mono 로 함께 보이는 타입 */
const ID_FIRST = new Set(['db-schema', 'msg-format', 'domain-skill', 'domain'])
const KW_MAX = 3

type Load =
  | { status: 'loading' }
  | { status: 'ok'; types: AkgType[]; docs: AkgDoc[] }
  | { status: 'error'; error: AkgError }

const NO_TOKEN: Load = { status: 'error', error: new AkgError('no-token', '읽기 토큰이 없습니다') }

export default function AkgDocs() {
  const akgUrl = useStore((s) => s.settings.akgUrl) ?? ''
  const akgToken = useStore((s) => s.settings.akgToken) ?? ''
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [typeSel, setTypeSel] = useState<string[]>([])
  const [fetched, setLoad] = useState<Load>({ status: 'loading' })
  // 토큰이 없으면 부르지 않고 바로 "토큰 없음"을 보인다
  const load = akgToken ? fetched : NO_TOKEN
  const [tick, setTick] = useState(0)

  // 목록은 이 페이지 상태에 둔다. 처음 한 번과 "새로 고침"(tick) 때만 받는다. 검색은 브라우저에서 거른다.
  useEffect(() => {
    if (!akgUrl || !akgToken) return
    let alive = true
    const client = akgClient(akgUrl, akgToken)
    Promise.all([client.types(), client.docs()])
      .then(([types, docs]) => {
        if (alive) setLoad({ status: 'ok', types, docs })
      })
      .catch((e: unknown) => {
        if (alive) setLoad({ status: 'error', error: toAkgError(e) })
      })
    return () => {
      alive = false
    }
  }, [akgUrl, akgToken, tick])

  const refresh = () => {
    setLoad({ status: 'loading' })
    setTick((t) => t + 1)
  }

  const types = load.status === 'ok' ? load.types : []
  const typeById = useMemo(() => new Map((load.status === 'ok' ? load.types : []).map((t) => [t.id, t])), [load])

  // archived 는 걸러 둔다. 검색용 소문자 문자열을 한 번만 만든다.
  const live = useMemo(() => {
    const docs = load.status === 'ok' ? load.docs : []
    return docs
      .filter((d) => d.status !== 'archived')
      .map((d) => ({ doc: d, hay: `${d.title} ${d.id} ${d.keywords.join(' ')}`.toLowerCase() }))
      .sort((a, b) => (a.doc.updatedAt < b.doc.updatedAt ? 1 : -1))
  }, [load])

  const countByType = useMemo(() => {
    const m = new Map<string, number>()
    for (const { doc } of live) m.set(doc.type, (m.get(doc.type) ?? 0) + 1)
    return m
  }, [live])

  const visible = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return live
      .filter(({ doc }) => typeSel.length === 0 || typeSel.includes(doc.type))
      .filter(({ hay }) => words.every((w) => hay.includes(w)))
      .map(({ doc }) => doc)
  }, [live, q, typeSel])

  const toggleType = (id: string) => setTypeSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  // ?doc=<type>/<id> 가 서랍의 열림 상태
  const docParam = params.get('doc')
  const slash = docParam?.indexOf('/') ?? -1
  const opened = docParam && slash > 0 ? { type: docParam.slice(0, slash), id: docParam.slice(slash + 1) } : null
  const allDocs = load.status === 'ok' ? load.docs : undefined
  const openedDoc = opened ? allDocs?.find((d) => d.type === opened.type && d.id === opened.id) : undefined

  // 본문의 [[id]] · [[type/id]] → 이 페이지의 서랍 주소. 목록에서 찾지 못하거나 id 가 여러 타입에 있으면 null(글자만).
  const wikiHref = useMemo(() => {
    const keys = new Set((allDocs ?? []).map((d) => `${d.type}/${d.id}`))
    const typesById = new Map<string, string[]>()
    for (const d of allDocs ?? []) typesById.set(d.id, [...(typesById.get(d.id) ?? []), d.type])
    return (target: string): string | null => {
      const t = target.trim()
      const slash = t.indexOf('/')
      if (slash >= 0) return keys.has(t) ? docRoute(t.slice(0, slash), t.slice(slash + 1)) : null
      const hits = typesById.get(t) ?? []
      return hits.length === 1 ? docRoute(hits[0], t) : null
    }
  }, [allDocs])

  const openDoc = (d: AkgDoc) => {
    setParams((p) => {
      p.set('doc', `${d.type}/${d.id}`)
      return p
    })
  }
  const closeDoc = useCallback(() => {
    setParams((p) => {
      p.delete('doc')
      return p
    })
  }, [setParams])

  const filtered = q.trim() !== '' || typeSel.length > 0

  return (
    <>
      <Topbar title="AKG 문서">
        {akgUrl && akgToken && (
          <button type="button" className="btn" onClick={refresh} disabled={load.status === 'loading'}>
            새로 고침
          </button>
        )}
      </Topbar>

      {!akgUrl && (
        <div className="panel akg-state">
          <b>AKG 주소가 비어 있습니다</b>
          <span>설정에 AKG 주소를 넣으면 지식 허브 문서를 검색해서 볼 수 있습니다.</span>
          <Link className="btn primary" to="/settings">
            설정으로 가기
          </Link>
        </div>
      )}

      {akgUrl && load.status !== 'error' && (
        <div className="panel akg-bar">
          <input
            className="input"
            placeholder="제목 · id · 키워드 검색 (띄어쓰기로 낱말을 나누면 모두 포함하는 문서만)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="문서 검색"
          />
          {load.status === 'ok' && <span className="small muted akg-count">{filtered ? `${visible.length} / ${live.length} 건` : `${live.length} 건`}</span>}
          {types.length > 0 && (
            <div className="akg-chips" role="group" aria-label="타입 거르기">
              {types.map((t) => (
                <button key={t.id} type="button" className={'akg-chip' + (typeSel.includes(t.id) ? ' on' : '')} onClick={() => toggleType(t.id)} aria-pressed={typeSel.includes(t.id)}>
                  <i className="akg-dot" style={{ background: t.color || 'var(--muted)' }} />
                  {t.label}
                  <span className="n">{countByType.get(t.id) ?? 0}</span>
                </button>
              ))}
              {typeSel.length > 0 && (
                <button type="button" className="btn small ghost" onClick={() => setTypeSel([])}>
                  타입 모두 해제
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {akgUrl && load.status === 'loading' && <div className="panel empty">불러오는 중…</div>}

      {akgUrl && load.status === 'error' && <ErrorState error={load.error} akgUrl={akgUrl} onRetry={refresh} />}

      {akgUrl && load.status === 'ok' && visible.length === 0 && <div className="panel empty">{live.length === 0 ? 'AKG 에 문서가 0 건입니다' : '조건에 맞는 문서가 없습니다'}</div>}

      {akgUrl && load.status === 'ok' && visible.length > 0 && (
        <div className="akg-list">
          {visible.map((d) => (
            <DocRow key={`${d.type}/${d.id}`} doc={d} type={typeById.get(d.type)} onOpen={() => openDoc(d)} />
          ))}
        </div>
      )}

      {akgUrl && akgToken && opened && (
        <AkgDrawer akgUrl={akgUrl} token={akgToken} type={opened.type} id={opened.id} doc={openedDoc} typeInfo={typeById.get(opened.type)} wikiHref={wikiHref} onClose={closeDoc} />
      )}
    </>
  )
}

function DocRow({ doc, type, onOpen }: { doc: AkgDoc; type?: AkgType; onOpen: () => void }) {
  const idFirst = ID_FIRST.has(doc.type) && doc.title !== ''
  return (
    <button type="button" className="akg-row" onClick={onOpen}>
      <TypeBadge type={type} fallback={doc.type} />
      <span className="t" title={doc.title || doc.id}>
        {idFirst && <code>{doc.id}</code>}
        {doc.title || <code>{doc.id}</code>}
      </span>
      {doc.keywords.length > 0 && (
        <span className="kw">
          {doc.keywords.slice(0, KW_MAX).map((k) => (
            <span key={k} className="tag">
              {k}
            </span>
          ))}
          {doc.keywords.length > KW_MAX && <span className="tag">+{doc.keywords.length - KW_MAX}</span>}
        </span>
      )}
      <span className="m" title={doc.updatedAt}>
        {relTime(doc.updatedAt)}
      </span>
    </button>
  )
}

function docRoute(type: string, id: string): string {
  return `/akg?doc=${encodeURIComponent(type)}/${encodeURIComponent(id)}`
}

/** 설정으로 가는 링크와 AKG 토큰 발급 화면(새 탭) 링크 */
function TokenLinks({ akgUrl }: { akgUrl: string }) {
  return (
    <>
      <Link className="btn primary" to="/settings">
        설정으로 가기
      </Link>
      <a className="btn" href={akgTokenPage(akgUrl)} target="_blank" rel="noreferrer">
        AKG 토큰 발급 화면 ↗
      </a>
    </>
  )
}

function ErrorState({ error, akgUrl, onRetry }: { error: AkgError; akgUrl: string; onRetry: () => void }) {
  if (error.kind === 'no-token') {
    return (
      <div className="panel akg-state">
        <b>읽기 토큰이 없습니다</b>
        <span>AKG 화면에서 개인 읽기 토큰을 발급받아 설정의 "읽기 토큰" 칸에 붙여 넣으세요.</span>
        <div className="btn-row">
          <TokenLinks akgUrl={akgUrl} />
        </div>
      </div>
    )
  }
  if (error.kind === 'token') {
    return (
      <div className="panel akg-state">
        <b>읽기 토큰이 맞지 않거나 만료되었습니다</b>
        <span>AKG 에서 토큰을 새로 발급받아 설정에 다시 넣으세요. 토큰을 바꾼 뒤 이 화면으로 돌아오면 목록을 다시 불러옵니다.</span>
        <div className="btn-row">
          <TokenLinks akgUrl={akgUrl} />
        </div>
      </div>
    )
  }
  if (error.kind === 'unreachable') {
    return (
      <div className="panel akg-state">
        <b>AKG 에 닿지 않습니다</b>
        <code className="small">{akgUrl}</code>
        <span>AKG 가 켜져 있고 주소가 맞는지 확인하세요.</span>
        <span className="small muted">{error.message}</span>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={onRetry}>
            다시 시도
          </button>
          <Link className="btn" to="/settings">
            설정으로 가기
          </Link>
        </div>
      </div>
    )
  }
  return (
    <div className="panel akg-state">
      <b>AKG 가 오류를 돌려주었습니다</b>
      <span className="small muted">{error.message}</span>
      <button type="button" className="btn primary" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  )
}
