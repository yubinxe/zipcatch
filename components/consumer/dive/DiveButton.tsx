'use client'

import type { ReactNode } from 'react'
import { centerOf, diveHash, startDive } from './dive'

/**
 * 단지 탐험으로 들어가는 단추. 원문 대조를 마친 공고(announcementId)만 받는다.
 * 링크 모양을 갖춘다 — 새 탭으로 열면 같은 탐험이 주소(#dive=)로 바로 열린다.
 */
export default function DiveButton({
  announcementId,
  region,
  className,
  children,
}: {
  announcementId: string
  region?: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={`/${diveHash(announcementId)}`}
      className={className}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        startDive({ announcementId, from: centerOf(e.currentTarget), region })
      }}
    >
      {children}
    </a>
  )
}
