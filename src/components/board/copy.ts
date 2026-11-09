import type { Cell, QueryResult } from '../../types'
import { copyText } from '../../lib/util'
import { useStore } from '../../store'

/** 끌어서 글자를 고르는 중이면 복사하지 않는다(고른 글자를 직접 복사하게 둔다) */
const selecting = () => (window.getSelection()?.toString() ?? '') !== ''

const cellText = (v: Cell) => (v === null ? '' : String(v))

/** 복사하고 토스트로 알린다. what 은 "값" · "열 이름" · "행" 처럼 무엇을 복사했는지 */
export async function copyWithToast(text: string, what: string): Promise<void> {
  const { showToast } = useStore.getState()
  if (!(await copyText(text))) return showToast('복사에 실패했습니다')
  const shown = text.length > 40 ? `${text.slice(0, 40)}…` : text
  showToast(text.includes('\n') ? `${what}을 복사했습니다` : `${what} 복사: ${shown || '(빈 값)'}`)
}

/** 표 · 행 카드의 칸 클릭: 카드를 여는 클릭으로 번지지 않게 막고 복사한다 */
export function copyOnClick(text: string, what: string) {
  return (e: { stopPropagation: () => void }) => {
    if (selecting()) return
    e.stopPropagation()
    void copyWithToast(text, what)
  }
}

/** 한 행: 열 이름 [탭] 값, 한 줄에 열 하나 */
export const rowText = (result: QueryResult, row: Cell[]) => result.columns.map((c, i) => `${c.name}\t${cellText(row[i])}`).join('\n')

/** 결과 전체: 머리 행 + 행들, 탭으로 나눈다(엑셀에 바로 붙는다) */
export const resultTsv = (result: QueryResult) =>
  [result.columns.map((c) => c.name), ...result.rows.map((r) => r.map((v) => cellText(v).replace(/[\t\n]/g, ' ')))].map((r) => r.join('\t')).join('\n')

export { cellText }
