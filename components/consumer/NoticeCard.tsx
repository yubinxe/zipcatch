'use client'

import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import type { Candidate } from '@/lib/crm/services/scoring'
import type { Property } from '@/lib/crm/types'
import { formatManOr } from '@/lib/crm/services/scoring'
import type { SpecialBrief } from '@/lib/adapters/applyhome-special'
import SaveButton from './SaveButton'
import RegionMark from './RegionMark'

export function statusBadge(urgency: Candidate['urgency']) {
  switch (urgency.level) {
    case 'CLOSED':
      return { cls: '', text: '접수 마감' }
    case 'TODAY':
    case 'IMMINENT':
      return { cls: 'cs-badge--urgent', text: urgency.label }
    case 'SOON':
      return { cls: 'cs-badge--check', text: urgency.label }
    case 'UPCOMING':
      return { cls: 'cs-badge--brand', text: urgency.label }
    case 'UNKNOWN':
      return { cls: '', text: '마감일 미정' }
    default:
      return { cls: 'cs-badge--ok', text: '접수중' }
  }
}

/** 상한을 얼마나 넘는지 — 감추면 사용자가 판단할 수 없다 */
function overageLabel(candidate: Candidate): string | null {
  const bits: string[] = []
  if (candidate.budget.depositOver > 0) bits.push(`보증금 ${formatManOr(candidate.budget.depositOver)}`)
  if (candidate.budget.rentOver > 0) bits.push(`월 임대료 ${candidate.budget.rentOver.toLocaleString()}만원`)
  return bits.length ? `${bits.join(' · ')} 초과` : null
}

/**
 * 금액을 숫자와 단위로 가른다 — "1억 2,000만원" → ["1억 2,000", "만원"].
 * 숫자는 크게, 단위는 작게 적어야 금액이 한눈에 읽힌다. 단위가 없는 말
 * ('공고문 확인')은 그대로 돌려준다.
 */
export function splitWon(text: string): [string, string] {
  const m = text.match(/^(.*\d)\s*(만원|억원)$/)
  return m ? [m[1], m[2]] : [text, '']
}

