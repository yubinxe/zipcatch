import NoticeMap from '@/components/consumer/NoticeMap'
import Link from 'next/link'
import { KAKAO_JS_KEY, KAKAO_SDK_URL } from '@/components/consumer/kakao-sdk'
import PageMasthead from '@/components/consumer/PageMasthead'
import MapTimeScope from '@/components/consumer/map/MapTimeScope'
import { FEATURES } from '@/lib/features'
import '../../consumer-timemachine.css'

export const metadata = {
  title: '지도로 보는 공고 — 집캐치',
  description: '접수 중인 청약·임대 공고를 지도 위에서 찾아보세요. 마감이 가까운 순으로 표시합니다.',
}

/**
 * 지도 전용 화면.
 *
 * 목록 화면 맨 아래에 붙여 두면 스크롤을 끝까지 내린 사람만 지도를 본다.
 * "어디인지"부터 묻는 사람이 적지 않으므로 길을 따로 낸다.
 *
 * 무대 아래로 지도 판이 떠올라 무대 바닥에 걸친다 — 밤의 상황실에 들어선 듯이.
 */
export default function MapPage() {
  return (
    <div className="cs-wrap cs-sa cs-sa--map">
      {/*
        SDK 는 원래 지도 조각이 깨어난 뒤(수화 이후)에야 받기 시작했다. HTML 과 함께
        미리 받으라고 적어 두면 자바스크립트 묶음과 나란히 내려온다.
        sdk.js 는 다시 t1.daumcdn.net 에서 본체를 부르므로 그쪽 연결도 미리 연다.

        react-dom 의 preload() 나 평범한 <link rel="preload"> 는 쓰면 안 된다. React 가
        그것을 머리로 끌어올리는 신호로 바꿔 이 화면을 '미리 받아 둔' RSC 묶음에도
        싣는다 — 머리의 '지도' 링크가 보이는 모든 화면이 SDK 를 받았다(확인함).
        itemProp 을 단 link 는 React 가 끌어올리지 않고 그린 자리에 둔다. 본문 안의
        preload 도 브라우저는 그대로 따른다. 그래서 이 화면이 실제로 그려질 때만 받는다.
      */}
      {KAKAO_JS_KEY && (
        <>
          <link rel="preconnect" href="https://dapi.kakao.com" />
          <link rel="preconnect" href="https://t1.daumcdn.net" />
          <link rel="preload" as="script" href={KAKAO_SDK_URL} itemProp="kakao-sdk" />
        </>
      )}
      <PageMasthead
        eyebrow="MAP VIEW"
        title="지도로 보는 공고"
        lead={
          <>
            목록은 무엇이 있는지를, 달력은 언제인지를 답합니다. 지도는 <b>어디인지</b>를 답해요.
          </>
        }
      >
        <div className="cs-sa-mrow cs-sa-mrow--facts">
          <ul className="cs-sa-facts" aria-label="지도 읽는 법">
            <li>
              <span className="cs-sa-facts__dot" aria-hidden="true" />
              표시의 숫자는 접수 마감까지 남은 날
            </li>
            <li>붉은 쪽 분양 · 푸른 쪽 임대</li>
            <li>점선은 지역 기준의 대략 위치</li>
          </ul>
          <Link href="/notices" className="cs-sa-mlink">
            목록으로 보기 <i aria-hidden="true">→</i>
          </Link>
        </div>
      </PageMasthead>
      {/* 화면 제목이 이미 같은 말을 했다. 조각의 머리는 접는다 */}
      {/* 4.0 확장 — 타임머신이 위 지도와 날짜를 나눠 쓴다. NEXT_PUBLIC_FEATURE_TIME_MACHINE=0 이면 예전 지도 그대로 */}
      {FEATURES.timeMachine ? <MapTimeScope /> : <NoticeMap heading={false} />}
    </div>
  )
}
