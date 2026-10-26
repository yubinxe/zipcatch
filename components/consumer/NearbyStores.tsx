'use client'

import { useEffect, useState } from 'react'

/**
 * 이 집 앞의 생활 — 반경 안의 상가.
 *
 * 공고문은 금액과 일정을 말하지만 저녁에 걸어서 장을 볼 수 있는지는 말하지 않는다.
 * 소상공인시장진흥공단에 등록된 업소를 반경으로 세어 보여 준다. 점수나 등급은
 * 매기지 않는다 — 많다고 좋은 집이 아니고, 무엇이 필요한지는 사는 사람이 안다.
 *
 * 좌표가 정확하지 않은 공고(지역 기준점)에는 열지 않는다. 시청 앞 상가를
 * 그 공고의 동네처럼 보여 주게 된다.
 */

interface Read {
  ok: boolean
  reason?: string
  radius?: number
  total?: number
  counted?: number
  groups?: { name: string; count: number }[]
  essentials?: { key: string; label: string; count: number }[]
}

const RADII = [500, 1000] as const

export default function NearbyStores({
  lat,
  lng,
  approximate,
}: {
  lat: number
  lng: number
  /** 주소가 아니라 공고명으로 찾은 자리 */
  approximate: boolean
}) {
  const [radius, setRadius] = useState<(typeof RADII)[number]>(500)
  const [result, setResult] = useState<{ key: string; read: Read } | null>(null)
  const key = `${lat},${lng},${radius}`
  const read = result?.key === key ? result.read : null

  useEffect(() => {
    const ctl = new AbortController()
    fetch(`/api/stores?lat=${lat}&lng=${lng}&radius=${radius}`, { signal: ctl.signal })
      .then(r => r.json().catch(() => ({ ok: false, reason: `HTTP ${r.status}` })))
      .then((json: Read) => setResult({ key: `${lat},${lng},${radius}`, read: json }))
      .catch(() => {
        if (!ctl.signal.aborted) setResult({ key: `${lat},${lng},${radius}`, read: { ok: false, reason: '불러오지 못했습니다.' } })
      })
    return () => ctl.abort()
  }, [lat, lng, radius])

  const maxGroup = read?.groups?.[0]?.count ?? 1

  return (
    <section style={{ marginTop: 32 }}>
      <div className="cs-near__head">
        <h2 className="cs-section-title" style={{ fontSize: 24 }}>
          걸어서 닿는 생활
        </h2>
        <div className="cs-bp__sort" role="group" aria-label="반경">
          {RADII.map(r => (
            <button key={r} type="button" aria-pressed={radius === r} onClick={() => setRadius(r)}>
              반경 {r >= 1000 ? `${r / 1000}km` : `${r}m`}
            </button>
          ))}
        </div>
      </div>

      <div className="cs-card cs-near" style={{ marginTop: 18 }} aria-busy={!read}>
        {!read ? (
          <div className="cs-near__grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="cs-skel" style={{ height: 76 }} />
            ))}
          </div>
        ) : !read.ok ? (
          <p className="cs-note" style={{ margin: 0 }}>
            주변 상가 정보를 불러오지 못했어요. {read.reason}
          </p>
        ) : (
          <>
            <ul className="cs-near__grid">
              {read.essentials!.map(e => (
                <li key={e.key} data-zero={e.count === 0 || undefined}>
                  <span>{e.label}</span>
                  <b className="cs-num">{e.count.toLocaleString('ko-KR')}</b>
                </li>
              ))}
            </ul>

            {read.groups!.length > 0 && (
              <div className="cs-near__groups">
                <div className="cs-near__total">
                  <span>등록 업소</span>
                  <div>
                    <b className="cs-num">{read.total!.toLocaleString('ko-KR')}</b>곳
                  </div>
                </div>
                <ul>
                  {read.groups!.slice(0, 6).map(g => (
                    <li key={g.name}>
                      <span>{g.name}</span>
                      <i aria-hidden="true">
                        <em style={{ width: `${(g.count / maxGroup) * 100}%` }} />
                      </i>
                      <b className="cs-num">{g.count.toLocaleString('ko-KR')}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="cs-note" style={{ marginTop: 18, marginBottom: 0 }}>
              소상공인시장진흥공단 상가(상권)정보 · 공공데이터포털. 등록 정보 기준이라 실제 영업과 다를 수 있습니다.
              {approximate && ' 위치는 주소가 아니라 공고명으로 찾은 자리입니다.'}
              {read.counted! < read.total! && ` 업소가 많아 앞의 ${read.counted!.toLocaleString('ko-KR')}곳으로 세었습니다.`}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
