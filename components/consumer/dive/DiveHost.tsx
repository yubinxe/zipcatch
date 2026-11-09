'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { verifiedFor, verifiedModels, type OfficialNotice } from '@/lib/consumer/complex-visualization'
import { setJourney } from '@/lib/consumer/journey-store'
import { loadSite } from '@/lib/consumer/sites'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import DataBadge from '../DataBadge'
import NoticePlace, { type PlaceNotice } from './NoticePlace'
import { resolveCoord } from '@/lib/consumer/geo'
import { DIVE_EVENT, DIVE_PHASE_EVENT, diveHash, parseDiveHash, prefetchDive, type DivePhase, type DiveRequest } from './dive'

const ComplexExperience = dynamic(() => import('../complex/ComplexExperience'), { ssr: false })

/** 단계 길이(ms) — 공통 움직임 규칙: 즉각 반응 ≤150, 카메라 800~1,300, 큰 장면 전환 1,200~2,000 */
const T = { focus: 220, approach: 850, cover: 650, reveal: 420, waitMax: 4000 }

interface Open {
  /** 지도에서 전환을 거쳐 들어왔는가(주소로 바로 열면 아니다) */
  quick: boolean
  req: DiveRequest
  notice: OfficialNotice | null
  detailHref: string
}

/**
 * 홈에 하나 — 지도·첫 화면·시연 모드가 startDive 로 부르면 전환을 맡고 단지 탐험을 띄운다.
 * 탐험 자료는 원문에서 확인한 값만으로 세운다(lib/consumer/complex-visualization). DB 가 없는
 * 환경에서도 같은 숫자가 나온다.
 */
