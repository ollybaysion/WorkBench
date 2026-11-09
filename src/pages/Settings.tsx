import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { EnvPreset, ExportBundle, Settings } from '../types'
import { fmtDate, kvToText, parseKV, relTime, uid } from '../lib/util'
import { AKG_TOKEN_RE, akgTokenPage, checkAkg, normalizeAkgUrl } from '../lib/akg'
import type { AkgCheck } from '../lib/akg'
import Topbar from '../components/Topbar'
import { exportBackup } from '../components/backup'
import SettingsTabs from '../components/SettingsTabs'

export default function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const envs = useStore((s) => s.envs)
  const importBundle = useStore((s) => s.importBundle)
  const resetToSeed = useStore((s) => s.resetToSeed)
  const showToast = useStore((s) => s.showToast)
  const counts = {
    c: useStore((s) => s.commands.length),
    r: useStore((s) => s.runbooks.length),
    b: useStore((s) => s.boards.length),
  }
  const [name, setName] = useState(settings.userName)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const fileRef = useRef<HTMLInputElement>(null)

  const onImport = async (file: File) => {
    try {
      const b = JSON.parse(await file.text()) as ExportBundle
      if (mode === 'replace' && !window.confirm('현재 데이터를 모두 지우고 파일 내용으로 교체할까요?')) return
      await importBundle(b, mode)
      showToast(`가져오기 완료 (${mode === 'merge' ? '병합' : '교체'})`)
    } catch (e) {
      showToast(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const reset = async () => {
    if (!window.confirm('모든 데이터를 삭제하고 시드 데이터로 초기화할까요? 되돌릴 수 없습니다.')) return
    await resetToSeed()
    setName(useStore.getState().settings.userName)
    showToast('시드 데이터로 초기화했습니다')
  }

  return (
    <>
      <Topbar title="설정" />
      <SettingsTabs />
      <div className="grid g2">
        <div className="panel form-col">
          <h4>👤 사용자</h4>
          <label className="field">
            이름 (런북 실행자 · {'{{who}}'} 변수로 사용)
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void setSettings({ userName: name.trim() })} placeholder="홍길동" />
          </label>
          <label className="field">
            테마
            <select value={settings.theme} onChange={(e) => void setSettings({ theme: e.target.value as Settings['theme'] })}>
              <option value="system">시스템 설정 따름</option>
              <option value="light">라이트</option>
              <option value="dark">다크</option>
            </select>
          </label>
          <div>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void setSettings({ userName: name.trim() })
                showToast('저장했습니다')
              }}
            >
              저장
            </button>
          </div>
        </div>

        <div className="panel form-col">
          <h4>💾 백업 · 가져오기</h4>
          <div className="small muted">
            현재 데이터: 작업대 {counts.b} · 명령 {counts.c} · 런북 {counts.r}
            <br />
            마지막 백업: {settings.lastBackupAt ? `${fmtDate(settings.lastBackupAt)} (${relTime(settings.lastBackupAt)})` : '없음'}
          </div>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void exportBackup()}>
              JSON 내보내기
            </button>
          </div>
          <div className="btn-row">
            <select className="input" style={{ width: 'auto' }} value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}>
              <option value="merge">병합 (같은 ID는 덮어씀)</option>
              <option value="replace">교체 (기존 데이터 삭제)</option>
            </select>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              JSON 가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImport(f)
              }}
            />
          </div>
          <div className="note-box">
            <b>팀 공유 방법</b>
            <br />
            서버가 없으므로 데이터는 각자의 브라우저(IndexedDB)에만 저장됩니다. 팀과 공유하려면 <b>JSON 내보내기</b>로 받은 파일을 이 저장소의{' '}
            <code>data/</code> 폴더에 커밋하고, 팀원은 파일을 받아 <b>JSON 가져오기 (병합)</b>를 실행하세요. 변경 이력은 Git이 관리합니다.
          </div>
          <div className="note-box danger">
            <div className="btn-row">
              <span>모든 데이터를 지우고 기본 예시 데이터로 되돌립니다.</span>
              <button type="button" className="btn small danger" onClick={() => void reset()}>
                시드 데이터로 초기화
              </button>
            </div>
          </div>
        </div>
      </div>

      <AkgSettings />

      <div className="panel" style={{ marginTop: 14 }}>
        <h4>
          🌐 환경 프리셋
          <span className="small muted" style={{ fontWeight: 400 }}>
            명령·런북의 {'{{변수}}'}에 자동 주입됩니다. 한 줄에 <code>KEY=value</code>
          </span>
        </h4>
        <div className="grid g2">
          {envs.map((e) => (
            <EnvEditor key={e.id} env={e} active={settings.activeEnvId === e.id} />
          ))}
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => void useStore.getState().upsertEnv({ id: `env_${uid().slice(0, 8)}`, name: '새 환경', vars: {} })}
            >
              + 환경 추가
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

type Check = { busy: true } | ({ busy: false } & AkgCheck)

