import type { Board } from '../types.ts'

/** 작업판의 묶음 이름(TSUM · EVENT · INTERLOCK 같은 기능 묶음). 빈 값은 묶음 없음 */
export const groupOf = (b: Pick<Board, 'group'>) => b.group?.trim() ?? ''

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'ko')

/** 묶음별 작업판. 묶음 없는 작업판이 먼저, 그다음 묶음 이름 가나다순. 묶음 안은 제목 가나다순 */
export function groupBoards<T extends Board>(boards: T[]): { group: string; boards: T[] }[] {
  const by = new Map<string, T[]>()
  for (const b of boards) {
    const g = groupOf(b)
    by.set(g, [...(by.get(g) ?? []), b])
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'ko')))
    .map(([group, list]) => ({ group, boards: [...list].sort(byTitle) }))
}

/** 쓰고 있는 묶음 이름들(가나다순) */
export const groupNames = (boards: Board[]) => groupBoards(boards).map((g) => g.group).filter(Boolean)
