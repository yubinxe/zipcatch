import { NextRequest } from 'next/server'
import { fetchMyhomeWait, type MyhomeWait } from '@/lib/adapters/myhome'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * 공공임대 예비입주자 대기현황 — 마이홈포털(국토교통부 15108378).
 *
 * 광역 코드(brtcCode)가 필수다. 시·군·구 코드는 따로 매핑하지 않고, 광역 전체를 받아
 * 시·군·구 이름으로 거른다(서울 3,795행 → 1,000행씩 네 쪽, 6시간 캐시).
 *
 * 코드는 2026-10 실측으로 확인했다 — 2026 개편 지역은 새 코드로만 답한다:
 *   강원특별자치도 51(42 X) · 전북특별자치도 52(45 X) · 전남광주통합특별시 12(29·46 X)
 *
 * 대기자 수·퇴거 건수만 보인다. 이것으로 입주 시점이나 당첨 가능성을 계산하지 않는다.
 */
const BRTC: Record<string, string> = {
  서울: '11', 부산: '26', 대구: '27', 인천: '28', 대전: '30', 울산: '31', 세종: '36', 경기: '41',
  강원: '51', 충북: '43', 충남: '44', 전북: '52', 경북: '47', 경남: '48', 제주: '50',
  '전남·광주': '12', 전남: '12', 광주: '12',
}

interface Complex {
  name: string
  address: string
  operator: string
  types: string[]
  styles: number
  wait: number
  moved: number
}

export async function GET(req: NextRequest) {
  const province = (req.nextUrl.searchParams.get('province') ?? '').trim()
  const sigungu = (req.nextUrl.searchParams.get('sigungu') ?? '').trim()
  const code = BRTC[province]
  if (!code) return Response.json({ ok: false, status: 'UNSUPPORTED', reason: '광역 지역을 알 수 없습니다.' }, { status: 400 })

  const rows: MyhomeWait[] = []
  for (let page = 1; page <= 6; page++) {
    const r = await fetchMyhomeWait(code, { rows: 1000, page })
    if (!r.ok) {
      if (page === 1) {
        const auth = /키|KEY|인증/i.test(r.reason)
        return Response.json({ ok: false, status: auth ? 'AUTH_FAILED' : 'ERROR', reason: r.reason }, { status: 502 })
      }
      break
    }
    rows.push(...r.items)
    if (r.items.length < 1000 || rows.length >= r.total) break
  }

  // 시·군·구로 거른다. 이름이 없거나(LH 목록만 있는 공고) 맞는 곳이 없으면 광역 전체에서 고른다
  // 표기가 '수원시 장안구'·'장안구'처럼 갈릴 수 있어 어느 쪽이 다른 쪽을 품으면 같은 곳으로 본다
  const same = (a: string) => !!a && (a === sigungu || a.split(/\s+/).includes(sigungu) || sigungu.split(/\s+/).includes(a))
  // 구가 있는 시(수원시·성남시)는 signguNm 이 '장안구'로만 와서, 도로명주소에 시 이름이 있는지도 본다
  const inAddr = (a: string) => ` ${a} `.includes(` ${sigungu} `)
  const local = sigungu ? rows.filter(r => same((r.signguNm ?? '').trim()) || inAddr(r.rnAdres ?? '')) : []
  const scope = local.length ? 'SIGUNGU' : 'PROVINCE'
  const pool = local.length ? local : rows

  // 한 단지가 운영 단위로 나뉘어 번호가 여럿일 수 있다 — 이름·주소가 같으면 한 단지로 합친다
  const by = new Map<string, Complex>()
  for (const r of pool) {
    const k = `${r.hsmpNm}|${r.rnAdres}`
    const c = by.get(k) ?? { name: r.hsmpNm, address: r.rnAdres, operator: r.rtsInsttNm, types: [], styles: 0, wait: 0, moved: 0 }
    if (r.suplyTyNm && !c.types.includes(r.suplyTyNm)) c.types.push(r.suplyTyNm)
    c.styles++
    c.wait += Number(r.waitCo) || 0
    c.moved += Number(r.trmnatCo) || 0
    by.set(k, c)
  }
  const complexes = [...by.values()].sort((a, b) => b.wait - a.wait)

  return Response.json({
    ok: true,
    status: pool.length ? 'OK' : 'EMPTY',
    scope,
    province,
    sigungu: scope === 'SIGUNGU' ? sigungu : null,
    complexCount: complexes.length,
    waitTotal: complexes.reduce((s, c) => s + c.wait, 0),
    movedTotal: complexes.reduce((s, c) => s + c.moved, 0),
    top: complexes.slice(0, 8),
    source: '마이홈포털 예비입주자 대기현황 (국토교통부)',
  })
}
