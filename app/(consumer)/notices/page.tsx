import { Suspense } from 'react'
import NoticeBrowser from '@/components/consumer/NoticeBrowser'

export const metadata = { title: '모집 중인 공고 — 집캐치' }

/**
 * 첫 화면 지도에서 지역을 골라 들어오면(?region=) 그 지역이 이미 골라져 있어야 한다.
 * 주소의 값은 브라우저에서 읽는다 — 서버에서 읽으면 이 화면이 매 요청 새로 그려진다.
 */
export default function NoticesPage() {
  return (
    <Suspense fallback={<p className="cs-wrap cs-note" style={{ paddingTop: 48 }}>공고를 불러오는 중입니다.</p>}>
      <NoticeBrowser />
    </Suspense>
  )
}
