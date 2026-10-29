import Link from 'next/link'
import HomeNoticeStrip from '@/components/consumer/HomeNoticeStrip'
import DeadlineTicker from '@/components/consumer/DeadlineTicker'
import DeadlineCalendar from '@/components/consumer/DeadlineCalendar'
import Reveal from '@/components/consumer/Reveal'
import HeroAtlas from '@/components/consumer/HeroAtlas'
import Journey from '@/components/consumer/Journey'
import CostSimulator from '@/components/consumer/CostSimulator'
import FinancialPlayground from '@/components/consumer/FinancialPlayground'
import BuildProgress from '@/components/consumer/BuildProgress'
import StatementScene from '@/components/consumer/home/StatementScene'
import OpenNoticeScene from '@/components/consumer/home/OpenNoticeScene'
import DecideScene from '@/components/consumer/home/DecideScene'

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
  eyebrow,
  title,
  sub,
  right,
}: {
  index: string
  eyebrow?: string
  title: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <div className="cs-sec-head">
      <span className="cs-sec-index" aria-hidden="true">
        {index}
      </span>
      <div className="cs-sec-head__body">
        {eyebrow && <span className="cs-sec-eyebrow">{eyebrow}</span>}
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
    <div className="cs-home">
      {/* ── 첫 화면 ─────────────────────────────────────── */}
      {/* 밤의 도시 — 남색 하늘, 아래에서 번지는 주황, 눕힌 바닥 모눈과 빛기둥 */}
      <section className="cs-night">
        <div className="cs-night__sky" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="cs-wrap cs-hero">
        <div>
          <span className="cs-eyebrow">청약 · 공공임대 모집공고 · ZIPCATCH</span>

          {/* 줄마다 차례로 올라온다. 쓸어 올리려면 줄이 각자 틀을 가져야 한다 */}
          <h1 className="cs-hero-title">
            <span className="cs-lux-line">
              <span>내 첫 집,</span>
            </span>
            <span className="cs-lux-line">
              <span>감이 아니라</span>
            </span>
            <span className="cs-lux-line">
              <span>
                <em>근거</em>로.
              </span>
            </span>
          </h1>

          <p className="cs-lead" style={{ marginTop: 26, maxWidth: 520 }}>
            청약부터 공공임대까지, 열려 있는 공고를 지도와 숫자로.
            <br className="cs-mobile-break" /> 내 조건에 맞는 후보부터 마감 일정까지 이어서 챙깁니다.
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

          {/* 누르면 바로 아래 '지금 살펴볼 공고'로 내려간다 — 화살표가 갈 곳을 가리킨다 */}
          <a href="#notices-now" className="cs-lux-scroll">
            <span className="cs-lux-scroll__arrow" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </span>
            아래로 내려 공고 보기
          </a>
        </div>

        {/* 예시 카드 대신 실제 집계. 지금 어디에 공고가 열려 있는지가 첫 화면의 주인공이다 */}
        <HeroAtlas />
        </div>
        {/* 어디서 온 정보인지 — 꾸밈이 아니라 신뢰다. 첫 화면의 바닥에 얌전히 둔다 */}
        <div className="cs-wrap">
          <div className="cs-lux-sources">
            <b>Data Source</b>
            <span>청약홈 OpenAPI</span>
            <span>LH 청약플러스</span>
            <span>공공데이터포털</span>
          </div>
        </div>
      </section>


      {/* ── 지금 살펴볼 공고 ────────────────────────────── */}
      <Reveal scrub className="cs-ap cs-ap--strip">
        <HomeNoticeStrip />
      </Reveal>

      {/* ── 장면 — 흩어진 공고가 한 장의 지도로 ────────── */}
      <StatementScene />

      {/* ── 장면 — 카드 한 장이 공고 한 장으로 열린다 ──── */}
      <OpenNoticeScene />

      {/* ── 장면 — 두 공고를 한 줄씩 견준다 ───────────── */}
      <DecideScene />

      {/* ── 마감이 언제 몰리는지 ────────────────────────── */}
      <Reveal className="cs-ap cs-ap--cal">
        <DeadlineCalendar />
      </Reveal>

      {/* ── 준비 순서 ───────────────────────────────────── */}
      <Reveal as="section" scrub className="cs-wrap cs-section cs-band cs-ap cs-ap--journey">
        <SectionHead
          index="02"
          eyebrow="Four Steps"
          title="집 하나를 고르기까지"
          sub="고르고, 견주고, 확인하고, 챙기는 네 장면. 장면마다 실제로 쓰는 화면이 하나씩 있습니다."
        />
        <Journey />
      </Reveal>

      {/* ── 주거비 환산 ─────────────────────────────────── */}
      <Reveal as="section" scrub id="cost" className="cs-wrap cs-section cs-ap cs-ap--cost">
        <SectionHead
          index="03"
          eyebrow="Monthly Cost"
          title="보증금도 매달 비용입니다"
          sub="보증금과 월 임대료를 한 달 단위로 옮겨, 서로 다른 공고를 같은 잣대로 봅니다."
        />
        <CostSimulator />
        <FinancialPlayground />
      </Reveal>

      {/* ── 지금 짓고 있는 집 ───────────────────────────── */}
      {/* 당첨 뒤에도 기다림은 이어진다. 지역마다 공사가 얼마나 남았는지 */}
      <Reveal as="section" scrub className="cs-wrap cs-section cs-band cs-ap cs-ap--build">
        <SectionHead
          index="04"
          eyebrow="Under Construction"
          title="지금 짓고 있는 집"
          sub="분양받은 뒤의 시간 — 지역별로 공사가 어디까지 왔는지 주택도시보증공사 집계로 봅니다."
        />
        <BuildProgress />
      </Reveal>

      {/* ── 알림 ────────────────────────────────────────── */}
      <Reveal as="section" scrub className="cs-wrap cs-section cs-band cs-band--night cs-ap cs-ap--saved">
        <SectionHead index="05" eyebrow="Saved Search" title="다음에도, 처음부터 찾지 않도록" />
        {/*
          저장 권유. 버튼은 버튼의 키(56px)로 둔다 — 지면 높이만큼 늘린 먹판은
          누르는 곳이 아니라 벽처럼 보였다. 설명은 세 번 되풀이하지 않고, 저장하면
          실제로 달라지는 것 셋을 한 줄씩 적는다.
        */}
        <div className="cs-remember">
          <div className="cs-remember__top">
            {/* 쉼표에서만 끊긴다 — 좁은 화면에서 "한 / 번만" 처럼 말 중간이 갈리지 않게 */}
            <p className="cs-remember__lead">
              <span>지역과 주거비,</span> <span>한 번만 적어 두세요.</span>
            </p>
            <div className="cs-remember__act">
              <Link href="/analyze" className="cs-btn cs-btn--primary cs-remember__btn">
                내 조건 저장하기
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
              <span className="cs-remember__hint">가입 없이 먼저 저장할 수 있어요</span>
            </div>
          </div>

          <ol className="cs-remember__list">
            <li>
              <span className="cs-remember__no cs-num">01</span>
              <b>다음 방문에 바로</b>
              <span>같은 조건의 후보가 먼저 열립니다. 처음부터 다시 고르지 않아도 돼요.</span>
            </li>
            <li>
              <span className="cs-remember__no cs-num">02</span>
              <b>새 공고 알림</b>
              <span>알림을 켜 두면 조건에 맞는 공고가 열릴 때마다 메일로 알려 드려요.</span>
            </li>
            <li>
              <span className="cs-remember__no cs-num">03</span>
              <b>언제든 해제</b>
              <span>받기 싫어지면 관심공고 화면에서 바로 끌 수 있어요.</span>
            </li>
          </ol>
        </div>
      </Reveal>

      {/* ── 신뢰 ────────────────────────────────────────── */}
      <Reveal as="section" scrub className="cs-wrap cs-section cs-ap cs-ap--trust">
        <SectionHead
          index="06"
          eyebrow="Trust"
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
      <Reveal as="section" scrub className="cs-wrap cs-section cs-ap cs-ap--faq">
        <SectionHead index="07" eyebrow="FAQ" title="처음이라 궁금하신 것들" />
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
      <Reveal as="section" scrub className="cs-wrap cs-section cs-ap cs-ap--cta">
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
    </div>
  )
}
