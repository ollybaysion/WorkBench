import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Note } from '../types'
import { download, now, parseTags, relTime, todayStr, uid } from '../lib/util'
import Topbar from '../components/Topbar'
import Markdown from '../components/Markdown'

const TEMPLATES: { name: string; title: string; folder: string; tags: string[]; content: string }[] = [
  { name: '빈 노트', title: '새 노트', folder: '기타', tags: [], content: '' },
  {
    name: '장애 보고서',
    title: `${todayStr()} 장애 보고: `,
    folder: '장애 보고',
    tags: ['장애'],
    content: `# 장애 보고: (서비스명) (SEV-?)

- **영향 시간**:
- **영향 범위**:
- **원인(Root cause)**:
- **조치**:
- **재발 방지**:

## 타임라인
- HH:MM 알람 수신
- HH:MM 원인 식별
- HH:MM 복구 확인
`,
  },
  {
    name: '온보딩 가이드',
    title: '온보딩 가이드: ',
    folder: '온보딩',
    tags: ['온보딩'],
    content: `# 온보딩 가이드

## 첫날
- [ ] 계정 발급 (메일, 슬랙, Git)
- [ ] 개발환경 세팅 — [[신규 입사자 개발환경 세팅]]

## 첫 주
- [ ] 서비스 아키텍처 리뷰
- [ ] 첫 PR 머지

## 참고 문서
- [[Git 브랜치 전략]]
`,
  },
  {
    name: '서버 셋업 기록',
    title: '서버 셋업 기록: ',
    folder: '서버 셋업',
    tags: ['server'],
    content: `# 서버 셋업 기록

| 항목 | 값 |
|---|---|
| 호스트명 | |
| IP | |
| OS | Ubuntu 24.04 LTS |
| 역할 | |
| 담당자 | |
| 셋업 일자 | ${todayStr()} |

## 수행 내역
- [ ] 초기 설정 — [[신규 Linux 서버 초기 설정 체크리스트]]
- [ ] Docker 설치 — [[Docker & Docker Compose 설치]]
- [ ] Nginx / TLS — [[Nginx 리버스 프록시 + Let's Encrypt (certbot)]]

## 특이사항
`,
  },
]

interface Draft {
  title: string
  folder: string
  tags: string
  content: string
}

