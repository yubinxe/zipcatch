import Link from 'next/link'
import MarketRead from '@/components/consumer/MarketRead'

export const metadata = {
  title: '사업성 판독 — 집캐치',
  description:
    '분양가는 지금 평당 얼마이고 그 값에 팔렸는가. 청약홈 공고·주택형·경쟁률 표를 이어 붙인 시행·분양대행·감정평가용 집계.',
}

export default function BizPage() {
  return (
    <div className="cs-main cs-mk">
      <header className="cs-mk__head">
        <p className="cs-mk__kicker">시행 · 분양대행 · 감정평가</p>
        <h1 className="cs-page-title">사업성 판독</h1>
        <p className="cs-sub cs-mk__intro">
          소비자 화면은 공고 한 건을 열어 &ldquo;내가 넣을 자리가 있나&rdquo;를 묻습니다. 사업을
          벌이는 쪽이 묻는 것은 반대입니다 — <b>이 동네에 지금 평당 얼마에 내고 있고, 그 값에
          팔렸는가.</b> 답은 청약홈 공개 표 안에 이미 있는데 표가 셋으로 나뉘어 있어 아무도 붙여
          보지 않습니다. 공고번호로 이어 붙였습니다.
        </p>
      </header>

      <MarketRead />

      <p className="cs-note cs-mk__foot">
        모두 공개된 기록의 집계입니다. 앞으로 얼마에 내면 팔린다는 말은 하지 않습니다. 실제 사업
        판단은 공고문 원문과 현장 조사, 감정평가사·건축사 등 자격을 갖춘 전문가의 검토를 거쳐
        주세요. 공고문에 나오는 실무 용어는{' '}
        <Link href="/pro">공급 판독</Link>에 정리해 두었습니다.
      </p>
    </div>
  )
}
