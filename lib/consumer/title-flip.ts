'use client'

/**
 * 공고 제목이 화면을 옮겨도 이어 보이게 — 누른 화면에서 제목 자리를 적어 두고,
 * 새 화면의 같은 공고 제목을 그 자리에서 제자리로 옮겨 놓는다(FLIP, Web Animations API).
 *
 * React <ViewTransition> 을 먼저 시도했지만, 이 앱의 공고 화면은 경로 단위 대기 화면(loading.tsx)이
 * 옛 제목과 새 제목 사이에 끼어 짝이 지어지지 않았다(2026-10-30 실측: 전환 호출 0회). 대기 화면을
 * 없애지 않고도 되는 방법이 이것이다. 지원하지 않는 환경·움직임 줄이기에서는 아무것도 하지 않는다.
 */

const KEY = 'zc:title-flip'
const FRESH_MS = 4000

interface Snap {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** 지금 화면에 보이는 이 공고들의 제목 자리를 적는다 */
export function captureTitles(ids: string[]) {
  try {
    const snaps: Snap[] = []
    for (const id of ids) {
      const el = document.querySelector<HTMLElement>(`[data-nt="${CSS.escape(id)}"]`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue
      snaps.push({ id, x: r.left, y: r.top, w: r.width, h: r.height })
    }
    if (snaps.length) sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), snaps }))
  } catch {
    /* 저장이 막혀도 이동은 그대로 */
  }
}

/** 새 화면의 제목 — 적어 둔 자리가 있으면 거기서 출발한다 */
export function playTitle(el: HTMLElement, id: string) {
  try {
    if (!el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return
    const { at, snaps } = JSON.parse(raw) as { at: number; snaps: Snap[] }
    if (Date.now() - at > FRESH_MS) return
    const s = snaps.find(x => x.id === id)
    if (!s) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const dx = s.x - r.left
    const dy = s.y - r.top
    // 글자 크기가 다르므로 폭으로만 맞춘다(세로는 비율 그대로) — 글자가 납작해지지 않게
    const k = s.w / r.width
    el.animate(
      [
        { transformOrigin: 'left top', transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.6 },
        { transformOrigin: 'left top', transform: 'none', opacity: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
    // 한 번 쓰고 지운다 — 뒤로 가기·새로고침에서 다시 날아오지 않게
    const rest = snaps.filter(x => x.id !== id)
    if (rest.length) sessionStorage.setItem(KEY, JSON.stringify({ at, snaps: rest }))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* 그대로 둔다 */
  }
}
