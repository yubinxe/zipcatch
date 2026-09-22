import Link from 'next/link'
import HomeNoticeStrip from '@/components/consumer/HomeNoticeStrip'
import DeadlineTicker from '@/components/consumer/DeadlineTicker'
import DeadlineCalendar from '@/components/consumer/DeadlineCalendar'
import Reveal from '@/components/consumer/Reveal'

const STEPS = [
  {
    title: '내 조건 확인하기',
    desc: '살고 싶은 동네와 감당할 수 있는 주거비. 딱 그 정도면 됩니다.',
  },
  {
    title: '관심공고 저장하기',
    desc: '마음에 드는 공고를 한곳에. 다음 방문에도 이어서 비교하세요.',
  },
  {
    title: '일정 챙기기',
    desc: '접수 마감과 서류 준비일을 공고 기준으로 정리해 드립니다.',
  },
]

/**
 * 자주 묻는 것.
 *
 * 답을 한 덩어리로 붙여두면 세 문장이 한 문장처럼 읽힌다. 묻는 것이 하나여도
 * 답에는 결론과 단서와 예외가 섞여 있으므로, 생각이 바뀌는 자리에서 끊는다.
 */
const FAQ: { q: string; a: string[] }[] = [
  {
    q: '관심조건을 저장하면 무엇이 달라지나요?',
    a: [
      '다음 방문에 같은 조건으로 후보를 바로 보여드립니다.',
      '알림에 동의하시면 그 자리에서 조건에 맞는 공고를 메일로 한 통 보내드리고, 이후 새 공고가 열릴 때마다 이어서 알려드려요.',
      '가입 없이도 조건 입력과 후보 확인은 전부 가능합니다.',
    ],
  },
  {
    q: '알림 메일에는 무엇이 담기나요?',
    a: [
      '공고 이름과 지역, 보증금과 월 임대료, 접수 마감일, 그리고 왜 추천했는지를 한 통에 정리해 보내드립니다.',
      '조건에 맞는 공고가 없으면 없다고 적어 보냅니다 — 빈 자리를 예시로 메우지 않습니다.',
      '수신은 관심공고에서 언제든 해제할 수 있어요.',
    ],
  },
  {
    q: '지금 보이는 공고는 실제 공고인가요?',
    a: [
      '네. 공공데이터포털 청약홈 OpenAPI와 LH 청약플러스에서 모은 실제 모집공고만 보여드립니다.',
      '화면 구성을 위해 쓰던 예시 공고는 전부 걷어냈습니다. 접수 중인 공고가 없을 때는 비어 있다는 사실을 그대로 적습니다.',
    ],
  },
  {
    q: '조건에 딱 맞지 않는 공고도 보여주나요?',
    a: [
      '예산이나 면적을 조금 벗어난 공고는 아래 참고 후보로 따로 모읍니다.',
      '상한을 얼마나 넘는지 카드마다 적어두니, 조건을 넓혀볼지는 직접 정하시면 됩니다.',
    ],
  },
  {
    q: '여기서 추천받으면 자격이 확인된 건가요?',
    a: [
      '아닙니다. 지역·주거비·면적처럼 희망 조건이 맞는지만 비교해 드립니다.',
      '소득·자산·거주기간 등 자격요건 체크 요망 — 지원 전 반드시 공식 모집공고문을 읽어주세요.',
    ],
  },
]

/** 섹션 머리 — 잡지 목차처럼 번호와 괘선을 앞세운다 */
function SectionHead({
  index,
  title,
  sub,
  right,
}: {
  index: string
  title: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <div className="cs-sec-head">
      <span className="cs-sec-index">{index}</span>
      <div className="cs-sec-head__body">
        <h2 className="cs-section-title">{title}</h2>
        {sub && (
          <p className="cs-sub" style={{ marginTop: 12 }}>
            {sub}
          </p>
        )}
      </div>
      {right}
    </div>
  )
}

