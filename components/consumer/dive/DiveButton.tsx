'use client'

import type { CSSProperties, ReactNode } from 'react'
import { verifiedFor } from '@/lib/consumer/complex-visualization'
import { centerOf, diveHash, explorerHref, openSpatialExplorer, prefetchDive, startDive } from './dive'

/**
 * '3D 공간 탐험' 단추 — 어느 화면에서든 같은 껍데기를 연다.
 *
 *  - noticeId(운영 공고 id)를 주면 전국 어느 공고든 공간 탐험(openSpatialExplorer). 위치·형상은
 *    서버가 정한다 — 단추가 좌표나 주택형을 알 필요가 없다.
 *  - announcementId 만 주면 원문 대조 단지로 곧장(첫 화면·ONE MAP 의 확인 사례 단추).
 *
 * 링크 모양을 갖춘다 — 새 탭·주소 복사로 열면 같은 탐험이 고정 주소로 열린다.
 */
export default function DiveButton({
  noticeId,
  announcementId,
  name,
  region,
  className,
  style,
  children = '3D 공간 탐험',
  'aria-label': ariaLabel,
}: {
  noticeId?: string | null
  announcementId?: string | null
  /** 불러오는 동안 껍데기에 미리 적을 이름 */
  name?: string | null
  region?: string | null
  className?: string
  style?: CSSProperties
  children?: ReactNode
  'aria-label'?: string
}) {
  const site = announcementId ? (verifiedFor(announcementId)?.siteKey ?? null) : null
  const href = noticeId ? explorerHref(noticeId) : announcementId ? `/${diveHash(announcementId)}` : '#'
  return (
    <a
      href={href}
      className={className}
      style={style}
      aria-label={ariaLabel}
      data-explore={noticeId ?? undefined}
      onPointerEnter={() => prefetchDive(site)}
      onFocus={() => prefetchDive(site)}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const from = centerOf(e.currentTarget)
        if (noticeId) openSpatialExplorer(noticeId, { from, name, region })
        else if (announcementId) startDive({ announcementId, from, region })
      }}
    >
      {children}
    </a>
  )
}
