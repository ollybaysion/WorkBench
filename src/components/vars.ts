import type { Command, EnvPreset, RunStatus } from '../types'
import { extractVars } from '../lib/template'

/** 명령 변수 초기값: 환경 프리셋 값 우선, 없으면 명령 기본값 */
export function initialCommandVars(cmd: Command, env?: EnvPreset): Record<string, string> {
  const out: Record<string, string> = {}
  const names = new Set([...cmd.vars.map((v) => v.name), ...extractVars(cmd.template)])
  for (const name of names) {
    const def = cmd.vars.find((v) => v.name === name)?.default
    out[name] = env?.vars[name] ?? def ?? ''
  }
  return out
}

export const RISK_LABEL: Record<Command['risk'], string> = { read: '읽기', change: '변경', destroy: '파괴' }
export const RISK_PILL: Record<Command['risk'], string> = { read: 'green', change: 'amber', destroy: 'red' }

export const RUN_STATUS_LABEL: Record<RunStatus, string> = { in_progress: '진행 중', done: '완료', aborted: '중단' }
export const RUN_STATUS_PILL: Record<RunStatus, string> = { in_progress: 'blue', done: 'green', aborted: 'gray' }