export default function ConsumerHome() {
  return (
    <>
      {/* ── 첫 화면 ─────────────────────────────────────── */}
      <section className="cs-wrap cs-hero">
        <div>
          <span className="cs-eyebrow">청약부터 공공임대까지</span>

          <h1 className="cs-hero-title">
            나에게 맞는 집,
            <br />
            <em>내집마련 기회</em>를
            <br />
            사로잡아 보세요.
          </h1>

          <p className="cs-lead" style={{ marginTop: 26, maxWidth: 520 }}>
            청약부터 공공임대까지, 지역·보증금·월 임대료·면적 기준으로
            <br className="cs-mobile-break" /> 내 조건에 맞는 후보부터 확인해 보세요.
          </p>

          <div className="cs-hero__cta">
            <Link href="/analyze" className="cs-btn cs-btn--primary">
              내 조건으로 집 찾기
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <Link href="/notices" className="cs-btn cs-btn--text cs-btn--map">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 5h16M4 12h16M4 19h10" />
              </svg>
              모집공고 둘러보기
            </Link>
            {/* 목록과 지도는 같은 공고를 다르게 보는 두 창구다. 목록으로만
                들여보내면 지도가 있는 줄도 모른다.
                지도를 독립 화면으로 옮긴 뒤 이 링크만 /notices#map 에 남아
                지도를 눌렀는데 목록이 열렸다. 옮길 때 들어오는 길을 같이 옮겨야 한다. */}
            <Link href="/map" className="cs-btn cs-btn--text cs-btn--map">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3Z" />
                <path d="M9 3v15M15 6v15" />
              </svg>
              지도로 보기
            </Link>
          </div>

          <p className="cs-note" style={{ marginTop: 20 }}>
            가입 없이 먼저 확인하세요 · 청약홈·LH 실제 모집공고
          </p>
        </div>

        {/* 결과 미리보기 — 실제 성과가 아니라 화면 예시임을 카드 안에 밝힌다 */}
        <div className="cs-preview">
          <div className="cs-card cs-card--lift">
            <span className="cs-preview__label">나에게 맞는 집은 이런 모습</span>

            <div className="cs-badge-row" style={{ marginBottom: 16 }}>
              <span className="cs-badge cs-badge--brand">청년매입임대</span>
              <span className="cs-badge cs-badge--ok">
                <span className="cs-badge__dot" />
                예산 범위 내
              </span>
              <span className="cs-sample">화면 예시</span>
            </div>

            <div className="cs-notice__name" style={{ minHeight: 'auto' }}>
              동작구 청년 매입임대
            </div>
            <p className="cs-notice__where">서울 동작구 · 전용 29㎡</p>

            <div className="cs-price-grid">
              <div>
                <div className="cs-price-label">보증금</div>
                <div className="cs-notice__deposit cs-num">6,500만원</div>
              </div>
              <div>
                <div className="cs-price-label">월 임대료</div>
                <div className="cs-notice__deposit cs-num">32만원</div>
              </div>
            </div>

            <div className="cs-reason-block">
              <div className="cs-price-label">추천 이유</div>
              <ul className="cs-notice__reasons">
                <li>희망 1순위 지역</li>
                <li>예산 범위 충족</li>
                <li>희망면적 충족</li>
              </ul>
            </div>

            <div className="cs-notice__caution">
              소득·자산 등 <strong>자격요건 체크 요망</strong>
            </div>
          </div>

          <div className="cs-mini">
            <span className="cs-mini__icon" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="5" width="16" height="15" rx="1" />
                <path d="M8 3v4M16 3v4M4 10h16" />
              </svg>
            </span>
            <div>
              <div className="cs-mini__title">관심공고의 일정을 한눈에</div>
              <div className="cs-mini__sub">공식 일정과 준비 권장일을 구분해요</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 지금 살펴볼 공고 ────────────────────────────── */}
      <HomeNoticeStrip />

      {/* ── 마감이 언제 몰리는지 ────────────────────────── */}
      <DeadlineCalendar />

      {/* ── 준비 순서 ───────────────────────────────────── */}
      <Reveal as="section" className="cs-wrap cs-section">
        <SectionHead
          index="02"
          title="복잡한 청약, 이 순서로 준비하세요"
          sub="한 번에 다 알아보지 않으셔도 괜찮아요."
        />
        <div className="cs-steps3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="cs-card">
              <span className="cs-step-card__num">STEP {String(i + 1).padStart(2, '0')}</span>
              <div className="cs-step-card__title">{s.title}</div>
              <p className="cs-step-card__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── 알림 ────────────────────────────────────────── */}
      <Reveal as="section" className="cs-wrap cs-section">
        <SectionHead index="03" title="다음에도, 처음부터 찾지 않도록" />
        <div className="cs-keep">
          <div className="cs-keep__copy">
            <p>살고 싶은 동네와 주거비를 저장해두세요.</p>
            <p>다음 방문에도 같은 조건으로 후보를 바로 확인할 수 있어요.</p>
            <p>
              알림에 동의하시면 그 자리에서 조건에 맞는 공고를 한 통 보내드리고, 새 공고와 마감이
              생길 때마다 이어서 알려드립니다.
            </p>
          </div>

          {/* 저장은 이 지면에서 가장 중요한 행동이다. 글자 버튼으로 두면
              문단 끝에 딸린 각주처럼 읽혀 아무도 누르지 않는다. */}
          <Link href="/analyze" className="cs-keep__cta">
            <span className="cs-keep__cta-main">
              내 조건 저장하기
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
            <span className="cs-keep__cta-sub">1분이면 끝나요 · 가입 없이 먼저</span>
          </Link>
        </div>
      </Reveal>

      {/* ── 신뢰 ────────────────────────────────────────── */}
      <Reveal as="section" className="cs-wrap cs-section">
        <SectionHead
          index="04"
          title="확인하고, 구분해서 보여드려요"
          sub="어디서 온 정보인지, 무엇을 아직 확인하지 않았는지 함께 적어둡니다."
        />
        <div className="cs-steps3">
          <div className="cs-card">
            <div className="cs-step-card__title">정보의 출처를 함께</div>
            <p className="cs-step-card__desc">
              공식 공고 원문이 있으면 링크를 함께 드립니다. 없으면 없다고 적고, 저희 상세 화면을 원문인
              것처럼 안내하지 않습니다.
            </p>
          </div>
          <div className="cs-card">
            <div className="cs-step-card__title">자격은 한 번 더 확인</div>
            <p className="cs-step-card__desc">
              소득·자산·거주기간 같은 공식 자격요건은 아직 확인하지 않습니다. 결과마다 그대로 적어
              둡니다.
            </p>
          </div>
          <div className="cs-card">
            <div className="cs-step-card__title">공식 일정과 준비일 구분</div>
            <p className="cs-step-card__desc">
              공고에 적힌 기한과 저희가 제안하는 준비일을 구분합니다. 공고에 없는 날짜는 미정으로
              둡니다.
            </p>
          </div>
        </div>
      </Reveal>

      {/* ── FAQ ─────────────────────────────────────────── */}
      <Reveal as="section" className="cs-wrap cs-section">
        <SectionHead index="05" title="처음이라 궁금하신 것들" />
        <div className="cs-faq">
          {FAQ.map(f => (
            <details key={f.q} className="cs-faq__item">
              <summary className="cs-faq__q">{f.q}</summary>
              <div className="cs-faq__a">
                {f.a.map((para, i) => (
                  <p key={para}>
                    {i === 0 && (
                      <span className="cs-faq__mark" aria-hidden="true">
                        A.
                      </span>
                    )}
                    {para}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Reveal>

      {/* ── 마지막 CTA ──────────────────────────────────── */}
      <Reveal as="section" className="cs-wrap cs-section">
        <div className="cs-cta-band">
          <h2 className="cs-section-title">
            내 조건에 맞는 공고,
            <br />
            첫 후보부터 확인해보세요.
          </h2>
          <Link href="/analyze" className="cs-btn cs-btn--primary" style={{ marginTop: 30 }}>
            내 조건으로 공고 찾기
          </Link>
        </div>
      </Reveal>

      {/* ── 마감 티커 ───────────────────────────────────── */}
      {/* 지면의 맨 끝이자 화면의 맨 아래. 스크롤 위치와 무관하게
          가장 빨리 사라지는 정보를 늘 발치에 깔아둔다. */}
      <DeadlineTicker />
    </>
  )
}
