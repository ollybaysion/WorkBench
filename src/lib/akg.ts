// AKG(지식 허브) 읽기 클라이언트. 쓰기 API 는 부르지 않는다.
// 인증은 개인 읽기 토큰이 맡는다. 사람이 AKG 화면에서 토큰을 발급받아 설정에 붙여 넣는다.
// 요청마다 Authorization: Bearer akgr_… 를 싣고 쿠키는 싣지 않는다(credentials: 'omit').
// AKG 는 읽기 응답에 Access-Control-Allow-Origin: * 를 붙인다. 그래서 file:// (origin null) 에서도 읽힌다.

export interface AkgType {
  id: string
  label: string
  color: string
  kind?: string
  status?: string
}

export interface AkgDoc {
  type: string
  id: string
  status: string
  keywords: string[]
  title: string
  updatedAt: string
}

/** 문서 본문과 첨부 그림. AKG 화면은 assets 를 본문 아래 "그림" 절에 모두 보인다. */
export interface AkgDocBody {
  md: string
  assets: { sha256: string; alt: string }[]
}

/** 본문 md 끝에 "그림" 절을 붙인다. 첨부 그림이 없으면 본문 그대로. */
export function withAssetsSection(body: AkgDocBody): string {
  if (body.assets.length === 0) return body.md
  const pics = body.assets.map((a) => `![${a.alt.replace(/[[\]\n\r]/g, ' ').trim()}](asset:${a.sha256})`)
  return `${body.md.trimEnd()}\n\n## 그림\n\n${pics.join('\n\n')}\n`
}

/** AKG 가 주는 키워드 꼴: JSON 타입 문서는 {kw, inject}, 다른 문서는 문자열일 수 있다. */
type RawKeyword = string | { kw?: unknown }
type RawDoc = Omit<AkgDoc, 'keywords'> & { keywords?: RawKeyword[] }

function toDoc(d: RawDoc): AkgDoc {
  const keywords = (d.keywords ?? [])
    .map((k) => (typeof k === 'string' ? k : typeof k?.kw === 'string' ? k.kw : ''))
    .filter((k) => k !== '')
  return { ...d, keywords }
}

/**
 * no-token: 설정에 토큰이 없다
 * token: AKG 가 토큰을 받지 않았다(401 read_token_invalid: 틀림 · 만료 · 폐기)
 * unreachable: 네트워크 오류 · CORS 거부 · 서버 꺼짐
 * http: 그 밖의 HTTP 오류
 */
export type AkgErrorKind = 'no-token' | 'token' | 'unreachable' | 'http'

export class AkgError extends Error {
  kind: AkgErrorKind
  status?: number

  constructor(kind: AkgErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'AkgError'
    this.kind = kind
    this.status = status
  }
}

export function toAkgError(e: unknown): AkgError {
  if (e instanceof AkgError) return e
  return new AkgError('unreachable', e instanceof Error ? e.message : String(e))
}

/** 읽기 토큰의 꼴: akgr_ + base64url 43 자 */
export const AKG_TOKEN_RE = /^akgr_[A-Za-z0-9_-]{43}$/

/** 앞뒤 공백과 끝 슬래시를 떼어 저장용 주소로 만든다. */
export function normalizeAkgUrl(s: string): string {
  return s.trim().replace(/\/+$/, '')
}

/** AKG 화면에서 문서를 여는 주소. 새 탭으로 연다(새 탭에는 AKG 로그인 쿠키가 실린다). */
export function akgDocPage(baseUrl: string, type: string, id: string): string {
  return `${normalizeAkgUrl(baseUrl)}/#/doc/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
}

/** AKG 의 읽기 토큰 발급 화면 주소 */
export function akgTokenPage(baseUrl: string): string {
  return `${normalizeAkgUrl(baseUrl)}/#/read-tokens`
}

async function request(url: string, token: string | null, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {}
  if (token !== null) {
    if (!token) throw new AkgError('no-token', '읽기 토큰이 없습니다')
    headers.Authorization = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(url, { headers, credentials: 'omit', signal })
  } catch (e) {
    if (signal?.aborted) throw e
    // 네트워크 오류 · CORS 거부 · 서버 꺼짐은 모두 TypeError 로 온다
    throw new AkgError('unreachable', e instanceof Error ? e.message : String(e))
  }
  if (res.status === 401) throw new AkgError('token', '읽기 토큰이 맞지 않거나 만료되었습니다', 401)
  if (!res.ok) throw new AkgError('http', `HTTP ${res.status}`, res.status)
  return res
}

export interface AkgClient {
  types(): Promise<AkgType[]>
  docs(): Promise<AkgDoc[]>
  /** 문서 본문 마크다운 */
  /** 문서 상세(GET /api/docs/:type/:id): 본문 md 와 첨부 그림 목록 */
  doc(type: string, id: string, signal?: AbortSignal): Promise<AkgDocBody>
  /** 그림(asset:<sha256>)의 바이트 */
  asset(sha256: string, signal?: AbortSignal): Promise<Blob>
}

export function akgClient(baseUrl: string, token: string): AkgClient {
  const base = normalizeAkgUrl(baseUrl)
  const get = (path: string, signal?: AbortSignal) => request(`${base}${path}`, token.trim(), signal)
  return {
    types: async () => ((await (await get('/api/types')).json()) as { types: AkgType[] }).types,
    docs: async () => ((await (await get('/api/docs')).json()) as { docs: RawDoc[] }).docs.map(toDoc),
    doc: async (type, id, signal) => {
      const d = (await (await get(`/api/docs/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, signal)).json()) as { md?: unknown; assets?: unknown }
      const assets = Array.isArray(d.assets)
        ? d.assets.flatMap((a: { sha256?: unknown; alt?: unknown }) =>
            typeof a?.sha256 === 'string' ? [{ sha256: a.sha256, alt: typeof a.alt === 'string' ? a.alt : '' }] : [],
          )
        : []
      return { md: typeof d.md === 'string' ? d.md : '', assets }
    },
    asset: async (sha256, signal) => (await get(`/api/assets/${encodeURIComponent(sha256)}`, signal)).blob(),
  }
}

export type AkgCheck = { ok: boolean; msg: string }

/**
 * 설정 화면 "연결 확인".
 * 1) /api/config(인증 없이 열림)로 AKG 에 닿는지 본다. 2) 토큰으로 /api/types 를 불러 토큰이 맞는지 본다.
 */
export async function checkAkg(baseUrl: string, token: string): Promise<AkgCheck> {
  try {
    await request(`${normalizeAkgUrl(baseUrl)}/api/config`, null)
  } catch (e) {
    const err = toAkgError(e)
    if (err.kind === 'unreachable') return { ok: false, msg: `닿지 않음 · ${err.message}. 주소와 AKG 실행 상태를 확인하세요` }
    return { ok: false, msg: `닿지 않음 · ${err.message}` }
  }
  try {
    const types = await akgClient(baseUrl, token).types()
    return { ok: true, msg: `닿음 · 토큰 맞음 · 문서 타입 ${types.length} 개` }
  } catch (e) {
    const err = toAkgError(e)
    if (err.kind === 'no-token') return { ok: false, msg: '닿음 · 토큰을 넣으세요' }
    if (err.kind === 'token') return { ok: false, msg: '닿음 · 토큰이 맞지 않거나 만료되었습니다. AKG 에서 새로 발급하세요' }
    return { ok: false, msg: `닿음 · 토큰 확인 실패 (${err.message})` }
  }
}
