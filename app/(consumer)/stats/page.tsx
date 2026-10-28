import type { Metadata } from 'next'
import StatsView from '@/components/consumer/StatsView'
import SeoulSupply from '@/components/consumer/SeoulSupply'

export const metadata: Metadata = {
  title: '경쟁률 · 당첨통계 — 집캐치',
  description:
    '청약홈 공개 통계로 보는 지역별 청약 경쟁률, 당첨 가점, 연령대별 신청자와 당첨자 분포.',
}

export default function StatsPage() {
  return (
    <>
      <StatsView />
      <SeoulSupply />
    </>
  )
}
