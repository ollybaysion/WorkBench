import type { Board } from '../../types'
import { groupBoards } from '../../lib/boardGroup'

/** 작업판 선택 상자의 항목. 묶음이 있으면 묶음마다 optgroup 으로 나눈다 */
export default function BoardOptions({ boards }: { boards: Board[] }) {
  return (
    <>
      {groupBoards(boards).map(({ group, boards: list }) => {
        const opts = list.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
          </option>
        ))
        return group ? (
          <optgroup key={group} label={group}>
            {opts}
          </optgroup>
        ) : (
          opts
        )
      })}
    </>
  )
}
