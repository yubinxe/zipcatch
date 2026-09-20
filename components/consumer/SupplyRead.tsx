'use client'

import { useEffect, useState } from 'react'

interface ShortRow {
  pblancNo: string
  title: string | null
  region: string | null
  houseTy: string
  supply: number
  applied: number
  shortBy: number
  rank: number
}

interface Read {
  ok: boolean
  reason: string | null
  scanned: number
  notices: number
  shortages: ShortRow[]
  shortShare: { short: number; total: number } | null
  reside: { name: string; applied: number; share: number }[]
  wentToRank2: number
  hottest: { pblancNo: string; houseTy: string; rate: number; supply: number }[]
}

/**
 * "084.8786A" → "84㎡ A"
 *
 * 소수점 아래 네 자리는 실무에서 아무도 읽지 않는다. 다만 표기가 한결같지 않아
 * ("084.6795", "59.9945B", "198.1234") 앞의 숫자와 뒤의 알파벳만 집어낸다.
 * 형태를 못 알아보면 원문을 그대로 둔다 — 틀린 숫자로 바꾸지 않는다.
 */
function typeLabel(raw: string) {
  const s = String(raw ?? '').trim()
  const m = s.match(/(\d{2,3})(?:\.\d+)?\s*([A-Za-z]?)/)
  if (!m) return s
  return `${Number(m[1])}㎡${m[2] ? ` ${m[2].toUpperCase()}` : ''}`
}

/**
 * 공급 판독.
 *
 * 우리가 이미 받아오면서 어느 화면도 쓰지 않던 표(접수 경쟁률 5만 행)를
 * 실무자가 실제로 내리는 판단 셋으로 바꾼다.
 *
 * 평균 경쟁률은 내놓지 않는다. 같은 공고 안에서 59㎡가 30대 1일 때 84㎡가
 * 미달인 일이 흔하고, 평균은 그 둘을 뭉개 둘 다 틀린 숫자 하나로 만든다.
 */
