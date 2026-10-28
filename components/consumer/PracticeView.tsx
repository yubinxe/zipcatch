'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { PRACTICE } from '@/lib/consumer/practice'
import PageMasthead from './PageMasthead'
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
 *
 * 지면은 조용한 단말기다. 판독이 먼저 떠오르고, 그 아래에 용어집이 붙는다.
 */
export default function PracticeView() {
  const [key, setKey] = useState(PRACTICE[0].key)
  const domain = PRACTICE.find(d => d.key === key) ?? PRACTICE[0]
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  // 탭 사이를 화살표로 옮긴다 — 탭 목록의 약속(왼쪽·오른쪽·처음·끝)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = PRACTICE.findIndex(d => d.key === key)
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % PRACTICE.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + PRACTICE.length) % PRACTICE.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? PRACTICE.length - 1
              : -1
    if (to < 0) return
    e.preventDefault()
    setKey(PRACTICE[to].key)
    tabs.current[to]?.focus()
  }

  return (
    <div className="cs-wrap cs-sb cs-sb--pro">
      <PageMasthead
        eyebrow="Supply Read"
        title="공급 판독"
        lead={
          <>
            접수 결과는 마감된 뒤에 공개됩니다. 그 기록을 훑어 <b>어디가 비었고 누가 넣었는지</b>를 읽어
            드려요. 앞일을 점치지 않고, 지난 기록이 말하는 데까지만 말합니다.
          </>
        }
      >
        <nav className="cs-sb-toc" aria-label="이 화면의 차례">
          <a href="#read">
            <span className="cs-num">01</span>접수 기록 판독
          </a>
          <a href="#terms">
            <span className="cs-num">02</span>알아야 하는 말
          </a>
        </nav>
      </PageMasthead>

      {/* 지식보다 판독이 먼저다. 용어는 판단을 도울 때만 쓸모가 있다 */}
      <section id="read" className="cs-sb-sheet cs-sb-term cs-sb-anchor" aria-labelledby="pro-read-t">
        <div className="cs-sb-head">
          <span className="cs-sb-head__no">01</span>
          <h2 id="pro-read-t" className="cs-sb-head__t">
            접수 기록 판독
          </h2>
          <p className="cs-sb-head__p">마감된 공고의 주택형별 접수 결과를 세 가지 물음으로 읽습니다.</p>
        </div>
        <SupplyRead />
      </section>

      <section id="terms" className="cs-sb-sec cs-sb-anchor" aria-labelledby="pro-terms-t">
        <div className="cs-sb-head">
          <span className="cs-sb-head__no">02</span>
          <h2 id="pro-terms-t" className="cs-sb-head__t">
            이 숫자를 읽으려면 알아야 하는 말
          </h2>
          <p className="cs-sb-head__p">위 판독에 나오는 용어가 실무에서 무엇을 뜻하는지 정리했어요.</p>
        </div>

        {/* 탭 — 네 도메인 */}
        <div className="cs-protab" role="tablist" aria-label="실무 분야" onKeyDown={onKey}>
          {PRACTICE.map((d, i) => (
            <button
              key={d.key}
              ref={el => {
                tabs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`pro-tab-${d.key}`}
              aria-selected={d.key === key}
              aria-controls="pro-panel"
              tabIndex={d.key === key ? 0 : -1}
              className="cs-protab__btn"
              data-on={d.key === key}
              onClick={() => setKey(d.key)}
            >
              <span className="cs-protab__no cs-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="cs-protab__label">{d.label}</span>
              <span className="cs-protab__tag">{d.tagline}</span>
            </button>
          ))}
        </div>

        <div
          id="pro-panel"
          role="tabpanel"
          aria-labelledby={`pro-tab-${domain.key}`}
          className="cs-pro cs-sb-doc"
        >
          <div key={domain.key} className="cs-sb-swap">
            <p className="cs-pro__who">{domain.who}</p>

            {domain.blocks.map(b => (
              <section key={b.heading} className="cs-pro__block">
                <h3 className="cs-pro__h">{b.heading}</h3>
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
              <h3 className="cs-pro__h">공고문에서 확인할 것</h3>
              <ul>
                {domain.checklist.map(c => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <p className="cs-sb-foot">
          일반적인 실무 관행을 정리한 참고 자료입니다. 금액·요율·기간은 사업마다 다르고 법령은
          바뀝니다. 실제 판단은 공고문 원문과 계약서, 그리고 감정평가사·변호사 등 자격을 갖춘
          전문가의 확인을 거쳐 주세요.
        </p>
      </section>
    </div>
  )
}
