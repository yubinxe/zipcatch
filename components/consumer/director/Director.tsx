'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { verifiedFor } from '@/lib/consumer/complex-visualization'
import { setJourney } from '@/lib/consumer/journey-store'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { startDive } from '../dive/dive'
import DataBadge from '../DataBadge'
import DirectorQr from './DirectorQr'

/**
 * 시연 모드 — 주소에 ?director=1 을 붙였을 때만 선다. 평소 첫 화면은 그대로다(자동 재생 없음).
 *
 * 여섯 장면, 약 90초. 장면마다 정해진 시간이 지나면 다음으로 가되, 관객이 직접 만져 보는 장면
 * (wait)은 시간이 지나도 넘어가지 않는다 — 발표자가 '다음'을 눌러야 간다.
 * 장면이 하는 일은 사람이 누를 수 있는 것과 같은 길(스크롤·지역 고르기·단지 탐험)이다.
 */
const VERIFIED_ID = '2026000373-2026000373'
/** 공개 제품 주소 — 운영(공개) 사이트. 시연 화면(Preview)의 주소를 담지 않는다 */
const PUBLIC_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zipcatch.vercel.app').replace(/\/$/, '')
const SEOUL = KOREA_REGIONS.find(r => r.name === '서울')?.code ?? null

interface Scene {
  title: string
  line: string
  /** 초. 0 이면 기다린다 */
  secs: number
  run: () => void
  /** 장면이 화면에 다 섰는가 — 서기 전에는 남은 시간이 줄지 않는다(느린 기기에서 장면이 뜨기도 전에 지나가지 않게) */
  ready: () => boolean
}

