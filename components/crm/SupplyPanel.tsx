'use client'

import { useEffect, useState } from 'react'
import { Stat, ErrorBox } from './primitives'
import { Card, CardHead } from '@/components/ui'

/**
 * 공급 데이터 운영 현황.
 *
 * CRM 지표는 고객이 무엇을 했는지 본다. 이 패널은 그 앞단 — 팔 물건이
 * 제대로 들어와 있는지를 본다. 공고 수집이 깨지면 고객 지표는 한참 뒤에야
 * 떨어지고, 그때는 이미 사람들이 빈 화면을 본 뒤다.
 *
 * "몇 건 있나"보다 "무엇이 비어 있나"를 앞에 둔다.
 */

interface Gap {
  count: number
  pct: number
}

interface Supply {
  checkedAt: string
  total: number
  open: number
  closed: number
  sources: { name: string; count: number }[]
  provinces: { name: string; count: number }[]
  types: { name: string; count: number }[]
  closing: { today: number; within7: number; within30: number }
  gaps: { noAddress: Gap; noPrice: Gap; noArea: Gap; noEnd: Gap }
}

/** 이 비율을 넘으면 눈에 띄게 한다 — 수집이 깨졌을 때 먼저 보이도록 */
const WARN_PCT = 40

function GapRow({ label, gap, note }: { label: string; gap: Gap; note: string }) {
  return (
    <div className="crm-gap" data-warn={gap.pct >= WARN_PCT}>
      <div className="crm-gap__head">
        <span className="crm-gap__label">{label}</span>
        <span className="crm-gap__n">
          {gap.count.toLocaleString()}건 · {gap.pct}%
        </span>
      </div>
      <div className="crm-gap__bar">
        <span style={{ width: `${Math.min(100, gap.pct)}%` }} />
      </div>
      <div className="crm-gap__note">{note}</div>
    </div>
  )
}

export default function SupplyPanel() {
  const [data, setData] = useState<Supply | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 가져오기 전에 오류를 미리 지우지 않는다. 그러면 화면이 한 번 비었다가
  // 다시 채워지고, 다시 시도했다가 또 실패하면 오류가 깜빡인다.
  // 결과가 온 뒤에 한 번만 갈아 끼운다.
  const load = () => {
    fetch('/api/admin/supply', { cache: 'no-store' })
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json?.error ?? '공급 현황을 불러오지 못했습니다.')
        return json as Supply
      })
      .then(json => {
        setData(json)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '공급 현황을 불러오지 못했습니다.'))
  }

  useEffect(load, [])

  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!data) return null

  return (
    <div className="crm-supply">
      <div className="crm-stat-grid">
        <Stat label="접수 중 공고" value={data.open} unit="건" hint={`마감 포함 ${data.total}건 보유`} />
        <Stat
          label="오늘 마감"
          value={data.closing.today}
          unit="건"
          hot={data.closing.today > 0}
          hint={`7일 내 ${data.closing.within7}건`}
        />
        <Stat label="30일 내 마감" value={data.closing.within30} unit="건" />
        <Stat
          label="출처"
          value={data.sources.length}
          unit="곳"
          hint={data.sources.map(s => `${s.name.replace(/\s*\(.*\)$/, '')} ${s.count}`).join(' · ')}
        />
      </div>

      <div className="crm-2col" style={{ marginTop: 'var(--s5)' }}>
        <Card>
          <CardHead
            title="비어 있는 칸"
            sub="화면에서 '공고문 확인'으로 나가는 자리입니다. 비율이 갑자기 오르면 수집이 깨진 것입니다."
          />
          <div className="crm-gaps">
            <GapRow label="금액 미공개" gap={data.gaps.noPrice} note="LH 임대는 공고문 PDF 에만 있는 경우가 많습니다" />
            <GapRow label="면적 미공개" gap={data.gaps.noArea} note="주택형별 공급 표로 메울 수 있는 건도 포함됩니다" />
            <GapRow label="주소 없음" gap={data.gaps.noAddress} note="지도에 찍지 못하고 지역 기준점으로 물러섭니다" />
            <GapRow label="마감일 없음" gap={data.gaps.noEnd} note="달력과 마감 알림에서 빠집니다" />
          </div>
        </Card>

        <Card>
          <CardHead
            title="어디에 몰려 있나"
            sub={`접수 중 ${data.open}건 · ${data.types.map(t => `${t.name} ${t.count}`).join(' · ')}`}
          />
          <div className="crm-dist">
            {data.provinces.slice(0, 10).map(p => {
              const top = data.provinces[0]?.count || 1
              return (
                <div key={p.name} className="crm-dist__row">
                  <span className="crm-dist__k">{p.name}</span>
                  <span className="crm-dist__bar">
                    <span style={{ width: `${Math.max(3, (p.count / top) * 100)}%` }} />
                  </span>
                  <span className="crm-dist__n">{p.count}</span>
                </div>
              )
            })}
            {data.provinces.length > 10 && (
              <div className="crm-dist__more">그 밖 {data.provinces.length - 10}개 지역</div>
            )}
          </div>
        </Card>
      </div>

      <div className="crm-supply__foot">
        {new Date(data.checkedAt).toLocaleString('ko-KR')} 기준 · 공공데이터포털 청약홈 · LH 청약플러스
      </div>
    </div>
  )
}
