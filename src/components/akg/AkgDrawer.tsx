import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { defaultUrlTransform } from 'react-markdown'
import { useStore } from '../../store'
import { akgClient, akgDocPage, toAkgError, withAssetsSection } from '../../lib/akg'
import type { AkgDoc, AkgError, AkgType } from '../../lib/akg'
import { relTime } from '../../lib/util'
import Markdown from '../Markdown'
import TypeBadge from './TypeBadge'

interface Props {
  akgUrl: string
  token: string
  type: string
  id: string
  /** 목록에 있는 문서면 제목 · 수정 시각을 머리에 보인다 */
  doc?: AkgDoc
  typeInfo?: AkgType
  wikiHref: (target: string) => string | null
  onClose: () => void
}

type Body = { key: string; md: string } | { key: string; error: AkgError }

/** 스킬 문서 앞의 YAML 머리말(--- … ---)을 yaml 코드 블록으로 바꿔 그대로 읽히게 한다. */
function frontmatterAsCode(md: string): string {
  return md.replace(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/, (_m, yaml: string) => '```yaml\n' + yaml + '\n```\n')
}

/** 오른쪽 서랍. AKG 문서 본문(마크다운)을 읽기 전용으로 그린다. */
export default function AkgDrawer({ akgUrl, token, type, id, doc, typeInfo, wikiHref, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const key = `${type}/${id}`
  const [body, setBody] = useState<Body | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const ctrl = new AbortController()
    akgClient(akgUrl, token)
      .doc(type, id, ctrl.signal)
      .then((d) => setBody({ key, md: withAssetsSection(d) }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setBody({ key, error: toAkgError(e) })
      })
    return () => ctrl.abort()
  }, [akgUrl, token, type, id, key, tick])

  // 문서가 바뀌면 이전 본문은 버리고 "불러오는 중"을 보인다
  const cur = body?.key === key ? body : null
  const heading = doc?.title || id

  return (
    <div className="akg-drawer-bg" onMouseDown={onClose}>
      <aside className="akg-drawer" role="dialog" aria-label={heading} onMouseDown={(e) => e.stopPropagation()}>
        <div className="akg-drawer-h">
          <div className="row">
            <TypeBadge type={typeInfo} fallback={type} />
            <span className="title" title={heading}>
              {heading}
            </span>
            <a className="btn small" href={akgDocPage(akgUrl, type, id)} target="_blank" rel="noreferrer" title="새 탭에서 AKG 화면으로 엽니다">
              AKG 에서 열기 ↗
            </a>
            <button ref={closeRef} type="button" className="btn small ghost" onClick={onClose} title="닫기 (Esc)" aria-label="닫기">
              ×
            </button>
          </div>
          <div className="meta small muted">
            <code>{id}</code>
            {doc?.updatedAt && <span title={doc.updatedAt}>수정 {relTime(doc.updatedAt)}</span>}
          </div>
        </div>
        <div className="akg-drawer-b" key={key}>
          {!cur && <div className="empty">불러오는 중…</div>}
          {cur && 'md' in cur && (cur.md.trim() ? <Markdown content={frontmatterAsCode(cur.md)} wikiHref={wikiHref} img={AkgImage} /> : <div className="empty">본문이 비어 있습니다</div>)}
          {cur && 'error' in cur && (
            <BodyError
              error={cur.error}
              onRetry={() => {
                setBody(null)
                setTick((t) => t + 1)
              }}
            />
          )}
        </div>
      </aside>
    </div>
  )
}

function BodyError({ error, onRetry }: { error: AkgError; onRetry: () => void }) {
  const msg =
    error.kind === 'token' || error.kind === 'no-token'
      ? '읽기 토큰이 맞지 않거나 만료되었습니다. 설정에서 토큰을 바꾸세요.'
      : error.status === 404
        ? '문서를 찾지 못했습니다. AKG 에서 지워졌거나 id 가 바뀌었을 수 있습니다.'
        : error.kind === 'unreachable'
          ? `AKG 에 닿지 않습니다 (${error.message})`
          : `AKG 가 오류를 돌려주었습니다 (${error.message})`
  return (
    <div className="akg-state">
      <span>{msg}</span>
      <div className="btn-row">
        {error.kind === 'token' || error.kind === 'no-token' ? (
          <Link className="btn primary" to="/settings">
            설정으로 가기
          </Link>
        ) : (
          <button type="button" className="btn primary" onClick={onRetry}>
            다시 시도
          </button>
        )}
      </div>
    </div>
  )
}

const ASSET_RE = /^asset:([0-9a-f]{64})$/

type Pic = { sha: string; url: string } | { sha: string; failed: true }

/**
 * 마크다운 그림. asset:<sha256> 이면 토큰으로 /api/assets/<sha256> 를 받아 blob URL 로 그린다.
 * 그림이 사라지면(서랍 닫힘 · 문서 바뀜) blob URL 을 놓아준다.
 */
function AkgImage({ src, alt }: { src?: string; alt?: string }) {
  const akgUrl = useStore((s) => s.settings.akgUrl) ?? ''
  const token = useStore((s) => s.settings.akgToken) ?? ''
  const sha = ASSET_RE.exec(src ?? '')?.[1] ?? null
  const [pic, setPic] = useState<Pic | null>(null)

  useEffect(() => {
    if (!sha) return
    const ctrl = new AbortController()
    let url: string | null = null
    akgClient(akgUrl, token)
      .asset(sha, ctrl.signal)
      .then((blob) => {
        if (ctrl.signal.aborted) return
        url = URL.createObjectURL(blob)
        setPic({ sha, url })
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setPic({ sha, failed: true })
      })
    return () => {
      ctrl.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [akgUrl, token, sha])

  if (!sha) {
    // AKG 는 그림을 asset: 으로만 둔다. 다른 주소는 마크다운 기본 규칙으로 거른다.
    const safe = defaultUrlTransform(src ?? '')
    return safe ? <img src={safe} alt={alt ?? ''} /> : <span className="akg-pic-note">{alt}</span>
  }
  const cur = pic?.sha === sha ? pic : null
  if (cur && 'url' in cur) return <img src={cur.url} alt={alt ?? ''} />
  return <span className="akg-pic-note">{cur ? `그림을 받지 못했습니다${alt ? ` · ${alt}` : ''}` : '그림 받는 중…'}</span>
}
