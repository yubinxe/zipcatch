import Link from 'next/link'

/**
 * 없는 주소로 들어온 사람.
 *
 * 박람회에서는 주소를 손으로 치다 틀리는 일이 실제로 일어난다. 그때 나오는
 * 화면이 프레임워크 기본 화면이면 거기서 대화가 끊긴다.
 *
 * 사과만 하고 끝내지 않는다. 여기까지 온 사람이 찾던 것은 대개 공고이므로,
 * 바로 갈 수 있는 문을 몇 개 열어 둔다. 헤더·챗은 붙이지 않는다 —
 * 라우트 그룹 밖이라 붙지 않고, 굳이 붙일 자리도 아니다.
 *
 * 다만 바깥 상자에 `cs` 를 준다. 소비자 화면의 색·서체는 :root 가 아니라
 * `.cs` 아래에 매여 있어서, 이 클래스가 없으면 토큰이 닿지 않는다.
 * 처음에 빠뜨렸더니 링크가 브라우저 기본 파랑으로 나왔다.
 */
export const metadata = {
  title: '없는 주소입니다 — 집캐치',
}

const DOORS = [
  { href: '/notices', label: '모집 중인 공고', hint: '청약홈·LH 실제 공고를 마감 가까운 순으로' },
  { href: '/analyze', label: '내 조건으로 찾기', hint: '지역·예산을 넣으면 맞는 공고만 골라 드려요' },
  { href: '/map', label: '지도로 보기', hint: '어디인지부터 궁금할 때' },
  { href: '/guide', label: '청약 가이드', hint: '무엇부터 알아야 하는지' },
]

export default function NotFound() {
  return (
    <main className="cs cs-404">
      <div className="cs-404__inner">
        <p className="cs-404__code">404</p>
        <h1 className="cs-404__title">이 주소에는 아무것도 없어요</h1>
        <p className="cs-404__desc">
          주소가 바뀌었거나, 지나간 공고일 수 있습니다. 찾으시던 것이 공고라면 아래에서 바로 이어
          가실 수 있어요.
        </p>

        <ul className="cs-404__doors">
          {DOORS.map(d => (
            <li key={d.href}>
              <Link href={d.href} className="cs-404__door">
                <span className="cs-404__door-label">{d.label}</span>
                <span className="cs-404__door-hint">{d.hint}</span>
              </Link>
            </li>
          ))}
        </ul>

        <Link href="/" className="cs-404__home">
          첫 화면으로
        </Link>
      </div>
    </main>
  )
}
