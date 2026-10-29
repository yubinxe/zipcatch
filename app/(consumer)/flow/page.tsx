import type { Metadata } from 'next'
import { Suspense } from 'react'
import TradeFlow from '@/components/consumer/TradeFlow'
import '../../consumer-flow.css'

export const metadata: Metadata = {
  title: '실거래 흐름 — 집캐치',
  description: '국토교통부 실거래 신고를 지역·기간·매매/전세/월세로 모아 보는 월별 흐름. 중앙값과 표본 수, 출처를 함께 적습니다.',
}

/* 조건은 주소(?lawd=…)에서 읽는다 — 브라우저에서만 읽히므로 경계를 둔다 */
export default function FlowPage() {
  return (
    <Suspense fallback={null}>
      <TradeFlow />
    </Suspense>
  )
}
