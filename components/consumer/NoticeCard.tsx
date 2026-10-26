'use client'

import Link from 'next/link'
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

export default function NoticeCard({
  property,
  candidate,
  showReasons = true,
  index,
  special,
  variant = 'default',
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
}) {
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

  return (
    <article className={variant === 'nearby' ? 'cs-notice cs-notice--nearby' : 'cs-notice'}>
      <Link
        href={`/notices/${property.id}`}
        className="cs-notice__link"
        aria-label={`${property.name} 자세히 보기`}
      />

      {index !== undefined && (
        <span className="cs-notice__index">{String(index + 1).padStart(3, '0')}</span>
      )}

      <div className="cs-notice__top">
        {property.dataOrigin === 'SYNTHETIC' ? (
          <span className="cs-sample">예시 공고</span>
        ) : (
          <span className="cs-official">공식 공고</span>
        )}
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
            <div className="cs-notice__deposit cs-num">보증금 {formatManOr(property.deposit)}</div>
            <div className="cs-notice__rent cs-num">
              월 임대료{' '}
              {property.monthlyRent === null
                ? '공고문 확인'
                : `${property.monthlyRent.toLocaleString()}만원`}
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
            <>{property.dataOrigin === 'SYNTHETIC' ? '예시' : '공식'} 접수 마감 {property.applicationEnd}</>
          ) : (
            <>접수 마감일 공고 미공개</>
          )}
          <br />
          {property.source}
          <br />
          <span style={{ color: 'var(--brand)', fontSize: 16, fontWeight: 600 }}>
            자세히 보기 <span className="cs-arrow">→</span>
          </span>
        </div>
        <SaveButton propertyId={property.id} />
      </div>
    </article>
  )
}