/** 빈 자리의 표 — 세 겹의 판. 꾸밈이며 아무 수치도 담지 않는다 */
export function EmptyMark() {
  return (
    <span className="cs-sa-empty__mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

const WEEK = '일월화수목금토'

/** "2026-11-05" → "11. 05 (목)". 요일은 달력 날짜로만 센다 — 사는 곳의 시간대와 무관하다 */
export function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')} (${WEEK[day]})`
}

/** 남은 날을 표 한 칸으로 */
export function ddayText(daysLeft: number | null) {
  if (daysLeft === null) return null
  if (daysLeft < 0) return '마감'
  if (daysLeft === 0) return 'D-DAY'
  return `D-${daysLeft}`
}

/**
 * 손끝을 따라 기우는 카드.
 *
 * 카드 자신은 기울기·반사광·겹 밀림의 값(--rx · --ry · --mx · --my · --px · --py)만
 * 받고, 실제로 기울이는 일은 CSS 가 맡는다(consumer-spaces.css). 그래야 떠오름(hover)과
 * 기울기가 한 transform 안에서 합쳐지고, 손을 떼면 부드럽게 제자리로 돌아온다.
 *
 * 겹의 깊이는 preserve-3d 로 세우지 않는다. 입체 맥락에서는 브라우저마다 누르는
 * 자리를 고르는 순서가 달라, 덮개 링크와 저장 단추의 앞뒤가 뒤집힐 수 있다.
 * 겹은 평면에 둔 채 손끝 반대쪽으로 조금씩 밀어(translate) 깊이를 흉내 낸다.
 *
 * 손가락 화면과 움직임을 줄인 사용자에게는 걸지 않는다.
 */
function useDepth(on: boolean, max = 5) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!on || !el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    let frame = 0
    let last: PointerEvent | null = null

    const paint = () => {
      frame = 0
      if (!last) return
      const r = el.getBoundingClientRect()
      const px = Math.min(1, Math.max(0, (last.clientX - r.left) / r.width))
      const py = Math.min(1, Math.max(0, (last.clientY - r.top) / r.height))
      el.style.setProperty('--rx', `${((0.5 - py) * max * 2).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${((px - 0.5) * max * 2).toFixed(2)}deg`)
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
      // 겹마다 다르게 밀리는 거리(-1 ~ 1) — 앞에 선 겹일수록 많이 움직여 깊이가 생긴다
      el.style.setProperty('--px', ((px - 0.5) * 2).toFixed(3))
      el.style.setProperty('--py', ((py - 0.5) * 2).toFixed(3))
    }
    const onMove = (e: PointerEvent) => {
      // 저장·비교 단추 위에서는 기울기를 멈춘다 — 누르려는 단추가 손끝 밑에서 움직이지 않게
      if (e.target instanceof Element && e.target.closest('button, label, input')) return
      last = e
      el.dataset.tilt = 'on'
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onLeave = () => {
      last = null
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      delete el.dataset.tilt
      el.style.removeProperty('--rx')
      el.style.removeProperty('--ry')
      el.style.removeProperty('--px')
      el.style.removeProperty('--py')
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [on, max])
  return ref
}

export default function NoticeCard({
  property,
  candidate,
  showReasons = true,
  index,
  special,
  variant = 'default',
  depth = false,
  pick,
}: {
  property: Property
  candidate: Candidate | null
  showReasons?: boolean
  /** 카탈로그 인덱스 (0-based). 주면 카드 머리에 번호가 붙는다 */
  index?: number
  /**
   * 특별공급이 이미 어떻게 끝났는지. 청약홈 분양에만 붙는다.
   *
   * 접수 중인 공고에 숫자를 얹는 유일한 자리다 — 특별공급이 하루 먼저
   * 접수되고 그 결과가 일반공급 접수 사이에 공개되기 때문이다.
   * 어느 공고를 열지 고르는 자리가 여기라서, 상세까지 미루지 않는다.
   */
  special?: SpecialBrief
  /**
   * 카드가 놓이는 층.
   *
   * `nearby` 는 조건을 벗어난 후보가 서는 자리다. 흰 카드에서 내려와 지면과
   * 같은 톤으로 가라앉히고, 괘선만 남긴다 — 조건에 맞는 후보와 나란히 두면
   * 같은 자격으로 읽히기 때문이다. 지우지는 않는다. 볼지 말지는 사용자가 정한다.
   */
  variant?: 'default' | 'nearby'
  /** 손끝을 따라 기우는 입체. 밝은 작업 지면(공고·후보·관심)에서만 켠다 */
  depth?: boolean
  /** 카드 바닥, 저장 단추 앞에 놓일 것(관심공고의 '비교' 담기) */
  pick?: ReactNode
}) {
  const ref = useDepth(depth)
  const badge = candidate ? statusBadge(candidate.urgency) : null
  const overBudget = candidate ? candidate.budget.depositOver > 0 || candidate.budget.rentOver > 0 : false
  const overage = candidate && variant === 'nearby' ? overageLabel(candidate) : null

  // 초과분을 카드 머리에 이미 적었으면 '확인 필요' 줄에서는 건너뛴다.
  // buildCautions 는 초과 항목을 맨 앞에 쌓으므로 그만큼만 밀면 된다.
  // 같은 말을 두 줄에 적으면 두 번째 줄은 읽히지 않는다.
  const skip = overage
    ? (candidate!.budget.depositOver > 0 ? 1 : 0) + (candidate!.budget.rentOver > 0 ? 1 : 0)
    : 0
  const caution = candidate ? (candidate.cautions[skip] ?? candidate.cautions[0]) : null

  const days = candidate?.urgency.daysLeft ?? null
  const dday = candidate && candidate.urgency.level !== 'CLOSED' ? ddayText(days) : null
  const isSample = property.dataOrigin === 'SYNTHETIC'
  const [depositNum, depositUnit] = splitWon(formatManOr(property.deposit))

  return (
    <article
      ref={ref}
      className={variant === 'nearby' ? 'cs-notice cs-notice--nearby' : 'cs-notice'}
      data-depth={depth ? 'on' : undefined}
      data-level={candidate?.urgency.level}
    >
      <Link
        href={`/notices/${property.id}`}
        className="cs-notice__link"
        aria-label={`${property.name} 자세히 보기`}
      />
      {/* 손끝을 따라 움직이는 반사광 — 입체를 켠 카드에서만 보인다 */}
      <span className="cs-notice__glare" aria-hidden="true" />

      <div className="cs-notice__head">
        {index !== undefined && (
          <span className="cs-notice__index">{String(index + 1).padStart(3, '0')}</span>
        )}
        {isSample ? (
          <span className="cs-sample">예시 공고</span>
        ) : (
          <span className="cs-official">공식 공고</span>
        )}
      </div>

      <div className="cs-notice__top">
        <span className="cs-badge cs-badge--brand">{property.housingType}</span>
        {badge && (
          <span className={`cs-badge ${badge.cls}`}>
            {(badge.cls === 'cs-badge--urgent' || badge.cls === 'cs-badge--ok') && (
              <span className="cs-badge__dot" />
            )}
            {badge.text}
          </span>
        )}
        {/* 유사 후보 층에서는 초과액 자체를 적는다. "예산 초과" 넉 자만으로는
            10만원 차이와 1억 차이가 같은 말이 된다. */}
        {overBudget && variant !== 'nearby' && <span className="cs-badge cs-badge--check">예산 초과</span>}
      </div>

      {overage && <div className="cs-notice__over">{overage}</div>}

      {/* 오른쪽 여백에 지역 마크. 단지명·지역이 왼쪽에만 몰려 있던 자리를 받는다 */}
      <RegionMark region={property.region} district={property.district} title={property.name} />

      <h3 className="cs-notice__name">{property.name}</h3>
      <p className="cs-notice__where">
        {/* 광역이 없거나 지역과 같으면 한 번만 적는다 */}
        {property.district && property.district !== property.region
          ? `${property.district} ${property.region}`
          : property.region}
        {property.area !== null && <> · 전용 {property.area}㎡</>}
      </p>

      {/* 특별공급은 하루 먼저 끝난다. 접수가 열려 있는 공고에도 붙는
          유일한 실제 숫자라 금액 줄보다 위에 둔다. */}
      {special && (
        <p
          className="cs-notice__sp"
          data-tone={special.shortBy > 0 ? 'UNDER' : 'HOT'}
          // 카드에서는 '특별공급' 넉 자로만 범위를 밝힌다. 그 넉 자를 놓친 채
          // 일반공급 잔여로 읽는 일이 없도록 한 줄을 덧붙인다.
          title={`특별공급 ${special.supply.toLocaleString()}세대에 ${special.applied.toLocaleString()}건 접수. 일반공급 결과가 아닙니다.`}
        >
          <span className="cs-notice__sp-tag">특별공급</span>
          <b className="cs-num">
            {special.shortBy > 0 ? `${special.shortBy.toLocaleString()}세대 남고 마감` : `${special.rate}배 마감`}
          </b>
          <span className="cs-notice__sp-meta cs-num">
            {special.supply.toLocaleString()}세대 · {special.applied.toLocaleString()}건
          </span>
        </p>
      )}

      <div className="cs-notice__price">
        {property.deposit === null && property.monthlyRent === null ? (
          // 공고 목록에 금액이 없는 경우. 0 원으로 채우지 않는다.
          // 분양·임대를 함께 다루므로 "임대조건" 으로 좁혀 쓰지 않는다.
          <div className="cs-notice__unknown">공급금액·면적은 모집공고문에서 확인하세요</div>
        ) : (
          <>
            <div className="cs-notice__deposit cs-num">
              <span className="cs-notice__k">보증금</span>
              <span className="cs-notice__v" data-plain={depositUnit ? undefined : 'true'}>
                {depositNum}
                {depositUnit && <small>{depositUnit}</small>}
              </span>
            </div>
            <div className="cs-notice__rent cs-num">
              <span className="cs-notice__k">월 임대료</span>
              {property.monthlyRent === null ? (
                <span className="cs-notice__v" data-plain="true">
                  공고문 확인
                </span>
              ) : (
                <span className="cs-notice__v">
                  {property.monthlyRent.toLocaleString()}
                  <small>만원</small>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {showReasons && candidate && candidate.reasons.length > 0 && (
        <ul className="cs-notice__reasons">
          {candidate.reasons.slice(0, 2).map(r => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {caution && <div className="cs-notice__caution">확인 필요 · {caution}</div>}

      <div className="cs-notice__foot">
        <div className="cs-notice__meta">
          {property.applicationEnd ? (
            <span className="cs-notice__due">
              <span className="cs-notice__due-k">{isSample ? '예시' : '공식'} 접수 마감</span>
              <span className="cs-notice__due-v cs-num">{shortDate(property.applicationEnd)}</span>
              {dday && (
                <span className="cs-notice__dday cs-num" data-hot={days !== null && days <= 3 ? 'true' : undefined}>
                  {dday}
                </span>
              )}
            </span>
          ) : (
            <span className="cs-notice__due">
              <span className="cs-notice__due-k">접수 마감일 공고 미공개</span>
            </span>
          )}
          <span className="cs-notice__src">{property.source}</span>
        </div>
        {pick}
        <SaveButton propertyId={property.id} />
      </div>
    </article>
  )
}
