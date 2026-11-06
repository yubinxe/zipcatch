'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { verifiedFor, type OfficialNotice } from '@/lib/consumer/complex-visualization'
import { FEATURES } from '@/lib/features'

// 열기 전에는 받지 않는다 — 공고 상세의 첫 화면 무게를 늘리지 않게(three 는 그 안에서 또 따로)
const ComplexExperience = dynamic(() => import('./ComplexExperience'), { ssr: false })

/**
 * 공고 상세의 '주택형 탐험' 단추. 주택형이 둘 이상인 공고에만 선다.
 * 닫으면 마지막으로 고른 주택형을 돌려준다 — 공고 화면이 그 줄을 짚는다.
 */
export default function ComplexLauncher({
  notice,
  picked,
  onPicked,
}: {
  notice: OfficialNotice
  picked: string | null
  onPicked: (name: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  if (!FEATURES.complex || notice.models.length < 2) return null
  const site = !!verifiedFor(notice.announcementId)?.siteKey
  return (
    <>
      <button type="button" className="cx-launch" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="cx-launch__k">Property Experience</span>
        <span className="cx-launch__t">
          {site ? `단지를 둘러보고 주택형 ${notice.models.length}종 견주기` : `주택형 ${notice.models.length}종을 입체로 보고 견주기`}
        </span>
        <i aria-hidden="true">→</i>
      </button>
      {open && (
        <ComplexExperience
          notice={notice}
          initial={picked}
          onClose={sel => {
            setOpen(false)
            onPicked(sel)
          }}
        />
      )}
    </>
  )
}
