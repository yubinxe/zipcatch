'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { KOREA_MAP_VIEWBOX, KOREA_PROVINCES } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { resolveSpatial, type CoordKind } from '@/lib/consumer/spatial-capability'

/**
 * 공고의 자리 — 원문 대조를 마치지 않은 공고의 공간 화면.
 *
 * 전국 어느 공고에서든 '어디인가'로 들어갈 수 있어야 한다. 그렇다고 없는 정밀도를
 * 지어내지 않는다. 가진 자료가 좌표까지면 그 점을, 지역까지면 지역을 비추고,
 * 각 등급이 세울 수 없는 것을 화면에 그대로 적는다(lib/consumer/spatial-capability).
 *
 * 입체 모형은 여기서 그리지 않는다 — 동 윤곽과 층수를 확인하지 않았기 때문이다.
 * 지도 엔진도 새로 들이지 않는다. 이미 쓰는 전국 지리 그림 하나로 충분하다.
 */
export interface PlaceNotice {
  id?: string | null
  name: string
  region?: string | null
  district?: string | null
  address?: string | null
  housingType?: string | null
  source?: string | null
  sourceUrl?: string | null
  applicationEnd?: string | null
  coord?: CoordKind | null
  lat?: number | null
  lng?: number | null
}

export default function NoticePlace({ notice, onClose }: { notice: PlaceNotice; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cap = resolveSpatial({ coord: notice.coord ?? null })

  /* 모달의 기본 예절 — Esc 로 닫히고, 초점이 안에 머문다 */
  useEffect(() => {
    const el = ref.current
    const before = document.activeElement as HTMLElement | null
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      before?.focus?.()
    }
  }, [onClose])

  const regionName = (notice.region ?? '').trim()
  const code = KOREA_REGIONS.find(r => r.name === regionName)?.code ?? null
  const where = [notice.region, notice.district].filter(Boolean).join(' ')

  return (
    <div className="cs-place" role="dialog" aria-modal="true" aria-label={`${notice.name} 위치`} ref={ref}>
      <div className="cs-place__scrim" onClick={onClose} aria-hidden="true" />

      <div className="cs-place__panel">
        <header className="cs-place__head">
          <p className="cs-place__eyebrow">공고의 자리</p>
          <h2 className="cs-place__name">{notice.name}</h2>
          {where && <p className="cs-place__where">{where}</p>}
          <button type="button" className="cs-place__close" onClick={onClose} aria-label="닫기" data-autofocus>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="cs-place__body">
          <figure className="cs-place__map">
            <svg viewBox={KOREA_MAP_VIEWBOX} role="img" aria-label={`${regionName || '전국'} 위치 그림`}>
              {KOREA_PROVINCES.map(p => (
                <path key={p.code} d={p.path} className="cs-place__prov" data-on={p.code === code || undefined} />
              ))}
            </svg>
            <figcaption>{cap.accuracy}</figcaption>
          </figure>

          <div className="cs-place__facts">
            <dl>
              {notice.housingType && (
                <div>
                  <dt>공급 유형</dt>
                  <dd>{notice.housingType}</dd>
                </div>
              )}
              {notice.address && (
                <div>
                  <dt>주소</dt>
                  <dd>{notice.address}</dd>
                </div>
              )}
              {notice.applicationEnd && (
                <div>
                  <dt>접수 마감</dt>
                  <dd className="cs-num">{notice.applicationEnd}</dd>
                </div>
              )}
              {cap.can.pinpoint && typeof notice.lat === 'number' && typeof notice.lng === 'number' && (
                <div>
                  <dt>좌표</dt>
                  <dd className="cs-num">
                    {notice.lat.toFixed(5)}, {notice.lng.toFixed(5)}
                  </dd>
                </div>
              )}
              {notice.source && (
                <div>
                  <dt>출처</dt>
                  <dd>{notice.source}</dd>
                </div>
              )}
            </dl>

            {/* 이 등급이 세울 수 없는 것 — 화면에서 가장 먼저 읽히게 둔다 */}
            <p className="cs-place__limit">{cap.limitation}</p>

            <div className="cs-place__go">
              {notice.id && (
                <Link href={`/notices/${notice.id}`} className="cs-btn cs-btn--primary" onClick={onClose}>
                  공고 자세히 보기
                </Link>
              )}
              <Link href={code ? `/map?region=${code}` : '/map'} className="cs-btn cs-btn--ghost" onClick={onClose}>
                지도에서 보기
              </Link>
              {notice.sourceUrl && (
                <a href={notice.sourceUrl} className="cs-btn cs-btn--text" target="_blank" rel="noopener noreferrer">
                  공고 원문
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
