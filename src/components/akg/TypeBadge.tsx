import type { AkgType } from '../../lib/akg'

/** 타입 배지. AKG 가 준 color 로 글자색을 칠하고 배경은 같은 색을 옅게 섞는다. */
export default function TypeBadge({ type, fallback }: { type?: AkgType; fallback: string }) {
  const color = type?.color || 'var(--muted)'
  return (
    <span className="akg-type" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      {type?.label ?? fallback}
    </span>
  )
}
