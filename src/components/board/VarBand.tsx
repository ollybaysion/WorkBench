import { useEffect, useRef, useState } from 'react'

interface Props {
  names: string[]
  vars: Record<string, string>
  /** 300 ms 디바운스 뒤 호출 */
  onSave: (vars: Record<string, string>) => void
}

/** 변수 띠 — 보드의 조회 카드 SQL 바인드를 알약 입력으로 보인다. 값은 board.vars 에 저장 */
export default function VarBand({ names, vars, onSave }: Props) {
  const [draft, setDraft] = useState(vars)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<Record<string, string> | null>(null)
  const saveRef = useRef(onSave)
  useEffect(() => {
    saveRef.current = onSave
  }, [onSave])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
    if (pending.current) {
      saveRef.current(pending.current)
      pending.current = null
    }
  }
  // 내릴 때 아직 저장하지 않은 값을 저장
  useEffect(() => flush, [])

  const change = (name: string, value: string) => {
    const next = { ...draft, [name]: value }
    setDraft(next)
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 300)
  }

  return (
    <div className="vband">
      <span className="lbl">변수</span>
      {names.map((n) => {
        const v = draft[n] ?? ''
        return (
          <label key={n} className={'vpill' + (v ? '' : ' empty')}>
            <span className="k">{n}</span>
            <input value={v} placeholder="비어 있음" style={{ width: `calc(${Math.max(7, v.length + 1)}ch + 12px)` }} onChange={(e) => change(n, e.target.value)} />
          </label>
        )
      })}
      {names.length === 0 && <span className="muted small">조회 카드에 바인드가 없습니다</span>}
    </div>
  )
}
