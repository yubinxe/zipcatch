'use client'

import { caseLabel, liveLabel } from '@/lib/consumer/data-mode'
import type { IngestMeta } from '@/lib/consumer/data-mode'
import type { VerifiedSource } from '@/lib/consumer/complex-visualization'

/**
 * 자료 상태 표 — 수집 공고(신선도별)와 원문 검증 사례(VERIFIED_CASE)를 한눈에 가른다.
 * 수집 공고는 서버가 넘긴 실제 수집 기록(meta)으로만 '최근 수집'을 말한다. meta 가 없으면 '수집 시각 미확인'.
 * 사례는 날짜가 지나면 '지난 사례'로 바뀐다(지금 신청할 수 있는 것처럼 보이지 않게).
 */
export default function DataBadge({
  live,
  src,
  compact = false,
}: {
  live?: { source: string | null; meta: IngestMeta | null } | null
  src?: VerifiedSource | null
  compact?: boolean
}) {
  const label = src ? caseLabel(src, new Date()) : live ? liveLabel(live.source, live.meta) : null
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
