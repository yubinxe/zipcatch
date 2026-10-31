'use client'

import { useEffect, useRef, useState } from 'react'
import { lockScroll } from '@/lib/consumer/scroll-lock'
import { createPortal } from 'react-dom'
import { drawShareCard, RATIO_SIZE, type Ratio, type ShareCard } from '@/lib/consumer/share-card'
import { FEATURES } from '@/lib/features'
import { useDialogFocus } from './phone/useDialogFocus'

/**
 * 공유 이미지 만들기 — 단추 하나와, 누르면 열리는 미리보기·비율·저장 창.
 *
 * 그림은 이 기기에서 그린다(서버로 보내지 않는다). 저장은 PNG 파일 내려받기이고,
 * 휴대폰처럼 파일 공유를 받는 브라우저에서는 '공유'도 함께 연다.
 */
export default function ShareStudio({ card, label = '이미지로 저장' }: { card: () => ShareCard; label?: string }) {
  const [open, setOpen] = useState(false)
  if (!FEATURES.share) return null
  return (
    <>
      <button type="button" className="ss-launch" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        {label}
      </button>
      {open && createPortal(<Studio make={card} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function Studio({ make, onClose }: { make: () => ShareCard; onClose: () => void }) {
  // 연 순간의 결과로 고정한다 — 뒤 화면이 다시 그려져도 미리보기가 흔들리지 않게
  const [card] = useState(make)
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ratio, setRatio] = useState<Ratio>('4:5')
  const [ready, setReady] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useDialogFocus(true, box, onClose)

  useEffect(() => {
    let alive = true
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
    // 글꼴이 다 내려온 뒤 그린다 — 대체 글꼴로 한 번 그려지면 그림이 달라진다
    document.fonts.ready.then(() => {
      if (!alive || !canvas.current) return
      drawShareCard(canvas.current, card, ratio, family)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [card, ratio])

  useEffect(() => {
    const unlock = lockScroll()
    box.current?.focus()
    return unlock
  }, [])

  const name = `zipcatch-${card.slug}-${ratio.replace(':', 'x')}.png`
  const blob = () =>
    new Promise<Blob | null>(res => {
      const c = canvas.current
      if (!c) return res(null)
      c.toBlob(b => res(b), 'image/png')
    })

  const save = async () => {
    const b = await blob()
    if (!b) return setMsg('이미지를 만들지 못했어요.')
    const url = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    setMsg(`${name} 저장`)
  }

  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean }) : null
  const canShareFiles = !!nav?.canShare && nav.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })
  const share = async () => {
    const b = await blob()
    if (!b || !nav) return
    try {
      await nav.share({ files: [new File([b], name, { type: 'image/png' })], title: card.title })
    } catch {
      /* 사용자가 닫음 */
    }
  }

  const [w, h] = RATIO_SIZE[ratio]

  return (
    <div className="ss-veil" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div className="ss" role="dialog" aria-modal="true" aria-label="공유 이미지 만들기" ref={box} tabIndex={-1}>
        <header className="ss-head">
          <strong>공유 이미지</strong>
          <button type="button" className="ss-x" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className="ss-body">
          <div className="ss-preview" style={{ aspectRatio: `${w} / ${h}`, ['--ar' as string]: w / h }} data-ready={ready || undefined}>
            <canvas ref={canvas} role="img" aria-label={`${card.title} — ${ratio} 미리보기`} />
          </div>
          <div className="ss-side">
            <div className="ss-ratios" role="radiogroup" aria-label="비율">
              {(Object.keys(RATIO_SIZE) as Ratio[]).map(r => (
                <button key={r} type="button" role="radio" aria-checked={ratio === r} onClick={() => setRatio(r)}>
                  <i data-r={r} aria-hidden="true" />
                  {r}
                  <small>{r === '16:9' ? '발표·블로그' : r === '4:5' ? '피드' : '스토리'}</small>
                </button>
              ))}
            </div>
            <p className="ss-meta">
              {w}×{h}px PNG · 출처와 기준일이 함께 들어갑니다{card.assumptions?.length ? ' · 넣으신 가정값 포함' : ''}
            </p>
            <div className="ss-acts">
              <button type="button" className="ss-save" onClick={save} disabled={!ready}>
                PNG 저장
              </button>
              {canShareFiles && (
                <button type="button" className="ss-share" onClick={share} disabled={!ready}>
                  공유
                </button>
              )}
            </div>
            <p className="ss-msg" role="status">
              {msg}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
