import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * 공개 API 앞에 세우는 문지기.
 *
 * `/api/notices` 한 번이면 접수 중인 공고 전부가, `/api/competition/stats`
 * 한 번이면 지역별 경쟁률·가점 집계 110KB 가 통째로 나온다. 화면을 하나씩
 * 긁을 필요도 없이 JSON 한 줄이면 끝난다.
 *
 * 관리·크론 엔드포인트는 이미 401 로 막혀 있다. 여기서 맡는 것은 "열려 있어야
 * 하지만 통째로 퍼가면 곤란한" 공개 데이터다.
 *
 * ── 이 장치의 한계를 분명히 해 둔다 ──
 *
 * Next 문서가 이르기를, proxy 는 CDN 으로 밀려 나갈 수 있으니 전역 상태에
 * 기대지 말라고 한다. 아래 계수기는 인스턴스마다 따로 산다. 지역이 나뉘면
 * 한도도 그만큼 나뉘고, 인스턴스가 재활용되면 기억이 지워진다.
 *
 * 그러므로 이것은 "차단"이 아니라 "한 군데서 몰아치는 것을 성가시게 만드는"
 * 장치다. 작정한 수집기는 IP 를 바꿔 가며 통과한다. 그래도 둔다 — 대부분의
 * 퍼가기는 작정한 것이 아니라 스크립트 한 줄로 시작하기 때문이다.
 *
 * 제대로 막으려면 공용 저장소(Redis 등)에 계수를 두어야 한다. 그때까지의
 * 임시방편임을 적어 둔다.
 */

export const config = {
  matcher: '/api/:path*',
}

/** 창의 길이 */
const WINDOW_MS = 60_000

/**
 * 한도.
 *
 * 한 사람 기준으로 재면 안 된다. 사무실·행사장·학교는 NAT 뒤에 있어 수십 명이
 * 하나의 공인 IP 로 보인다. 발표장에서 청중이 한꺼번에 들어오면 그게 전부
 * 한 사람의 요청으로 세어진다 — 좁게 잡으면 막아야 할 것 대신 손님을 막는다.
 *
 * 그래서 "사람 여럿이 한 IP 로 몰려도 닿지 않고, 스크립트 한 줄이 도는 속도로는
 * 금방 닿는" 자리에 둔다. 수집기는 보통 분당 수천 번을 던진다.
 */
const LIMIT_DEFAULT = 400
/** 집계를 통째로 주는 자리는 좀 더 좁게 */
const LIMIT_HEAVY = 100

// progress · stores 는 부를 때마다 바깥 공공 API 를 쓴다(일일 호출 한도가 있는 키). 좁게 둔다
const HEAVY = ['/api/competition', '/api/winners', '/api/notices/map', '/api/prediction', '/api/progress', '/api/stores']

type Hit = { n: number; until: number }
const hits = new Map<string, Hit>()

/** 지나간 기록을 버린다. 두지 않으면 인스턴스가 사는 동안 계속 불어난다 */
function sweep(now: number) {
  if (hits.size < 2_000) return
  for (const [k, v] of hits) if (v.until <= now) hits.delete(k)
}

function take(key: string, limit: number, now: number) {
  const cur = hits.get(key)
  if (!cur || cur.until <= now) {
    hits.set(key, { n: 1, until: now + WINDOW_MS })
    return { ok: true, remaining: limit - 1, retryAfter: 0 }
  }
  cur.n++
  if (cur.n > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((cur.until - now) / 1000) }
  }
  return { ok: true, remaining: limit - cur.n, retryAfter: 0 }
}

/**
 * 누구의 요청인지.
 *
 * 프록시를 거치므로 `x-forwarded-for` 의 맨 앞이 실제 요청자다. 위조할 수
 * 있는 값이라 신원 확인에는 쓸 수 없고, 계수 용도로만 쓴다.
 */
function who(req: NextRequest) {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const first = fwd.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const now = Date.now()
  sweep(now)

  const heavy = HEAVY.some(p => path.startsWith(p))
  const limit = heavy ? LIMIT_HEAVY : LIMIT_DEFAULT
  const { ok, remaining, retryAfter } = take(`${who(req)}:${heavy ? 'h' : 'd'}`, limit, now)

  if (!ok) {
    return NextResponse.json(
      { error: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  const res = NextResponse.next()
  // API 응답은 검색 결과에 실릴 이유가 없다. robots.txt 를 읽지 않고 들어온
  // 크롤러에게도 색인하지 말라고 일러둔다.
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  res.headers.set('X-RateLimit-Limit', String(limit))
  res.headers.set('X-RateLimit-Remaining', String(remaining))
  return res
}
