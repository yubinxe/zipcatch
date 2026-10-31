'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EXTRA_PAGES, NAV } from '@/lib/consumer/nav'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { FEATURES } from '@/lib/features'
import { useDialogFocus } from './phone/useDialogFocus'

/**
 * 빠른 검색 — ⌘K(맥) · Ctrl+K 로 어디서든 연다.
 *
 * 화면·지역·지금 열린 공고를 한 칸에서 찾는다. 공고는 목록 화면과 같은 길
 * (/api/notices)에서 처음 열 때 한 번 받는다. 새 검색 서버는 두지 않는다.
 */

interface Hit {
  kind: '화면' | '지역' | '공고'
  label: string
  hint?: string
  href: string
}

interface NoticeLite {
  id: string
  name: string
  region: string
  housingType: string
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

const PAGES: Hit[] = [
  ...NAV.map(n => ({ kind: '화면' as const, label: n.label, href: n.href })),
  ...EXTRA_PAGES.map(p => ({ kind: '화면' as const, label: p.label, hint: p.hint, href: p.href })),
]
const REGIONS: Hit[] = KOREA_REGIONS.map(r => ({
  kind: '지역' as const,
  label: r.name,
  hint: '이 지역 공고 보기',
  href: `/notices?region=${encodeURIComponent(r.name)}`,
}))

function score(q: string, h: Hit) {
  const l = norm(h.label)
  if (l === q) return 0
  if (l.startsWith(q)) return 1
  if (l.includes(q)) return 2
  if (h.hint && norm(h.hint).includes(q)) return 3
  return -1
}

export default function Spotlight() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [notices, setNotices] = useState<NoticeLite[] | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const back = useRef<HTMLElement | null>(null)
  const router = useRouter()
  const listId = useId()

  const close = useCallback(() => {
    setOpen(false)
    back.current?.focus?.()
  }, [])
  useDialogFocus(open, box, close)

  const show = useCallback(() => {
    back.current = document.activeElement as HTMLElement | null
    setQ('')
    setSel(0)
    setOpen(true)
  }, [])

  // ⌘K · Ctrl+K — 글을 쓰는 중에도 연다(브라우저 기본 동작보다 우선)
  useEffect(() => {
    if (!FEATURES.spotlight) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) close()
        else show()
      }
    }
    const onOpen = () => show()
    window.addEventListener('keydown', onKey)
    window.addEventListener('zc:spotlight', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('zc:spotlight', onOpen)
    }
  }, [open, close, show])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => input.current?.focus())
    if (notices || loadErr) return
    let alive = true
    fetch('/api/notices', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(j => {
        if (!alive) return
        const list: NoticeLite[] = (j.notices ?? []).map((n: { property: NoticeLite }) => ({
          id: n.property.id,
          name: n.property.name,
          region: n.property.region,
          housingType: n.property.housingType,
        }))
        setNotices(list)
      })
      .catch(() => alive && setLoadErr(true))
    return () => {
      alive = false
    }
  }, [open, notices, loadErr])

  const hits = useMemo(() => {
    const k = norm(q)
    const noticeHits: Hit[] = (notices ?? []).map(n => ({
      kind: '공고',
      label: n.name,
      hint: `${n.region} · ${n.housingType}`,
      href: `/notices/${n.id}`,
    }))
    if (!k) return [...PAGES.slice(0, 6), ...noticeHits.slice(0, 4)]
    return [...PAGES, ...REGIONS, ...noticeHits]
      .map(h => ({ h, s: score(k, h) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, 12)
      .map(x => x.h)
  }, [q, notices])

  const go = (h: Hit) => {
    setOpen(false)
    router.push(h.href)
  }

  if (!FEATURES.spotlight || !open) return null

  const active = Math.min(sel, Math.max(0, hits.length - 1))

  return createPortal(
    <div className="sp-veil" onPointerDown={e => e.target === e.currentTarget && close()}>
      <div className="sp" role="dialog" aria-modal="true" aria-label="빠른 검색" ref={box}>
        <div className="sp-field">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={input}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="화면, 지역, 공고 이름"
            value={q}
            onChange={e => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel(s => (hits.length ? (Math.min(s, hits.length - 1) + 1) % hits.length : 0))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel(s => (hits.length ? (Math.min(s, hits.length - 1) - 1 + hits.length) % hits.length : 0))
              } else if (e.key === 'Enter' && hits[active]) {
                e.preventDefault()
                go(hits[active])
              }
            }}
          />
          <kbd className="sp-esc">Esc</kbd>
        </div>
        <ul className="sp-list" id={listId} role="listbox" aria-label="검색 결과">
          {hits.map((h, i) => (
            <li
              key={h.kind + h.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerMove={() => setSel(i)}
              onClick={() => go(h)}
            >
              <span className="sp-kind" data-k={h.kind}>
                {h.kind}
              </span>
              <span className="sp-label">{h.label}</span>
              {h.hint && <span className="sp-hint">{h.hint}</span>}
            </li>
          ))}
          {hits.length === 0 && <li className="sp-none">맞는 결과가 없어요. 지역 이름이나 공고 이름 일부로 찾아 보세요.</li>}
        </ul>
        <p className="sp-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 고르기 · <kbd>Enter</kbd> 이동
          </span>
          <span>{notices ? `지금 열린 공고 ${notices.length}건에서 찾습니다` : loadErr ? '공고를 불러오지 못해 화면·지역만 찾습니다' : '공고를 불러오는 중'}</span>
        </p>
      </div>
    </div>,
    document.body,
  )
}

/** 머리의 검색 단추 — 누르면 위 검색을 연다 */
export function SpotlightButton() {
  const [mac, setMac] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)))
    return () => cancelAnimationFrame(id)
  }, [])
  if (!FEATURES.spotlight) return null
  return (
    <button
      type="button"
      className="sp-btn"
      onClick={() => window.dispatchEvent(new Event('zc:spotlight'))}
      aria-label="빠른 검색 열기"
      aria-keyshortcuts="Meta+K Control+K"
      title={mac ? "빠른 검색 (⌘K)" : "빠른 검색 (Ctrl+K)"}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <kbd aria-hidden="true">{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}
