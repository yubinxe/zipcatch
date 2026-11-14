'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { SpatialResponse, ExplorerLevel } from '@/app/api/notices/[id]/spatial/route'
import GeoStage from './GeoStage'
import type { GeoScene } from './geo-scene'
import type { NeighborhoodInfo, NeighborhoodStatus } from './Neighborhood3D'

const Neighborhood3D = dynamic(() => import('./Neighborhood3D'), { ssr: false })

/**
 * 공간 탐험의 껍데기 — 어느 공고, 어느 화면에서 열어도 같은 하나.
 *
 * 상태(DiveHost 가 정한다)
 *   OPENING · LOADING_CONTEXT  껍데기는 곧장 선다. 이름(알면)과 전국 무대부터
 *   READY                      자리를 지역 이상으로 정했다
 *   LIMITED_DATA               위치를 모른다 — 전국 무대와 그 이유. 가짜 표식은 없다
 *   ERROR                      자료를 못 받았다 — 다시 시도·공고 상세·원문·닫기
 *   NOT_FOUND                  그런 공고가 없다 — 다른 공고로 바꿔 보여 주지 않는다
 *
 * 단계  전국 → 지역 → 동네(공개 지도 건물·길) → 단지(원문 대조 매스, 있을 때만)
 * 단계마다 그릴 수 있는 것은 서버가 정한다. 자료가 없는 단계는 단추가 비활성으로 남고 이유를 적는다.
 */
export type ExplorerStatus = 'IDLE' | 'OPENING' | 'LOADING_CONTEXT' | 'READY' | 'LIMITED_DATA' | 'ERROR' | 'CLOSING'

export interface ExplorerView {
  status: ExplorerStatus
  noticeId: string
  /** 불러오기 전에 알던 이름 */
  name: string | null
  data: SpatialResponse | null
  error: { code: 'NOT_FOUND' | 'READ_FAILED' | 'NETWORK' | 'ERROR'; message: string } | null
  level: ExplorerLevel | null
}

const LEVEL_TEXT: Record<ExplorerLevel, string> = {
  NATIONAL: '전국',
  REGIONAL: '지역',
  NEIGHBORHOOD: '주변',
  COMPLEX: '단지',
  UNIT_INFORMATION: '주택형',
}

const PROVENANCE_TEXT: Record<SpatialResponse['location']['provenance'], string> = {
  PARCEL_CONFIRMED: '필지 확인',
  ADDRESS_GEOCODED: '주소 좌표',
  NAME_GEOCODED: '공고명 검색 좌표 · 대략',
  DISTRICT_APPROXIMATE: '시·군·구까지',
  PROVINCE_APPROXIMATE: '시·도까지',
  UNKNOWN: '위치 미확인',
}

type Camera = Pick<GeoScene, 'reset' | 'nudge'> & { national?: () => void; northUp?: () => void }

function statusLine(d: SpatialResponse['notice']): string | null {
  const t = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
  const s = d.applicationStart
  const e = d.applicationEnd
  if (e && e < t) return `접수 마감 ${e}`
  if (s && t < s) return `접수 예정 ${s}${e ? ` ~ ${e}` : ''}`
  // 시작일이 없으면 지금 접수 중인지 알 수 없다 — 마감일만으로 '접수 중'이라 하지 않는다
  if (!s && e) return `마감 ${e} · 시작일 미공개`
  if (s && e) return `공고 일정상 접수 기간 · 마감 ${e}`
  return null
}

