'use client'

import { useState } from 'react'
import { FEATURES } from '@/lib/features'
import { TRAY_MAX, trayToggle, useCompareTray } from '@/lib/consumer/compare-tray'

/** 카드·상세의 '비교 담기'. 셋이 차면 더 담지 않고 그 사실을 말한다 */
export default function CompareToggle({ id, name, className }: { id: string; name: string; className?: string }) {
  const tray = useCompareTray()
  const [full, setFull] = useState(false)
  if (!FEATURES.battle) return null
  const on = tray.some(i => i.id === id)
  return (
    <button
      type="button"
      className={className ?? 'cs-cmpt'}
      aria-pressed={on}
      data-full={full && !on ? '' : undefined}
      title={full && !on ? `비교는 ${TRAY_MAX}건까지 담깁니다` : undefined}
      onClick={e => {
        e.stopPropagation()
        const ok = trayToggle({ id, name })
        setFull(!ok)
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {on ? <path d="M5 12l5 5 9-10" /> : <path d="M8 4v16M16 4v16M4 8h8M12 16h8" />}
      </svg>
      <span>{on ? '비교 담김' : full ? `${TRAY_MAX}건 가득` : '비교 담기'}</span>
    </button>
  )
}