export default function SupplyRead() {
  const [data, setData] = useState<Read | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/pro/read?pages=6', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: Read) => alive && setData(j))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  if (failed) {
    return <p className="cs-note">판독 자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>
  }
  if (!data) {
    return <div className="cs-skel" style={{ height: 320, borderRadius: 20 }} />
  }
  if (!data.ok) {
    return (
      <p className="cs-note">
        접수 결과 자료를 받지 못했습니다{data.reason ? ` — ${data.reason}` : ''}.
      </p>
    )
  }

  const shortPct = data.shortShare
    ? Math.round((data.shortShare.short / data.shortShare.total) * 100)
    : null
  const home = data.reside.find(r => r.name === '해당지역')

  return (
    <div className="cs-read">
      {/* 표본을 먼저 밝힌다. 몇 건을 보고 하는 말인지 모르면 해석할 수 없다 */}
      <p className="cs-read__basis">
        마감된 공고 <b>{data.notices}건</b> · 주택형 <b>{data.scanned.toLocaleString()}행</b>을 훑은
        결과입니다. 접수 경쟁률은 <b>마감 뒤에만</b> 생기므로, 지금 접수 중인 공고의 결과를 미리
        말하지는 않습니다.
      </p>

      {/* ── 판독 1. 어디가 비었나 ── */}
      <section className="cs-read__block">
        <div className="cs-read__head">
          <span className="cs-read__idx">01</span>
          <div>
            <h3 className="cs-read__h">어디가 비었나</h3>
            <p className="cs-read__why">
              가점이 낮을수록 봐야 할 것은 붐빈 곳이 아니라 <b>덜 찬 곳</b>입니다. 1순위에서 미달이
              나면 물량이 2순위와 기타지역으로 넘어갑니다.
            </p>
          </div>
        </div>

        {shortPct !== null && (
          <p className="cs-read__lede">
            훑은 주택형의 <b className="cs-read__big">{shortPct}%</b>가 미달이었습니다
            <span className="cs-read__sub">
              {data.shortShare!.short.toLocaleString()} / {data.shortShare!.total.toLocaleString()}개 주택형
            </span>
          </p>
        )}

        {data.shortages.length > 0 && (
          <div className="cs-read__tablewrap">
            <table className="cs-read__table">
              <thead>
                <tr>
                  <th>공고 · 주택형</th>
                  <th className="num">공급</th>
                  <th className="num">접수</th>
                  <th className="num">남은 세대</th>
                </tr>
              </thead>
              <tbody>
                {data.shortages.slice(0, 8).map((r, i) => (
                  <tr key={`${r.pblancNo}-${r.houseTy}-${i}`}>
                    <td>
                      <span className="cs-read__ty">{typeLabel(r.houseTy)}</span>
                      <span className="cs-read__nm">
                        {r.title ?? `공고 ${r.pblancNo}`}
                        {r.region && <span className="muted"> · {r.region}</span>}
                      </span>
                    </td>
                    <td className="num">{r.supply.toLocaleString()}</td>
                    <td className="num">{r.applied.toLocaleString()}</td>
                    <td className="num cs-read__short">{r.shortBy.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="cs-read__note">
          접수는 해당지역·기타지역을 합친 수이고, 남은 세대는 <b>마지막 구역까지 가고도 남은
          물량</b>입니다. 구역별로 따로 세면 같은 주택형이 여러 번 미달난 것처럼 보입니다.
        </p>
        <p className="cs-read__note">
          실무에서 읽는 법 — 미달은 &ldquo;인기가 없다&rdquo;가 아니라 <b>자격을 갖춘 1순위가 그만큼
          없었다</b>는 뜻입니다. 입지보다 자격 요건(거주기간·무주택·통장)이 빡빡할 때도 미달이 납니다.
        </p>
      </section>

      {/* ── 판독 2. 누가 가져갔나 ── */}
      {data.reside.length > 0 && (
        <section className="cs-read__block">
          <div className="cs-read__head">
            <span className="cs-read__idx">02</span>
            <div>
              <h3 className="cs-read__h">누가 넣었나</h3>
              <p className="cs-read__why">
                해당지역 우선공급이 물량을 먼저 가져갑니다. 기타지역 지원자에게 남는 틈이 있는지를
                접수 구성으로 봅니다.
              </p>
            </div>
          </div>

          <ul className="cs-read__bars">
            {data.reside.map(r => (
              <li key={r.name} className="cs-read__bar">
                <span className="cs-read__bar-k">{r.name}</span>
                <span className="cs-read__bar-track">
                  <span className="cs-read__bar-fill" style={{ width: `${r.share}%` }} />
                </span>
                <span className="cs-read__bar-v">
                  {r.share}%
                  <span className="muted"> · {r.applied.toLocaleString()}건</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="cs-read__note">
            {home
              ? `접수의 ${home.share}%가 해당지역에서 들어왔습니다. `
              : ''}
            공급세대는 구역마다 같은 값이 반복돼 합치면 두 배로 부풀기 때문에, 여기서는 <b>접수
            건수의 구성비</b>만 냅니다. 구역별 경쟁률로 읽지 마세요.
          </p>
        </section>
      )}

      {/* ── 판독 3. 1순위에서 끝났나 ── */}
      <section className="cs-read__block">
        <div className="cs-read__head">
          <span className="cs-read__idx">03</span>
          <div>
            <h3 className="cs-read__h">1순위에서 끝났나</h3>
            <p className="cs-read__why">
              2순위 접수가 있었다는 것은 1순위에서 다 차지 않았다는 뜻입니다. 통장 가입기간이 짧은
              사람에게는 이 공고들이 들어갈 자리입니다.
            </p>
          </div>
        </div>

        <p className="cs-read__lede">
          <b className="cs-read__big">{data.wentToRank2}건</b>
          <span className="cs-read__sub">/ {data.notices}건에서 2순위 접수가 있었습니다</span>
        </p>

        {data.hottest.length > 0 && (
          <>
            <p className="cs-read__note" style={{ marginTop: 18 }}>
              반대쪽 끝 — 같은 기간 가장 붐빈 주택형입니다. 공급 세대가 한 자릿수일 때 경쟁률이
              치솟으므로, 배수만 보지 말고 <b>공급 세대수를 함께</b> 보세요.
            </p>
            <ul className="cs-read__hot">
              {data.hottest.slice(0, 4).map((h, i) => (
                <li key={`${h.pblancNo}-${h.houseTy}-${i}`}>
                  <span className="cs-read__hot-t">{typeLabel(h.houseTy)}</span>
                  <span className="cs-read__hot-r">{h.rate.toLocaleString()}:1</span>
                  <span className="muted">공급 {h.supply}세대</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
