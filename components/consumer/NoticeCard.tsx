'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Candidate } from '@/lib/crm/services/scoring'
import type { Property } from '@/lib/crm/types'
import { formatManOr } from '@/lib/crm/services/scoring'
import type { SpecialBrief } from '@/lib/adapters/applyhome-special'
import SaveButton from './SaveButton'
import CompareToggle from './battle/CompareToggle'
import NoticeTitleMorph from './NoticeTitleMorph'

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
 * 카드 머리의 상태 한 마디. 남은 날 수는 바닥의 D-day 표가 맡으므로
 * 여기서는 숫자를 되풀이하지 않고 상태만 말한다.
 */
function cardStatus(urgency: Candidate['urgency']): { tone: string; text: string } {
  switch (urgency.level) {
    case 'CLOSED':
      return { tone: 'off', text: urgency.label || '접수 마감' }
    case 'TODAY':
      return { tone: 'hot', text: '오늘 마감' }
    case 'IMMINENT':
      return { tone: 'hot', text: '마감 임박' }
    case 'SOON':
      return { tone: 'soon', text: '곧 마감' }
    case 'UPCOMING':
      return { tone: 'next', text: urgency.label }
    case 'UNKNOWN':
      return { tone: 'off', text: '마감일 미정' }
    default:
      return { tone: 'open', text: '접수중' }
  }
}

/**
 * 공고명 — 'A-3블록' 처럼 붙임표가 든 낱말은 붙임표에서 줄이 갈리지 않게 묶는다.
 * keep-all 은 한글 낱말을 지켜 주지만 붙임표 뒤는 줄바꿈 자리로 본다.
 */
function nameParts(name: string): ReactNode[] {
  return name.split(/(\s+)/).map((tok, i) =>
    /[-‐–]/.test(tok) && tok.length <= 14 ? (
      <span key={i} className="cs-nc__nw">
        {tok}
      </span>
    ) : (
      tok
    ),
  )
}

