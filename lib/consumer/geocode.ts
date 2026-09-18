import type { LatLng } from './geo'

/**
 * 주소 → 좌표 (카카오 로컬 API).
 *
 * 브라우저에서 부르지 않는다. 지오코딩 키는 서버에만 둔다 — 화면에 내보내면
 * 누구나 우리 할당량으로 주소를 조회할 수 있다.
 *
 * 공고의 주소는 "경기도 남양주시 오남읍 양지리 186-10번지 일원" 처럼
 * 행정 표기와 설명이 섞여 있다. 그대로 물으면 못 찾는 경우가 있어,
 * 꼬리를 한 마디씩 떼며 다시 묻는다. 지번까지 못 찾으면 읍·면·동까지만
 * 찾아도 지도에 올릴 값으로는 충분하다.
 */

const ENDPOINT = 'https://dapi.kakao.com/v2/local/search/address.json'

/** 같은 주소를 두 번 묻지 않는다. 인스턴스가 사는 동안 남는다 */
const cache = new Map<string, GeoHit | null>()

function key() {
  return (process.env.KAKAO_REST_API_KEY ?? '').trim()
}

export function isGeocodingConfigured() {
  return Boolean(key())
}

/**
 * 물어볼 후보를 넓은 쪽으로 만든다.
 * "…오남읍 양지리 186-10번지 일원" → 지번까지 → 리까지 → 읍까지
 */
function candidates(address: string): string[] {
  const cleaned = address
    .replace(/일원|일대|외\s*\d+필지|번지/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []

  const parts = cleaned.split(' ')
  const out = new Set<string>([cleaned])
  for (let n = parts.length - 1; n >= 2; n--) {
    out.add(parts.slice(0, n).join(' '))
  }
  return [...out]
}

/**
 * 주소 한 건의 조회 결과.
 *
 * 좌표만 쓰다가 법정동코드가 필요해졌다 — 국토부 실거래가는 시군구 코드로만
 * 물을 수 있기 때문이다. 카카오가 같은 응답에 `b_code`(법정동코드 10자리)를
 * 함께 주므로, 주소를 두 번 묻지 않고 한 번에 받는다.
 */
export interface GeoHit extends LatLng {
  /** 법정동코드 10자리. 앞 5자리가 시군구 코드(LAWD_CD)다 */
  bCode: string | null
  /** 법정동 이름 — '녹양동' 처럼 */
  dong: string | null
  /** 시군구까지의 이름 — '경기도 의정부시' */
  sigungu: string | null
}

async function ask(query: string): Promise<GeoHit | null> {
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `KakaoAK ${key()}` },
    // 주소는 거의 바뀌지 않는다. 하루 동안 다시 묻지 않는다.
    next: { revalidate: 86400 },
  })
  if (!res.ok) return null
  const json = (await res.json()) as {
    documents?: {
      x: string
      y: string
      address?: { b_code?: string; region_3depth_name?: string; region_1depth_name?: string; region_2depth_name?: string }
      road_address?: { b_code?: string; region_3depth_name?: string; region_1depth_name?: string; region_2depth_name?: string }
    }[]
  }
  const doc = json.documents?.[0]
  if (!doc) return null
  const lat = Number(doc.y)
  const lng = Number(doc.x)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const a = doc.address ?? doc.road_address ?? {}
  const sigungu = [a.region_1depth_name, a.region_2depth_name].filter(Boolean).join(' ') || null
  return {
    lat,
    lng,
    bCode: a.b_code ?? null,
    dong: a.region_3depth_name ?? null,
    sigungu,
  }
}

/**
 * 공고 이름으로 자리를 찾는다.
 *
 * LH 공고에는 주소 칸이 아예 없다 — 쉰두 건 전부 비어 있었다. 그래서 지도에서
 * 광역 기준점으로 물러서 한 점에 뭉치고, 법정동코드를 못 구해 주변 시세도
 * 붙이지 못했다.
 *
 * 그런데 이름에는 자리가 적혀 있다. '평택고덕 A57-2블록', '인천계양 A6블록',
 * '포항창포 영구임대아파트' — 사람은 읽는다. 주소 검색은 이런 표기를 못 풀지만
 * 장소 검색은 푼다.
 *
 * ── 틀린 자리를 찍지 않기 위한 장치 ──
 *
 * 장소 검색은 그럴듯한 것을 무엇이든 돌려준다. '오룡'이라는 카페가 나올 수도
 * 있다. 그래서 찾은 곳의 광역이 공고의 광역과 다르면 버린다. 틀린 좌표는
 * 없는 좌표보다 나쁘다 — 지도는 틀렸다고 말해 주지 않는다.
 */
const KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json'
const REGIONCODE_ENDPOINT = 'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json'

