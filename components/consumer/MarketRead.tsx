'use client'

import { useEffect, useState } from 'react'
import type { MarketRead as Market, MarketSlice, RegionRow } from '@/lib/services/market-read'

/**
 * 사업성 판독 — 시행사·분양대행사·감정평가사가 묻는 순서.
 *
 * 소비자 화면과 읽는 방향이 반대다. 소비자는 공고 한 건을 열어 "내가 넣을
 * 자리가 있나"를 묻고, 여기서는 시장을 위에서 내려다보며 "이 값에 내면
 * 팔리나"를 묻는다. 그래서 한 건짜리 카드가 아니라 표와 분포로 그린다.
 *
 * 값 하나(중앙값)만 적지 않고 **p25~p75 를 띠로** 그린다. 감정평가가 사례를
 * 고를 때 보는 것은 대푯값이 아니라 폭이다. 같은 중앙값이라도 폭이 좁은
 * 동네와 넓은 동네는 전혀 다른 시장이다.
 */

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

/** 만원/평 → "2,140" */
function man(n: number): string {
  return n.toLocaleString()
}

/** 억 단위가 읽기 편한 세대수 */
function units(n: number): string {
  return n.toLocaleString()
}

function Sample({ children }: { children: React.ReactNode }) {
  return <p className="cs-note cs-mk__sample">{children}</p>
}

