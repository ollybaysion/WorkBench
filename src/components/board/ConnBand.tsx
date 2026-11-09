import { Link } from 'react-router-dom'
import type { Connection } from '../../types'
import { useStore } from '../../store'
import { connLabel, connsNamed } from '../../lib/conn'

interface Props {
  names: string[]
  connOf: (name: string) => Connection | undefined
  onPick: (name: string, connId: string) => void
}

/** 연결 띠: 조회 카드가 쓰는 연결 이름마다 실제 연결(환경)을 고른다. 이름마다 따로 바뀐다 */
export default function ConnBand({ names, connOf, onPick }: Props) {
  const connections = useStore((s) => s.connections)
  const envs = useStore((s) => s.envs)
  if (names.length === 0) return null
  return (
    <div className="vband cband">
      <span className="lbl">연결</span>
      {names.map((name) => {
        const cur = connOf(name)
        const opts = connsNamed(name, connections, envs)
        return (
          <label key={name} className={'vpill' + (cur ? '' : ' empty')} title={cur?.alias ? `agent-db ${cur.alias} 로 조회` : '가짜 결과'}>
            <span className="k">⛁ {name || '(이름 없음)'}</span>
            {opts.length ? (
              <select value={cur?.id ?? ''} onChange={(e) => onPick(name, e.target.value)} aria-label={`${name} 연결`}>
                {opts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {connLabel(c, envs)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="cb-none">연결 없음</span>
            )}
          </label>
        )
      })}
      {names.some((n) => !connOf(n)?.alias) && (
        <Link className="pill amber fake" to="/settings/connections" title="연결에 agent-db alias 를 고르면 Oracle 에서 조회합니다">
          가짜 결과 쓰는 연결 있음 · DB 연결 설정 ›
        </Link>
      )}
    </div>
  )
}
