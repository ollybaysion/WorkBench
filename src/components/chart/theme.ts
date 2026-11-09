import { useEffect, useState } from 'react'

/** 테마(시스템 · 라이트 · 다크)가 바뀔 때마다 오르는 번호. 캔버스 그래프가 색을 다시 읽는다 */
export function useThemeVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const bump = () => setV((x) => x + 1)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', bump)
    const mo = new MutationObserver(bump)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', bump)
      mo.disconnect()
    }
  }, [])
  return v
}

/** index.css 의 색 토큰 값(캔버스는 var() 를 못 쓴다) */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** 범주 색. SVG 는 var() 를 그대로 쓴다 */
export const seriesVar = (slot: number) => `var(--series-${(slot % 8) + 1})`
