import { useId } from 'react'

/**
 * 집캐치 마크 — 지도 위에 내려앉은 핀과, 핀이 닿은 자리의 고리.
 *
 * "지도에서 내 집 자리를 잡는다"를 한 번에 읽히게 한다. 집 모양은 쓰지 않는다 —
 * 부동산 서비스마다 같은 지붕을 달고 있어 어느 서비스인지 남지 않는다.
 *
 * 같은 모양이 app/icon.svg · scripts/og/render-og.mjs(앱 아이콘·미리보기)에도
 * 그려져 있다. 모양을 바꾸면 세 곳을 함께 바꾼다.
 */
export const MARK_PIN =
  'M16 5.2c-4.2 0-7.5 3.2-7.5 7.3 0 5.2 6 11 6.9 11.8.35.32.85.32 1.2 0 .9-.8 6.9-6.6 6.9-11.8 0-4.1-3.3-7.3-7.5-7.3Z'

export default function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF9248" />
          <stop offset="1" stopColor="#C2410C" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}g)`} />
      <rect width="32" height="32" rx="9" fill={`url(#${id}h)`} />
      <ellipse cx="16" cy="25.2" rx="8.2" ry="2.3" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.5" />
      <path d={MARK_PIN} fill="#fff" />
      <circle cx="16" cy="12.5" r="2.9" fill="#C2410C" />
    </svg>
  )
}
