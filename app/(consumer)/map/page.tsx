import NoticeMap from '@/components/consumer/NoticeMap'

export const metadata = {
  title: '지도로 보는 공고 — 집캐치',
  description: '접수 중인 청약·임대 공고를 지도 위에서 찾아보세요. 마감이 가까운 순으로 표시합니다.',
}

/**
 * 지도 전용 화면.
 *
 * 목록 화면 맨 아래에 붙여 두면 스크롤을 끝까지 내린 사람만 지도를 본다.
 * "어디인지"부터 묻는 사람이 적지 않으므로 길을 따로 낸다.
 */
export default function MapPage() {
  return (
    <div className="cs-wrap" style={{ paddingTop: 44 }}>
      <h1 className="cs-page-title">지도로 보는 공고</h1>
      <p className="cs-lead" style={{ marginTop: 14, marginBottom: 6 }}>
        목록은 무엇이 있는지를, 달력은 언제인지를 답합니다. 지도는 <b>어디인지</b>를 답해요.
        표시의 숫자는 접수 마감까지 남은 날이고, 붉은 쪽이 분양, 푸른 쪽이 임대입니다.
      </p>
      {/* 화면 제목이 이미 같은 말을 했다. 조각의 머리는 접는다 */}
      <NoticeMap heading={false} />
    </div>
  )
}
