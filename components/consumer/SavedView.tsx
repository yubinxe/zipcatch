'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ELIGIBILITY_CAUTION, type UrgencyInfo } from '@/lib/crm/services/scoring'
import type { Property } from '@/lib/crm/types'
import NoticeCard, { ddayText, EmptyMark, shortDate } from './NoticeCard'
import PageMasthead from './PageMasthead'
import { useConsumer } from './ConsumerProvider'
import { isRental } from '@/lib/consumer/classify'

interface Row {
  property: Property
  urgency: UrgencyInfo
}

/** 목록 카드에 쓸 중립 후보 — 개인 판정 없이 상태만 보여준다 */
function neutral(propertyId: string, urgency: UrgencyInfo) {
  return {
    propertyId,
    fit: { regionScore: 0, areaScore: null, housingTypeScore: 0, preferenceScore: 0 },
    // 저장 목록은 판정 화면이 아니다. 예산을 비교하지 않았다는 뜻으로 둔다.
    budget: {
      depositOver: 0,
      rentOver: 0,
      depositRoom: 0,
      rentRoom: 0,
      withinBudget: true,
      unverified: [] as ('DEPOSIT' | 'RENT')[],
    },
    urgency,
    eligibility: 'UNKNOWN' as const,
    confidence: 'PARTIAL' as const,
    reasons: [],
    cautions: [ELIGIBILITY_CAUTION],
    tier: 'PRIMARY' as const,
    excludedBy: [] as never[],
  }
}

