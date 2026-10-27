/**
 * 입체를 그려도 되는 자리인가.
 *
 * 이 파일은 three 를 들이지 않는다 — 판단만 하고, 그리는 코드는 판단이 끝난 뒤
 * 동적 import 로 따로 받는다. 첫 화면의 HTML·JS 무게에 three 가 섞이지 않게.
 *
 * 그리지 않는 경우
 * - 움직임을 줄여 달라고 한 사람(prefers-reduced-motion) — 입체 장면은 늘 움직인다
 * - WebGL2 가 없는 브라우저(three r163 부터 WebGL1 을 받지 않는다)
 * 둘 중 하나라도 걸리면 먼저 그려 둔 평면 그림을 그대로 둔다.
 */

let cached: boolean | null = null

export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function hasWebGL2(): boolean {
  if (cached !== null) return cached
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    cached = !!gl
    // 시험용 맥락은 바로 돌려준다 — 브라우저마다 동시에 열 수 있는 수가 정해져 있다
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}

export function canUse3D(): boolean {
  return !reducedMotion() && hasWebGL2()
}

/** 첫 화면이 다 그려진 뒤, 브라우저가 한가할 때 */
export function whenIdle(fn: () => void, timeout = 1200): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, 200)
  return () => window.clearTimeout(id)
}
