'use client'

import { useLayoutEffect, type KeyboardEvent, type RefObject } from 'react'
import { SendGlyph } from './glyphs'

export const MAX_LEN = 1000
/** 남은 글자를 이때부터 보여준다 */
const COUNT_FROM = 800
/** 네 줄까지 자라고 그 뒤로는 칸 안에서 스크롤 */
const MAX_HEIGHT = 112

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  busy: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
  noteId: string
}

/**
 * 입력줄 — One UI 메시지의 알약 모양 입력칸과 둥근 보내기.
 * Enter 는 보내고 Shift+Enter 는 줄을 바꾼다. 한글 조합 중의 Enter 는 글자를
 * 확정하는 키이므로 보내지 않는다(조합 중 Enter 로 두 번 나가는 흔한 사고).
 */
export default function Composer({ value, onChange, onSubmit, busy, inputRef, noteId }: Props) {
  const empty = value.trim().length === 0

  // 글이 길어지면 칸이 위로 자란다
  useLayoutEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`
  }, [value, inputRef])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    if (!busy && !empty) onSubmit()
  }

  return (
    <form
      className="cs-phone__composer"
      onSubmit={e => {
        e.preventDefault()
        if (!busy && !empty) onSubmit()
      }}
    >
      <div className="cs-phone__field">
        <label htmlFor="chat-input" className="cs-sr">
          메시지 입력
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          className="cs-phone__input"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="예) 동작구 보증금 7000만원 이하로 찾아요"
          maxLength={MAX_LEN}
          rows={1}
          enterKeyHint="send"
          aria-describedby={noteId}
          autoComplete="off"
        />
        {value.length >= COUNT_FROM && (
          <span className="cs-phone__count" data-full={value.length >= MAX_LEN || undefined}>
            {value.length}/{MAX_LEN}
          </span>
        )}
      </div>
      <button
        type="submit"
        className="cs-phone__send"
        disabled={busy || empty}
        aria-label={busy ? '답변을 기다리는 중' : '보내기'}
        data-busy={busy || undefined}
      >
        <SendGlyph />
      </button>
    </form>
  )
}