const scrollToSel = (sel: string, frac = 0) => {
  const el = document.querySelector<HTMLElement>(sel)
  if (!el) return
  const r = el.getBoundingClientRect()
  const top = window.scrollY + r.top + Math.max(0, r.height - window.innerHeight) * frac
  window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
const closeDive = () => window.dispatchEvent(new Event('zc:dive-close'))

const SCENES: Scene[] = [
  {
    title: '대한민국 3D 지도',
    line: '지금 접수 중·예정인 공고가 어디에 열려 있는지 — 실제 집계로 솟은 지도',
    secs: 12,
    ready: () => window.scrollY < 40 && !document.querySelector('.pxe') && !!document.querySelector('.cs-atlas[data-state="ready"], .cs-atlas[data-state="empty"]'),
    run: () => {
      closeDive()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  },
  {
    title: '지역을 고르면 숫자가 섭니다',
    line: '서울 — 공고 수 · 분양/임대 · 가장 가까운 마감. 묶여 온 집계는 나누지 않습니다',
    secs: 14,
    ready: () => !!document.querySelector('.cs-stage__pin[data-late] .cs-om-panel'),
    run: () => {
      closeDive()
      setJourney({ region: SEOUL }, 'director')
      scrollToSel('.cs-scene--statement', 0.94)
    },
  },
  {
    title: '고덕강일 3단지 — 공간 탐험',
    line: '17개 동 매스(지도 윤곽 × 공고 최고층). 실제 외관이 아니라 개념 시각화입니다',
    secs: 0,
    ready: () => !!document.querySelector('.pxe[data-phase="arrived"], .pxe[data-quick]'),
    run: () => {
      if (!document.querySelector('.pxe')) startDive({ announcementId: VERIFIED_ID, region: '서울' })
    },
  },
  {
    title: '주택형과 토지임대부 비용',
    line: '59B — 건물 분양가 최고 3억 9,050만원, 월 토지임대료 51만 1,500원은 따로 냅니다',
    secs: 0,
    ready: () => !!document.querySelector('.pxe .cx-info, .pxe .cx-key'),
    run: () => {
      if (!document.querySelector('.pxe')) startDive({ announcementId: VERIFIED_ID, region: '서울', type: '059.0000B' })
      else window.dispatchEvent(new CustomEvent('zc:experience-select', { detail: '059.0000B' }))
    },
  },
  {
    title: 'FOUR STEPS — 하나의 결정',
    line: '같은 공고를 고르고, 견주고, 확인하고, 챙깁니다. 확인되지 않은 자격은 충족으로 적지 않습니다',
    secs: 18,
    ready: () => !document.querySelector('.pxe') && !!document.querySelector('.op-jr__chosen b'),
    run: () => {
      closeDive()
      const v = verifiedFor(VERIFIED_ID)
      if (v) setJourney({ region: SEOUL, noticeId: v.propertyIds[0] ?? VERIFIED_ID, noticeName: v.name, announcementId: VERIFIED_ID }, 'director')
      window.setTimeout(() => scrollToSel('.cs-ap--journey'), 120)
    },
  },
  {
    title: '공식 원문과 다음 행동',
    line: '모든 숫자의 출처 — 청약홈 공고 상세와 SH 정정본 공고문',
    secs: 0,
    ready: () => true,
    run: () => closeDive(),
  },
]

export default function Director() {
  const [on, setOn] = useState(false)
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [left, setLeft] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!new URLSearchParams(location.search).has('director')) return
    const id = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // 다음 장면까지의 마감 시각 — 상태 갱신 함수 안에서 장면을 넘기지 않는다(묵은 틱이 두 번 넘기는 일이 없게)
  const deadline = useRef(0)
  const remain = useRef(0)
  const goto = useCallback((n: number) => {
    const k = (n + SCENES.length) % SCENES.length
    setI(k)
    setLeft(SCENES[k].secs)
    remain.current = SCENES[k].secs * 1000
    deadline.current = performance.now() + remain.current
    SCENES[k].run()
  }, [])

  useEffect(() => {
    if (!on || started.current) return
    started.current = true
    document.documentElement.dataset.director = ''
    const id = requestAnimationFrame(() => goto(0))
    return () => cancelAnimationFrame(id)
  }, [on, goto])

  // 남은 시간 — 기다리는 장면(secs 0)과 멈춤에서는 줄지 않는다
  useEffect(() => {
    if (!on || !SCENES[i].secs) return
    if (!playing) {
      remain.current = Math.max(0, deadline.current - performance.now())
      return
    }
    deadline.current = performance.now() + remain.current
    let shown = false
    const id = window.setInterval(() => {
      // 장면이 서기 전에는 마감을 미룬다
      if (!shown) {
        if (!SCENES[i].ready()) {
          deadline.current = performance.now() + remain.current
          setWaiting(true)
          return
        }
        shown = true
        setWaiting(false)
      }
      const ms = deadline.current - performance.now()
      remain.current = Math.max(0, ms)
      if (ms <= 0) {
        window.clearInterval(id)
        goto(i + 1)
      } else setLeft(Math.ceil(ms / 1000))
    }, 250)
    return () => window.clearInterval(id)
  }, [on, playing, i, goto])

  const exit = useCallback(() => {
    closeDive()
    delete document.documentElement.dataset.director
    setOn(false)
    const u = new URL(location.href)
    u.searchParams.delete('director')
    history.replaceState(history.state, '', u.pathname + u.search + u.hash)
  }, [])

  // 발표자 키 — → 다음 · ← 이전 · Space 멈춤 · Home 처음. 글을 쓰는 중이거나 창이 열려 있으면 비킨다
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      // 글을 쓰는 칸에서는 비킨다. 창(단지 탐험) 안에서는 화살표가 창 몫이므로
      // 발표용 넘김 키(PageUp·PageDown)만 받는다 — 창의 초점 가둠은 건드리지 않는다
      if (t?.closest('input, select, textarea')) return
      const inDialog = !!t?.closest('[role="dialog"]')
      if (inDialog && e.key !== 'PageDown' && e.key !== 'PageUp') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goto(i + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goto(i - 1)
      else if (e.key === ' ') setPlaying(p => !p)
      else if (e.key === 'Home') goto(0)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on, i, goto])

  if (!on) return null
  const s = SCENES[i]
  const v = verifiedFor(VERIFIED_ID)
  return createPortal(
    <div className="dir" role="region" aria-label="시연 모드">
      {i === SCENES.length - 1 && v && (
        <div className="dir-end">
          <p className="dir-end__k">출처</p>
          <ul>
            <li>
              <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer">
                청약홈 공고 상세 — {v.name}
              </a>
            </li>
            <li>
              <a href={v.documents[0].url} target="_blank" rel="noopener noreferrer">
                SH 입주자모집공고(정정) — 공급 세대·가격·토지임대료
              </a>
            </li>
          </ul>
          <p className="dir-end__fine">
            <DataBadge src={v} />
          </p>
          <p className="dir-end__fine">동 윤곽 © OpenStreetMap 기여자(ODbL) · 3D 매스는 개념 시각화(실제 외관 아님) · 자격은 공고문으로 확인</p>
          <DirectorQr url={`${PUBLIC_SITE}/notices/${v.propertyIds[0]}`} label="집캐치에서 이 공고 보기" />
        </div>
      )}
      <div className="dir-bar">
        <div className="dir-bar__t" aria-live="polite">
          <span className="dir-bar__n cs-num">
            {String(i + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}
          </span>
          <b>{s.title}</b>
          <span>{s.line}</span>
        </div>
        <div className="dir-bar__c">
          <span className="dir-bar__left cs-num" aria-label="다음 장면까지">
            {s.secs ? (!playing ? '멈춤' : waiting ? '장면 준비 중' : `${left}s`) : '조작 대기'}
          </span>
          <button type="button" onClick={() => goto(i - 1)} aria-label="이전 장면">
            ←
          </button>
          <button type="button" onClick={() => setPlaying(p => !p)} aria-pressed={!playing}>
            {playing ? '일시정지' : '재생'}
          </button>
          <button type="button" onClick={() => goto(i + 1)} aria-label="다음 장면">
            →
          </button>
          <button type="button" onClick={() => goto(0)}>
            처음부터
          </button>
          <button type="button" onClick={exit}>
            시연 종료
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
