'use client'

import Image from 'next/image'
import { emblemFor } from '@/lib/consumer/emblem'

/**
 * 공고 카드의 지역 표시.
 *
 * 지자체 상징(엠블럼)을 박고 그 아래 시·군·구 이름을 적는다.
 * 상징은 광역까지만 확실히 확보돼 있어(기초자치단체 CI 는 공개 저장소에
 * 정리돼 있지 않다) 평택시 공고에는 경기도 상징 + "평택시" 가 붙는다.
 * 틀린 말이 아니고, 어느 지역인지는 한눈에 들어온다.
 *
 * 상징이 없는 지역("전국", "공공주택지구" 같은 값)은 이름을 마크로 만든다.
 * 빈칸을 남기면 카드마다 오른쪽이 들쭉날쭉해진다.
 */

/** 이름에서 색을 만든다. 같은 지역은 언제나 같은 색이다 */
function hueOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

/** "서울특별시 관악구" → "관악", "충청남도" → "충남" */
function shortName(raw: string) {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const last = s.split(/\s+/).pop() ?? s
  const core = last.replace(/(특별자치도|특별자치시|광역시|특별시|[시군구읍면동])$/u, '')
  return (core || last).slice(0, 3)
}

export default function RegionMark({
  region,
  district,
  title,
}: {
  region: string
  district?: string
  /** 공고명. 지역본부까지만 주는 공고의 시·군·구가 여기 들어 있다 */
  title?: string
}) {
  const name = (region ?? '').trim()
  if (!name) return null

  const emblem = emblemFor(name, district, title)

  if (emblem) {
    // 상징과 이름이 같은 곳을 가리켜야 한다. 부천시 CI 를 달아 놓고 "경기"라고
    // 적으면 보는 사람이 둘 중 무엇을 믿어야 할지 알 수 없다.
    return (
      <span className="cs-emblem" title={`${emblem.of} · 공고 지역 ${name}`}>
        <Image
          src={emblem.src}
          alt=""
          width={40}
          height={40}
          className="cs-emblem__img"
          aria-hidden="true"
          unoptimized
        />
        <span className="cs-emblem__name">{shortName(emblem.of)}</span>
      </span>
    )
  }

  // 상징이 없는 지역 — 이름 자체를 마크로
  return (
    <span
      className="cs-regionmark"
      aria-hidden="true"
      style={{ '--mark-h': hueOf(name) } as React.CSSProperties}
    >
      <span className="cs-regionmark__ring" />
      <span className="cs-regionmark__text">{shortName(name)}</span>
    </span>
  )
}
