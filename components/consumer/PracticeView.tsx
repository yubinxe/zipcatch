'use client'

import { useState } from 'react'
import { PRACTICE } from '@/lib/consumer/practice'
import SupplyRead from './SupplyRead'

/**
 * 공급 실무 지식.
 *
 * 네 도메인을 한 지면에 두고 탭으로 오간다. 따로 페이지를 나누면 "분양대행과
 * 시행이 어떻게 다른가" 를 알고 싶은 사람이 뒤로 가기를 눌러 가며 비교해야
 * 한다. 옆으로 옮기는 편이 견주기 쉽다.
 *
 * 내용은 자격 판정도 투자 권유도 아니다. 공고문과 계약서에 나오는 말이
 * 실무에서 무엇을 뜻하는지를 적고, 그래서 무엇을 확인할지로 닫는다.
 */
export default function PracticeView() {
  const [key, setKey] = useState(PRACTICE[0].key)
  const domain = PRACTICE.find(d => d.key === key) ?? PRACTICE[0]

  return (
    <div className="cs-wrap" style={{ paddingTop: 44, maxWidth: 940 }}>
      <h1 className="cs-page-title">공급 판독</h1>
      <p className="cs-lead" style={{ marginTop: 16 }}>
        접수 결과는 마감된 뒤에 공개됩니다. 그 기록을 훑어 <b>어디가 비었고 누가 넣었는지</b>를
        읽어 드려요. 앞일을 점치지 않고, 지난 기록이 말하는 데까지만 말합니다.
      </p>

      {/* 지식보다 판독이 먼저다. 용어는 판단을 도울 때만 쓸모가 있다 */}
      <SupplyRead />

      <div className="cs-pro__divider">
        <h2 className="cs-section-title" style={{ fontSize: 26 }}>
          이 숫자를 읽으려면 알아야 하는 말
        </h2>
        <p className="cs-sub" style={{ marginTop: 10 }}>
          위 판독에 나오는 용어가 실무에서 무엇을 뜻하는지 정리했어요.
        </p>
      </div>

      {/* 탭 — 네 도메인 */}
      <div className="cs-protab" role="tablist" aria-label="실무 분야">
        {PRACTICE.map(d => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={d.key === key}
            className="cs-protab__btn"
            data-on={d.key === key}
            onClick={() => setKey(d.key)}
          >
            <span className="cs-protab__label">{d.label}</span>
            <span className="cs-protab__tag">{d.tagline}</span>
          </button>
        ))}
      </div>

      <div className="cs-pro">
        <p className="cs-pro__who">{domain.who}</p>

        {domain.blocks.map(b => (
          <section key={b.heading} className="cs-pro__block">
            <h2 className="cs-pro__h">{b.heading}</h2>
            {b.body.map((p, i) => (
              <p key={i} className="cs-pro__p">
                {p}
              </p>
            ))}

            {b.terms && b.terms.length > 0 && (
              <dl className="cs-terms">
                {b.terms.map(t => (
                  <div key={t.term} className="cs-terms__item">
                    <dt className="cs-terms__t">{t.term}</dt>
                    <dd className="cs-terms__d">
                      {t.short}
                      {t.soWhat && <span className="cs-terms__so">{t.soWhat}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}

        {/* 지식은 확인할 것으로 닫아야 쓸모가 된다 */}
        <section className="cs-pro__check">
          <h2 className="cs-pro__h">공고문에서 확인할 것</h2>
          <ul>
            {domain.checklist.map(c => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        <p className="cs-note cs-pro__foot">
          일반적인 실무 관행을 정리한 참고 자료입니다. 금액·요율·기간은 사업마다 다르고 법령은
          바뀝니다. 실제 판단은 공고문 원문과 계약서, 그리고 감정평가사·변호사 등 자격을 갖춘
          전문가의 확인을 거쳐 주세요.
        </p>
      </div>
    </div>
  )
}
