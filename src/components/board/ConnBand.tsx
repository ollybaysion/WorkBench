import { Link } from 'react-router-dom'
import type { Connection } from '../../types'
import { useStore } from '../../store'
import { connLabel, connOptions } from '../../lib/conn'

interface Props {
  conn?: Connection
  onPick: (connId: string) => void
}

/** 연결 띠: 작업판이 조회할 DB 하나를 고른다. 작업판의 조회 카드는 모두 이 연결로 조회한다 */
export default function ConnBand({ conn, onPick }: Props) {
  const connections = useStore((s) => s.connections)
  const envs = useStore((s) => s.envs)
  const opts = connOptions(connections, envs)
  return (
    <div className="vband cband">
      <span className="lbl">연결</span>
      <label className={'vpill' + (conn ? '' : ' empty')} title={conn?.alias ? `agent-db ${conn.alias} 로 조회` : '가짜 결과'}>
        {opts.length ? (
          <select value={conn?.id ?? ''} onChange={(e) => onPick(e.target.value)} aria-label="작업판 연결">
            {opts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || '(이름 없음)'} · {connLabel(c, envs)}
              </option>
            ))}
          </select>
        ) : (
          <span className="cb-none">연결 없음</span>
        )}
      </label>
      {!conn?.alias && (
        <Link className="pill amber fake" to="/settings/connections" title="alias 에 이름을 붙이면 연결 띠에서 고를 수 있습니다">
          가짜 결과로 조회 중 · DB 연결 설정 ›
        </Link>
      )}
    </div>
  )
}
