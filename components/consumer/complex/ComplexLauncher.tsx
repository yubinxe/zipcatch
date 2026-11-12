'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { verifiedFor, type OfficialNotice } from '@/lib/consumer/complex-visualization'
import { FEATURES } from '@/lib/features'

// 열기 전에는 받지 않는다 — 공고 상세의 첫 화면 무게를 늘리지 않게(three 는 그 안에서 또 따로)
const ComplexExperience = dynamic(() => import('./ComplexExperience'), { ssr: false })

/**
 * 공고 상세의 '단지 탐험' 단추.
 *
 * 전에는 주택형이 둘 이상일 때만 섰다. 공간을 둘러보는 일과 주택형을 견주는 일은
 * 다른 능력인데 하나로 묶여 있어서, 주택형이 하나인 분양 공고나 주택형 자료가 없는
 * 임대 공고에서는 단지를 둘러볼 길이 아예 닫혔다. 둘을 떼어 놓는다 —
 * 현장 자료가 있으면 주택형 수와 무관하게 단지를 열고, 글은 할 수 있는 일에 맞춘다.
 *
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
  if (!FEATURES.complex) return null
  const site = !!verifiedFor(notice.announcementId)?.siteKey
  const models = notice.models.length
  // 둘러볼 현장도 없고 견줄 주택형도 없으면 이 단추로 할 수 있는 일이 없다.
  // 그때는 '이 공고의 자리'(NoticePlace)가 공간을 맡는다.
  if (!site && models < 2) return null
  const label = site
    ? models >= 2
      ? `단지를 둘러보고 주택형 ${models}종 견주기`
      : '단지를 입체로 둘러보기'
    : `주택형 ${models}종을 입체로 보고 견주기`
  return (
    <>
      <button type="button" className="cx-launch" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="cx-launch__k">Property Experience</span>
        <span className="cx-launch__t">{label}</span>
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
