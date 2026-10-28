import { MARK_HOUSE, MARK_ROOF } from '../BrandMark'

/**
 * 폰 화면의 글리프 — 모두 인라인 SVG, currentColor 로 칠한다.
 * 장식이므로 전부 aria-hidden. 뜻은 감싼 버튼의 aria-label 이 전한다.
 */

const svg = { 'aria-hidden': true, focusable: false } as const

/** 안테나 — 네 칸 */
export function SignalGlyph() {
  return (
    <svg {...svg} width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
      <rect x="0" y="8.6" width="2.8" height="3.4" rx="0.8" />
      <rect x="4.4" y="6" width="2.8" height="6" rx="0.8" />
      <rect x="8.8" y="3.2" width="2.8" height="8.8" rx="0.8" />
      <rect x="13.2" y="0" width="2.8" height="12" rx="0.8" />
    </svg>
  )
}

/** 와이파이 — 연결이 끊기면 흐리게 두고 빗금을 긋는다 */
export function WifiGlyph({ off = false }: { off?: boolean }) {
  return (
    <svg {...svg} width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
      <g opacity={off ? 0.32 : 1}>
        <path d="M8 0C5 0 2.3 1.1.2 3a.6.6 0 0 0 0 .9l1 1c.2.2.6.2.8 0A8.6 8.6 0 0 1 8 2.6c2.3 0 4.4.8 6 2.3.2.2.6.2.8 0l1-1a.6.6 0 0 0 0-.9C13.7 1.1 11 0 8 0Z" />
        <path d="M8 4.4c-1.8 0-3.5.7-4.8 1.8a.6.6 0 0 0 0 .9l1 1c.2.2.6.2.8 0A4.3 4.3 0 0 1 8 7c1.1 0 2.2.4 3 1.1.2.2.6.2.8 0l1-1a.6.6 0 0 0 0-.9A7.3 7.3 0 0 0 8 4.4Z" />
        <path d="M8 8.8c-.7 0-1.3.2-1.8.6a.6.6 0 0 0 0 .9l1.4 1.4c.2.2.6.2.8 0l1.4-1.4a.6.6 0 0 0 0-.9c-.5-.4-1.1-.6-1.8-.6Z" />
      </g>
      {off && <path d="M2 11.4 14 .6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  )
}

/**
 * 배터리 — level 이 없으면(브라우저가 알려주지 않으면) 그림만 가득 채우고
 * 숫자는 달지 않는다. 충전 중이면 번개를 화면 바탕색으로 뚫는다.
 */
export function BatteryGlyph({ level, charging }: { level: number | null; charging: boolean }) {
  const fill = level === null ? 1 : Math.max(0.08, Math.min(1, level))
  return (
    <svg {...svg} width="25" height="12" viewBox="0 0 25 12" fill="none">
      <rect x="0.6" y="0.6" width="21" height="10.8" rx="3.2" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
      <rect x="22.7" y="3.9" width="1.7" height="4.2" rx="0.85" fill="currentColor" fillOpacity="0.5" />
      <rect x="2.2" y="2.2" width={17.8 * fill} height="7.6" rx="1.9" fill="currentColor" />
      {charging && (
        <path
          className="cs-phone__bolt"
          d="M12.2 1.4 7.9 6.7h3.1l-1 3.9 4.3-5.3h-3.1l1-3.9Z"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** 상담 프로필 — 집캐치 마크의 지붕과 몸채만 흰색으로. 바탕 원은 CSS 가 칠한다 */
export function AssistantGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg {...svg} width={size} height={size} viewBox="3 3 26 26" fill="#fff">
      <path d={MARK_ROOF} />
      <path d={MARK_HOUSE} fillRule="evenodd" />
    </svg>
  )
}

export function BackGlyph() {
  return (
    <svg {...svg} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

export function CloseGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg {...svg} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}

/** 보내기 — 위로 쏘아 올리는 화살 */
export function SendGlyph() {
  return (
    <svg {...svg} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  )
}

export function InfoGlyph() {
  return (
    <svg {...svg} width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.9" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
    </svg>
  )
}

/** 링크 버튼 끝의 화살 */
export function ArrowGlyph() {
  return (
    <svg {...svg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** 목록 줄 끝의 꺾쇠 */
export function ChevronGlyph() {
  return (
    <svg {...svg} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

/** 다시 보내기 — 한 바퀴 도는 화살 */
export function RetryGlyph() {
  return (
    <svg {...svg} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4.5V11h-6.5" />
    </svg>
  )
}

/** 실패 표시 — 둥근 느낌표 */
export function AlertGlyph() {
  return (
    <svg {...svg} width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 4.4v4.4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="1" fill="#fff" />
    </svg>
  )
}

/** 떠 있는 버튼의 말풍선 — 안에 점 세 개 */
export function ChatGlyph() {
  return (
    <svg {...svg} width="26" height="26" viewBox="0 0 26 26" fill="none">
      <path
        d="M13 3.2c5.7 0 10 3.9 10 8.9s-4.3 8.9-10 8.9c-1.2 0-2.4-.2-3.5-.5L4.6 22.6a.6.6 0 0 1-.8-.7l1.1-4.2A8.4 8.4 0 0 1 3 12.1c0-5 4.3-8.9 10-8.9Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.9" cy="12.2" r="1.35" fill="currentColor" />
      <circle cx="13" cy="12.2" r="1.35" fill="currentColor" />
      <circle cx="17.1" cy="12.2" r="1.35" fill="currentColor" />
    </svg>
  )
}
