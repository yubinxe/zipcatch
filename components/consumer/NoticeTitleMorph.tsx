'use client'

import { cloneElement, isValidElement, useLayoutEffect, type ReactElement } from 'react'
import { FEATURES } from '@/lib/features'
import { playTitle } from '@/lib/consumer/title-flip'

/**
 * 공고 제목 표시 — 카드·상세·비교 열이 같은 표를 단다(data-nt). 감싸는 DOM 을 더하지 않는다.
 * 새로 그려질 때 직전 화면에서 적어 둔 자리가 있으면 거기서 제자리로 옮겨 온다(lib/consumer/title-flip).
 */
export default function NoticeTitleMorph({ id, children }: { id: string; children: ReactElement<Record<string, unknown>> }) {
  useLayoutEffect(() => {
    if (!FEATURES.transitions) return
    const el = document.querySelector<HTMLElement>(`[data-nt="${CSS.escape(id)}"]`)
    if (el) playTitle(el, id)
  }, [id])
  if (!FEATURES.transitions || !isValidElement(children)) return children
  return cloneElement(children, { 'data-nt': id })
}
