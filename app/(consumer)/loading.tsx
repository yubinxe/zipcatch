import BrandMark from '@/components/consumer/BrandMark'

/**
 * 첫 화면이 준비되는 동안.
 *
 * 회전하는 동그라미는 "기다려라"만 말한다. 그 대신 지면의 뼈대를 먼저 세운다 —
 * 머리글이 설 자리, 카드가 설 자리. 내용이 도착하면 자리가 바뀌지 않고
 * 채워지기만 해서 화면이 튀지 않는다.
 *
 * 상호는 진짜로 적는다. 로고까지 회색 덩어리로 두면 어느 사이트에 들어왔는지
 * 모른 채 기다리게 된다.
 */
export default function Loading() {
  return (
    <div className="cs-boot" role="status" aria-live="polite">
      <div className="cs-wrap">
        <div className="cs-boot__mark">
          <span className="cs-boot__logo" aria-hidden="true">
            <BrandMark size={40} />
          </span>
          <span className="cs-boot__name">집캐치</span>
          <span className="cs-boot__msg">공고를 불러오는 중이에요</span>
        </div>

        <div className="cs-boot__bar" aria-hidden="true">
          <span />
        </div>

        <div className="cs-boot__grid" aria-hidden="true">
          <div>
            <div className="cs-skel" style={{ height: 22, width: '32%' }} />
            <div className="cs-skel" style={{ height: 58, width: '84%', marginTop: 18 }} />
            <div className="cs-skel" style={{ height: 58, width: '68%', marginTop: 10 }} />
            <div className="cs-skel" style={{ height: 20, width: '76%', marginTop: 26 }} />
            <div className="cs-skel" style={{ height: 52, width: 210, marginTop: 28, borderRadius: 12 }} />
          </div>
          <div className="cs-skel" style={{ height: 380, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  )
}
