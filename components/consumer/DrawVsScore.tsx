'use client'

import { useState } from 'react'
import {
  OWNERSHIP_LABEL,
  REGULATED_AS_OF,
  ZONE_LABEL,
  judge,
  type Ownership,
  type Reference,
  type Zone,
} from '@/lib/consumer/draw-vs-score'

/**
 * 가점제냐 추첨제냐 — 주택형마다 한 줄.
 *
 * 공고의 주택형이 있으면 그것으로, 없으면 대표 면적 셋(59·84·114㎡)으로 보여 준다.
 * 지역의 규제 상태는 주소로 짐작하지만 바뀌는 값이라 사용자가 고칠 수 있게 둔다.
 * 모든 판단 옆에 근거 조문을 단다.
 */

interface Model {
  name: string
  exclusiveArea: number | null
  households: number | null
}

const SAMPLE: Model[] = [
  { name: '59㎡형', exclusiveArea: 59, households: null },
  { name: '84㎡형', exclusiveArea: 84, households: null },
  { name: '114㎡형', exclusiveArea: 114, households: null },
]

const ROUTE_TONE: Record<string, string> = {
  SCORE: 'score',
  BOTH: 'both',
  DRAW: 'draw',
  DRAW_ONLY: 'draw',
  RANK2: 'muted',
}

export default function DrawVsScore({
  myScore,
  reference,
  models,
  defaultZone,
  defaultOwnership = 'NONE',
  zoneHint,
}: {
  myScore: number
  reference: Reference | null
  models?: Model[]
  defaultZone: Zone
  defaultOwnership?: Ownership
  /** 규제 상태를 무엇으로 짐작했는지 */
  zoneHint?: string
}) {
  const [zone, setZone] = useState<Zone>(defaultZone)
  const [ownership, setOwnership] = useState<Ownership>(defaultOwnership)
  const rows = (models && models.some(m => m.exclusiveArea !== null) ? models : SAMPLE).filter(
    (m): m is Model & { exclusiveArea: number } => m.exclusiveArea !== null,
  )

  return (
    <section className="cs-dvs">
      <div className="cs-dvs__head">
        <div>
          <h2 className="cs-dvs__title">가점제냐, 추첨제냐</h2>
          <p className="cs-dvs__sub">
            내 가점 <b className="cs-num">{myScore}점</b> 기준. 지역의 규제 상태와 전용면적이 가점·추첨 물량을 정합니다.
          </p>
        </div>
        <div className="cs-dvs__controls">
          <div className="cs-bp__sort" role="group" aria-label="지역 규제">
            {(['SPECULATION', 'ADJUSTED', 'NONE'] as Zone[]).map(z => (
              <button key={z} type="button" aria-pressed={zone === z} onClick={() => setZone(z)}>
                {ZONE_LABEL[z]}
              </button>
            ))}
          </div>
          <div className="cs-bp__sort" role="group" aria-label="주택 소유">
            {(['NONE', 'ONE', 'MULTI'] as Ownership[]).map(o => (
              <button key={o} type="button" aria-pressed={ownership === o} onClick={() => setOwnership(o)}>
                {OWNERSHIP_LABEL[o]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {zoneHint && (
        <p className="cs-note cs-dvs__hint">
          {zoneHint} — 규제지역 목록({REGULATED_AS_OF})으로 짐작한 값입니다. 공고문의 규제 표기가 다르면 위에서 바꿔 주세요.
        </p>
      )}

      <ol className="cs-dvs__rows">
        {rows.map(m => {
          const v = judge({ zone, area: m.exclusiveArea, ownership, myScore, ref: reference, households: m.households })
          const scorePct = v.score.max
          const fmt = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}~${r[1]}`)
          return (
            <li key={m.name} className="cs-dvs__row" data-tone={ROUTE_TONE[v.route]}>
              <div className="cs-dvs__type">
                <b>{m.name}</b>
                <span className="cs-num">전용 {m.exclusiveArea}㎡</span>
              </div>
              <div className="cs-dvs__split" aria-label={`가점 ${v.score.min === v.score.max ? v.score.max : `${v.score.min}~${v.score.max}`}%, 추첨 ${v.draw.min === v.draw.max ? v.draw.max : `${v.draw.min}~${v.draw.max}`}%`}>
                <div className="cs-dvs__bar">
                  <span className="cs-dvs__s" style={{ width: `${scorePct}%` }} data-range={v.score.min !== v.score.max || undefined} />
                </div>
                <div className="cs-dvs__legend cs-num">
                  <span>
                    가점 {v.score.min === v.score.max ? `${v.score.max}%` : `최대 ${v.score.max}%`}
                    {v.units && ` · ${fmt(v.units.score)}세대`}
                  </span>
                  <span>
                    추첨 {v.draw.min === v.draw.max ? `${v.draw.max}%` : `${v.draw.min}% 이상`}
                    {v.units && ` · ${fmt(v.units.draw)}세대`}
                  </span>
                </div>
              </div>
              <div className="cs-dvs__verdict">
                <b>{v.headline}</b>
                <details>
                  <summary>근거 {v.reasons.length}가지</summary>
                  <ul>
                    {v.reasons.map(r => (
                      <li key={r.text}>
                        {r.text}
                        <cite>{r.basis}</cite>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="cs-note">
        {reference
          ? `비교 기준: ${reference.label} 당첨가점 통계(평균 ${reference.avg}점 · 최저 ${reference.min}점). `
          : '당첨가점 통계를 불러오지 못해 물량만 보여 드립니다. '}
        당첨 확률이 아니라 물량과 점수의 거리입니다. 최종 비율과 세대수는 입주자모집공고문의 주택형별 표가 우선합니다.
      </p>
    </section>
  )
}
