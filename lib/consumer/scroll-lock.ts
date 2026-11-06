'use client'

/**
 * 배경 스크롤 잠금 — 여러 겹(탐험 모드 위 공유 창 등)이 열려도 마지막이 닫힐 때 한 번만 푼다.
 *
 * iPhone Safari 는 body 에 overflow:hidden 만 주면 뒤가 계속 굴러간다. 본문을 지금 자리에 고정
 * (position:fixed; top:-스크롤)하고, 풀 때 그 자리로 되돌린다 — 닫은 뒤 맨 위로 튀지 않게.
 */
let depth = 0
let saved: { y: number; style: string } | null = null

export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (depth++ === 0) {
    const y = window.scrollY
    const b = document.body
    saved = { y, style: b.getAttribute('style') ?? '' }
    // 스크롤 막대가 사라지며 화면이 옆으로 밀리지 않게 그 폭만큼 채운다
    const bar = window.innerWidth - document.documentElement.clientWidth
    b.style.position = 'fixed'
    b.style.top = `-${y}px`
    b.style.left = '0'
    b.style.right = '0'
    b.style.width = '100%'
    b.style.overflow = 'hidden'
    if (bar > 0) b.style.paddingRight = `${bar}px`
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--depth > 0 || !saved) return
    const { y, style } = saved
    saved = null
    if (style) document.body.setAttribute('style', style)
    else document.body.removeAttribute('style')
    // 'smooth' 스크롤 설정이 있어도 제자리로 바로
    window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
  }
}
