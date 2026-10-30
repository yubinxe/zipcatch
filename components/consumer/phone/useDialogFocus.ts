'use client'

import { useEffect, useRef, type RefObject } from 'react'

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
 */
const stack: object[] = []

export function useDialogFocus(active: boolean, dialogRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  // 닫기 함수가 바뀌어도 쌓인 순서는 그대로 — 효과를 다시 돌리면 아래 창이 맨 위로 올라선다
  const esc = useRef(onEscape)
  useEffect(() => {
    esc.current = onEscape
  }, [onEscape])
  useEffect(() => {
    if (!active) return
    const me = {}
    stack.push(me)
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
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [active, dialogRef])
}
