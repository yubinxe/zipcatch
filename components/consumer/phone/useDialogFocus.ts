'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 지금 눈에 보이고 누를 수 있는 것만 — 좁은 화면에서 숨긴 닫기 버튼은 건너뛴다 */
export function focusablesIn(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    el => el.getClientRects().length > 0 && !el.closest('[inert]'),
  )
}

/**
 * 열린 폰 안에 초점을 가둔다.
 * - Tab / Shift+Tab 은 폰 안에서만 돈다
 * - 무엇이 초점을 바깥으로 빼가도(배경 클릭 등) 다시 안으로 데려온다
 * - Esc 는 닫는다. 한글 조합 중의 Esc 는 조합 취소이므로 건드리지 않는다
 */
export function useDialogFocus(active: boolean, dialogRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  useEffect(() => {
    if (!active) return

    const onKey = (e: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        onEscape()
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
      if (!dialog || !(e.target instanceof Node) || dialog.contains(e.target)) return
      const target = focusablesIn(dialog)[0] ?? dialog
      target.focus({ preventScroll: true })
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [active, dialogRef, onEscape])
}
