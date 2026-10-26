'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 기다리는 동안 읽을 한 장.
 *
 * 빨리 끝나는 일에는 아무것도 띄우지 않는다. 0.4초 안에 끝나면 버튼의 눌림만으로
 * 충분하고, 그 사이에 카드가 번쩍 떴다 사라지면 오히려 고장처럼 보인다.
 * 그보다 길어지면 화면 한쪽에 카드 한 장을 올린다 — 화면을 덮지 않는다.
 * 입력, 취소, 다른 메뉴는 그대로 손이 닿아야 한다.
 *
 * 2초가 지나면 지금 실제로 하고 있는 단계를 적는다(부르는 쪽이 넘긴 값).
 * 진행률은 만들지 않는다 — 서버가 몇 퍼센트인지 알려 주지 않는데 막대를
 * 채우는 것은 기다림을 꾸미는 일이다. 오래 걸리면 취소와 다시 시도를 내민다.
 *
 * 카드의 내용은 법령과 공식 기관 안내로 확인되는 것만 적고, 링크는 그 기관으로
 * 보낸다. 모집 여부·금액·기한처럼 바뀌는 값은 적지 않는다.
 */

interface Tip {
  tag: string
  title: string
  body: string
  link?: { href: string; label: string }
}

const TIPS: Tip[] = [
  {
    tag: '계약 전',
    title: '전세 계약 전에 이것부터 확인했나요?',
    body: '등기사항증명서의 갑구에서 지금 소유자가 계약 상대와 같은지, 을구에서 근저당 같은 다른 권리가 먼저 잡혀 있는지 봅니다. 계약 당일에 한 번 더 떼어 보는 편이 안전합니다.',
    link: { href: 'https://www.iros.go.kr', label: '대법원 인터넷등기소' },
  },
  {
    tag: '입주 직후',
    title: '이사한 날, 전입신고와 확정일자',
    body: '집을 넘겨받고 전입신고까지 마치면 다음 날 0시부터 대항력이 생기고, 확정일자를 받아 두면 우선변제를 주장할 수 있습니다(주택임대차보호법 제3조·제3조의2).',
    link: { href: 'https://www.law.go.kr/법령/주택임대차보호법', label: '국가법령정보센터' },
  },
  {
    tag: '청년 지원',
    title: '나에게 맞는 청년 주거지원은?',
    body: '지원 대상과 금액은 지역·연령·소득·주거 형태마다 다르고, 해마다 바뀌기도 합니다. 여기서 대신 판정하지 않습니다. 공식 정책 목록에서 지역을 골라 확인하세요.',
    link: { href: 'https://www.youthcenter.go.kr', label: '온통청년' },
  },
  {
    tag: '주거비',
    title: '월세만 보면 놓치기 쉬운 비용',
    body: '관리비, 보증금 대출 이자, 보증금으로 묶여 받지 못하는 예금 이자까지 더해야 한 달에 실제로 나가는 돈입니다. 첫 화면의 계산기로 두 집을 같은 잣대에 올려 보세요.',
    link: { href: '/#cost', label: '주거비 환산 계산기' },
  },
  {
    tag: '보증금',
    title: '계약 종료일과 보증금 반환일을 함께',
    body: '다음 집 잔금 날짜와 지금 집 보증금이 돌아오는 날이 어긋나면 이사가 막힙니다. 전세보증금 반환보증은 가입 요건이 있으니 계약 전에 미리 확인해 두세요.',
    link: { href: 'https://www.khug.or.kr', label: '주택도시보증공사(HUG)' },
  },
  {
    tag: '청약',
    title: '자격은 공고문이 정합니다',
    body: '같은 유형이라도 공고마다 소득·자산 기준과 우선순위가 다릅니다. 집캐치는 지역과 예산이 맞는지를 보고, 자격의 최종 확인은 모집공고 원문으로 합니다.',
    link: { href: 'https://www.applyhome.co.kr', label: '청약홈' },
  },
  {
    tag: '공공임대',
    title: '공공임대 정보를 한곳에서',
    body: '행복주택·국민임대·매입임대처럼 이름이 비슷한 제도는 대상과 거주 기간이 다릅니다. 제도 설명과 공고는 정부 주거복지 포털에 모여 있습니다.',
    link: { href: 'https://www.myhome.go.kr', label: '마이홈포털' },
  },
]