/** 지역 한 줄 — 값의 폭과 그 결과를 한 눈에 */
function RegionLine({ row, max, open, onToggle }: {
  row: RegionRow
  /** 축의 오른쪽 끝(만원/평). 모든 줄이 같은 자를 쓴다 */
  max: number
  open: boolean
  onToggle: () => void
}) {
  const left = (row.price.p25 / max) * 100
  const width = Math.max(1.5, ((row.price.p75 - row.price.p25) / max) * 100)
  const tick = (row.price.median / max) * 100
  const shortPct = pct(row.shortTypes, row.ratedTypes)

  return (
    <>
      <tr
        className="cs-mk__row"
        data-open={open ? 'true' : 'false'}
        onClick={onToggle}
        aria-expanded={open}
      >
        <td className="cs-mk__region">
          {row.name}
          <span className="cs-mk__n">{row.notices}건</span>
        </td>
        <td className="cs-mk__band">
          <span className="cs-mk__track" aria-hidden="true">
            <span className="cs-mk__range" style={{ left: `${left}%`, width: `${width}%` }} />
            <span className="cs-mk__tick" style={{ left: `${tick}%` }} />
          </span>
          <span className="cs-mk__spread cs-num">
            {man(row.price.p25)} ~ {man(row.price.p75)}
          </span>
        </td>
        <td className="cs-mk__price cs-num">{man(row.price.median)}</td>
        <td className="cs-num cs-table__r">{units(row.units)}</td>
        <td className="cs-num cs-table__r" data-heat={shortPct >= 50 ? 'hot' : undefined}>
          {row.ratedTypes === 0 ? '—' : `${shortPct}%`}
        </td>
        <td className="cs-num cs-table__r">
          {row.settled === 0 ? '—' : `${pct(row.soldOut, row.settled)}%`}
        </td>
      </tr>
      {open && (
        <tr className="cs-mk__detail">
          <td colSpan={6}>
            {row.sizes.length === 0 ? (
              <p className="cs-note">이 지역은 면적대를 가를 만큼 사례가 모이지 않았습니다.</p>
            ) : (
              <div className="cs-mk__sizes">
                {row.sizes.map(s => (
                  <div key={s.label} className="cs-mk__size">
                    <span className="cs-mk__size-label">{s.label}</span>
                    <b className="cs-num">{man(s.price.median)}</b>
                    <span className="cs-mk__size-sub cs-num">
                      {man(s.price.p25)} ~ {man(s.price.p75)} · 주택형 {s.price.samples}개
                    </span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Slice({ slice }: { slice: MarketSlice }) {
  const [open, setOpen] = useState<string | null>(null)
  /** 같은 계산을 시공사로도, 시행사로도 본다 */
  const [axis, setAxis] = useState<'builders' | 'developers'>('developers')

  if (slice.notices === 0) {
    return <p className="cs-note">이 구간에 집계할 공고가 없습니다.</p>
  }

  /*
   * 축의 오른쪽 끝.
   *
   * 가장 비싼 지역의 상위 25% 값에 딱 맞추면 축 끝이 7,552 같은 수가 되어
   * 읽는 사람이 위치를 가늠할 수 없다. 천 단위로 올려 눈금을 붙인다 —
   * 자에 눈금이 없으면 띠가 어디쯤인지는 알아도 얼마인지는 모른다.
   */
  const axisMax = Math.max(1000, Math.ceil(Math.max(...slice.regions.map(r => r.price.p75), 1) / 1000) * 1000)
  const split = slice.splits[0]

  return (
    <>
      {/* 01 — 얼마에 내고 있나 */}
      <section className="cs-mk__sec">
        <h3 className="cs-mk__h">
          <span className="cs-mk__no">01</span> 얼마에 내고 있나
        </h3>
        <p className="cs-mk__lead">
          분양 최고금액을 공급면적으로 나눈 평당가입니다. 가운데 값 하나가 아니라{' '}
          <b>사례의 절반이 들어오는 폭(하위 25% ~ 상위 25%)</b>을 함께 그렸습니다. 같은 중앙값이라도
          폭이 좁은 동네와 넓은 동네는 다른 시장입니다.
        </p>

        {slice.price && (
          <div className="cs-mk__headline">
            <div>
              <span className="cs-mk__big cs-num">{man(slice.price.median)}</span>
              <span className="cs-mk__unit">만원 / 평</span>
            </div>
            <p className="cs-mk__lead" style={{ margin: 0 }}>
              {slice.kind} 분양 {slice.notices}건 · {units(slice.units)}세대를 모은 값입니다. 사례의
              절반은 평당 {man(slice.price.p25)}~{man(slice.price.p75)}만원 사이에 있습니다.
            </p>
          </div>
        )}

        <p className="cs-note cs-mk__swipe">표를 옆으로 밀면 공급세대 · 미달 · 마감이 이어집니다.</p>
        <div className="cs-card cs-mk__card">
          <table className="cs-table cs-mk__table">
            <thead>
              <tr>
                <th>지역</th>
                <th className="cs-mk__band">
                  <span className="cs-mk__axis-title">평당가 분포</span>
                  <span className="cs-mk__axis" aria-hidden="true">
                    <span>0</span>
                    <span>{(axisMax / 2).toLocaleString()}</span>
                    <span>{axisMax.toLocaleString()}만원</span>
                  </span>
                </th>
                <th className="cs-table__r">중앙값</th>
                <th className="cs-table__r">공급세대</th>
                <th className="cs-table__r">미달 주택형</th>
                <th className="cs-table__r">전 주택형 마감</th>
              </tr>
            </thead>
            <tbody>
              {slice.regions.map(r => (
                <RegionLine
                  key={r.name}
                  row={r}
                  max={axisMax}
                  open={open === r.name}
                  onToggle={() => setOpen(open === r.name ? null : r.name)}
                />
              ))}
            </tbody>
          </table>
          <p className="cs-note" style={{ marginTop: 14 }}>
            지역을 누르면 면적대별 평당가가 펼쳐집니다. 면적대는 지역을 고정해야 뜻이 생깁니다 —
            전국을 한 표로 묶으면 서울 소형이 섞여 &lsquo;작은 평형이 더 비싸다&rsquo;는 엉뚱한 줄이
            나옵니다. 미달·마감은 접수가 끝난 공고만 셉니다.
          </p>
        </div>
      </section>

      {/* 02 — 값을 낮추면 팔리나 */}
      {split && (
        <section className="cs-mk__sec">
          <h3 className="cs-mk__h">
            <span className="cs-mk__no">02</span> 값을 낮추면 팔리나
          </h3>
          <p className="cs-mk__lead">
            같은 지역 안에서 분양가가 싼 절반과 비싼 절반을 갈라 미달률을 견주었습니다. 지역을 섞으면
            &ldquo;서울은 비싸고 안 미달난다&rdquo;가 그대로 나와 아무 말도 하지 못하기 때문입니다.
          </p>

          <div className="cs-mk__splits">
            {slice.splits.map(s => {
              /*
               * 색은 **값**을 따라가야 한다.
               *
               * 처음에는 싼 쪽을 붉게, 비싼 쪽을 푸르게 칠했다. 그랬더니 서울처럼
               * 양쪽 다 0%인 지역에서 같은 숫자가 다른 색으로 나왔다. 색이 사실이
               * 아니라 줄 위치를 말하고 있었던 셈이다. 더 많이 미달난 쪽만 붉게,
               * 덜 미달난 쪽만 푸르게, 같으면 둘 다 그대로 둔다.
               */
              const tone = (mine: number, other: number) =>
                mine === other ? 'even' : mine > other ? 'worse' : 'better'
              return (
                <div key={s.region} className="cs-card cs-mk__split">
                  <div className="cs-mk__split-top">
                    <b>{s.region}</b>
                    <span className="cs-note">{s.notices}건</span>
                  </div>
                  <div
                    className="cs-mk__split-row"
                    data-tone={tone(s.cheap.shortPct, s.pricey.shortPct)}
                  >
                    <span className="cs-mk__split-label">싼 절반</span>
                    <span className="cs-num cs-mk__split-price">평당 {man(s.cheap.price)}</span>
                    <b className="cs-num">미달 {s.cheap.shortPct}%</b>
                  </div>
                  <div
                    className="cs-mk__split-row"
                    data-tone={tone(s.pricey.shortPct, s.cheap.shortPct)}
                  >
                    <span className="cs-mk__split-label">비싼 절반</span>
                    <span className="cs-num cs-mk__split-price">평당 {man(s.pricey.price)}</span>
                    <b className="cs-num">미달 {s.pricey.shortPct}%</b>
                  </div>
                </div>
              )
            })}
          </div>

          {/*
           * 이 줄이 이 화면에서 가장 중요하다. 숫자만 보면 "비싸게 내면 팔린다"로
           * 읽히는데 그건 틀린 결론이고, 그 결론으로 사업을 정하면 크게 다친다.
           */}
          <div className="cs-mk__warn">
            <b>이 숫자를 거꾸로 읽지 마세요.</b> 비싼 절반이 덜 미달난 것은 값이 높아서가 아니라,
            값을 높게 받을 수 있는 자리가 대체로 좋은 입지이기 때문입니다. 같은 단지에서 분양가만
            올리면 그 반대가 됩니다. 여기서 말할 수 있는 것은 하나뿐입니다 —{' '}
            <b>분양가를 낮추는 것만으로 미달을 면하지는 못했다</b>는 기록입니다. 입지·자격요건·
            공급시기를 함께 보지 않으면 어떤 결론도 이 표에서 나오지 않습니다.
          </div>
        </section>
      )}

      {/* 03 — 누가 냈나 */}
      {(slice.developers.length > 0 || slice.builders.length > 0) && (
        <section className="cs-mk__sec">
          <h3 className="cs-mk__h">
            <span className="cs-mk__no">03</span> 누가 냈나
          </h3>
          <p className="cs-mk__lead">
            회사별 미달률만 늘어놓으면 <b>지방에만 지은 회사가 나빠 보입니다.</b> 그래서 그 회사가
            실제로 사업을 벌인 지역들의 평균 미달률을 같은 줄에 두고 차이를 적었습니다. 차이가
            음수면 같은 동네 평균보다 덜 미달났다는 뜻입니다.
          </p>

          <div className="cs-mk__toggle" role="tablist" aria-label="집계 축">
            {(
              [
                ['developers', `사업주체 ${slice.developers.length}곳`],
                ['builders', `시공사 ${slice.builders.length}곳`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={axis === id}
                className="cs-mk__tab"
                data-active={axis === id ? 'true' : 'false'}
                onClick={() => setAxis(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="cs-note cs-mk__swipe">표를 옆으로 밀면 미달 · 지역 평균 · 차이가 이어집니다.</p>
          <div className="cs-card cs-mk__card">
            <table className="cs-table cs-mk__table">
              <thead>
                <tr>
                  <th>{axis === 'developers' ? '사업주체' : '시공사'}</th>
                  <th>주로 지은 곳</th>
                  <th className="cs-table__r">공고</th>
                  <th className="cs-table__r">세대</th>
                  <th className="cs-table__r">미달</th>
                  <th className="cs-table__r">그 지역 평균</th>
                  <th className="cs-table__r">차이</th>
                </tr>
              </thead>
              <tbody>
                {slice[axis].map(b => {
                  const gap = b.shortPct - b.benchPct
                  return (
                    <tr key={b.name}>
                      <td className="cs-table__key">{b.name}</td>
                      <td className="cs-mk__where">{b.where.join(' · ')}</td>
                      <td className="cs-num cs-table__r">{b.notices}</td>
                      <td className="cs-num cs-table__r">{units(b.units)}</td>
                      <td className="cs-num cs-table__r">{b.shortPct}%</td>
                      <td className="cs-num cs-table__r cs-mk__bench">{b.benchPct}%</td>
                      <td
                        className="cs-num cs-table__r cs-mk__gap"
                        data-tone={gap < 0 ? 'good' : gap > 0 ? 'bad' : 'even'}
                      >
                        {gap > 0 ? `+${gap}` : gap}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="cs-note" style={{ marginTop: 14 }}>
              최근 1년 공고 {MIN_BUILDER}건 이상을 낸 곳만 실었습니다. <b>시공 품질이나 회사에 대한
              평가가 아닙니다.</b> 접수 결과는 입지·분양가·자격요건·공급시기가 함께 만든 것이고,
              시행사·시공사는 그 가운데 하나일 뿐입니다. 회사 이름은 공고에 적힌 표기를 그대로
              옮겼습니다.
            </p>
            {axis === 'developers' ? (
              <p className="cs-note" style={{ marginTop: 8 }}>
                <b>&lsquo;사업주체&rsquo;는 공고문에 그렇게 적힌 이름입니다.</b> 신탁 방식으로 하는
                사업은 신탁사가 사업주체로 오르기 때문에, 이 표에 부동산신탁사가 많이 보입니다.
                그 경우 실질 시행사는 공고에 적히지 않아 여기서 가를 수 없습니다 — 신탁사의 성적이
                아니라 <b>그 신탁사를 통해 나온 사업들의 성적</b>으로 읽어 주세요.
              </p>
            ) : null}
            <p className="cs-note" style={{ marginTop: 8 }}>
              <b>분양대행사는 이 표에 없습니다.</b> 청약홈 공고가 사업주체와 시공사만 싣고
              분양대행사는 싣지 않아, 공개 자료만으로는 집계할 방법이 없습니다.
            </p>
          </div>
        </section>
      )}
    </>
  )
}

const MIN_BUILDER = 4

export default function MarketRead() {
  const [data, setData] = useState<Market | null>(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<'private' | 'public'>('private')

  useEffect(() => {
    let alive = true
    fetch('/api/market')
      .then(async res => {
        if (!res.ok) throw new Error('시장 자료를 불러오지 못했습니다.')
        return res.json() as Promise<Market>
      })
      .then(d => {
        if (alive) setData(d)
      })
      .catch(e => {
        if (alive) setError(e instanceof Error ? e.message : '불러오지 못했습니다.')
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) return <p className="cs-note">{error}</p>

  if (!data) {
    return (
      <div className="cs-mk__loading">
        <span className="cs-mk__pulse" aria-hidden="true" />
        <p className="cs-note">
          청약홈 표 셋(공고 · 주택형 · 경쟁률)을 통째로 받아 잇는 중입니다. 처음 한 번은 몇 초
          걸립니다.
        </p>
      </div>
    )
  }

  const slice = kind === 'private' ? data.private : data.public
  const last = data.pipeline.slice(-12)
  const maxUnits = Math.max(...last.map(p => p.units), 1)

  return (
    <>
      <Sample>
        청약홈 공고 {data.scanned.announcements.toLocaleString()}건 · 주택형{' '}
        {data.scanned.models.toLocaleString()}행 · 접수 경쟁률{' '}
        {data.scanned.competition.toLocaleString()}행을 공고번호로 이어 붙였습니다. 집계 구간은{' '}
        {data.since.slice(0, 7).replace('-', '년 ')}월부터입니다.
        {!data.ok && data.reason && <> 다만 일부 표를 다 받지 못했습니다 — {data.reason}</>}
      </Sample>

      <div className="cs-mk__toggle" role="tablist" aria-label="주택 구분">
        {(
          [
            ['private', `민영 ${data.private.notices}건`],
            ['public', `국민·공공 ${data.public.notices}건`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={kind === id}
            className="cs-mk__tab"
            data-active={kind === id ? 'true' : 'false'}
            onClick={() => setKind(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <Slice slice={slice} />

      {/* 04 — 경쟁 물량 */}
      {last.length > 1 && (
        <section className="cs-mk__sec">
          <h3 className="cs-mk__h">
            <span className="cs-mk__no">04</span> 같은 달에 누가 또 받나
          </h3>
          <p className="cs-mk__lead">
            공고일이 아니라 <b>접수 시작일</b>로 셉니다. 경쟁 물량은 같은 달에 접수를 받는 단지이지,
            같은 달에 공고문이 나온 단지가 아닙니다. 민영·국민을 합친 수입니다.
          </p>
          <div className="cs-card cs-mk__card">
            <ul className="cs-mk__months">
              {last.map(p => (
                <li key={p.month} className="cs-mk__month" data-ahead={p.ahead ? 'true' : 'false'}>
                  <span className="cs-mk__month-bar" aria-hidden="true">
                    <span style={{ height: `${Math.max(4, (p.units / maxUnits) * 100)}%` }} />
                  </span>
                  <b className="cs-num">{Math.round(p.units / 1000)}k</b>
                  <span className="cs-mk__month-label">{p.month.slice(5)}월</span>
                </li>
              ))}
            </ul>
            <p className="cs-note" style={{ marginTop: 14 }}>
              세대수는 천 단위로 줄여 적었습니다. 마지막 칸은 아직 접수가 남은 달이라 더 늘어날 수
              있습니다 — 공고가 뜨지 않은 단지는 여기에 없습니다.
            </p>
          </div>
        </section>
      )}
    </>
  )
}
