import { useId } from 'react'

/**
 * 집캐치 마크 — 지붕 하나, 문 하나.
 *
 * 집은 두 획으로만 선다. 45° 로 꺾인 지붕(ㅅ)과, 그 아래 문이 뚫린 몸채.
 * 둘 사이를 비워 둔 틈이 이 마크의 서명이다 — 지붕이 집을 덮어 '잡는다(catch)'.
 * 열린 문은 "내 첫 집의 문"이다. 16px 탭 아이콘에서도 지붕과 문이 남도록
 * 획을 굵게, 요소를 셋으로 줄였다.
 *
 * 작도 — 32 격자, 모든 치수가 0.25 단위에 떨어진다.
 *   지붕  꼭짓점 (16, 4.5), 처마 끝 x 4.5 · 27.5, 세로 두께 5.5
 *   틈    세로 2.5 (지붕 두께의 절반에 가깝게 — 16px 에서 1px 남짓)
 *   몸채  벽 x 8.5 · 23.5, 어깨 y 20, 바닥 y 27.5
 *   문    폭 5.5(= 지붕 세로 두께), 위 y 19 의 반원 아치
 *   외곽  23 × 23 정사각에 들어가 타일 한가운데 놓인다
 *
 * 타일은 #FF8E45 → #C2410C(--accent) 주황 그레이디언트, 기호는 흰색.
 * 단색이 필요하면 variant="symbol" — 기호만 currentColor 로 칠한다.
 *
 * 같은 모양이 app/icon.svg · scripts/og/render-og.mjs(탭 아이콘·애플 아이콘·
 * 링크 미리보기)에도 있다. 모양을 바꾸면 세 곳을 함께 바꾸고 스크립트를 다시 돌린다.
 */

/** 타일 — 모서리를 원호보다 조금 더 각지게 당긴 둥근 사각(연속 곡률에 가깝게) */
export const MARK_TILE =
  'M7.5 0h17C30.5 0 32 1.5 32 7.5v17c0 6-1.5 7.5-7.5 7.5h-17C1.5 32 0 30.5 0 24.5v-17C0 1.5 1.5 0 7.5 0Z'
/** 지붕 — 45° 꺾쇠. 처마 끝은 경사에 직각으로 자른다 */
export const MARK_ROOF = 'M16 4.5 27.5 16l-2.75 2.75L16 10l-8.75 8.75L4.5 16Z'
/** 몸채 바깥선 */
export const MARK_BODY = 'M16 12.5 23.5 20v7.5h-15V20Z'
/** 문 — 몸채에서 뚫어 낸다(evenodd) */
export const MARK_DOOR = 'M13.25 27.5v-5.75a2.75 2.75 0 0 1 5.5 0v5.75Z'
/** 문이 뚫린 몸채 한 덩어리 — fill-rule="evenodd" 로 칠한다 */
export const MARK_HOUSE = MARK_BODY + MARK_DOOR

type Props = {
  size?: number
  className?: string
  /** tile: 주황 타일 위 흰 기호(기본) · symbol: 기호만, currentColor */
  variant?: 'tile' | 'symbol'
}

export default function BrandMark({ size = 32, className, variant = 'tile' }: Props) {
  const id = useId().replace(/:/g, '')
  const cls = ['zc-mark', `zc-mark--${variant}`, className].filter(Boolean).join(' ')

  if (variant === 'symbol') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" className={cls} fill="currentColor" aria-hidden="true" focusable="false">
        <path className="zc-mark__roof" d={MARK_ROOF} />
        <path className="zc-mark__body" d={MARK_HOUSE} fillRule="evenodd" />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cls} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8E45" />
          <stop offset="0.55" stopColor="#E35A1C" />
          <stop offset="1" stopColor="#C2410C" />
        </linearGradient>
      </defs>
      <path d={MARK_TILE} fill={`url(#${id}g)`} />
      {/* 문 안의 불빛 — 평소엔 꺼져 있다. 머리글에 손을 올리거나 첫 화면을 기다릴 때만 켜진다(consumer-brand.css) */}
      <path className="zc-mark__light" d={MARK_DOOR} fill="#FFD9B8" opacity="0" />
      <path className="zc-mark__roof" d={MARK_ROOF} fill="#fff" />
      <path className="zc-mark__body" d={MARK_HOUSE} fill="#fff" fillRule="evenodd" />
    </svg>
  )
}