const SHOW_AFTER = 400
const STAGE_AFTER = 2000
const STUCK_AFTER = 10000

export default function YouthDiscoveryLoader({
  active,
  title = '내 조건에 맞는 공고를 찾는 중이에요',
  stage,
  onCancel,
  onRetry,
}: {
  active: boolean
  title?: string
  /** 지금 실제로 하고 있는 일 — "조건 저장" 처럼 부르는 쪽이 아는 단계만 */
  stage?: string
  onCancel?: () => void
  onRetry?: () => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const [visible, setVisible] = useState(false)
  // 시작 장은 매번 다르게 — 같은 사람이 두 번째 검색에서 같은 카드를 보지 않게
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const t0 = useRef(0)

  useEffect(() => {
    if (!active) {
      const id = requestAnimationFrame(() => setVisible(false))
      return () => cancelAnimationFrame(id)
    }
    t0.current = performance.now()
    const first = requestAnimationFrame(() => {
      setElapsed(0)
      setOpen(false)
      setIndex(Math.floor(Math.random() * TIPS.length))
    })
    const id = window.setInterval(() => {
      const e = performance.now() - t0.current
      setElapsed(e)
      if (e >= SHOW_AFTER) setVisible(true)
    }, 200)
    return () => {
      cancelAnimationFrame(first)
      window.clearInterval(id)
    }
  }, [active])

  if (!visible) return null

  const tip = TIPS[index % TIPS.length]
  const next = () => {
    setOpen(false)
    setIndex(i => (i + 1) % TIPS.length)
  }
  const external = tip.link && tip.link.href.startsWith('http')

  return (
    <aside className="cs-ydl" data-leaving={!active || undefined} aria-label="검색 진행 상황">
      <div className="cs-ydl__status" role="status">
        <i className="cs-ydl__spin" aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <span>
            {elapsed >= STUCK_AFTER
              ? '평소보다 오래 걸리고 있어요. 입력한 조건은 그대로 남아 있습니다.'
              : elapsed >= STAGE_AFTER && stage
                ? stage
                : '잠시만요.'}
          </span>
        </div>
      </div>

      <article className="cs-ydl__card" key={index}>
        <span className="cs-ydl__tag">{tip.tag}</span>
        <h3 className="cs-ydl__title">{tip.title}</h3>
        <p className="cs-ydl__body" data-open={open || undefined}>
          {tip.body}
        </p>
        <div className="cs-ydl__foot">
          {open && tip.link ? (
            <a
              href={tip.link.href}
              className="cs-ydl__link"
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {tip.link.label}
              {external ? ' (새 창)' : ''}
            </a>
          ) : (
            <button type="button" className="cs-ydl__more" onClick={() => setOpen(true)}>
              자세히
            </button>
          )}
          <button type="button" className="cs-ydl__next" onClick={next}>
            다음 팁
            <span className="cs-num" aria-hidden="true">
              {(index % TIPS.length) + 1}/{TIPS.length}
            </span>
          </button>
        </div>
      </article>

      {(onCancel || (onRetry && elapsed >= STUCK_AFTER)) && (
        <div className="cs-ydl__actions">
          {onRetry && elapsed >= STUCK_AFTER && (
            <button type="button" className="cs-btn cs-btn--sm cs-btn--ghost" onClick={onRetry}>
              다시 시도
            </button>
          )}
          {onCancel && (
            <button type="button" className="cs-ydl__cancel" onClick={onCancel}>
              취소하고 조건으로 돌아가기
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
