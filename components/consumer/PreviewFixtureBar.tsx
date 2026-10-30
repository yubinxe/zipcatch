'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * 미리보기 배포에서 가상 공고(픽스처)를 켰을 때만 보이는 띠.
 * 운영 배포에서는 /api/preview/env 가 404 라 아무것도 그리지 않는다.
 */
export default function PreviewFixtureBar() {
  const [on, setOn] = useState(false)
  const pathname = usePathname()
  useEffect(() => {
    if (!document.cookie.includes('zc_fixture=1')) return
    let alive = true
    fetch('/api/preview/env', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => alive && setOn(Boolean(j?.fixture)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  if (!on) return null
  return (
    <div className="cs-fxbar" role="status">
      <b>검증용 픽스처</b> 가상 공고·가상 조건으로 보는 미리보기입니다. 운영 데이터가 아닙니다.
      <a href={`/api/preview/fixture?on=0&next=${encodeURIComponent(pathname)}`}>끄기</a>
    </div>
  )
}
