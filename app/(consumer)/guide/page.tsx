import Link from 'next/link'

export const metadata = { title: '청약 가이드 — 집캐치' }

/**
 * 청약 가이드.
 *
 * 지금까지 이 지면에는 공공임대 다섯 종류만 있었다. 그런데 우리가 실제로 모아
 * 보여주는 공고의 절반 가까이가 **민간분양**이다. 목록에서 '민영'을 누른 사람이
 * 그게 무엇인지 알아볼 데가 한 곳도 없었다는 뜻이다.
 *
 * 그래서 분양과 임대를 갈라 세우고, 분양을 앞에 둔다. 값이 크고 되돌리기 어려운
 * 쪽이 먼저 설명돼야 한다.
 */

interface Item {
  title: string
  who: string
  what: string
  /** 처음 보는 사람이 반드시 걸리는 대목 */
  watch?: string
}

const SALE: Item[] = [
  {
    title: '민영주택 (민간분양)',
    who: '청약통장 가입자 · 지역·면적별 예치금 충족',
    what:
      '건설사가 짓고 파는 아파트예요. 우리가 보여드리는 공고에서 가장 흔한 유형입니다. 당첨되면 분양대금을 내고 내 집이 되며, 계약금 10%·중도금 60%·잔금 30%를 몇 년에 걸쳐 나눠 냅니다.',
    watch:
      '가점제와 추첨제 비율이 지역과 면적에 따라 다릅니다. 85㎡ 이하 규제지역은 가점 비중이 높아 무주택 기간·부양가족이 적으면 추첨 물량을 노리는 편이 현실적이에요.',
  },
  {
    title: '국민주택 (공공분양)',
    who: '무주택 세대구성원 · 소득·자산 기준 있음',
    what:
      'LH·지방공사 등이 공급하는 전용 85㎡ 이하 분양주택이에요. 민영보다 분양가가 낮은 대신 소득·자산을 봅니다. 가점이 아니라 **납입 인정금액(저축총액)** 순으로 뽑는 순차제가 적용돼요.',
    watch:
      '매달 얼마를 오래 넣었는지가 당락을 가릅니다. 한 번에 많이 넣어도 월 10만원까지만 인정돼요.',
  },
  {
    title: '신혼희망타운',
    who: '혼인 7년 이내 · 예비신혼 · 6세 이하 자녀 가구',
    what:
      '신혼부부에게 특화된 공급이에요. 분양형과 임대형이 나뉘고, 분양형은 시세보다 낮은 값에 공급하는 대신 조건이 붙습니다.',
    watch:
      '분양형에는 수익공유형 모기지가 따라붙는 경우가 있습니다. 집을 팔 때 시세차익의 일부를 기금과 나눠야 하므로, 이 조건을 먼저 확인하세요.',
  },
]

const RENT: Item[] = [
  {
    title: '청년매입임대',
    who: '만 19~39세 무주택 청년',
    what:
      'LH·지방공사가 사들인 주택을 시세의 40~50% 수준으로 빌려줘요. 보증금이 낮고 임대료 부담이 적은 편입니다.',
  },
  {
    title: '행복주택',
    who: '청년·신혼부부·대학생 등',
    what:
      '직장과 학교가 가까운 곳에 짓는 공공임대예요. 시세의 60~80% 수준이며 거주 기간이 정해져 있습니다.',
  },
  {
    title: '국민임대 · 공공임대',
    who: '무주택 세대구성원 · 소득·자산 기준 있음',
    what:
      '장기간 살 수 있는 공공임대주택이에요. 재계약이 가능하고, 30년·50년처럼 기간이 표기됩니다.',
  },
  {
    title: '통합공공임대',
    who: '기존 유형을 하나로 합친 새 기준',
    what:
      '영구·국민·행복주택으로 나뉘어 있던 것을 한 가지로 통합한 유형이에요. 소득 구간에 따라 임대료가 달라집니다.',
  },
]

