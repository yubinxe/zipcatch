'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * 집 하나를 고르기까지 — 네 장면.
 *
 * 왼쪽은 멈춰 서서 지금 어느 장면인지 말하고, 오른쪽이 지나간다.
 * 장면마다 실제로 있는 화면으로 가는 문을 하나씩 단다. 이야기만 하고
 * 갈 곳이 없으면 장식이다.
 *
 * 스크롤을 빼앗지 않는다. 자동으로 넘기지도, 붙잡지도 않는다 — 읽는
 * 속도는 읽는 사람이 정한다. 좁은 화면에서는 멈춰 서는 기둥 없이 그냥 쌓인다.
 */

const SCENES = [
  {
    verb: '고르기',
    title: '세 가지만 정하면 후보가 나옵니다',
    desc: '살고 싶은 지역, 감당할 수 있는 주거비, 가구와 선호. 자격 판단에 필요한 세부는 후보를 본 다음에 묻습니다.',
    href: '/analyze',
    cta: '내 조건 넣기',
  },
  {
    verb: '견주기',
    title: '두 공고를 같은 줄에 세웁니다',
    desc: '보증금·월 임대료·면적·마감을 한 줄씩 맞대어 봅니다. 어느 쪽이 더 나은지는 숫자 차이로 말합니다.',
    href: '/compare',
    cta: '공고 비교하기',
  },
  {
    verb: '확인하기',
    title: '확인된 것과 아닌 것을 나눠 둡니다',
    desc: '공고 원문에 있는 사실, 아직 확인하지 않은 자격요건, 공고에 없어 미정인 날짜. 섞지 않고 표시합니다.',
    href: '/guide',
    cta: '청약 가이드 읽기',
  },
  {
    verb: '챙기기',
    title: '마감은 저희가 기억합니다',
    desc: '관심공고를 저장하면 공식 기한과 준비 권장일을 나눠 정리하고, 새 공고가 열리면 알려 드립니다.',
    href: '/saved',
    cta: '관심공고 보기',
  },
] as const

/** 장면마다 그 화면이 다루는 것을 글자로만 보여준다 — 숫자를 지어내지 않는다 */
function Specimen({ i }: { i: number }) {
  if (i === 0)
    return (
      <div className="cs-jr__spec cs-jr__spec--chips" aria-hidden="true">
        <span>
          <em>지역</em>살고 싶은 동네
        </span>
        <span>
          <em>주거비</em>보증금 · 월 상한
        </span>
        <span>
          <em>가구</em>인원 · 면적 · 유형
        </span>
      </div>
    )
  if (i === 1)
    return (
      <div className="cs-jr__spec cs-jr__spec--table" aria-hidden="true">
        <div>
          <span />
          <b>A</b>
          <b>B</b>
        </div>
        {['보증금', '월 임대료', '전용면적', '접수 마감'].map(row => (
          <div key={row}>
            <span>{row}</span>
            <i />
            <i />
          </div>
        ))}
      </div>
    )
  if (i === 2)
    return (
      <ul className="cs-jr__spec cs-jr__spec--check" aria-hidden="true">
        <li data-s="ok">
          <i />
          공고 원문에 적힌 금액·일정
        </li>
        <li data-s="check">
          <i />
          소득·자산·거주기간 — 확인 필요
        </li>
        <li data-s="none">
          <i />
          원문에 없는 날짜 — 미정
        </li>
      </ul>
    )
  return (
    <ol className="cs-jr__spec cs-jr__spec--line" aria-hidden="true">
      <li>
        <i />
        서류 준비 <em>권장</em>
      </li>
      <li data-s="due">
        <i />
        접수 마감 <em>공식</em>
      </li>
      <li>
        <i />
        결과 발표 <em>공식</em>
      </li>
    </ol>
  )
}

export default function Journey() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const el of refs.current) if (el) io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className="cs-jr" style={{ '--jr-p': (active + 1) / SCENES.length } as React.CSSProperties}>
      <div className="cs-jr__pin" aria-hidden="true">
        <span className="cs-jr__num cs-num" key={active}>
          {String(active + 1).padStart(2, '0')}
        </span>
        <span className="cs-jr__verb">{SCENES[active].verb}</span>
        <ol className="cs-jr__rail">
          {SCENES.map((s, i) => (
            <li key={s.verb} data-on={i <= active || undefined}>
              {s.verb}
            </li>
          ))}
        </ol>
      </div>

      <ol className="cs-jr__scenes">
        {SCENES.map((s, i) => (
          <li
            key={s.verb}
            ref={el => {
              refs.current[i] = el
            }}
            data-i={i}
            data-on={i === active || undefined}
            className="cs-jr__scene"
          >
            <span className="cs-jr__mobile-num cs-num" aria-hidden="true">
              {String(i + 1).padStart(2, '0')} · {s.verb}
            </span>
            <h3 className="cs-jr__title">{s.title}</h3>
            <p className="cs-jr__desc">{s.desc}</p>
            <Specimen i={i} />
            <Link href={s.href} className="cs-btn cs-btn--text cs-jr__go">
              {s.cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
