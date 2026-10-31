'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 지금 눈에 보이고 누를 수 있는 것만 — 좁은 화면에서 숨긴 닫기 버튼은 건너뛴다 */
export function focusablesIn(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // tabindex=-1 인 버튼(로빙 라디오의 나머지 칸)은 Tab 이 서지 않는다 — 마지막 칸으로 세면 가둠이 샌다
    el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'),
  )
}

/**
 * 열린 폰 안에 초점을 가둔다.
 * - Tab / Shift+Tab 은 폰 안에서만 돈다
 * - 무엇이 초점을 바깥으로 빼가도(배경 클릭 등) 다시 안으로 데려온다
 * - Esc 는 닫는다. 한글 조합 중의 Esc 는 조합 취소이므로 건드리지 않는다
 * - 창 위에 창이 겹치면 맨 위 창만 가둔다 — 둘이 서로 초점을 끌어오면 끝없이 돈다
 * - 닫히면 연 자리(여는 단추)로 초점을 돌려준다. 초점이 이미 다른 곳에 가 있으면 건드리지 않는다
 */
const stack: object[] = []

/**
 * 최근에 초점을 받은 것들 — 창이 열리며 autoFocus 로 초점을 먼저 가져가도 연 단추를 찾을 수 있게.
 * 문서에 한 번만 귀를 단다.
 */
const recent: HTMLElement[] = []
let tracking = false
function trackFocus() {
  if (tracking || typeof document === 'undefined') return
  tracking = true
  document.addEventListener(
    'focusin',
    e => {
      if (!(e.target instanceof HTMLElement)) return
      recent.push(e.target)
      if (recent.length > 8) recent.shift()
    },
    true,
  )
}
function openerOutside(node: HTMLElement | null): HTMLElement | null {
  const a = document.activeElement
  if (a instanceof HTMLElement && a !== document.body && !node?.contains(a)) return a
  for (let i = recent.length - 1; i >= 0; i--) {
    const el = recent[i]
    if (el.isConnected && !node?.contains(el)) return el
  }
  return null
}

export function useDialogFocus(active: boolean, dialogRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  // 닫기 함수가 바뀌어도 쌓인 순서는 그대로 — 효과를 다시 돌리면 아래 창이 맨 위로 올라선다
  const esc = useRef(onEscape)
  useEffect(() => {
    esc.current = onEscape
  }, [onEscape])
  // 연 단추는 그리기 직후에 적어 둔다 — 창이 입력칸에 초점을 먼저 옮겼으면 그 전에 초점을 가졌던 것
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(trackFocus, [])
  useLayoutEffect(() => {
    if (active) openerRef.current = openerOutside(dialogRef.current)
  }, [active, dialogRef])
  useEffect(() => {
    if (!active) return
    const me = {}
    stack.push(me)
    const opener = openerRef.current
    const node = dialogRef.current
    const top = () => stack[stack.length - 1] === me

    const onKey = (e: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog || !top()) return
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        esc.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusablesIn(dialog)
      if (items.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      const inside = current instanceof Node && dialog.contains(current)
      if (e.shiftKey && (current === first || current === dialog || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (current === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }

    const onFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current
      if (!dialog || !top() || !(e.target instanceof Node) || dialog.contains(e.target)) return
      const target = focusablesIn(dialog)[0] ?? dialog
      target.focus({ preventScroll: true })
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      stack.splice(stack.indexOf(me), 1)
      const now = document.activeElement
      const lost = !now || now === document.body || !now.isConnected || !!node?.contains(now)
      if (lost && opener?.isConnected && !node?.contains(opener)) opener.focus({ preventScroll: true })
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [active, dialogRef])
}