function AkgSettings() {
  const saved = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useStore((s) => s.showToast)
  const [url, setUrl] = useState(saved.akgUrl ?? '')
  const [token, setToken] = useState(saved.akgToken ?? '')
  const [reveal, setReveal] = useState(false)
  const [check, setCheck] = useState<Check | null>(null)

  const cleanUrl = normalizeAkgUrl(url)
  const cleanToken = token.trim()
  const badToken = cleanToken !== '' && !AKG_TOKEN_RE.test(cleanToken)

  const save = async () => {
    if (badToken) return showToast('토큰 꼴을 고친 뒤 저장하세요')
    setUrl(cleanUrl)
    setToken(cleanToken)
    await setSettings({ akgUrl: cleanUrl, akgToken: cleanToken })
    showToast('AKG 설정을 저장했습니다')
  }

  const verify = async () => {
    if (!cleanUrl) return setCheck({ busy: false, ok: false, msg: '주소를 먼저 넣으세요' })
    if (badToken) return setCheck({ busy: false, ok: false, msg: '토큰 꼴을 먼저 고치세요' })
    setCheck({ busy: true })
    setCheck({ busy: false, ...(await checkAkg(cleanUrl, cleanToken)) })
  }

  return (
    <div className="panel form-col" style={{ marginTop: 14 }}>
      <h4>
        📖 AKG 지식 허브
        <span className="small muted" style={{ fontWeight: 400 }}>
          AKG 문서를 검색해서 봅니다. 편집은 AKG 화면에서 합니다.
        </span>
      </h4>
      <label className="field">
        AKG 주소
        <input
          className="mono"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setCheck(null)
          }}
          placeholder="http://akg.fdc.localhost:8000"
          spellCheck={false}
        />
      </label>
      <div className="field">
        <label htmlFor="akg-token">읽기 토큰</label>
        <div className="akg-token">
          <input
            id="akg-token"
            className="input mono"
            type={reveal ? 'text' : 'password'}
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setCheck(null)
            }}
            placeholder="akgr_…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={badToken}
            aria-describedby="akg-token-help"
          />
          <button type="button" className="btn" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
            {reveal ? '가리기' : '보기'}
          </button>
          {cleanUrl ? (
            <a className="btn" href={akgTokenPage(cleanUrl)} target="_blank" rel="noreferrer">
              토큰 발급 화면 열기 ↗
            </a>
          ) : (
            <button type="button" className="btn" disabled title="AKG 주소를 먼저 넣으세요">
              토큰 발급 화면 열기 ↗
            </button>
          )}
        </div>
        <span id="akg-token-help" className={'small' + (badToken ? ' akg-check bad' : ' muted')}>
          {badToken ? '토큰 꼴이 맞지 않습니다. akgr_ 로 시작하는 48 자입니다.' : 'AKG 화면(로그인한 탭)에서 개인 읽기 토큰을 발급받아 붙여 넣으세요.'}
        </span>
      </div>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={() => void save()}>
          저장
        </button>
        <button type="button" className="btn" onClick={() => void verify()} disabled={check?.busy === true}>
          연결 확인
        </button>
        {check && (
          <span className={'small akg-check' + (check.busy ? ' muted' : check.ok ? ' ok' : ' bad')} role="status">
            {check.busy ? '확인하는 중…' : check.msg}
          </span>
        )}
      </div>
      <div className="note-box">
        토큰은 이 브라우저(IndexedDB)에만 둡니다. JSON 내보내기 · 가져오기는 토큰을 건너뜁니다. 토큰이 새면 AKG 발급 화면에서 폐기하세요.
      </div>
    </div>
  )
}

function EnvEditor({ env, active }: { env: EnvPreset; active: boolean }) {
  const upsertEnv = useStore((s) => s.upsertEnv)
  const deleteEnv = useStore((s) => s.deleteEnv)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useStore((s) => s.showToast)
  const [name, setName] = useState(env.name)
  const [text, setText] = useState(kvToText(env.vars))

  return (
    <div className="panel form-col" style={active ? { borderColor: 'var(--accent)' } : undefined}>
      <div className="btn-row">
        <input className="input" style={{ flex: 1, width: 'auto' }} value={name} onChange={(e) => setName(e.target.value)} />
        {active ? (
          <span className="pill blue">사용 중</span>
        ) : (
          <button type="button" className="btn small" onClick={() => void setSettings({ activeEnvId: env.id })}>
            사용
          </button>
        )}
      </div>
      <textarea className="input mono" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="btn-row">
        <button
          type="button"
          className="btn small primary"
          onClick={async () => {
            await upsertEnv({ ...env, name: name.trim() || env.name, vars: parseKV(text) })
            showToast('환경을 저장했습니다')
          }}
        >
          저장
        </button>
        <button
          type="button"
          className="btn small danger"
          onClick={() => {
            if (window.confirm(`"${env.name}" 환경을 삭제할까요?`)) void deleteEnv(env.id)
          }}
        >
          삭제
        </button>
      </div>
    </div>
  )
}