export default function NoticeCard({
  property,
  candidate,
  showReasons = true,
  special,
  variant = 'default',
  pick,
}: {
  property: Property
  candidate: Candidate | null
  showReasons?: boolean
  /** 카탈로그 인덱스 (0-based). 예전에는 카드 머리에 번호를 달았다 — 지금은 쓰지 않는다 */
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
  /**
   * 예전의 손끝 기울기. 카드는 이제 살짝 떠오르기만 한다 — 기울기와 반사광은
   * 금액을 읽는 눈을 흔들었다. 부르는 쪽을 고치지 않도록 이름만 남긴다.
   */
  depth?: boolean
  /** 카드 바닥, 저장 단추 앞에 놓일 것(관심공고의 '비교' 담기) */
  pick?: ReactNode
}) {
  const status = candidate ? cardStatus(candidate.urgency) : null
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
  const closed = candidate?.urgency.level === 'CLOSED'
  const dday = candidate && !closed ? ddayText(days) : null
  const isSample = property.dataOrigin === 'SYNTHETIC'
  const noPrice = property.deposit === null && property.monthlyRent === null
  const [depositNum, depositUnit] = splitWon(formatManOr(property.deposit))
  const where =
    property.district && property.district !== property.region
      ? `${property.district} ${property.region}`
      : property.region

  return (
    <article
      className={variant === 'nearby' ? 'cs-nc cs-nc--nearby' : 'cs-nc'}
      data-level={candidate?.urgency.level}
      data-origin={isSample ? 'sample' : 'official'}
    >
      <Link
        href={`/notices/${property.id}`}
        className="cs-nc__link"
        aria-label={`${property.name} 자세히 보기`}
      />

      <div className="cs-nc__body">
        {/* 머리 — 상태 · 유형 한 줄, 오른쪽 끝에 공식/예시 표 */}
        <div className="cs-nc__eyebrow">
          {status && (
            <span className="cs-nc__status" data-tone={status.tone}>
              <i aria-hidden="true" />
              {status.text}
            </span>
          )}
          <span className="cs-nc__type">{property.housingType}</span>
          {/* 유사 후보 층에서는 초과액 자체를 적는다. "예산 초과" 넉 자만으로는
              10만원 차이와 1억 차이가 같은 말이 된다. */}
          {overBudget && variant !== 'nearby' && <span className="cs-nc__flag">예산 초과</span>}
          <span className="cs-nc__origin" data-origin={isSample ? 'sample' : 'official'}>
            {isSample ? '예시 공고' : '공식 공고'}
          </span>
        </div>

        {/* 두 줄 높이를 늘 비워 둔다 — 한 줄 이름도 아래에 붙어 지역 줄과 한 덩이로 읽힌다 */}
        <div className="cs-nc__title">
          <NoticeTitleMorph id={property.id}>
            <h3 className="cs-nc__name" title={property.name}>
            {nameParts(property.name)}
          </h3>
          </NoticeTitleMorph>
        </div>
        <p className="cs-nc__where">
          {/* 광역이 없거나 지역과 같으면 한 번만 적는다 */}
          <span>{where}</span>
          {property.area !== null && (
            <>
              <span className="cs-nc__dot" aria-hidden="true" />
              <span className="cs-num">전용 {property.area}㎡</span>
            </>
          )}
        </p>

        {overage && <p className="cs-nc__over">{overage}</p>}

        {/* 특별공급은 하루 먼저 끝난다. 접수가 열려 있는 공고에도 붙는
            유일한 실제 숫자라 금액 줄보다 위에 둔다. */}
        {special && (
          <p
            className="cs-nc__sp"
            data-tone={special.shortBy > 0 ? 'UNDER' : 'HOT'}
            // 카드에서는 '특별공급' 넉 자로만 범위를 밝힌다. 그 넉 자를 놓친 채
            // 일반공급 잔여로 읽는 일이 없도록 한 줄을 덧붙인다.
            title={`특별공급 ${special.supply.toLocaleString()}세대에 ${special.applied.toLocaleString()}건 접수. 일반공급 결과가 아닙니다.`}
          >
            <span className="cs-nc__sp-tag">특별공급</span>
            <b className="cs-num">
              {special.shortBy > 0 ? `${special.shortBy.toLocaleString()}세대 남고 마감` : `${special.rate}배 마감`}
            </b>
            <span className="cs-nc__sp-meta cs-num">
              {special.supply.toLocaleString()}세대 · {special.applied.toLocaleString()}건
            </span>
          </p>
        )}

        {noPrice ? (
          // 공고 목록에 금액이 없는 경우. 0 원으로 채우지 않는다.
          // 분양·임대를 함께 다루므로 "임대조건" 으로 좁혀 쓰지 않는다.
          <dl className="cs-nc__price" data-kind="unknown" title="공급금액·면적은 모집공고문에서 확인하세요">
            <div className="cs-nc__cell">
              <dt>공급금액</dt>
              <dd className="cs-nc__v" data-plain="true">
                공고문 확인
              </dd>
            </div>
          </dl>
        ) : (
          <dl className="cs-nc__price">
            <div className="cs-nc__cell">
              <dt>보증금</dt>
              <dd className="cs-nc__v cs-num" data-plain={depositUnit ? undefined : 'true'}>
                {depositNum}
                {depositUnit && <small>{depositUnit}</small>}
              </dd>
            </div>
            <div className="cs-nc__cell">
              <dt>월 임대료</dt>
              {property.monthlyRent === null ? (
                <dd className="cs-nc__v" data-plain="true">
                  공고문 확인
                </dd>
              ) : (
                <dd className="cs-nc__v cs-num">
                  {property.monthlyRent.toLocaleString()}
                  <small>만원</small>
                </dd>
              )}
            </div>
          </dl>
        )}

        {showReasons && candidate && candidate.reasons.length > 0 && (
          <ul className="cs-nc__reasons">
            {candidate.reasons.slice(0, 2).map(r => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}

        {caution && (
          <p className="cs-nc__caution" title={`확인 필요 · ${caution}`}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 7.2v3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
            </svg>
            <span>
              <span className="cs-sr">확인 필요 · </span>
              {caution}
            </span>
          </p>
        )}
      </div>

      <div className="cs-nc__foot">
        <div className="cs-nc__meta">
          {property.applicationEnd ? (
            <span className="cs-nc__due">
              <span className="cs-nc__due-k">{isSample ? '예시 접수 마감' : '접수 마감'}</span>
              <span className="cs-nc__due-v cs-num">{shortDate(property.applicationEnd)}</span>
              {dday && (
                <span className="cs-nc__dday cs-num" data-hot={days !== null && days <= 3 ? 'true' : undefined}>
                  {dday}
                </span>
              )}
            </span>
          ) : (
            <span className="cs-nc__due">
              <span className="cs-nc__due-k">접수 마감일 공고 미공개</span>
            </span>
          )}
          <span className="cs-nc__src">{property.source}</span>
        </div>
        <div className="cs-nc__acts">
          {/* 부르는 쪽이 제 고르기(관심공고)를 넘기면 그것을, 아니면 비교 담기 */}
          {pick ?? <CompareToggle id={property.id} name={property.name} />}
          <SaveButton propertyId={property.id} />
        </div>
      </div>
    </article>
  )
}
