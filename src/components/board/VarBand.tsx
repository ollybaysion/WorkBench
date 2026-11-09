import { useEffect, useRef, useState } from 'react'

interface Props {
  names: string[]
  vars: Record<string, string>
  /** 300 ms 디바운스 뒤 호출 */
  onSave: (vars: Record<string, string>) => void
  /** 카드에서 눌러 넣은 변수(파랗게 보인다). 손으로 고치면 onTouch 로 알린다 */
  picked?: string[]
  onTouch?: (name: string) => void
}

/** 변수 띠 — 보드의 조회 카드 SQL 바인드를 알약 입력으로 보인다. 값은 board.vars 에 저장 */
export default function VarBand({ names, vars, onSave, picked = [], onTouch }: Props) {
  const [draft, setDraft] = useState(vars)
  // 밖(카드에서 눌러 넣기)에서 vars 가 바뀌면 바뀐 값만 입력칸에 옮긴다. 아직 저장하지 않은 손 입력은 남긴다
  const [prev, setPrev] = useState(vars)
  if (vars !== prev) {
    const changed = Object.keys(vars).filter((k) => vars[k] !== prev[k])
    setPrev(vars)
    if (changed.length) setDraft((d) => ({ ...d, ...Object.fromEntries(changed.map((k) => [k, vars[k]])) }))
  }
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
    onTouch?.(name)
    const next = { ...vars, ...draft, [name]: value }
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
          <label key={n} className={'vpill' + (v ? '' : ' empty') + (v && picked.includes(n) ? ' set' : '')} title={picked.includes(n) ? '카드에서 눌러 넣은 값' : undefined}>
            <span className="k">{n}</span>
            <input value={v} placeholder="비어 있음" style={{ width: `calc(${Math.max(7, v.length + 1)}ch + 12px)` }} onChange={(e) => change(n, e.target.value)} />
          </label>
        )
      })}
      {names.length === 0 && <span className="muted small">조회 카드에 바인드가 없습니다</span>}
    </div>
  )
}
