import { useStore } from '../store'
import type { Task, TaskStatus } from '../types'
import { addPeriod, now, todayStr, uid } from '../lib/util'

/** 업무 상태 변경. 반복 업무가 완료되면 다음 회차를 생성 */
export async function setTaskStatus(task: Task, status: TaskStatus): Promise<void> {
  const st = useStore.getState()
  if (task.status === status) return
  await st.upsertTask({ ...task, status, doneAt: status === 'done' ? now() : undefined })
  if (status === 'done' && task.repeat !== 'none') {
    const next = addPeriod(task.due ?? todayStr(), task.repeat)
    const t = now()
    await st.upsertTask({ ...task, id: uid(), status: 'todo', due: next, doneAt: undefined, createdAt: t, updatedAt: t })
    st.showToast(`반복 업무 다음 회차 생성: ${next}`)
  }
}

export function isOverdue(task: Task): boolean {
  return task.status !== 'done' && !!task.due && task.due < todayStr()
}

export const REPEAT_LABEL: Record<Task['repeat'], string> = { none: '반복 없음', daily: '매일', weekly: '매주', monthly: '매월' }
