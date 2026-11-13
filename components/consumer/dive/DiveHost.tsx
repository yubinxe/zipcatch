'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { verifiedFor, verifiedModels, type OfficialNotice } from '@/lib/consumer/complex-visualization'
import { setJourney } from '@/lib/consumer/journey-store'
import { loadSite } from '@/lib/consumer/sites'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import DataBadge from '../DataBadge'
import NoticePlace, { type ExplorerView } from './NoticePlace'
import type { ExplorerLevel, SpatialResponse } from '@/app/api/notices/[id]/spatial/route'
import {
  DIVE_EVENT,
  DIVE_PHASE_EVENT,
  EXPLORE_EVENT,
  diveHash,
  explorerIdFromUrl,
  parseDiveHash,
  prefetchDive,
  urlWithExplorer,
  urlWithoutExplorer,
  type DivePhase,
  type DiveRequest,
  type ExploreRequest,
} from './dive'

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
  /**
   * 공간 탐험 껍데기의 상태 — IDLE → OPENING → LOADING_CONTEXT → READY | LIMITED_DATA | ERROR → CLOSING → IDLE.
   * 누르는 즉시 껍데기가 서고(OPENING), 자료는 그 안에서 받는다. 앞 요청은 끊고(AbortController),
   * 요청 번호가 다른 응답은 버린다 — B 를 고른 뒤 늦게 온 A 가 B 를 덮지 않는다.
   */
  const [ex, setEx] = useState<ExplorerView | null>(null)
  const exReq = useRef(0)
  const exCtl = useRef<AbortController | null>(null)
  /** 탐험을 연 요소 — 닫으면 그리로 초점을 돌린다 */
  const opener = useRef<HTMLElement | null>(null)
  /** 단지 단계를 탐험 껍데기 안에서 열었는가(닫으면 껍데기로 돌아온다) */
  const nested = useRef(false)
  const exPushed = useRef(false)
  const exRef = useRef<ExplorerView | null>(null)
  useEffect(() => {
    exRef.current = ex
  }, [ex])
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

  /* ── 공간 탐험(공고 id) ─────────────────────────────────── */
  const loadExplorer = useCallback(async (noticeId: string, id: number) => {
    exCtl.current?.abort()
    const ctl = new AbortController()
    exCtl.current = ctl
    setEx(v => (v && exReq.current === id ? { ...v, status: 'LOADING_CONTEXT', error: null } : v))
    try {
      const r = await fetch(`/api/notices/${encodeURIComponent(noticeId)}/spatial`, { signal: ctl.signal })
      const j = (await r.json().catch(() => null)) as (SpatialResponse & { code?: string }) | null
      if (exReq.current !== id) return
      if (!r.ok || !j || !('noticeId' in j)) {
        const code = r.status === 404 ? 'NOT_FOUND' : j?.code === 'READ_FAILED' ? 'READ_FAILED' : 'ERROR'
        setEx(v => (v && exReq.current === id ? { ...v, status: 'ERROR', error: { code, message: `HTTP ${r.status}` } } : v))
        return
      }
      const lv: ExplorerLevel = j.levels.includes('NEIGHBORHOOD') ? 'NEIGHBORHOOD' : j.levels.includes('REGIONAL') ? 'REGIONAL' : 'NATIONAL'
      setEx(v =>
        v && exReq.current === id
          ? { ...v, status: j.capability.locationResolved ? 'READY' : 'LIMITED_DATA', data: j, error: null, level: v.level && j.levels.includes(v.level) ? v.level : lv }
          : v,
      )
      const rc = KOREA_REGIONS.find(x => x.name === (j.location.province ?? '').trim())?.code ?? null
      setJourney({ region: rc, noticeId: j.noticeId, noticeName: j.notice.name, announcementId: j.site.announcementId }, 'dive')
    } catch (err) {
      if (exReq.current !== id || (err instanceof DOMException && err.name === 'AbortError')) return
      setEx(v => (v && exReq.current === id ? { ...v, status: 'ERROR', error: { code: 'NETWORK', message: String(err) } } : v))
    }
  }, [])

  /** 껍데기를 곧장 연다. fromUrl 이면 주소를 새로 올리지 않는다(이미 그 주소다) */
  const openExplorer = useCallback(
    (req: ExploreRequest, fromUrl = false) => {
      const id = ++exReq.current
      if (!fromUrl) opener.current = (document.activeElement as HTMLElement | null) ?? null
      setEx({ status: 'OPENING', noticeId: req.noticeId, name: req.name ?? null, data: null, error: null, level: (req.level as ExplorerLevel | null) ?? null })
      if (!fromUrl) {
        const url = urlWithExplorer(location, req.noticeId)
        if (exPushed.current) history.replaceState({ zcExplore: req.noticeId }, '', url)
        else {
          history.pushState({ zcExplore: req.noticeId }, '', url)
          exPushed.current = true
        }
      }
      prefetchDive(null)
      void loadExplorer(req.noticeId, id)
    },
    [loadExplorer],
  )

  /** 닫기 — 상태만 거둔다(주소는 부르는 쪽이 정리). 진행 중인 요청을 끊고, 연 단추로 초점을 돌린다 */
  const finishExplorer = useCallback(() => {
    exReq.current++
    exCtl.current?.abort()
    exCtl.current = null
    setEx(v => (v ? { ...v, status: 'CLOSING' } : v))
    window.setTimeout(() => {
      setEx(v => (v && v.status === 'CLOSING' ? null : v))
      const o = opener.current
      opener.current = null
      if (o && o.isConnected) o.focus({ preventScroll: true })
    }, 160)
  }, [])

  const closeExplorer = useCallback(() => {
    if (exPushed.current) {
      // 우리가 올린 주소면 뒤로 — 브라우저 뒤로 가기와 같은 길(popstate 가 마저 닫는다)
      exPushed.current = false
      history.back()
      return
    }
    // 주소로 바로 들어왔다 — 뒤로 갈 자리가 없다. 고리만 걷어 낸다
    if (explorerIdFromUrl(location)) history.replaceState(history.state, '', urlWithoutExplorer(location) + (location.hash.startsWith('#dive=') ? '' : location.hash))
    finishExplorer()
  }, [finishExplorer])

  const begin = useCallback((req: DiveRequest, fromHash = false) => {
    const src = verifiedFor(req.announcementId)
    /*
     * 대조를 마치지 않은 공고라고 문을 닫지 않는다. 입체 모형을 세울 수 없을 뿐,
     * '어디인가'는 가진 자료만큼 보여 줄 수 있다. 위치를 아예 정할 수 없을 때만 열지 않는다.
     */
    if (!src) {
      // 대조를 마치지 않은 공고 — 같은 공간 탐험 껍데기로(공고 id 가 있을 때). 위치는 서버가 정한다
      const q = req.place
      if (q?.id) openExplorer({ noticeId: q.id, name: q.name, from: req.from, region: req.region })
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
  }, [openExplorer])

  useEffect(() => {
    const on = () => {
      ready.current = true
    }
    window.addEventListener('zc:complex-ready', on)
    return () => window.removeEventListener('zc:complex-ready', on)
  }, [])

  // 닫기·취소 — 우리가 주소를 올렸으면 뒤로 가기로(브라우저 뒤로 가기와 같은 길)
  const leave = useCallback(() => {
    if (nested.current) {
      // 탐험 껍데기 안에서 연 단지 단계 — 껍데기로 돌아온다(주소는 그대로)
      nested.current = false
      finish()
      return
    }
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
    const onExplore = (e: Event) => openExplorer((e as CustomEvent<ExploreRequest>).detail)
    const onPop = () => {
      // 단지 전환(#dive=10자리)
      if (!parseDiveHash(location.hash)?.announcementId && !nested.current) {
        pushed.current = false
        finish()
      }
      // 공간 탐험 — 주소가 가리키는 대로(뒤로: 닫기, 앞으로: 다시 열기)
      const id = explorerIdFromUrl(location)
      if (!id) {
        exPushed.current = false
        nested.current = false
        setOpen(null)
        finishExplorer()
      } else {
        const v = exRef.current
        if (!(v && v.noticeId === id && v.status !== 'CLOSING')) openExplorer({ noticeId: id }, true)
      }
    }
    window.addEventListener(DIVE_EVENT, onDive)
    window.addEventListener(EXPLORE_EVENT, onExplore)
    window.addEventListener('popstate', onPop)
    const onClose = () => leaveRef.current()
    window.addEventListener('zc:dive-close', onClose)
    /*
     * 주소로 바로 들어온 경우.
     *  - #dive=10자리      원문 대조 단지(예전 고리 그대로)
     *  - ?explore=<id> · /notices/<id>?view=3d · 예전 #dive=<id>  공간 탐험
     * 예전 #dive=<id> 는 같은 자리의 새 주소로 바꿔 적는다(공유한 고리가 깨지지 않게).
     */
    const key = parseDiveHash(location.hash)
    let raf = 0
    if (key?.announcementId) {
      const aid = key.announcementId
      raf = requestAnimationFrame(() => begin({ announcementId: aid }, true))
    } else {
      const id = explorerIdFromUrl(location)
      if (id) {
        if (key?.noticeId) history.replaceState(history.state, '', urlWithExplorer(location, id))
        raf = requestAnimationFrame(() => openExplorer({ noticeId: id }, true))
      }
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener(DIVE_EVENT, onDive)
      window.removeEventListener(EXPLORE_EVENT, onExplore)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('zc:dive-close', onClose)
      clear()
      exCtl.current?.abort()
    }
  }, [begin, finish, openExplorer, finishExplorer])

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

  const shell =
    ex &&
    createPortal(
      <NoticePlace
        view={ex}
        onClose={closeExplorer}
        onRetry={() => {
          const id = ++exReq.current
          void loadExplorer(ex.noticeId, id)
        }}
        onLevel={l => setEx(v => (v ? { ...v, level: l } : v))}
        onComplex={aid => {
          nested.current = true
          begin({ announcementId: aid }, true)
        }}
      />,
      document.body,
    )

  if (!open) return shell || null

  const src = verifiedFor(open.req.announcementId)!
  const from = open.req.from ?? null
  return (
    <>
      {shell}
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
