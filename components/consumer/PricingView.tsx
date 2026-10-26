'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FEATURES, PASS, PLANS, priceParts, type Entitlement, type Feature, type Plan } from '@/lib/billing/plans'

/**
 * 요금제.
 *
 * 숫자는 크게, 단위는 작게 — "$" 와 ".99", "/월" 은 숫자 옆에 작게 붙는다.
 * 사람은 가장 큰 글자를 가격으로 읽는다. 그 자리에 통화 기호와 소수점까지 같은
 * 크기로 두면 숫자가 실제보다 길고 비싸 보인다.
 *
 * 그러나 덜 비싸 보이게 하는 것과 속이는 것은 다르다. 그래서:
 *  · 연간 요금은 월 환산과 함께 **한 번에 청구되는 총액**을 바로 아래 적는다.
 *  · 결제가 아직 열리지 않았다는 사실을 첫 화면에 둔다.
 *  · 준비 중인 기능에는 '준비 중'을 붙인다. 있는 척하지 않는다.
 *  · 인기·잔여 수량·카운트다운처럼 확인되지 않은 압박 문구는 쓰지 않는다.
 */

type Cycle = 'monthly' | 'annual'

function Price({ cents, cycle, plan }: { cents: number; cycle: Cycle; plan: Plan }) {
  // 연간은 월 환산으로 크게, 총액은 아래 줄에 그대로
  const shown = cycle === 'annual' && plan.annualCents !== null ? Math.round(plan.annualCents / 12) : cents
  const { whole, fraction } = priceParts(shown)
  return (
    <div className="cs-pr__price" aria-label={`월 ${(shown / 100).toFixed(2)}달러`}>
      <span className="cs-pr__cur">$</span>
      <b className="cs-num">{whole}</b>
      {fraction && <span className="cs-pr__frac cs-num">{fraction}</span>}
      <span className="cs-pr__per">/ 월</span>
    </div>
  )
}

/** 가격 아래 한 줄 — 연간이면 실제 청구액, 월간이면 하루 환산 */
function PriceNote({ plan, cycle }: { plan: Plan; cycle: Cycle }) {
  if (plan.monthlyCents === 0) return <p className="cs-pr__note">카드 없이 바로</p>
  if (plan.monthlyCents === null) return <p className="cs-pr__note">팀 규모에 맞춰 별도 견적</p>
  if (cycle === 'annual' && plan.annualCents !== null) {
    const { whole, fraction } = priceParts(plan.annualCents)
    const saved = Math.round((1 - plan.annualCents / (plan.monthlyCents * 12)) * 100)
    return (
      <p className="cs-pr__note">
        연 <b className="cs-num">${whole}{fraction}</b> 한 번 결제 · 월간보다 {saved}% 적게
      </p>
    )
  }
  const perDay = Math.round(plan.monthlyCents / 30)
  return (
    <p className="cs-pr__note">
      하루 약 <b className="cs-num">{perDay}¢</b> · 언제든 해지
    </p>
  )
}

function cell(e: Entitlement, f: Feature) {
  if (e === false) return <span className="cs-pr__no" aria-label="없음">—</span>
  if (e === true) return <span className="cs-pr__yes" aria-label="포함">●</span>
  return (
    <span className="cs-num">
      {e}
      <small>{f.unit ?? ''}</small>
    </span>
  )
}

/** 카드 안에 보여 줄 대표 기능 — 아래 요금제보다 새로 생기는 것 위주 */
const HIGHLIGHTS: Record<Plan['id'], Feature['id'][]> = {
  free: ['explore', 'safety', 'regionStats', 'compare', 'alerts'],
  plus: ['compare', 'alerts', 'scenarios', 'contractFiles', 'reports'],
  pro: ['marketRead', 'advancedFilters', 'export', 'monitoring', 'reports'],
  business: ['team', 'evidence', 'auditLog', 'api'],
}

const CTA: Record<Plan['id'], { label: string; href: string | null; sub: string }> = {
  free: { label: '무료로 시작하기', href: '/analyze', sub: '가입 없이 조건부터' },
  plus: { label: 'Plus 기능 먼저 써 보기', href: '/compare', sub: '베타 동안 무료 · 결제 없음' },
  pro: { label: '판독 화면 열어 보기', href: '/biz', sub: '베타 동안 무료 · 결제 없음' },
  business: { label: '도입 상담 준비 중', href: null, sub: '증빙·팀 기능과 함께 엽니다' },
}

