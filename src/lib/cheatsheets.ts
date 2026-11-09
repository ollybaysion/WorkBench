import vim from './cheatsheets/vim.md?raw'
import grep from './cheatsheets/grep.md?raw'
import sed from './cheatsheets/sed.md?raw'
import awk from './cheatsheets/awk.md?raw'

/** 번들에 든 치트시트 한 장. 읽기 전용이다. */
export interface Cheatsheet {
  tool: string
  /** .md 첫 줄의 `# 제목`. 없으면 `<tool> 치트시트` */
  title: string
  /** 첫 줄 제목을 뺀 본문 */
  body: string
  /** 본문의 `## 절 제목` 목록. 목차에 쓴다 */
  sections: string[]
}

const sheet = (tool: string, md: string): Cheatsheet => {
  const h1 = /^# (.+)\n+/.exec(md)
  const body = h1 ? md.slice(h1[0].length) : md
  // 코드 블록 안의 `## …` 는 절 제목이 아니므로 블록을 먼저 지운다
  const sections = [...body.replace(/```[\s\S]*?```/g, '').matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  return { tool, title: h1?.[1].trim() ?? `${tool} 치트시트`, body, sections }
}

/** 사이드바 순서(이름 순) */
export const CHEATSHEETS: Cheatsheet[] = [sheet('awk', awk), sheet('grep', grep), sheet('sed', sed), sheet('vim', vim)]

export const DEFAULT_CHEATSHEET = 'vim'

export const findCheatsheet = (tool: string | undefined): Cheatsheet | undefined => CHEATSHEETS.find((c) => c.tool === tool)