export default function Notes() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notes = useStore((s) => s.notes)
  const upsertNote = useStore((s) => s.upsertNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const showToast = useStore((s) => s.showToast)

  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tplOpen, setTplOpen] = useState(false)

  const current = notes.find((n) => n.id === id)
  const editing = draft !== null && editingId === (id ?? null)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes.filter(
      (n) =>
        (!tag || n.tags.includes(tag)) &&
        (!s || n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s) || n.tags.some((t) => t.toLowerCase().includes(s))),
    )
  }, [notes, q, tag])

  const folders = useMemo(() => {
    const map = new Map<string, Note[]>()
    for (const n of filtered) {
      const f = n.folder || '기타'
      map.set(f, [...(map.get(f) ?? []), n])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [filtered])

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes])
  const backlinks = current ? notes.filter((n) => n.id !== current.id && n.content.includes(`[[${current.title}]]`)) : []

  const startEdit = (n: Note) => {
    setEditingId(n.id)
    setDraft({ title: n.title, folder: n.folder, tags: n.tags.join(', '), content: n.content })
  }

  const createFrom = async (tpl: (typeof TEMPLATES)[number]) => {
    const t = now()
    const n: Note = { id: uid(), createdAt: t, updatedAt: t, tags: tpl.tags, title: tpl.title, folder: tpl.folder, content: tpl.content }
    await upsertNote(n)
    setTplOpen(false)
    navigate(`/notes/${n.id}`)
    startEdit(n)
  }

  const save = async () => {
    if (!current || !draft) return
    if (!draft.title.trim()) return showToast('제목을 입력하세요')
    await upsertNote({ ...current, title: draft.title.trim(), folder: draft.folder.trim() || '기타', tags: parseTags(draft.tags), content: draft.content })
    setDraft(null)
    setEditingId(null)
    showToast('저장했습니다')
  }

  const remove = async () => {
    if (!current || !window.confirm(`"${current.title}" 노트를 삭제할까요?`)) return
    await deleteNote(current.id)
    navigate('/notes')
    showToast('삭제했습니다')
  }

  const exportMd = () => {
    if (!current) return
    const safe = current.title.replace(/[\\/:*?"<>|]/g, '_')
    download(`${safe}.md`, `# ${current.title}\n\n${current.content}`, 'text/markdown')
  }

  return (
    <>
      <Topbar title="지식 베이스" search="전문 검색">
        <div style={{ position: 'relative' }}>
          <button type="button" className="btn primary" onClick={() => setTplOpen((v) => !v)}>
            + 새 노트
          </button>
          {tplOpen && (
            <div className="panel" style={{ position: 'absolute', right: 0, top: 36, zIndex: 20, minWidth: 180, padding: 6, boxShadow: 'var(--shadow)' }}>
              {TEMPLATES.map((t) => (
                <button key={t.name} type="button" className="nav-item" onClick={() => void createFrom(t)}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Topbar>

      <div className="split">
        <div className="panel tree">
          <input className="input" placeholder="제목·내용 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
          {folders.length === 0 && <div className="empty">노트가 없습니다</div>}
          {folders.map(([folder, list]) => (
            <div key={folder}>
              <div className="d">📁 {folder}</div>
              {list.map((n) => (
                <div key={n.id} className={'f' + (n.id === id ? ' on' : '')} title={n.title} onClick={() => navigate(`/notes/${n.id}`)}>
                  {n.title}
                </div>
              ))}
            </div>
          ))}
          <div className="d">🏷 태그</div>
          <div style={{ padding: '4px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {allTags.map((t) => (
              <span
                key={t}
                className="tag"
                style={{ cursor: 'pointer', ...(tag === t ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : {}) }}
                onClick={() => setTag(tag === t ? null : t)}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="panel">
          {!current && <div className="empty">왼쪽에서 노트를 선택하거나 새 노트를 만드세요</div>}
          {current && editing && draft && (
            <div className="form-col">
              <label className="field">
                제목
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="field">
                  폴더
                  <input value={draft.folder} list="note-folders" onChange={(e) => setDraft({ ...draft, folder: e.target.value })} />
                  <datalist id="note-folders">
                    {[...new Set(notes.map((n) => n.folder))].map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  태그 (쉼표/공백 구분)
                  <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span>
                  내용 (Markdown) <span>[[노트 제목]]으로 링크</span>
                </span>
                <textarea className="mono" rows={22} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
              </label>
              <div className="btn-row">
                <button type="button" className="btn primary" onClick={() => void save()}>
                  저장
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setDraft(null)
                    setEditingId(null)
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
          {current && !editing && (
            <>
              <h3 style={{ marginBottom: 6 }}>{current.title}</h3>
              <div className="btn-row small muted" style={{ marginBottom: 10 }}>
                <span className="tag">📁 {current.folder}</span>
                {current.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
                <span>· 수정 {relTime(current.updatedAt)}</span>
                {backlinks.length > 0 && <span>· 백링크 {backlinks.length}</span>}
                <span style={{ marginLeft: 'auto' }} className="btn-row">
                  <button type="button" className="btn small" onClick={() => startEdit(current)}>
                    편집
                  </button>
                  <button type="button" className="btn small" onClick={exportMd}>
                    .md 내보내기
                  </button>
                  <button type="button" className="btn small danger" onClick={() => void remove()}>
                    삭제
                  </button>
                </span>
              </div>
              {current.content.trim() ? <Markdown content={current.content} /> : <div className="empty">내용이 없습니다. 편집을 눌러 작성하세요.</div>}
              {backlinks.length > 0 && (
                <div className="note-box">
                  이 노트를 참조하는 노트:{' '}
                  {backlinks.map((b, i) => (
                    <span key={b.id}>
                      {i > 0 && ', '}
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          navigate(`/notes/${b.id}`)
                        }}
                      >
                        {b.title}
                      </a>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
