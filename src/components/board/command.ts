import { useStore } from '../../store'
import type { Command, EnvPreset } from '../../types'
import { extractVars, missingVars, render } from '../../lib/template'
import { copyText, now } from '../../lib/util'

export interface ResolvedVar {
  name: string
  value: string
  source: string
}

/** 명령 카드 변수 값의 출처: 환경 프리셋 > 변수 띠(board.vars) > Command 기본값 */
export function resolveCommandVars(cmd: Command, env: EnvPreset | undefined, boardVars: Record<string, string>): ResolvedVar[] {
  const names = new Set([...cmd.vars.map((v) => v.name), ...extractVars(cmd.template)])
  return [...names].map((name) => {
    if (env && env.vars[name] !== undefined) return { name, value: env.vars[name], source: `환경 프리셋 ${env.name}` }
    const band = boardVars[name]
    if (band) return { name, value: band, source: '변수 띠' }
    const def = cmd.vars.find((v) => v.name === name)?.default
    return { name, value: def ?? '', source: def ? '기본값' : '없음' }
  })
}

export function varsOf(list: ResolvedVar[]): Record<string, string> {
  return Object.fromEntries(list.map((v) => [v.name, v.value]))
}

/** Commands.tsx 와 같은 복사 규칙: 파괴 명령은 체크 모두 + confirm, usageCount 증가, 토스트 */
export async function copyCommand(cmd: Command, vars: Record<string, string>, allChecked: boolean): Promise<void> {
  const { showToast, upsertCommand } = useStore.getState()
  const output = render(cmd.template, vars)
  if (cmd.risk === 'destroy') {
    if (!allChecked) return showToast('실행 전 체크 항목을 모두 확인하세요')
    if (!window.confirm(`⚠ 파괴적 명령입니다. 정말 복사할까요?\n\n${output}`)) return
  }
  if (!(await copyText(output))) return showToast('복사에 실패했습니다')
  await upsertCommand({ ...cmd, usageCount: cmd.usageCount + 1, lastUsedAt: now() })
  const missing = missingVars(cmd.template, vars)
  showToast(missing.length ? `복사했습니다 (미입력 변수: ${missing.join(', ')})` : '명령을 복사했습니다')
}
