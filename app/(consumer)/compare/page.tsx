import { Suspense } from 'react'
import CompareView from '@/components/consumer/CompareView'

export const metadata = {
  title: '공고 비교 — 집캐치',
  description: '관심공고 둘 이상을 나란히 놓고 금액·면적·일정·특별공급 결과를 견줍니다.',
}

/**
 * 비교 화면.
 *
 * 고른 공고는 주소(?ids=)에 담는다. 그래야 비교한 화면 자체를 공유할 수 있고,
 * 새로고침해도 고른 것이 풀리지 않는다.
 */
export default function ComparePage() {
  return (
    <div className="cs-wrap" style={{ paddingTop: 44 }}>
      <Suspense fallback={<p className="cs-note">불러오는 중입니다.</p>}>
        <CompareView />
      </Suspense>
    </div>
  )
}
