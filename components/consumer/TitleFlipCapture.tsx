'use client'

import { useEffect } from 'react'
import { FEATURES } from '@/lib/features'
import { captureTitles } from '@/lib/consumer/title-flip'

/** 공고 상세·비교로 가는 링크를 누르는 순간, 화면에 있는 그 공고들의 제목 자리를 적는다 */
export default function TitleFlipCapture() {
  useEffect(() => {
    if (!FEATURES.transitions) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin) return
      const one = /^\/notices\/([^/]+)$/.exec(url.pathname)
      if (one) return captureTitles([decodeURIComponent(one[1])])
      if (url.pathname === '/compare') captureTitles((url.searchParams.get('ids') ?? '').split(',').filter(Boolean))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