export default function SavedView() {
  const { savedIds, alerts, user, profile, loading: meLoading, refresh } = useConsumer()
  const [result, setResult] = useState<{ key: string; rows: Row[] } | null>(null)
  /**
   * 비교에 담은 공고.
   *
   * 저장과는 다른 목록이다. 저장은 "나중에 볼 것"이고 비교는 "지금 둘 중
   * 고를 것"이라, 하나를 둘로 쓰면 비교하려고 저장을 풀게 된다.
   * 셋을 넘기면 한 화면에서 읽히지 않으므로 거기서 막는다.
   */
  const [picked, setPicked] = useState<string[]>([])
  const togglePick = (id: string) =>
    setPicked(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 3 ? prev : [...prev, id],
    )

  const key = savedIds.join(',')
  const loading = result?.key !== key
  const rows = result?.rows ?? []

  useEffect(() => {
    if (meLoading) return
    let alive = true

    Promise.all(
      savedIds.map(id =>
        fetch(`/api/notices/${id}`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    )
      .then(results => {
        if (!alive) return
        const sorted = (results.filter(r => r && r.property) as Row[]).sort(
          (a, b) => (a.urgency.daysLeft ?? 9999) - (b.urgency.daysLeft ?? 9999),
        )
        setResult({ key, rows: sorted })
      })

    return () => {
      alive = false
    }
  }, [key, meLoading, savedIds])

  /**
   * 저장 목록에서 바로 읽히는 것들.
   *
   * 목록만 있으면 "몇 건 저장했다"까지는 알아도 "무엇부터 움직여야 하나"는
   * 세어 봐야 안다. 사람이 세도 되는 일을 화면이 대신한다.
   */
  const board = (() => {
    const live = rows.filter(r => r.urgency.level !== 'CLOSED')
    const soon = live.filter(r => r.urgency.daysLeft !== null && r.urgency.daysLeft <= 7)
    const closed = rows.length - live.length
    const sale = live.filter(r => !isRental(r.property.housingType)).length
    return {
      live: live.length,
      soon: soon.length,
      closed,
      sale,
      rent: live.length - sale,
      /** 가장 급한 하나 — 여기부터 보면 된다 */
      next: live
        .filter(r => r.urgency.daysLeft !== null)
        .sort((a, b) => (a.urgency.daysLeft ?? 0) - (b.urgency.daysLeft ?? 0))[0] ?? null,
      /** 남은 날 순으로 세운 띠 */
      strip: live
        .filter(r => r.urgency.daysLeft !== null && r.urgency.daysLeft >= 0)
        .sort((a, b) => (a.urgency.daysLeft ?? 0) - (b.urgency.daysLeft ?? 0))
        .slice(0, 12),
    }
  })()

  const removeAlert = async (alertId: string) => {
    await fetch('/api/alerts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId }),
    })
    await refresh()
  }

  const done = !meLoading && !loading
  const pickedRows = picked
    .map(id => rows.find(r => r.property.id === id))
    .filter((r): r is Row => Boolean(r))

  return (
    <div className="cs-wrap cs-sa cs-sa--saved">
      <PageMasthead
        eyebrow="WATCHLIST"
        title="관심공고"
        lead={
          user
            ? `${user.nickname}님이 저장하신 공고예요. 남은 날이 적은 것부터 놓았어요.`
            : '저장하신 공고예요. 남은 날이 적은 것부터 놓았어요. 이메일을 남기면 다른 기기에서도 볼 수 있어요.'
        }
      >
        {/* 다 받기 전에는 비워 둔다 — 받고 나서 숫자 판이 무대 위로 떠오른다 */}
        {!done ? null : rows.length > 0 ? (
          <ul className="cs-sa-kpis" aria-label="관심공고 한눈에">
            <li>
              <span className="cs-sa-kpis__n">{board.live}</span>
              <span className="cs-sa-kpis__k">접수 중</span>
            </li>
            <li data-hot={board.soon > 0}>
              <span className="cs-sa-kpis__n">{board.soon}</span>
              <span className="cs-sa-kpis__k">7일 내 마감</span>
            </li>
            <li>
              <span className="cs-sa-kpis__n">
                {board.sale}
                <i aria-hidden="true">/</i>
                <span className="cs-sr"> 대 </span>
                {board.rent}
              </span>
              <span className="cs-sa-kpis__k">분양 / 임대</span>
            </li>
            <li>
              <span className="cs-sa-kpis__n">{alerts.length}</span>
              <span className="cs-sa-kpis__k">받는 알림</span>
            </li>
          </ul>
        ) : (
          <ul className="cs-sa-facts">
            <li>
              <span className="cs-sa-facts__dot" aria-hidden="true" />
              {user ? '계정에 저장돼 어느 기기에서나 보여요' : '지금은 이 브라우저에만 저장돼요'}
            </li>
            <li>공고 카드의 하트로 담아요</li>
          </ul>
        )}
      </PageMasthead>

      {/* ── 한눈에 ───────────────────────────────────
          목록 위에 얹는 요약. 저장은 쌓이기만 하면 잊히는데, 잊히지 않게
          하는 것은 건수가 아니라 "언제까지"다. ── */}
      {!done ? (
        <div className="cs-sa-deck" aria-hidden="true">
          <div className="cs-sa-deck__skel">
            <span />
            <span />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="cs-sa-deck cs-sa-deck--plain">
          <div className="cs-empty cs-sa-empty">
            <EmptyMark />
            <div className="cs-empty__title">아직 저장한 공고가 없어요</div>
            <p className="cs-empty__desc">마음에 드는 공고의 하트를 누르면 여기에 모아둘 수 있어요.</p>
            <div className="cs-sa-empty__acts">
              <Link href={profile ? '/results' : '/analyze'} className="cs-btn cs-btn--primary">
                {profile ? '내 후보 보기' : '내 조건으로 공고 찾기'}
              </Link>
              <Link href="/notices" className="cs-btn cs-btn--ghost">
                공고 둘러보기
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <section className="cs-sa-deck cs-sa-watch" aria-label="남은 날 순서">
          {board.next ? (
            <Link href={`/notices/${board.next.property.id}`} className="cs-sa-next">
              <span className="cs-sa-next__k">가장 급한 공고</span>
              <span className="cs-sa-next__d cs-num">{ddayText(board.next.urgency.daysLeft)}</span>
              <span className="cs-sa-next__n">{board.next.property.name}</span>
              <span className="cs-sa-next__m">
                {board.next.urgency.label}
                {board.next.property.applicationEnd && ` · ${shortDate(board.next.property.applicationEnd)}`}
              </span>
              <span className="cs-sa-next__go" aria-hidden="true">
                →
              </span>
            </Link>
          ) : (
            <div className="cs-sa-next" data-quiet="true">
              <span className="cs-sa-next__k">가장 급한 공고</span>
              <span className="cs-sa-next__n">마감일이 잡힌 공고가 아직 없어요</span>
              <span className="cs-sa-next__m">접수가 끝났거나 마감일이 공고되지 않았습니다.</span>
            </div>
          )}

          <div className="cs-sa-runway">
            <div className="cs-sa-runway__k">
              <span className="cs-sa-kicker">Runway</span>
              <span>남은 날 순서</span>
            </div>
            {board.strip.length > 0 ? (
              <ol className="cs-sa-runway__rail">
                {board.strip.map(r => {
                  const d = r.urgency.daysLeft ?? 0
                  return (
                    <li key={r.property.id}>
                      <Link
                        href={`/notices/${r.property.id}`}
                        className="cs-sa-ticket"
                        data-kind={isRental(r.property.housingType) ? 'rent' : 'sale'}
                        data-urgent={d <= 3}
                        title={r.property.name}
                      >
                        <span className="cs-sa-ticket__d cs-num">{d === 0 ? 'D-DAY' : `D-${d}`}</span>
                        <span className="cs-sa-ticket__n">{r.property.name}</span>
                        <span className="cs-sa-ticket__k">
                          {isRental(r.property.housingType) ? '임대' : '분양'} · {r.property.housingType}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="cs-sa-runway__none">접수 중이면서 마감일이 잡힌 공고가 없어요.</p>
            )}
          </div>

          {board.closed > 0 && (
            <p className="cs-sa-watch__note">
              접수가 끝난 공고 {board.closed}건은 아래 목록에 그대로 둡니다 — 지난 기록도 비교에
              쓰입니다.
            </p>
          )}
        </section>
      )}

      {alerts.length > 0 && (
        <section className="cs-sa-sec">
          <header className="cs-sa-head">
            <div className="cs-sa-head__t">
              <span className="cs-sa-kicker">Alerts</span>
              <h2 className="cs-sa-h2">받고 있는 알림</h2>
            </div>
          </header>
          <ul className="cs-sa-alerts">
            {alerts.map(a => (
              <li key={a.id}>
                <span className="cs-sa-alerts__ic" aria-hidden="true" />
                <div className="cs-sa-alerts__t">
                  <b>{a.scope === 'NEW_NOTICE' ? '조건에 맞는 새 공고' : '관심공고 마감 알림'}</b>
                  <span>
                    {a.scope === 'NEW_NOTICE' && a.profile ? `${a.profile.regions.join(' · ')} · ` : ''}
                    이메일 · {new Date(a.consentedAt).toLocaleDateString('ko-KR')} 동의
                  </span>
                </div>
                <button className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => removeAlert(a.id)}>
                  해제
                </button>
              </li>
            ))}
          </ul>
          <p className="cs-sa-foot cs-sa-foot--tight">
            알림은 동의하신 이메일 주소로 발송됩니다. 조건을 바꾸시면 다음 발송부터 반영돼요.
          </p>
        </section>
      )}

      {(!done || rows.length > 0 || savedIds.length > rows.length) && (
        <section className="cs-sa-sec">
          <header className="cs-sa-head">
            <div className="cs-sa-head__t">
              <span className="cs-sa-kicker">Saved</span>
              <h2 className="cs-sa-h2">
                저장한 공고 <span className="cs-num">{rows.length}</span>건
              </h2>
            </div>
            {done && rows.length > 1 && (
              <p className="cs-sa-sub cs-sa-head__aside">
                카드의 <b>비교</b>를 눌러 둘 이상 고르면 금액·면적·일정을 나란히 놓고 볼 수 있어요.
                셋까지 담깁니다.
              </p>
            )}
          </header>

          {/* 예시 공고를 걷어내기 전에 저장해 둔 항목은 이제 열리지 않는다.
              숫자만 줄어들면 사용자는 자기 기록이 사라졌다고 읽는다. */}
          {done && savedIds.length > rows.length && (
            <p className="cs-sa-inline-note">
              예전에 저장하신 {savedIds.length - rows.length}건은 화면 구성을 위한 예시 공고였습니다.
              실제 공고만 다루도록 바뀌면서 목록에서 내렸습니다.
            </p>
          )}

          {!done ? (
            <div className="cs-notice-grid cs-sa-grid" aria-hidden="true">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="cs-skel cs-sa-skel" />
              ))}
            </div>
          ) : rows.length > 0 ? (
            <div className="cs-notice-grid cs-sa-grid">
              {rows.map((row, i) => {
                const on = picked.includes(row.property.id)
                return (
                  <div key={row.property.id} className="cs-pick" data-on={on}>
                    <NoticeCard
                      index={i}
                      depth
                      property={row.property}
                      candidate={neutral(row.property.id, row.urgency)}
                      showReasons={false}
                      // 카드 전체가 상세로 가는 링크라, 비교 선택은 저장 단추 곁에 따로 얹는다
                      pick={
                        <label className="cs-pick__box">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => togglePick(row.property.id)}
                            disabled={!on && picked.length >= 3}
                          />
                          <span>{on ? '비교 담음' : '비교'}</span>
                        </label>
                      }
                    />
                  </div>
                )
              })}
            </div>
          ) : null}
        </section>
      )}

      {/* 고른 것이 있을 때만 뜨는 막대. 화면 아래에 붙여 두면 목록을 내리면서
          담다가 바로 넘어갈 수 있다. */}
      {picked.length > 0 && (
        <div className="cs-pickbar cs-sa-dock" role="region" aria-label="비교 담은 공고">
          <span className="cs-pickbar__n">{picked.length}건 담음</span>
          <ol className="cs-sa-dock__slots" aria-hidden="true">
            {[0, 1, 2].map(k => (
              <li key={k} data-on={pickedRows[k] ? 'true' : undefined}>
                {pickedRows[k]?.property.name ?? '빈 자리'}
              </li>
            ))}
          </ol>
          <button type="button" className="cs-pickbar__clear" onClick={() => setPicked([])}>
            비우기
          </button>
          {picked.length >= 2 ? (
            <Link href={`/compare?ids=${picked.join(',')}`} className="cs-btn cs-btn--sm cs-btn--primary">
              나란히 비교하기
            </Link>
          ) : (
            <span className="cs-pickbar__hint">하나 더 고르면 비교할 수 있어요</span>
          )}
        </div>
      )}

      {!user && savedIds.length > 0 && (
        <p className="cs-sa-foot">
          지금은 이 브라우저에만 저장돼 있어요. 이메일을 남기면 다른 기기에서도 이어서 볼 수 있습니다.
        </p>
      )}
    </div>
  )
}
