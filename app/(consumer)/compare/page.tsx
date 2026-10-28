import { Suspense } from 'react'
import CompareView, { CompareSkeleton } from '@/components/consumer/CompareView'
import PageMasthead from '@/components/consumer/PageMasthead'

export const metadata = {
  title: '공고 비교 — 집캐치',
  description: '관심공고 둘 이상을 나란히 놓고 금액·면적·일정·특별공급 결과를 견줍니다.',
}

/**
 * 비교 화면.
 *
 * 고른 공고는 주소(?ids=)에 담는다. 그래야 비교한 화면 자체를 공유할 수 있고,
 * 새로고침해도 고른 것이 풀리지 않는다.
 *
 * 주소는 브라우저에서만 읽히므로 표는 따로 기다린다. 무대는 그것과 상관없는
 * 말만 담아 서버가 그린 그대로 첫 그림에 세운다.
 */
export default function ComparePage() {
  return (
    <div className="cs-wrap cs-sa cs-sa--compare">
      <PageMasthead
        eyebrow="SIDE BY SIDE"
        title="공고 비교"
        lead={
          <>
            관심공고를 나란히 놓고 금액·면적·일정·특별공급 결과를 견줍니다. <b>서로 다른 줄</b>만 남겨 볼 수
            있어요.
          </>
        }
      >
        <ul className="cs-sa-facts">
          <li>
            <span className="cs-sa-facts__dot" aria-hidden="true" />
            셋까지 나란히
          </li>
          <li>없는 값은 &lsquo;공고문 확인&rsquo;으로 비워 둡니다</li>
          <li>자격은 판정하지 않습니다</li>
        </ul>
      </PageMasthead>
      <Suspense fallback={<CompareSkeleton />}>
        <CompareView />
      </Suspense>
    </div>
  )
}
