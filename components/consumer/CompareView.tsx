'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Candidate, UrgencyInfo } from '@/lib/crm/services/scoring'
import { formatMan } from '@/lib/crm/services/scoring'
import type { Property } from '@/lib/crm/types'
import type { SpecialRead } from '@/lib/adapters/applyhome-special'
import SaveButton from './SaveButton'
import { ddayText, EmptyMark } from './NoticeCard'
import BattleChart, { type BattleItem } from './battle/BattleChart'
import { FEATURES } from '@/lib/features'
import CommuteExplorer from './CommuteExplorer'
import ShareStudio from './ShareStudio'
import NoticeTitleMorph from './NoticeTitleMorph'
import { provinceOf } from '@/lib/consumer/classify'

/**
 * 공고 비교.
 *
 * ── 왜 비교가 따로 있어야 하나 ──
 *
 * 목록은 "무엇이 있나"에 답하고 상세는 "이 공고가 어떤가"에 답한다. 그런데
 * 사람이 실제로 막히는 자리는 그 사이다 — **둘 중 어느 쪽인가.** 지금까지는
 * 상세를 두 번 열어 머릿속에서 맞춰 봐야 했고, 그러면 기억이 비교를 한다.
 *
 * ── 다른 값만 본다 ──
 *
 * 열두 줄을 나란히 세우면 같은 값이 대부분이라 눈이 미끄러진다. 결정을
 * 바꾸는 것은 **다른 줄**이므로, 같은 줄을 접을 수 있게 둔다.
 *
 * ── 없는 값을 채우지 않는다 ──
 *
 * 우리가 받는 공고는 열에 아홉이 금액을 주지 않는다. 비교표는 빈칸을 특히
 * 못 견디게 생긴 화면이지만, 그렇다고 0원이나 평균을 넣으면 비교 자체가
 * 거짓이 된다. 없는 것은 '공고문 확인'으로 적고 그 자리를 비워 둔다.
 */

interface Detail {
  property: Property
  urgency: UrgencyInfo
  candidate: Candidate | null
  supplyModels?: { exclusiveArea: number | null; topAmount: number | null }[]
  special?: SpecialRead | null
}

/** 한 줄 — 제목과 공고별 값. `same` 이면 '다른 값만 보기'에서 접힌다 */
interface Line {
  label: string
  values: { text: string; dim?: boolean }[]
  note?: string
}

function fmtDate(v: string | null) {
  return v ? v.replace(/-/g, '. ') : '공고문 확인'
}

function areaRange(d: Detail): string {
  const xs = (d.supplyModels ?? [])
    .map(m => m.exclusiveArea)
    .filter((n): n is number => n !== null)
  if (xs.length === 0) {
    return d.property.area !== null ? `전용 ${d.property.area}㎡` : '공고문 확인'
  }
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  return lo === hi ? `전용 ${lo}㎡` : `전용 ${lo} ~ ${hi}㎡`
}

function priceCell(d: Detail): string {
  const amounts = (d.supplyModels ?? [])
    .map(m => m.topAmount)
    .filter((n): n is number => n !== null)
  if (amounts.length > 0) {
    const lo = Math.min(...amounts)
    const hi = Math.max(...amounts)
    return lo === hi ? formatMan(lo) : `${formatMan(lo)} ~ ${formatMan(hi)}`
  }
  const { deposit, monthlyRent } = d.property
  if (deposit === null && monthlyRent === null) return '공고문 확인'
  const bits = []
  if (deposit !== null) bits.push(`보증금 ${formatMan(deposit)}`)
  if (monthlyRent !== null) bits.push(`월 ${monthlyRent.toLocaleString()}만원`)
  return bits.join(' · ')
}

