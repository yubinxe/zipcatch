'use client'

import { caseLabel, liveLabel } from '@/lib/consumer/data-mode'
import type { VerifiedSource } from '@/lib/consumer/complex-visualization'

/**
 * 자료 상태 표 — 실시간 공고(LIVE)와 원문 검증 사례(VERIFIED_CASE)를 한눈에 가른다.
 * 사례는 날짜가 지나면 '지난 사례'로 바뀐다(지금 신청할 수 있는 것처럼 보이지 않게).
 */
export default function DataBadge({
  live,
  src,
  compact = false,
}: {
  live?: { source: string | null; collectedAt: string | null } | null
  src?: VerifiedSource | null
  compact?: boolean
}) {
  const label = src ? caseLabel(src, new Date()) : live ? liveLabel(live.source, live.collectedAt) : null
  if (!label) return null
  const closed = label.title.startsWith('지난')
  return (
    <span className="op-badge" data-kind={label.kind} data-closed={closed || undefined} title={label.detail}>
      <i aria-hidden="true" />
      <b>{label.title}</b>
      {!compact && <span>{label.detail}</span>}
    </span>
  )
}