/** 부린이가 공고문에서 처음 만나 막히는 말들 */
const TERMS: { term: string; mean: string }[] = [
  {
    term: '1순위 · 2순위',
    mean:
      '청약통장 가입기간과 예치금을 채우면 1순위입니다. 1순위에서 물량이 다 차지 않으면 2순위로 넘어가요. 미달이 잦은 지역은 2순위도 기회가 됩니다.',
  },
  {
    term: '해당지역 · 기타지역',
    mean:
      '공고가 난 지역에 일정 기간 이상 살았으면 해당지역입니다. 물량을 먼저 배정받아요. 기타지역은 해당지역에서 남은 물량을 두고 겨룹니다.',
  },
  {
    term: '가점제 · 추첨제',
    mean:
      '가점제는 무주택기간·부양가족수·통장가입기간을 점수로 매겨 높은 순으로 뽑습니다. 추첨제는 자격만 되면 무작위예요. 가점이 낮다면 추첨 비율이 높은 면적을 보세요.',
  },
  {
    term: '전용면적 · 공급면적',
    mean:
      '전용면적은 우리 집 안쪽만, 공급면적은 복도·계단 같은 공용부를 더한 값입니다. 공고의 84㎡는 전용면적이고, 흔히 말하는 34평은 공급면적이에요.',
  },
  {
    term: '중도금 대출',
    mean:
      '분양대금의 60%가량을 완공 전에 나눠 내는데, 보통 건설사 알선으로 대출을 받습니다. 한도와 이자 부담 주체가 공고마다 달라요.',
  },
  {
    term: '전매제한 · 실거주의무',
    mean:
      '당첨 뒤 일정 기간 팔 수 없고(전매제한), 직접 살아야 하는(실거주의무) 조건이 붙을 수 있습니다. 기간은 지역과 유형에 따라 달라요.',
  },
]

function Cards({ items }: { items: Item[] }) {
  return (
    <div className="cs-stack" style={{ marginTop: 22 }}>
      {items.map(s => (
        <div key={s.title} className="cs-card">
          <div className="cs-step-card__title">{s.title}</div>
          <span className="cs-badge cs-badge--brand" style={{ marginBottom: 12 }}>
            {s.who}
          </span>
          <p className="cs-step-card__desc">{s.what}</p>
          {s.watch && (
            <p className="cs-guide__watch">
              <b>처음이면 여기서 막혀요</b>
              {s.watch}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function GuidePage() {
  return (
    <div className="cs-wrap" style={{ paddingTop: 44, maxWidth: 860 }}>
      <h1 className="cs-page-title">청약 가이드</h1>
      <p className="cs-lead" style={{ marginTop: 16 }}>
        처음이면 용어부터 낯설어요. <b>사서 내 집이 되는 분양</b>과 <b>빌려 사는 임대</b>를 갈라
        정리했습니다. 값이 크고 되돌리기 어려운 분양을 먼저 두었어요.
      </p>

      <section style={{ marginTop: 40 }}>
        <div className="cs-sec-head">
          <span className="cs-sec-index">01</span>
          <div className="cs-sec-head__body">
            <h2 className="cs-section-title">분양 — 사서 내 집이 되는 것</h2>
            <p className="cs-sub" style={{ marginTop: 10 }}>
              당첨되면 분양대금을 치르고 소유권을 갖습니다. 우리가 모아 보여드리는 청약홈 공고가
              대부분 여기에 속해요.
            </p>
          </div>
        </div>
        <Cards items={SALE} />
      </section>

      <section style={{ marginTop: 48 }}>
        <div className="cs-sec-head">
          <span className="cs-sec-index">02</span>
          <div className="cs-sec-head__body">
            <h2 className="cs-section-title">임대 — 빌려 사는 것</h2>
            <p className="cs-sub" style={{ marginTop: 10 }}>
              보증금과 월 임대료를 내고 정해진 기간 삽니다. LH 청약플러스 공고가 여기에 속해요.
            </p>
          </div>
        </div>
        <Cards items={RENT} />
      </section>

      <section style={{ marginTop: 48 }}>
        <div className="cs-sec-head">
          <span className="cs-sec-index">03</span>
          <div className="cs-sec-head__body">
            <h2 className="cs-section-title">공고문에서 처음 막히는 말</h2>
            <p className="cs-sub" style={{ marginTop: 10 }}>
              뜻만 알아도 공고문 절반이 읽힙니다.
            </p>
          </div>
        </div>
        <dl className="cs-terms" style={{ marginTop: 22 }}>
          {TERMS.map(t => (
            <div key={t.term} className="cs-terms__item">
              <dt className="cs-terms__t">{t.term}</dt>
              <dd className="cs-terms__d">{t.mean}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="cs-card" style={{ marginTop: 40 }}>
        <div className="cs-step-card__title">꼭 기억해 주세요</div>
        <p className="cs-step-card__desc">
          같은 유형이라도 공고마다 자격요건과 소득·자산 기준이 다릅니다. 이 가이드는 이해를 돕기 위한
          설명이며 자격 판정이 아닙니다. 실제 지원 가능 여부는 반드시 해당 공고의 공식 모집공고문에서
          확인해 주세요.
        </p>
      </div>

      <div className="cs-cta-band" style={{ marginTop: 44 }}>
        <h2 className="cs-section-title" style={{ fontSize: 24 }}>
          내 조건으로 먼저 살펴볼까요?
        </h2>
        <Link href="/analyze" className="cs-btn cs-btn--primary" style={{ marginTop: 22 }}>
          내 조건으로 집 찾기
        </Link>
      </div>
    </div>
  )
}