/** 차이 막대에 넘길 값 — 원문에 없는 값은 null 로 둔다 */
function toBattle(d: Detail): BattleItem {
  const amounts = (d.supplyModels ?? []).map(m => m.topAmount).filter((n): n is number => n !== null)
  const areas = (d.supplyModels ?? []).map(m => m.exclusiveArea).filter((n): n is number => n !== null)
  const price = amounts.length ? Math.min(...amounts) : d.property.deposit
  return {
    id: d.property.id,
    name: d.property.name,
    supply: d.property.supplyCount > 0 ? d.property.supplyCount : null,
    price: price ?? null,
    priceKind: amounts.length ? 'SALE' : d.property.deposit !== null ? 'DEPOSIT' : null,
    areaMax: areas.length ? Math.max(...areas) : d.property.area,
    daysLeft: d.urgency.level === 'CLOSED' ? null : d.urgency.daysLeft,
  }
}

function specialCell(d: Detail): string {
  const s = d.special
  if (!s || !s.hasData || s.supply <= 0) return '아직 공개 전'
  const left = Math.max(0, s.supply - s.applied)
  return left > 0
    ? `${left.toLocaleString()}세대 남고 마감`
    : `${Math.round((s.applied / s.supply) * 100) / 100}배 마감`
}

function buildLines(items: Detail[]): Line[] {
  const col = <T,>(f: (d: Detail) => T) => items.map(f)

  const lines: Line[] = [
    { label: '지역', values: col(d => ({ text: [d.property.district, d.property.region].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ') || '—' })) },
    { label: '유형', values: col(d => ({ text: d.property.housingType || '—' })) },
    { label: '공급 세대', values: col(d => ({ text: d.property.supplyCount > 0 ? `${d.property.supplyCount.toLocaleString()}세대` : '공고문 확인', dim: d.property.supplyCount === 0 })) },
    { label: '면적', values: col(d => ({ text: areaRange(d), dim: areaRange(d) === '공고문 확인' })) },
    { label: '금액', values: col(d => ({ text: priceCell(d), dim: priceCell(d) === '공고문 확인' })), note: '분양은 주택형별 최고가 범위, 임대는 공고에 적힌 보증금·월세입니다.' },
    { label: '접수 시작', values: col(d => ({ text: fmtDate(d.property.applicationStart), dim: !d.property.applicationStart })) },
    { label: '접수 마감', values: col(d => ({ text: fmtDate(d.property.applicationEnd), dim: !d.property.applicationEnd })) },
    { label: '남은 날', values: col(d => ({ text: d.urgency.label })) },
    { label: '당첨자 발표', values: col(d => ({ text: fmtDate(d.property.resultDate), dim: !d.property.resultDate })) },
    { label: '계약 시작', values: col(d => ({ text: fmtDate(d.property.contractStart), dim: !d.property.contractStart })) },
    {
      label: '특별공급 결과',
      values: col(d => ({ text: specialCell(d), dim: specialCell(d) === '아직 공개 전' })),
      note: '특별공급은 1·2순위보다 하루 먼저 접수하고 결과가 그 사이에 공개됩니다. 일반공급 결과가 아닙니다.',
    },
    { label: '출처', values: col(d => ({ text: d.property.source })) },
    {
      label: '받아온 때',
      values: col(d => ({
        text: d.property.collectedAt
          ? new Date(d.property.collectedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
          : '—',
        dim: true,
      })),
      note: '공고는 정정·취소될 수 있습니다. 결정 전에 원문을 한 번 더 확인해 주세요.',
    },
  ]
  return lines
}

/** 그 줄의 값이 전부 같은가 */
function allSame(line: Line) {
  return line.values.every(v => v.text === line.values[0].text)
}

/** 비교표가 서기 전 — 열 머리와 줄의 자리만 먼저 세운다 */
export function CompareSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="cs-cmp" role="status">
      <span className="cs-sr">공고 {count}건을 불러오는 중입니다.</span>
      <div className="cs-sa-deck" aria-hidden="true">
        <div className="cs-sa-deck__skel">
          <span />
          <span />
        </div>
      </div>
      <div className="cs-sa-spec cs-sa-spec--skel" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
    </div>
  )
}

export default function CompareView() {
  const params = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3)

  const [got, setGot] = useState<{ key: string; items: Detail[] }>({ key: '', items: [] })
  const [onlyDiff, setOnlyDiff] = useState(false)
  const key = ids.join(',')
  const loading = key !== '' && got.key !== key

  useEffect(() => {
    if (!key) return
    let alive = true
    Promise.all(
      key.split(',').map(id =>
        fetch(`/api/notices/${id}`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then(res => {
      if (alive) setGot({ key, items: res.filter(Boolean) as Detail[] })
    })
    return () => {
      alive = false
    }
  }, [key])

  if (ids.length === 0) {
    return (
      <div className="cs-sa-deck cs-sa-deck--plain">
        <div className="cs-empty cs-sa-empty">
          <EmptyMark />
          <div className="cs-empty__title">비교할 공고를 고르지 않았어요</div>
          <p className="cs-empty__desc">관심공고에서 둘 이상을 고르면 나란히 놓고 볼 수 있어요. 셋까지 담깁니다.</p>
          <div className="cs-sa-empty__acts">
            <Link href="/saved" className="cs-btn cs-btn--primary">
              관심공고로 가기
            </Link>
            <Link href="/notices" className="cs-btn cs-btn--ghost">
              공고 둘러보기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return <CompareSkeleton count={ids.length} />
  }

  const items = got.items
  if (items.length === 0) {
    return (
      <div className="cs-sa-deck cs-sa-deck--plain">
        <div className="cs-empty cs-sa-empty">
          <EmptyMark />
          <div className="cs-empty__title">고르신 공고를 찾지 못했어요</div>
          <p className="cs-empty__desc">접수가 끝나 목록에서 내려갔을 수 있어요.</p>
          <div className="cs-sa-empty__acts">
            <Link href="/notices" className="cs-btn cs-btn--primary">
              공고 찾기
            </Link>
            <Link href="/saved" className="cs-btn cs-btn--ghost">
              관심공고에서 다시 고르기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const lines = buildLines(items)
  const diffCount = lines.filter(l => !allSame(l)).length
  const shown = onlyDiff ? lines.filter(l => !allSame(l)) : lines

  return (
    <div className="cs-cmp">
      <header className="cs-sa-deck cs-sa-cmpbar">
        <div className="cs-sa-cmpbar__nums">
          <p className="cs-sa-cmpbar__lead">
            <b className="cs-num">{items.length}</b>건을 나란히 놓았습니다.{' '}
            <b className="cs-num cs-sa-cmpbar__hot">{diffCount}</b>줄이 서로 다릅니다.
          </p>
          <p className="cs-sa-cmpbar__sub">결정을 바꾸는 것은 같은 줄이 아니라 다른 줄입니다.</p>
        </div>
        <div className="cs-cmp__tools">
          <button
            type="button"
            className="cs-sa-switch"
            data-active={onlyDiff ? 'true' : 'false'}
            onClick={() => setOnlyDiff(v => !v)}
            aria-pressed={onlyDiff}
          >
            <span className="cs-sa-switch__track" aria-hidden="true">
              <span />
            </span>
            다른 값만 보기
          </button>
          <ShareStudio
            card={() => {
              const b = items.map(toBattle)
              const top = Math.max(1, ...b.map(x => x.price ?? 0))
              return {
                kicker: 'Side by side',
                title: `공고 ${items.length}건 나란히`,
                rows: b.map((x, i) => ({
                  label: x.name,
                  value: x.price === null ? '금액 원문 확인' : `${formatMan(x.price)}${x.priceKind === 'DEPOSIT' ? ' (보증금)' : ''}`,
                  sub: [
                    x.supply ? `공급 ${x.supply.toLocaleString('ko-KR')}세대` : '공급 원문 확인',
                    x.daysLeft === null ? '마감 지남·미정' : x.daysLeft === 0 ? '오늘 마감' : `마감 D-${x.daysLeft}`,
                  ].join(' · '),
                  bar: x.price === null ? null : x.price / top,
                  tone: i,
                })),
                source: [...new Set(items.map(d => d.property.source))].join(' · '),
                asOf: (items.map(d => d.property.collectedAt ?? '').sort().at(-1) ?? '').slice(0, 10) || '수집 시각 미상',
                slug: 'compare',
              }
            }}
          />
          <Link href="/saved" className="cs-sa-backlink">
            관심공고에서 다시 고르기
          </Link>
        </div>
      </header>

      {FEATURES.battle && items.length >= 2 && <BattleChart items={items.map(toBattle)} />}
      {FEATURES.commute && items.length >= 2 && (
        <section className="cs-battle cs-battle--commute" aria-label="업무지구까지">
          <h2 className="cs-battle__t">업무지구까지</h2>
          <CommuteExplorer
            heading={false}
            items={items.map(d => ({
              id: d.property.id,
              name: d.property.name,
              province: provinceOf(d.property),
              lat: d.property.lat,
              lng: d.property.lng,
              geoSource: d.property.geoSource,
            }))}
          />
        </section>
      )}

      <div className="cs-sa-spec" data-cols={items.length}>
        <table className="cs-table cs-cmp__table">
          <thead>
            <tr>
              <th scope="col" className="cs-cmp__rowhead">
                <span className="cs-sa-kicker">Spec</span>
              </th>
              {items.map(d => (
                <th key={d.property.id} scope="col" className="cs-cmp__col">
                  <div className="cs-sa-colcard" data-hot={d.urgency.daysLeft !== null && d.urgency.daysLeft >= 0 && d.urgency.daysLeft <= 3 ? 'true' : undefined}>
                    <span className="cs-sa-colcard__k">
                      {d.property.housingType || '공고'}
                      {ddayText(d.urgency.level === 'CLOSED' ? -1 : d.urgency.daysLeft) && (
                        <b className="cs-num">{ddayText(d.urgency.level === 'CLOSED' ? -1 : d.urgency.daysLeft)}</b>
                      )}
                    </span>
                    <Link href={`/notices/${d.property.id}`} className="cs-cmp__name">
                      <NoticeTitleMorph id={d.property.id}>
                        <span>{d.property.name}</span>
                      </NoticeTitleMorph>
                    </Link>
                    <span className="cs-cmp__sub">{d.property.region}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(line => (
              <tr key={line.label} data-diff={allSame(line) ? 'false' : 'true'}>
                <th scope="row" className="cs-cmp__rowhead">
                  {line.label}
                  {line.note && <sup className="cs-cmp__mark">*</sup>}
                </th>
                {line.values.map((v, i) => (
                  <td key={items[i].property.id} className="cs-cmp__cell" data-dim={v.dim ? 'true' : 'false'}>
                    {v.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="cs-cmp__rowhead">원문</th>
              {items.map(d => (
                <td key={d.property.id} className="cs-cmp__cell">
                  <div className="cs-cmp__acts">
                    {d.property.sourceUrl ? (
                      <a href={d.property.sourceUrl} target="_blank" rel="noopener noreferrer" className="cs-cmp__link">
                        모집공고문 열기<span className="cs-sr"> (새 창)</span>
                      </a>
                    ) : (
                      <span className="cs-cmp__cell" data-dim="true">원문 링크 없음</span>
                    )}
                    <SaveButton propertyId={d.property.id} />
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 주석을 행 안에 두면 그 줄만 네 겹으로 부풀어 표가 울퉁불퉁해진다.
          별표만 남기고 설명은 여기로 모은다. */}
      <dl className="cs-cmp__notes cs-sa-notes">
        {shown.filter(l => l.note).map(l => (
          <div key={l.label}>
            <dt>
              <span className="cs-cmp__mark">*</span> {l.label}
            </dt>
            <dd>{l.note}</dd>
          </div>
        ))}
      </dl>

      <p className="cs-sa-foot">
        자격 요건(무주택 기간·소득·자산·거주기간)은 공고마다 다르고, 이 표로는 판정하지 않습니다.
        금액·면적·일정도 공고문 원문이 기준입니다. 비교표는 어디를 더 볼지 고르는 데까지만 쓰세요.
      </p>
    </div>
  )
}
