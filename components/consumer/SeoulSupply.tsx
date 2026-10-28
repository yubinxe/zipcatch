'use client'

import { useEffect, useState } from 'react'
import { SUPPLY_GROUPS, type SeoulSupplyRead } from '@/lib/consumer/seoul-supply'

/**
 * 서울 분양 이력 — 주택도시보증공사 '서울특별시 분양아파트 기본현황'.
 *
 * 해마다 몇 세대가 어떤 방식(재건축·재개발·일반분양·기타)으로 분양됐는지 쌓아 보인다.
 * 분양 개시일이 없는 사업장은 그래프에 넣지 않고 숫자로 따로 밝힌다. 그래프와 같은 숫자를
 * 표로도 둔다(키보드·화면 읽기). 공정률(공사 진척)과는 다른 자료다.
 */
type Payload = (SeoulSupplyRead & { ok: true; status: 'OK' | 'EMPTY'; source: string }) | { ok: false; status: string; reason?: string }

const LABEL: Record<(typeof SUPPLY_GROUPS)[number], string> = { 재건축: '재건축', 재개발: '재개발', 일반분양: '일반분양', 기타: '기타' }

export default function SeoulSupply() {
  const [data, setData] = useState<Payload | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/hug/seoul-supply', { signal: ctl.signal })
      .then(r => r.json())
      .then((j: Payload) => setData(j))
      .catch(() => !ctl.signal.aborted && setData({ ok: false, status: 'ERROR' }))
    return () => ctl.abort()
  }, [attempt])

  return (
    <section className="cs-wrap cs-sb cs-seoul" aria-labelledby="cs-seoul-h">
      <div className="cs-seoul__head">
        <span className="cs-sec-eyebrow">Seoul Supply · HUG</span>
        <h2 id="cs-seoul-h" className="cs-seoul__h">서울 분양 이력</h2>
        <p className="cs-seoul__lead">해마다 서울에서 몇 세대가, 어떤 방식으로 분양됐는지 — 주택도시보증공사 분양보증 사업장 기준입니다.</p>
      </div>

      {!data ? (
        <div className="cs-skel" style={{ height: 280 }} />
      ) : !data.ok ? (
        <div className="cs-seoul__quiet">
          <p>
            {data.status === 'NOT_CONFIGURED'
              ? '서울 분양 이력 자료 연결을 마무리하고 있어요.'
              : data.status === 'AUTH_FAILED'
                ? '자료 제공처 인증을 확인하고 있어요.'
                : '서울 분양 이력을 지금 불러오지 못했어요.'}
          </p>
          {data.status === 'ERROR' && (
            <button type="button" className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => { setData(null); setAttempt(a => a + 1) }}>
              다시 시도
            </button>
          )}
        </div>
      ) : data.status === 'EMPTY' ? (
        <p className="cs-seoul__quiet">이번 자료에 서울 분양 사업장이 없어요.</p>
      ) : (
        <SeoulBody d={data} />
      )}
    </section>
  )
}

function SeoulBody({ d }: { d: SeoulSupplyRead & { source: string } }) {
  // 2000~2010 은 해마다 0~4곳뿐이라 막대가 비어 보인다 — 그래프는 2011 부터, 표에는 전부
  const shown = d.years.filter(y => y.year >= '2011')
  const max = Math.max(1, ...shown.map(y => y.households))
  const dated = d.sites - d.undated

  return (
    <>
      <dl className="cs-seoul__kpis">
        <div>
          <dt>분양 사업장</dt>
          <dd className="cs-num">{d.sites.toLocaleString('ko-KR')}곳</dd>
        </div>
        <div>
          <dt>분양 세대</dt>
          <dd className="cs-num">{d.households.toLocaleString('ko-KR')}세대</dd>
        </div>
        <div>
          <dt>가장 최근 분양 개시</dt>
          <dd className="cs-num">{d.latest ?? '—'}</dd>
        </div>
        <div>
          <dt>개시일 미표기</dt>
          <dd className="cs-num">{d.undated.toLocaleString('ko-KR')}곳</dd>
        </div>
      </dl>

      <div className="cs-seoul__chart" role="img" aria-label={`연도별 서울 분양 세대 — ${shown.map(y => `${y.year}년 ${y.households}세대`).join(', ')}`}>
        {shown.map(y => (
          <div key={y.year} className="cs-seoul__col">
            <div className="cs-seoul__stack" style={{ height: `${(y.households / max) * 100}%` }} title={`${y.year}년 ${y.households.toLocaleString('ko-KR')}세대 · ${y.sites}곳`}>
              {SUPPLY_GROUPS.map(g =>
                y.byGroup[g] > 0 ? <i key={g} data-g={g} style={{ flexGrow: y.byGroup[g] }} /> : null,
              )}
            </div>
            <span className="cs-seoul__yr cs-num">{y.year.slice(2)}</span>
          </div>
        ))}
      </div>
      <div className="cs-seoul__legend" aria-hidden="true">
        {SUPPLY_GROUPS.map(g => (
          <span key={g}>
            <i data-g={g} />
            {LABEL[g]}
          </span>
        ))}
        <em>단위: 분양 세대 · 연도는 분양 개시일 기준 ({dated.toLocaleString('ko-KR')}곳)</em>
      </div>

      <div className="cs-seoul__grid">
        <div>
          <h3 className="cs-seoul__h3">사업 방식별</h3>
          <table className="cs-seoul__table">
            <thead>
              <tr>
                <th scope="col">사업구분</th>
                <th scope="col">사업장</th>
                <th scope="col">세대</th>
              </tr>
            </thead>
            <tbody>
              {d.byType.map(t => (
                <tr key={t.type}>
                  <th scope="row">{t.type}</th>
                  <td className="cs-num">{t.sites.toLocaleString('ko-KR')}</td>
                  <td className="cs-num">{t.households.toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="cs-seoul__h3">최근 분양 개시</h3>
          <ul className="cs-seoul__recent">
            {d.recent.map(r => (
              <li key={`${r.name}-${r.date}`}>
                <span className="cs-num">{r.date}</span>
                <b>{r.name}</b>
                <em>
                  {r.type}
                  {r.households !== null && ` · ${r.households.toLocaleString('ko-KR')}세대`}
                </em>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="cs-seoul__src">
        출처: {d.source}. 분양보증을 받은 사업장 기준이라 서울의 모든 분양을 담지는 않습니다.
      </p>
    </>
  )
}
