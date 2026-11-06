'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FEATURES } from '@/lib/features'

// 열기 전에는 받지 않는다 — 첫 화면 무게를 늘리지 않게
const SpatialExplorer = dynamic(() => import('./SpatialExplorer'), { ssr: false })

/** 탐험 모드 진입 단추. 스위치가 꺼져 있으면 아무것도 그리지 않는다 */
export default function ExploreLauncher({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!FEATURES.explore) return null
  return (
    <>
      <button type="button" className={className ?? 'sx-launch'} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {children ?? '입체 지도로 탐험'}
      </button>
      {/* 바깥 칸이 transform 을 쥐고 있으면 fixed 가 그 안에 갇힌다 — body 로 띄운다 */}
      {open && createPortal(<SpatialExplorer open onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
