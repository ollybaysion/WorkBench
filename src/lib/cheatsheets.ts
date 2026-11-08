import type { Note } from '../types'
import vim from './cheatsheets/vim.md?raw'
import grep from './cheatsheets/grep.md?raw'
import sed from './cheatsheets/sed.md?raw'
import awk from './cheatsheets/awk.md?raw'

export const CHEATSHEET_FOLDER = '치트시트'

const t = '2026-11-08T00:00:00.000Z'

/** .md 첫 줄의 `# 제목` 은 노트 제목이 대신한다. */
const sheet = (tool: string, md: string): Note => ({
  id: `note_cs_${tool}`,
  createdAt: t,
  updatedAt: t,
  tags: ['cheatsheet', 'linux', tool],
  title: `${tool} 치트시트`,
  folder: CHEATSHEET_FOLDER,
  content: md.replace(/^# .*\n+/, ''),
})

export const cheatsheetNotes: Note[] = [sheet('vim', vim), sheet('grep', grep), sheet('sed', sed), sheet('awk', awk)]
