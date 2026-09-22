import { propertyById } from '@/lib/crm/store'
import { findOfficialProperty } from '@/lib/consumer/official'
import { fetchSupplyModels } from '@/lib/adapters/applyhome-models'
import { fetchSpecialSupply } from '@/lib/adapters/applyhome-special'
import { fetchTradeStat, fetchPresaleStat } from '@/lib/adapters/molit-trade'
import { geocode, geocodeByName, isGeocodingConfigured } from '@/lib/consumer/geocode'
import { fetchRentStat } from '@/lib/adapters/molit-rent'
import { isRental, provinceOf } from '@/lib/consumer/classify'
import { checkUrgency, buildCandidate } from '@/lib/crm/services/scoring'
import { buildTasks } from '@/lib/crm/services/scheduling'
import { resolveSession } from '@/lib/consumer/session'
import { track } from '@/lib/consumer/store'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    // 실제 공고만 연다. 예시를 먼저 찾던 예전 순서는, 목록에서 예시를 걷어낸
    // 뒤에도 주소창과 저장 목록으로 예시 상세가 열리게 두고 있었다.
    // 상세는 '예시' 배지 하나에 모든 구분을 걸어두기에 너무 깊은 자리다.
    const includeSample = new URL(req.url).searchParams.get('includeSample') === '1'
    const property =
      (await findOfficialProperty(id)) ?? (includeSample ? propertyById(id) : null)
    if (!property) {
      return Response.json({ error: '공고를 찾을 수 없습니다.' }, { status: 404 })
    }

    const session = await resolveSession()
    const now = new Date()
    const urgency = checkUrgency(property, now)

    // 저장된 조건이 있으면 이 공고에 대한 개인 판정을 함께 준다.
    let candidate = null
    if (session.profile) {
      const p = session.profile
      const searcher = {
        preferredRegions: p.regions, maxDeposit: p.maxDeposit,
        maxMonthlyRent: p.maxMonthlyRent, minArea: p.minArea,
        preferredHousingTypes: p.housingTypes,
      }
      candidate = buildCandidate(searcher, property, now)
    }

    // 준비 일정 미리보기 — 공식 기한과 권장 준비일을 구분해 보여준다.
    const schedule = buildTasks(property, { applicationId: `preview:${property.id}` })

    /**
     * 주택형별 공급. 청약홈 분양에만 있다 — LH 임대는 이 API 에 나오지 않는다.
     * 없거나 실패하면 빈 배열이고, 화면은 그 자리를 접는다.
     */
    /**
     * 특별공급 접수 결과.
     *
     * 일반공급 접수가 아직 열려 있어도 볼 수 있는 유일한 수요 신호다 —
     * 특별공급이 하루 먼저 접수되고 결과가 그 사이에 공개되기 때문이다.
     * 같은 청약홈 공고에만 있고, 없으면 화면이 그 자리를 접는다.
     */
    const isApplyhome =
      property.dataOrigin === 'OFFICIAL' && property.source.includes('청약홈')

    const [supply, special] = await Promise.all([
      isApplyhome
        ? fetchSupplyModels(property.announcementId)
        : Promise.resolve({ models: [], ok: true, reason: null }),
      isApplyhome ? fetchSpecialSupply(property.announcementId) : Promise.resolve(null),
    ])

    /**
     * 주변 실거래.
     *
     * 국토부는 시군구 코드로만 물을 수 있다. 주소를 지오코딩할 때 카카오가
     * 법정동코드를 함께 주므로 그것을 쓴다 — 주소를 두 번 묻지 않는다.
     */
    /**
     * 이 공고가 어디에 있는가.
     *
     * 주소가 있으면 그것으로, 없으면 이름으로 찾는다 — LH 공고에는 주소 칸이
     * 아예 없고(쉰두 건 전부), 대신 '평택고덕 A57-2블록'처럼 이름에 자리가
     * 적혀 있다. 이름으로 찾을 때는 광역이 맞는지 확인한 것만 받는다.
     */
    const province = provinceOf(property)
    const where =
      property.dataOrigin === 'OFFICIAL' && isGeocodingConfigured()
        ? ((await geocode(property.address).catch(() => null)) ??
          (await geocodeByName(property.name, province).catch(() => null)))
        : null
    /**
     * 견줌자.
     *
     * 분양이면 매매·전매 실거래와, 임대면 전월세 실거래와 견준다. 접수 중인
     * 공고 아홉 할이 임대인데 그 전부가 금액을 안 내놓으므로, 임대 쪽이야말로
     * 주변 시세가 필요한 자리다.
     */
    const rental = isRental(property.housingType)
    const [trade, presale, rent] = where?.bCode
      ? await Promise.all([
          rental ? Promise.resolve(null) : fetchTradeStat(where.bCode, where.dong),
          rental ? Promise.resolve(null) : fetchPresaleStat(where.bCode),
          rental
            ? fetchRentStat(where.bCode, property.housingType, { dong: where.dong })
            : Promise.resolve(null),
        ])
      : [null, null, null]

    track(session, 'notice_viewed', { propertyId: property.id })

    return Response.json({
      property,
      urgency,
      candidate,
      schedule,
      budget: candidate?.budget ?? null,
      dataOrigin: property.dataOrigin,
      supplyModels: supply.models,
      /** 특별공급 기록이 아직 없으면 null — 빈 표를 결과처럼 내놓지 않는다 */
      special: special && special.hasData ? special : null,
      rent: rent && rent.ok && rent.bands.length > 0 ? rent : null,
      /** 지도에 찍을 자리. 이름으로 찾은 것도 포함된다 */
      place: where ? { lat: where.lat, lng: where.lng, dong: where.dong, sigungu: where.sigungu } : null,
      trade: trade
        ? {
            ...trade,
            dong: where?.dong ?? null,
            sigungu: where?.sigungu ?? null,
            presale: presale && presale.ok && presale.count > 0 ? presale : null,
          }
        : null,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '공고를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
