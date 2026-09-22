/**
 * 공고의 지역 → 지자체 상징.
 *
 * ── 어느 상징을 고르나 ──
 *
 * 구체적인 것부터 찾는다. 시·군·구 → 광역 순이고, 맞는 파일이 없으면 다음으로 넘어간다.
 *
 * 문제는 우리가 받는 공고의 **셋 중 둘은 지역이 지역본부(경기·경남)까지만**
 * 온다는 것이다. LH 목록 API 가 그렇게 준다. 그런데 **제목에는 시·군·구가 들어
 * 있다** — "익산시 국민임대주택 예비입주자 모집 공고". 그래서 제목도 함께 훑는다.
 *
 * 제목을 훑으면 "남악휴먼시아"에서 `남악휴먼시` 같은 헛것이 딸려 오지만,
 * 여기서는 **보유한 파일과 이름이 맞을 때만** 쓰이므로 저절로 걸러진다.
 * 화면에 적는 지역명은 건드리지 않고 상징만 고르는 데 쓰기 때문에,
 * 제목 해석이 틀려도 틀린 지역명이 표시되는 일은 없다.
 *
 * 상징 파일은 scripts/fetch-region-emblems.mjs 가 공고를 읽어 받아 둔다.
 * 새 지역의 공고가 뜨면 그 스크립트를 다시 돌리는 것으로 끝난다.
 */

import manifest from '@/public/emblems/manifest.json'
import guInCity from './gu-in-city.json'

interface EmblemMeta {
  file: string
  title: string
  license: string
  artist: string
  source: string
}

const ITEMS = manifest.items as Record<string, EmblemMeta>

/** LH 지역본부 표기·행정구역 전체 이름을 광역 두 글자로 맞춘다 */
const TO_PROVINCE: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
  // LH 지역본부 — 행정구역이 아니라 관할이다. 대표 광역으로 잇는다
  '전남·광주': '광주',
  '대구 외': '대구',
  '대전 외': '대전',
  '인천 외': '인천',
}

/** 서울 자치구 — 구 이름만 오는 청약홈 행을 광역으로 되짚는다 */
const SEOUL_GU = new Set([
  '강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구',
  '동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구',
  '용산구','은평구','종로구','중구','중랑구',
])

/**
 * 일반구(자치구가 아닌 구) -> 그 구가 속한 시.
 *
 * 소사구는 부천시의 구이고 권선구는 수원시의 구다. 이런 구에는 따로 상징이
 * 없는 일이 많은데, 그렇다고 '경기'로 내려보내면 부천 공고에 경기도 상징이
 * 붙는다. 틀린 말은 아니지만 지도 위 한 점을 도 전체로 바꿔 버리는 셈이다.
 * 광역으로 내려가기 전에 **모시(母市)를 한 번 거친다.**
 *
 * 표는 gu-in-city.json 에 둔다 — 상징을 내려받는 스크립트도 같은 표를 읽어
 * 모시의 상징을 함께 받아 둔다. 같은 목록을 두 곳에 적으면 언젠가 어긋난다.
 *
 * 광역을 함께 적어 둔 이유는 이름이 겹치기 때문이다. '남구'는 포항에도 있고
 * 부산 . 대구 . 인천 . 광주 . 울산에도 있는데 그쪽은 제 상징을 가진 자치구다.
 * 공고의 광역이 맞을 때만 모시로 보낸다 — 아니면 울산 남구 공고에 포항시
 * 상징이 붙는다.
 */
const GU_IN_CITY = guInCity as Record<string, { city: string; province: string }>

/** 이 이름이 어느 시의 일반구인가. 광역이 맞을 때만 답한다 */
function cityOfGu(gu: string, province: string | undefined): string | null {
  const hit = GU_IN_CITY[gu]
  if (!hit) return null
  // 광역을 모르면 보내지 않는다. 겹치는 이름을 찍어 맞히느니 비워 두는 편이 낫다.
  if (!province || province !== hit.province) return null
  return hit.city
}

export interface Emblem {
  src: string
  /** 상징이 가리키는 지역 (광역일 수 있다) */
  of: string
  license: string
  artist: string
  source: string
}

/**
 * 공고 한 건에 붙일 상징을 고른다.
 *
 * 시·군·구 파일이 있으면 그것을, 없으면 그 지역이 속한 광역을 쓴다.
 * 둘 다 없으면 null — 없는 것을 아무거나로 채우지 않는다.
 */
export function emblemFor(
  region: string,
  district?: string | null,
  /**
   * 공고 제목. LH 공고는 지역을 지역본부까지만 주지만 제목에는 시·군·구가 들어 있다
   * ("익산시 국민임대주택 예비입주자 모집 공고"). 상징을 고를 때만 쓰므로
   * 제목에서 캔 이름이 틀려도 화면 값이 틀어지지 않는다 — 맞는 파일이 없으면
   * 그냥 다음 후보로 넘어간다.
   */
  title?: string | null,
): Emblem | null {
  const r = (region ?? '').trim()
  const d = (district ?? '').trim()

  // 제목에서 시·군·구를 줍는다. 보유한 파일과 맞을 때만 쓰이므로
  // "남악휴먼시" 같은 헛것은 저절로 걸러진다.
  const fromTitle: string[] = []
  for (const m of (title ?? '').matchAll(/([가-힣]{2,5}(?:시|군|구))/g)) {
    fromTitle.push(m[1])
  }

  // 이 공고의 광역. 일반구를 모시로 보낼 때 이름이 겹치는지 가리는 데 쓴다.
  const province = TO_PROVINCE[r] ?? TO_PROVINCE[d] ?? (SEOUL_GU.has(r) ? '서울' : undefined) ?? (d.length <= 3 ? d : undefined)

  const tries = [
    ...fromTitle, // 가장 구체적인 값이 먼저다
    r, // 시·군·구 파일이 있으면 가장 정확하다
    // 상징 없는 일반구는 광역이 아니라 제 시로 보낸다 (소사구 → 부천시).
    // **district 보다 먼저** 본다 — LH·청약홈 공고는 district 칸에 광역을
    // 담아 보내는 일이 많아서, 뒤에 두면 부천시를 찾기 전에 '경기'가 걸린다.
    ...fromTitle.map(t => cityOfGu(t, province)),
    cityOfGu(r, province),
    d,
    TO_PROVINCE[r],
    TO_PROVINCE[d],
    SEOUL_GU.has(r) ? '서울' : '',
    // "충남 서북구" 처럼 광역이 district 에 오는 경우
    d && d.length <= 3 ? d : '',
  ].filter(Boolean) as string[]

  for (const key of tries) {
    const hit = ITEMS[key]
    if (hit) {
      return {
        src: `/emblems/${hit.file}`,
        of: key,
        license: hit.license,
        artist: hit.artist,
        source: hit.source,
      }
    }
  }
  return null
}

/** 화면 아래에 적을 출처 한 줄 */
export const EMBLEM_CREDIT =
  '지자체 상징은 각 지자체가 공표한 공공저작물이며 위키미디어 공용(Public domain)에서 받았습니다.'