/** 이름에서 자리로 쓸 만한 앞부분을 잘라낸다 */
function nameQueries(name: string): string[] {
  const cleaned = (name ?? '')
    .replace(/^\[[^\]]*\]\s*/g, '') // [정정공고], [경기남부] 같은 머리표
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  const parts = cleaned.split(' ')
  const out = new Set<string>()
  // 두 어절 → 한 어절 순. '무안 오룡마을'처럼 둘이 붙어야 풀리는 이름이 있다.
  if (parts.length >= 2) out.add(`${parts[0]} ${parts[1]}`)
  if (parts[0]) out.add(parts[0])
  return [...out].filter(q => q.length >= 2)
}

async function askKeyword(query: string): Promise<GeoHit | null> {
  const res = await fetch(`${KEYWORD_ENDPOINT}?${new URLSearchParams({ query, size: '1' })}`, {
    headers: { Authorization: `KakaoAK ${key()}` },
    next: { revalidate: 86400 },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { documents?: { x: string; y: string; address_name?: string }[] }
  const doc = json.documents?.[0]
  if (!doc) return null

  const lat = Number(doc.y)
  const lng = Number(doc.x)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  // 좌표에서 법정동코드를 되짚는다. 장소 검색 응답에는 b_code 가 없다.
  const rc = await fetch(
    `${REGIONCODE_ENDPOINT}?${new URLSearchParams({ x: String(lng), y: String(lat) })}`,
    { headers: { Authorization: `KakaoAK ${key()}` }, next: { revalidate: 86400 } },
  )
  let bCode: string | null = null
  let dong: string | null = null
  let sigungu: string | null = null
  if (rc.ok) {
    const rj = (await rc.json()) as {
      documents?: {
        region_type?: string
        code?: string
        region_1depth_name?: string
        region_2depth_name?: string
        region_3depth_name?: string
      }[]
    }
    const b = rj.documents?.find(d => d.region_type === 'B') ?? rj.documents?.[0]
    if (b) {
      bCode = b.code ?? null
      dong = b.region_3depth_name ?? null
      sigungu = [b.region_1depth_name, b.region_2depth_name].filter(Boolean).join(' ') || null
    }
  }
  return { lat, lng, bCode, dong, sigungu }
}

/**
 * 공고 이름으로 자리를 찾는다. `province` 를 주면 그 광역과 맞는 것만 받는다.
 */
export async function geocodeByName(
  name: string | null | undefined,
  province?: string | null,
): Promise<GeoHit | null> {
  const raw = (name ?? '').trim()
  if (!raw || !key()) return null

  const want = (province ?? '')
    .split('·')
    .map(t => t.trim())
    .filter(Boolean)

  for (const q of nameQueries(raw)) {
    try {
      const hit = await askKeyword(q)
      if (!hit) continue
      if (want.length > 0) {
        const where = hit.sigungu ?? ''
        // '경기'는 '경기도'로, '충남'은 '충청남도'로 돌아온다. 앞 두 글자로 견준다.
        const ok = want.some(w => where.includes(w) || where.includes(w.slice(0, 2)))
        if (!ok) continue
      }
      return hit
    } catch {
      // 다음 후보로
    }
  }
  return null
}

/** 주소 하나를 좌표로. 못 찾으면 null — 아무 데나 찍지 않는다 */
export async function geocode(address: string | null | undefined): Promise<GeoHit | null> {
  const raw = (address ?? '').trim()
  if (!raw || !key()) return null
  if (cache.has(raw)) return cache.get(raw) ?? null

  for (const q of candidates(raw)) {
    try {
      const hit = await ask(q)
      if (hit) {
        cache.set(raw, hit)
        return hit
      }
    } catch {
      // 한 번 실패했다고 다음 후보까지 포기하지 않는다
    }
  }
  cache.set(raw, null)
  return null
}

/**
 * 여러 주소를 한 번에.
 *
 * 한 번에 몰아 보내면 상대 쪽에 부담이 가고 제한에 걸린다. 몇 개씩 끊어
 * 보내되, 이미 캐시에 있는 것은 네트워크를 쓰지 않는다.
 */
export async function geocodeMany(
  addresses: (string | null | undefined)[],
  { concurrency = 5 }: { concurrency?: number } = {},
): Promise<Map<string, GeoHit>> {
  const found = new Map<string, GeoHit>()
  const todo = [...new Set(addresses.map(a => (a ?? '').trim()).filter(Boolean))]

  for (let i = 0; i < todo.length; i += concurrency) {
    const slice = todo.slice(i, i + concurrency)
    const hits = await Promise.all(slice.map(a => geocode(a)))
    slice.forEach((a, n) => {
      const hit = hits[n]
      if (hit) found.set(a, hit)
    })
  }
  return found
}
