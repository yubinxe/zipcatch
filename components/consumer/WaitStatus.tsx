'use client'

import { useEffect, useState } from 'react'

/**
 * 이 지역 공공임대 입주 대기 — 마이홈포털 예비입주자 대기현황.
 *
 * 같은 시·군·구(없으면 광역) 공공임대 단지의 예비입주자 수와 최근 퇴거 건수를 보여 준다.
 * 퇴거는 빈집이 생긴 횟수일 뿐이다 — 둘을 나눠 '몇 달 뒤 입주' 같은 숫자를 만들지 않는다.
 * 자료를 못 받으면 섹션째 숨긴다(곁들이는 정보다). 원인 문구는 화면에 내지 않는다.
 */

interface Complex {
  name: string
  address: string
  operator: string
  types: string[]
  styles: number
  wait: number
  moved: number
}

interface WaitRead {
  ok: boolean
  status: 'OK' | 'EMPTY' | 'NOT_CONFIGURED' | 'AUTH_FAILED' | 'ERROR' | 'UNSUPPORTED'
  scope: 'SIGUNGU' | 'PROVINCE'
  province: string
  sigungu: string | null
  complexCount: number
  waitTotal: number
  movedTotal: number
  top: Complex[]
}

export default function WaitStatus({ province, sigungu }: { province: string; sigungu: string }) {
  const [data, setData] = useState<WaitRead | null>(null)

  useEffect(() => {
    if (!province) return
    let alive = true
    const q = new URLSearchParams({ province })
    if (sigungu) q.set('sigungu', sigungu)
    fetch(`/api/myhome/wait?${q}`)
      .then(r => (r.ok ? r.json() : null))
      .then((json: WaitRead | null) => {
        if (alive && json?.ok && json.status === 'OK') setData(json)
      })
      .catch(() => {
        /* 곁들이는 정보다. 없다고 본문을 막지 않는다 */
      })
    return () => {
      alive = false
    }
  }, [province, sigungu])

  if (!data) return null
  const place = data.scope === 'SIGUNGU' ? `${data.province} ${data.sigungu}` : `${data.province} 전체`

  return (
    <section className="cs-sa-doc__sec">
      <h2 className="cs-sa-doc__h">이 지역 공공임대 입주 대기</h2>
      <div className="cs-sa-doc__body">
        <p className="cs-pro__p" style={{ marginBottom: 18 }}>
          <strong>{place}</strong> 공공임대 <strong>{data.complexCount.toLocaleString('ko-KR')}개 단지</strong>에
          예비입주자 <strong>{data.waitTotal.toLocaleString('ko-KR')}명</strong>이 순번을 기다리고 있고, 최근 퇴거는{' '}
          <strong>{data.movedTotal.toLocaleString('ko-KR')}건</strong>입니다.
          {data.scope === 'PROVINCE' &&
            (sigungu
              ? ` ${sigungu} 단지 기록이 없어 광역 전체로 보였습니다.`
              : ' 공고에 시·군·구가 적혀 있지 않아 광역 전체로 보였습니다.')}
        </p>

        {/* 표는 좁은 화면에서 숫자 칸이 밀려난다 — 단지 한 줄에 이름·숫자를 함께 둔다 */}
        <ol className="cs-wait__list">
          {data.top.map(c => (
            <li key={`${c.name}|${c.address}`} className="cs-wait__row">
              <div className="cs-wait__who">
                <b>{c.name}</b>
                <span className="cs-wait__sub">{[c.operator, c.address].filter(Boolean).join(' · ')}</span>
                {c.types.length > 0 && <span className="cs-wait__types">{c.types.join(' · ')}</span>}
              </div>
              <dl className="cs-wait__nums">
                <div>
                  <dt>대기</dt>
                  <dd className="cs-num">{c.wait.toLocaleString('ko-KR')}명</dd>
                </div>
                <div>
                  <dt>퇴거</dt>
                  <dd className="cs-num">{c.moved.toLocaleString('ko-KR')}건</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>

        <p className="cs-note" style={{ marginTop: 12 }}>
          대기 많은 순 {data.top.length}곳 · 출처 마이홈포털 예비입주자 대기현황(국토교통부). 퇴거 건수는 빈집이 난 횟수이며,
          입주 시점이나 당첨 가능성을 뜻하지 않습니다. 순번·자격은 각 단지 운영기관에서 확인해 주세요.
        </p>
      </div>
    </section>
  )
}