export default function DiveHost() {
  const [open, setOpen] = useState<Open | null>(null)
  /** 등록부에 없는 공고의 '자리' 화면 — 입체 모형 없이 지역·좌표까지만 */
  const [place, setPlace] = useState<PlaceNotice | null>(null)
  const [phase, setPhase] = useState<DivePhase>('idle')
  const timers = useRef<number[]>([])
  const pushed = useRef(false)
  const reduced = useRef(false)
  /** 도착 장면이 첫 그림을 그렸는가 — 그 전에는 가림막을 걷지 않는다(빈 캔버스·검은 화면을 보이지 않게) */
  const ready = useRef(false)


  const broadcast = (p: DivePhase) => window.dispatchEvent(new CustomEvent(DIVE_PHASE_EVENT, { detail: p }))
  const clear = () => {
    timers.current.forEach(id => window.clearTimeout(id))
    timers.current = []
  }

  const finish = useCallback(() => {
    clear()
    setOpen(null)
    setPhase('idle')
    broadcast('idle')
  }, [])

  const begin = useCallback((req: DiveRequest, fromHash = false) => {
    const src = verifiedFor(req.announcementId)
    /*
     * 대조를 마치지 않은 공고라고 문을 닫지 않는다. 입체 모형을 세울 수 없을 뿐,
     * '어디인가'는 가진 자료만큼 보여 줄 수 있다. 위치를 아예 정할 수 없을 때만 열지 않는다.
     */
    if (!src) {
      const q = req.place
      if (!q) return
      const geocoded =
        typeof q.lat === 'number' && typeof q.lng === 'number' && Number.isFinite(q.lat) && Number.isFinite(q.lng)
          ? { lat: q.lat, lng: q.lng }
          : null
      const c = resolveCoord({ geocoded, address: q.address, region: q.district, province: q.region })
      if (!c) return
      clear()
      setPlace({ ...q, coord: c.source })
      const rc = KOREA_REGIONS.find(r => r.name === (q.region ?? '').trim())?.code ?? null
      setJourney({ region: rc, noticeId: q.id ?? null, noticeName: q.name, announcementId: req.announcementId }, 'dive')
      return
    }
    clear()
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const code = KOREA_REGIONS.find(r => r.name === src.region)?.code ?? null
    setJourney({ region: code, noticeId: src.propertyIds[0] ?? req.announcementId, noticeName: src.name, announcementId: req.announcementId }, 'dive')
    // 공고 상세가 있는 환경이면 상세로, 아니면 청약홈 원문으로
    const detailHref = src.sourceUrl
    setOpen({ req, notice: null, detailHref, quick: !fromHash && !reduced.current })
    loadSite(src.siteKey).then(site => {
      if (!site) return
      setOpen(o =>
        o && o.req === req
          ? {
              ...o,
              notice: {
                propertyId: src.propertyIds[0] ?? req.announcementId,
                announcementId: req.announcementId,
                name: src.name,
                source: '청약홈 (공공데이터포털) · SH 입주자모집공고(정정)',
                sourceUrl: src.sourceUrl,
                models: verifiedModels(src, site),
              },
            }
          : o,
      )
      // 상세 화면이 실제로 있는지 — 있을 때만 그리로 잇는다(읽기 요청 하나)
      const pid = src.propertyIds[0]
      if (pid)
        fetch(`/api/notices/${pid}`, { method: 'GET' })
          .then(r => r.ok && setOpen(o => (o && o.req === req ? { ...o, detailHref: `/notices/${pid}` } : o)))
          .catch(() => {})
    })
    if (!fromHash && !pushed.current) {
      history.pushState({ zcDive: req.announcementId }, '', diveHash(req.announcementId))
      pushed.current = true
    }
    ready.current = false
    prefetchDive(src.siteKey)
    if (reduced.current || fromHash) {
      setPhase('inside')
      broadcast('inside')
      return
    }
    const go = (p: DivePhase) => {
      setPhase(p)
      broadcast(p)
    }
    // 가림막이 다 덮은 뒤, 도착 장면이 첫 그림을 그렸으면 걷는다 — 아직이면 그릴 때까지(최대 4초) 덮어 둔다
    const reveal = () => {
      go('reveal')
      timers.current.push(window.setTimeout(() => go('inside'), T.reveal))
    }
    go('focus')
    timers.current.push(
      window.setTimeout(() => go('approach'), T.focus),
      window.setTimeout(() => go('cover'), T.focus + T.approach),
      window.setTimeout(() => {
        if (ready.current) return reveal()
        const onReady = () => {
          window.removeEventListener('zc:complex-ready', onReady)
          window.clearTimeout(cap)
          reveal()
        }
        const cap = window.setTimeout(onReady, T.waitMax)
        timers.current.push(cap)
        window.addEventListener('zc:complex-ready', onReady)
      }, T.focus + T.approach + T.cover),
    )
  }, [])

  useEffect(() => {
    const on = () => {
      ready.current = true
    }
    window.addEventListener('zc:complex-ready', on)
    return () => window.removeEventListener('zc:complex-ready', on)
  }, [])

  // 닫기·취소 — 우리가 주소를 올렸으면 뒤로 가기로(브라우저 뒤로 가기와 같은 길)
  const leave = useCallback(() => {
    if (pushed.current) {
      pushed.current = false
      history.back()
    } else {
      if (location.hash.startsWith('#dive=')) history.replaceState(history.state, '', location.pathname + location.search)
      finish()
    }
  }, [finish])
  const leaveRef = useRef(leave)
  useEffect(() => {
    leaveRef.current = leave
  }, [leave])

  useEffect(() => {
    const onDive = (e: Event) => begin((e as CustomEvent<DiveRequest>).detail)
    const onPop = () => {
      if (!parseDiveHash(location.hash)) {
        pushed.current = false
        finish()
      }
    }
    window.addEventListener(DIVE_EVENT, onDive)
    window.addEventListener('popstate', onPop)
    const onClose = () => leaveRef.current()
    window.addEventListener('zc:dive-close', onClose)
    // 주소로 바로 들어온 경우
    const id = parseDiveHash(location.hash)
    const raf = id ? requestAnimationFrame(() => begin({ announcementId: id }, true)) : 0
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener(DIVE_EVENT, onDive)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('zc:dive-close', onClose)
      clear()
    }
  }, [begin, finish])

  // 전환 중 Esc — 취소. 탐험 안에서는 탐험 창이 Esc 를 맡는다
  useEffect(() => {
    if (phase === 'idle' || phase === 'inside') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, leave])

  if (place) return createPortal(<NoticePlace notice={place} onClose={() => setPlace(null)} />, document.body)
  if (!open) return null
  const src = verifiedFor(open.req.announcementId)!
  const from = open.req.from ?? null
  return (
    <>
      {phase !== 'inside' &&
        createPortal(
          <div
            className="dv"
            data-phase={phase}
            role="status"
            aria-live="polite"
            style={{ '--x': `${from?.x ?? window.innerWidth / 2}px`, '--y': `${from?.y ?? window.innerHeight / 2}px` } as React.CSSProperties}
          >
            <div className="dv-veil" aria-hidden="true" />
            <div className="dv-mask" aria-hidden="true" />
            <div className="dv-chip">
              <span className="dv-chip__k">{open.req.region ?? src.region} · 3D 단지 탐험</span>
              <b className="dv-chip__t">{src.name}</b>
              <span className="dv-chip__m">
                단지 {src.supply.total.toLocaleString('ko-KR')}세대 · 이번 청약 {src.supply.main}세대
              </span>
              <DataBadge src={src} compact />
            </div>
            <button type="button" className="dv-cancel" onClick={leave}>
              취소 <kbd>Esc</kbd>
            </button>
          </div>,
          document.body,
        )}
      {(phase === 'cover' || phase === 'reveal' || phase === 'inside') && open.notice && (
        <ComplexExperience
          quick={open.quick}
          caseMode
          notice={open.notice}
          initial={open.req.type ?? null}
          closeLabel="지도로 돌아가기"
          detailHref={open.detailHref}
          onSelect={(sel, cmp) => setJourney({ unitTypes: [sel, cmp].filter((x): x is string => !!x) }, 'dive')}
          onClose={() => leave()}
        />
      )}
    </>
  )
}
