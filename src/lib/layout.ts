import type { BoardCell } from '../types'

/** 작업판 격자: 4 열, 칸 높이 1~2 */
export const COLS = 4
export const MAX_H = 2

const hit = (a: BoardCell, b: BoardCell) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const byPos = (a: BoardCell, b: BoardCell) => a.y - b.y || a.x - b.x

export const sameCell = (a: BoardCell, b: BoardCell) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** 옮길 때: 폭 1~4, 높이 1~2, x+w ≤ 4, y ≥ 0. 폭이 넘치면 x 를 왼쪽으로 당긴다 */
export function clampMove(c: BoardCell): BoardCell {
  const w = Math.min(COLS, Math.max(1, c.w))
  const h = Math.min(MAX_H, Math.max(1, c.h))
  return { ...c, w, h, x: Math.min(COLS - w, Math.max(0, c.x)), y: Math.max(0, c.y) }
}

/** 크기를 바꿀 때: 왼쪽 위 모서리는 그대로 두고 폭을 오른쪽 끝까지로 막는다 */
export function clampResize(c: BoardCell): BoardCell {
  return { ...c, w: Math.min(COLS - c.x, Math.max(1, c.w)), h: Math.min(MAX_H, Math.max(1, c.h)) }
}

/** 빈 자리를 위로 붙인다. 위 → 아래, 왼 → 오 순서로 하나씩 같은 열에서 가장 위 빈 자리에 놓는다 */
export function compact(cells: BoardCell[]): BoardCell[] {
  const out: BoardCell[] = []
  for (const c of [...cells].sort(byPos)) {
    const cand = { ...c, y: 0 }
    while (out.some((o) => hit(o, cand))) cand.y++
    out.push(cand)
  }
  return out
}

/** 칸 하나를 target 자리에 놓는다. 겹치는 다른 칸은 아래로 비켜나고, 끝에 빈 자리를 위로 붙인다 */
export function place(cells: BoardCell[], target: BoardCell): BoardCell[] {
  const out: BoardCell[] = [target]
  for (const c of cells.filter((x) => x.cardId !== target.cardId).sort(byPos)) {
    const cand = { ...c, y: 0 }
    while (out.some((o) => hit(o, cand))) cand.y++
    out.push(cand)
  }
  return compact(out)
}

/** 맨 아래에 칸을 하나 더한다 */
export function append(cells: BoardCell[], cell: BoardCell): BoardCell[] {
  const bottom = Math.max(0, ...cells.map((c) => c.y + c.h))
  return compact([...cells, clampMove({ ...cell, y: bottom })])
}