export default function NoticePlace({
  view,
  onClose,
  onRetry,
  onLevel,
  onComplex,
}: {
  view: ExplorerView
  onClose: () => void
  onRetry: () => void
  onLevel: (l: ExplorerLevel) => void
  /** 원문 대조 단지 단계로 — 매스가 있는 공고만 */
  onComplex: (announcementId: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const cam = useRef<Camera | null>(null)
  const [nb, setNb] = useState<{ id: string; status: NeighborhoodStatus; attribution?: string; build?: string; reason?: string; buildings?: number; withHeight?: number } | null>(null)
  const [sheet, setSheet] = useState<'peek' | 'open'>('peek')
  const d = view.data
  const busy = view.status === 'OPENING' || view.status === 'LOADING_CONTEXT'

  /* 모달의 기본 예절 — Esc 로 닫히고, 초점이 안에 머물고, 닫으면 연 단추로 돌아간다(DiveHost) */
  useEffect(() => {
    const el = ref.current
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      // 위에 단지 단계(.pxe)가 열려 있으면 그쪽이 Esc 를 맡는다
      if (document.querySelector('.pxe')) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]')].filter(x => x.offsetParent !== null)
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const level: ExplorerLevel = view.level ?? 'NATIONAL'
  const nbForThis = nb && nb.id === view.noticeId ? nb : null
  const nbFailed = nbForThis?.status === 'ASSET_UNAVAILABLE' || nbForThis?.status === 'RENDER_FAILED'
  const wantNeighborhood = level === 'NEIGHBORHOOD' && !!d?.capability.neighborhood && !nbFailed
  // 동네 장면이 서면 지역 무대를 내린다 — WebGL 맥락은 한 번에 하나(모바일 GPU). 실패하면 지역 무대가 다시 선다
  const showNeighborhood = wantNeighborhood && nbForThis?.status === 'READY'
  const onNb = useCallback(
    (status: NeighborhoodStatus, info?: NeighborhoodInfo) =>
      setNb({ id: view.noticeId, status, attribution: info?.attribution, build: info?.build, reason: info?.reason, buildings: info?.counts?.buildings, withHeight: info?.counts?.withHeight }),
    [view.noticeId],
  )
  /*
   * 카메라 단추는 지금 보이는 장면에만 — 장면마다 주인을 적어 두고, 내려가는 장면이 남이 잡은 카메라를 지우지 않게.
   */
  const camOwner = useRef<'geo' | 'nb' | null>(null)
  const setGeoCam = useCallback((s: Camera | null) => {
    if (s) {
      cam.current = s
      camOwner.current = 'geo'
    } else if (camOwner.current === 'geo') {
      cam.current = null
      camOwner.current = null
    }
  }, [])
  const setNbCam = useCallback((s: Camera | null) => {
    if (s) {
      cam.current = s
      camOwner.current = 'nb'
    } else if (camOwner.current === 'nb') {
      cam.current = null
      camOwner.current = null
    }
  }, [])

  // 무대 키보드 — 화살표·+/-·0(처음)·N(북쪽 위)
  const onStageKey = (e: React.KeyboardEvent) => {
    const c = cam.current
    if (!c) return
    const k = e.key
    const map: Record<string, Parameters<GeoScene['nudge']>[0]> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out' }
    if (map[k]) {
      e.preventDefault()
      c.nudge(map[k])
    } else if (k === '0') c.reset()
    else if (k === 'n' || k === 'N') c.northUp?.()
  }

  // 휴대폰 아래 판 — 손잡이를 끌어 펴고 접는다(누르면 번갈아)
  const drag = useRef<{ y: number; moved: boolean } | null>(null)
  const onHandleDown = (e: RPointerEvent) => {
    drag.current = { y: e.clientY, moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onHandleMove = (e: RPointerEvent) => {
    const g = drag.current
    if (!g) return
    const dy = e.clientY - g.y
    if (Math.abs(dy) > 24) {
      g.moved = true
      setSheet(dy < 0 ? 'open' : 'peek')
    }
  }
  const onHandleUp = () => {
    if (drag.current && !drag.current.moved) setSheet(s => (s === 'open' ? 'peek' : 'open'))
    drag.current = null
  }

  const name = d?.notice.name ?? view.name ?? '공고'
  const where = d ? [d.location.province, d.location.district && d.location.district !== d.location.province ? d.location.district : null].filter(Boolean).join(' ') : null
  const point = d && d.location.lat !== null && d.location.lng !== null ? { lat: d.location.lat, lng: d.location.lng } : null
  const regionCode = level === 'NATIONAL' ? null : (d?.location.regionCode ?? null)
  const st = d ? statusLine(d.notice) : null
  const levels: ExplorerLevel[] = ['NATIONAL', 'REGIONAL', 'NEIGHBORHOOD', 'COMPLEX']

  return (
    <div className="zx" role="dialog" aria-modal="true" aria-label={`${name} — 3D 공간 탐험`} ref={ref} data-status={view.status} data-sheet={sheet}>
      <div className="zx-stage" tabIndex={0} onKeyDown={onStageKey} aria-label="입체 지도. 화살표로 돌리고 +·- 로 확대, 0 으로 처음 자리">
        {/* 전국·지역 무대는 언제나 아래에 있다 — 동네 자료가 늦거나 없어도 빈 화면이 없다 */}
        {!showNeighborhood && (
          <GeoStage
            regionCode={regionCode}
            point={level === 'NATIONAL' ? null : point}
            pinpoint={!!d?.capability.pinpoint && level !== 'NATIONAL'}
            approximate={!!d?.capability.approximateArea && level !== 'NATIONAL'}
            label={`${d?.location.province ?? '전국'} 위치 그림`}
            onScene={setGeoCam}
          />
        )}
        {d && wantNeighborhood && (
          <Neighborhood3D noticeId={view.noticeId} pinpoint={d.capability.pinpoint} onStatus={onNb} onScene={setNbCam} />
        )}

        <div className="zx-tools" role="toolbar" aria-label="카메라">
          <button type="button" onClick={() => cam.current?.nudge('in')} aria-label="확대">+</button>
          <button type="button" onClick={() => cam.current?.nudge('out')} aria-label="축소">−</button>
          <button type="button" onClick={() => cam.current?.nudge('left')} aria-label="왼쪽으로 돌리기">↺</button>
          <button type="button" onClick={() => cam.current?.nudge('right')} aria-label="오른쪽으로 돌리기">↻</button>
          <button type="button" onClick={() => cam.current?.northUp?.()} aria-label="북쪽을 위로" disabled={!showNeighborhood}>N</button>
          <button type="button" onClick={() => cam.current?.reset()} aria-label="처음 자리로">⌖</button>
        </div>

        {showNeighborhood && nbForThis && (
          <p className="zx-credit">
            {/* 자료 수준에 맞는 말 — 공고명 좌표는 '추정한 주변 지역', 높이가 없으면 '위치와 윤곽' */}
            {d?.location.provenance === 'NAME_GEOCODED'
              ? '공고명으로 추정한 주변 지역 — 특정 건물이 이 공고의 단지라는 뜻이 아닙니다'
              : (nbForThis.withHeight ?? 0) > 0
                ? '공개 공간정보 기반 주변 건물 — 기존 건물이며 이 공고 단지의 형상이 아닙니다'
                : '주변 건물의 위치와 윤곽 — 높이 자료가 없어 바닥 윤곽만 그립니다'}
            {typeof nbForThis.buildings === 'number' &&
              ` · 건물 ${nbForThis.buildings}동 중 높이 자료 ${nbForThis.withHeight ?? 0}동(지도 자료 값 — 실측 또는 층수 셈, 나머지는 바닥 윤곽)`}
            {` · ${nbForThis.attribution ?? '© OpenStreetMap 기여자'}${nbForThis.build ? ` · 기준 ${nbForThis.build.slice(0, 4)}-${nbForThis.build.slice(4, 6)}-${nbForThis.build.slice(6, 8)}` : ''}`}
          </p>
        )}
        {wantNeighborhood && (nbForThis?.status === 'FETCHING_ASSET' || nbForThis?.status === 'RENDERING') && (
          <p className="zx-credit" role="status">주변 건물·길을 불러오는 중</p>
        )}
        {level === 'NEIGHBORHOOD' && nbFailed && (
          <p className="zx-credit" role="status">
            {nbForThis?.status === 'RENDER_FAILED' ? '이 기기에서 동네 입체를 그리지 못해 지역 무대로 보여 드립니다' : '이 자리의 주변 지도 자료가 아직 없어 지역 무대로 보여 드립니다'}
          </p>
        )}
        {d && level !== 'NEIGHBORHOOD' && (
          <p className="zx-credit">{d.location.provenance === 'UNKNOWN' ? '공고의 위치를 아직 확인할 수 없습니다 — 전국 단계' : '지역 수준 3D 탐험 — 단지의 정확한 자리를 짚지 않습니다'}</p>
        )}
      </div>

      <aside className="zx-panel" aria-busy={busy}>
        <button
          type="button"
          className="zx-handle"
          aria-label={sheet === 'open' ? '정보 접기' : '정보 펴기'}
          aria-expanded={sheet === 'open'}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
        >
          <i aria-hidden="true" />
        </button>

        <header className="zx-head">
          <p className="zx-eyebrow">3D 공간 탐험{d ? ` · ${LEVEL_TEXT[level]}` : ''}</p>
          <h2 className="zx-name">{view.error?.code === 'NOT_FOUND' ? '공고를 찾을 수 없습니다' : name}</h2>
          {where && <p className="zx-where">{where}</p>}
          <button type="button" className="zx-close" onClick={onClose} aria-label="닫기" data-autofocus>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {busy && (
          <p className="zx-note" role="status">
            공간 정보를 불러오는 중
          </p>
        )}

        {view.status === 'ERROR' && view.error && (
          <div className="zx-error" role="alert">
            <p>
              {view.error.code === 'NOT_FOUND'
                ? '이 주소의 공고가 저장소에 없습니다. 다른 공고로 바꿔 보여 드리지 않습니다.'
                : view.error.code === 'READ_FAILED'
                  ? '공간 정보를 불러오지 못했습니다. 공고 저장소를 읽지 못했습니다.'
                  : '공간 정보를 불러오지 못했습니다.'}
            </p>
            <div className="zx-go">
              {view.error.code !== 'NOT_FOUND' && (
                <button type="button" className="cs-btn cs-btn--primary" onClick={onRetry}>
                  다시 시도
                </button>
              )}
              {view.error.code !== 'NOT_FOUND' && (
                <Link href={`/notices/${view.noticeId}`} className="cs-btn cs-btn--ghost" onClick={onClose}>
                  공고 상세
                </Link>
              )}
              <button type="button" className="cs-btn cs-btn--text" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        )}

        {d && (
          <>
            <div className="zx-badges">
              <span className="zx-conf" data-p={d.location.provenance}>
                {PROVENANCE_TEXT[d.location.provenance]}
              </span>
              {st && <span className="zx-status cs-num">{st}</span>}
            </div>

            {view.status === 'LIMITED_DATA' && <p className="zx-note zx-note--warn">이 공고의 정확한 위치를 확인할 수 없습니다.</p>}

            <nav className="zx-levels" aria-label="보기 단계">
              {levels.map(l => {
                const ok = d.levels.includes(l)
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={level === l}
                    disabled={!ok}
                    title={ok ? undefined : l === 'NEIGHBORHOOD' ? '동네 수준의 자리를 정할 수 없는 공고입니다' : l === 'COMPLEX' ? '확인된 단지 형상 자료가 없습니다' : '지역을 정할 수 없습니다'}
                    onClick={() => (l === 'COMPLEX' && d.site.announcementId ? onComplex(d.site.announcementId) : onLevel(l))}
                  >
                    {LEVEL_TEXT[l]}
                  </button>
                )
              })}
            </nav>

            <dl className="zx-facts">
              {d.notice.housingType && (
                <div>
                  <dt>공급 유형</dt>
                  <dd>{d.notice.housingType}</dd>
                </div>
              )}
              {d.location.address && (
                <div>
                  <dt>주소</dt>
                  <dd>{d.location.address}</dd>
                </div>
              )}
              <div>
                <dt>위치 정확도</dt>
                <dd>{d.location.accuracy}</dd>
              </div>
              {d.capability.pinpoint && point && (
                <div>
                  <dt>좌표</dt>
                  <dd className="cs-num">
                    {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                  </dd>
                </div>
              )}
              <div>
                <dt>출처</dt>
                <dd>{d.notice.source}</dd>
              </div>
            </dl>

            <ul className="zx-limit">
              {d.limitations.map(l => (
                <li key={l}>{l}</li>
              ))}
            </ul>

            <div className="zx-go">
              <Link href={`/notices/${d.noticeId}`} className="cs-btn cs-btn--primary" onClick={onClose}>
                자세히 보기
              </Link>
              {d.site.announcementId && (
                <button type="button" className="cs-btn cs-btn--ghost" onClick={() => onComplex(d.site.announcementId!)}>
                  단지 입체 보기
                </button>
              )}
              {d.notice.sourceUrl && (
                <a href={d.notice.sourceUrl} className="cs-btn cs-btn--text" target="_blank" rel="noopener noreferrer">
                  공고 원문
                </a>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