export default function PricingView() {
  const [cycle, setCycle] = useState<Cycle>('annual')
  const byId = new Map(FEATURES.map(f => [f.id, f]))
  const groups = [...new Set(FEATURES.map(f => f.group))]
  const pass = priceParts(PASS.priceCents)

  return (
    <div className="cs-wrap cs-pr" style={{ paddingTop: 44 }}>
      <header className="cs-pr__head">
        <p className="cs-pr__kicker">요금제</p>
        <h1 className="cs-pr__title">
          찾는 건 무료로,
          <br /> 깊이 볼 때만.
        </h1>
        <p className="cs-pr__sub">
          지도·공고·계약 안전 정보는 어느 요금제에서도 닫지 않습니다. 비교·저장·분석이 더 필요할 때만 고르세요.
        </p>
        <p className="cs-pr__beta" role="note">
          <b>아직 결제를 받지 않습니다.</b> 지금 제공 중인 기능은 베타 기간 동안 누구나 무료로 씁니다. 아래 가격은
          출시 전에 검증 중인 안이며, 결제를 열기 전에 갱신·해지·환불 기준과 함께 다시 알려 드립니다.
        </p>
      </header>

      <div className="cs-pr__cycle" role="radiogroup" aria-label="결제 주기">
        <button type="button" role="radio" aria-checked={cycle === 'monthly'} onClick={() => setCycle('monthly')}>
          월간
        </button>
        <button type="button" role="radio" aria-checked={cycle === 'annual'} onClick={() => setCycle('annual')}>
          연간 <span>약 29% 적게</span>
        </button>
      </div>

      <div className="cs-pr__plans">
        {PLANS.map(plan => {
          const cta = CTA[plan.id]
          const featured = plan.id === 'plus'
          return (
            <article key={plan.id} className="cs-pr__plan" data-featured={featured || undefined}>
              {featured && <span className="cs-pr__tag">집을 찾는 중이라면</span>}
              <h2 className="cs-pr__name">{plan.name}</h2>
              <p className="cs-pr__for">{plan.forWhom}</p>

              {plan.monthlyCents === null ? (
                <div className="cs-pr__price cs-pr__price--quote">
                  <b>견적</b>
                </div>
              ) : (
                <Price cents={plan.monthlyCents} cycle={cycle} plan={plan} />
              )}
              <PriceNote plan={plan} cycle={cycle} />

              {cta.href ? (
                <Link
                  href={cta.href}
                  className={`cs-btn ${featured ? 'cs-btn--primary' : 'cs-btn--ghost'} cs-pr__cta`}
                >
                  {cta.label}
                </Link>
              ) : (
                <span className="cs-btn cs-btn--ghost cs-pr__cta" aria-disabled="true">
                  {cta.label}
                </span>
              )}
              <p className="cs-pr__cta-sub">{cta.sub}</p>

              <ul className="cs-pr__list">
                {HIGHLIGHTS[plan.id].map(id => {
                  const f = byId.get(id)!
                  const e = plan.entitlements[id]
                  return (
                    <li key={id} data-soon={f.status === 'soon' || undefined}>
                      <span>
                        {f.label}
                        {typeof e === 'number' && (
                          <em className="cs-num">
                            {' '}
                            {e}
                            {f.unit}
                          </em>
                        )}
                        {e === true && (id === 'compare' || id === 'alerts' || id === 'reports') && <em> 무제한</em>}
                      </span>
                      {f.status === 'soon' && <i>준비 중</i>}
                    </li>
                  )
                })}
              </ul>
            </article>
          )
        })}
      </div>

      {/* 구독이 망설여지는 사람을 위한 문 — 자동 갱신이 없다 */}
      <section className="cs-pr__pass">
        <div>
          <p className="cs-pr__kicker">구독이 부담스럽다면</p>
          <h2 className="cs-pr__pass-title">
            한 번 사서 30일, <span className="cs-nowrap">그걸로 끝.</span>
          </h2>
          <p className="cs-pr__pass-sub">
            집은 매달 구하지 않습니다. 계약을 앞둔 한 달만 Plus 기능을 쓰고 끝내세요. 자동 갱신이 없어 해지할 것도 없습니다.
          </p>
        </div>
        <div className="cs-pr__pass-buy">
          <div className="cs-pr__price">
            <span className="cs-pr__cur">$</span>
            <b className="cs-num">{pass.whole}</b>
            <span className="cs-pr__frac cs-num">{pass.fraction}</span>
            <span className="cs-pr__per">/ 30일</span>
          </div>
          <p className="cs-pr__note">한 번 결제 · 자동 갱신 없음</p>
          <Link href="/compare" className="cs-btn cs-btn--primary cs-pr__cta">
            지금은 무료로 써 보기
          </Link>
        </div>
      </section>

      {/* 비교표 — 요금제 카드와 같은 표(lib/billing/plans)에서 그린다 */}
      <section className="cs-pr__compare">
        <h2 className="cs-pr__h">요금제별로 무엇이 열리나</h2>
        <div className="cs-pr__tablewrap">
          <table className="cs-pr__table">
            <thead>
              <tr>
                <th scope="col">기능</th>
                {PLANS.map(p => (
                  <th key={p.id} scope="col" data-featured={p.id === 'plus' || undefined}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map(g => (
              <tbody key={g}>
                <tr className="cs-pr__group">
                  <th scope="rowgroup" colSpan={PLANS.length + 1}>
                    {g}
                  </th>
                </tr>
                {FEATURES.filter(f => f.group === g).map(f => (
                  <tr key={f.id}>
                    <th scope="row">
                      {f.href ? <Link href={f.href}>{f.label}</Link> : f.label}
                      {f.status === 'soon' && <i className="cs-pr__soon">준비 중</i>}
                    </th>
                    {PLANS.map(p => (
                      <td key={p.id} data-featured={p.id === 'plus' || undefined}>
                        {cell(p.entitlements[f.id], f)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="cs-note">
          한도와 구성은 출시 전 설계안입니다. 베타 기간에는 &lsquo;제공 중&rsquo; 기능을 한도 없이 무료로 씁니다.
        </p>
      </section>

      {/* 거래 증빙 등급 — 3.0 설계안. '검증 완료' 한 마디가 지는 책임을 단계로 나눈다 */}
      <section className="cs-pr__evidence">
        <h2 className="cs-pr__h">거래 증빙은 네 단계로 구분합니다</h2>
        <p className="cs-pr__lead">
          송금이 확인됐다고 거래가 성립한 것은 아닙니다. 그래서 &lsquo;검증 완료&rsquo; 한 마디로 묶지 않고, 무엇을
          어디까지 확인했는지를 단계로 적습니다. <b>Business 와 함께 준비 중인 설계안</b>입니다.
        </p>
        <ol className="cs-pr__levels">
          <li>
            <span className="cs-pr__lv cs-num">L0</span>
            <b>사용자 입력</b>
            <span>이용자가 거래 정보를 직접 적은 상태</span>
          </li>
          <li>
            <span className="cs-pr__lv cs-num">L1</span>
            <b>증빙 등록</b>
            <span>이체확인증·영수증 같은 서류를 올린 상태</span>
          </li>
          <li>
            <span className="cs-pr__lv cs-num">L2</span>
            <b>서류 대조 완료</b>
            <span>계약서와 입금 내역의 금액·일자·당사자가 서로 맞는지 대조한 상태</span>
          </li>
          <li>
            <span className="cs-pr__lv cs-num">L3</span>
            <b>외부 자료 확인</b>
            <span>적법하게 연계한 외부 기관 자료로 같은 사실을 한 번 더 확인한 상태</span>
          </li>
        </ol>
        <p className="cs-note">
          L3 도 거래의 법적 효력이나 잔금 이행을 보장하지 않습니다. L2 는 서류에 적힌 값이 서로 맞는다는 뜻이지 은행이
          지급을 확인했다는 뜻이 아닙니다. 은행 자료에 연결하지 않은 상태에서 &lsquo;은행 검증&rsquo;이라는 말은 쓰지
          않습니다.
        </p>
      </section>

      <section className="cs-pr__faq">
        <h2 className="cs-pr__h">결제 전에 묻는 것</h2>
        <dl>
          <div>
            <dt>지금 결제하면 무엇을 받나요?</dt>
            <dd>
              아직 결제를 받지 않습니다. 제공 중인 기능은 지금 무료로 쓰시면 됩니다. 결제를 열기 전에 이 화면에서 먼저
              알립니다.
            </dd>
          </div>
          <div>
            <dt>거래가 성사되면 수수료를 받나요?</dt>
            <dd>
              받지 않습니다. 중개보수는 중개사무소 개설등록을 한 개업공인중개사가 받는 대가로(공인중개사법 제9조·제32조)
              플랫폼 이용료와 성격이 다릅니다. 거래와 연계된 요금은 법률 검토를 마치기 전에는 만들지 않습니다.
            </dd>
          </div>
          <div>
            <dt>해지와 환불은 어떻게 되나요?</dt>
            <dd>
              결제를 열 때 갱신일·해지 방법·환불 기준을 결제 화면에 먼저 보여 드리고 동의를 받습니다. 30일 이용권은 자동
              갱신이 없습니다.
            </dd>
          </div>
          <div>
            <dt>카드 정보를 집캐치가 보관하나요?</dt>
            <dd>보관하지 않습니다. 결제는 등록된 결제대행(PG) 사업자의 화면에서 처리하도록 설계합니다.</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
