/**
 * 바닥글 — 이 서비스를 만든 사람에게로 이어지는 길.
 *
 * 공고를 다 보고 내려온 사람에게 "누가 만들었나"를 한 번에 보여 주고, 다음 걸음을
 * 셋으로 좁힌다: 포트폴리오 → 강의·협업 문의 → 채널. 링크는 모두 포트폴리오
 * (yubinxe.github.io/Portfolio) 에 공개된 것만 쓴다. 소개 문구도 그곳의 표현을 옮겼다.
 *
 * 서비스 고지(자격 판정 안 함·출처)는 맨 아래에 그대로 둔다 — 퍼널이 고지를 밀어내면 안 된다.
 */

const PORTFOLIO = 'https://yubinxe.github.io/Portfolio/'

const CHANNELS = [
  {
    key: 'instagram',
    label: 'Instagram',
    handle: '@yubinxe',
    href: 'https://www.instagram.com/yubinxe/',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: 'naver',
    label: '네이버 블로그',
    handle: 'blog.naver.com/yubinxe',
    href: 'https://blog.naver.com/yubinxe',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M5 4.5h10.5L19 8v11.5H5Z" />
        <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'tistory',
    label: '티스토리',
    handle: 'yubinxe.tistory.com',
    href: 'https://yubinxe.tistory.com/',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4.5 6.5h15M12 6.5v13" strokeLinecap="round" />
        <circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: 'github',
    label: 'GitHub',
    handle: 'github.com/yubinxe',
    href: 'https://github.com/yubinxe',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5.5l-3 13" />
      </svg>
    ),
  },
]

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
)

export default function MakerFooter() {
  return (
    <footer className="cs-footer cs-maker">
      <div className="cs-wrap">
        <section className="cs-maker__card" aria-labelledby="cs-maker-name">
          <div className="cs-maker__who">
            <p className="cs-maker__eyebrow">MADE BY</p>
            <h2 id="cs-maker-name" className="cs-maker__name">
              김유빈 <span>Yubin Kim</span>
            </h2>
            <p className="cs-maker__role">AI 전략 컨설팅 · 자동화로 증명하는 실력</p>
            <p className="cs-maker__line">
              판단의 근거를 만들고 실행으로 잇습니다. 집캐치도 그렇게 직접 기획하고 만들어 배포한 서비스입니다.
            </p>

            <div className="cs-maker__cta">
              <a href={PORTFOLIO} target="_blank" rel="author noopener" className="cs-maker__primary">
                포트폴리오 보기
                <Arrow />
              </a>
              <a
                href="mailto:yubin120866@gmail.com?subject=%5B%EC%A7%91%EC%BA%90%EC%B9%98%5D%20%ED%98%91%EC%97%85%C2%B7%EA%B0%95%EC%9D%98%20%EB%AC%B8%EC%9D%98"
                className="cs-maker__secondary"
              >
                협업·강의 문의
              </a>
            </div>

            <ul className="cs-maker__more">
              <li>
                <a href={`${PORTFOLIO}career.html`} target="_blank" rel="noopener">
                  경력 상세 <Arrow />
                </a>
              </li>
              <li>
                <a href={`${PORTFOLIO}lecture.html`} target="_blank" rel="noopener">
                  AI · 부동산 강의 <Arrow />
                </a>
              </li>
              <li>
                <a href={`${PORTFOLIO}gallery.html`} target="_blank" rel="noopener">
                  갤러리 <Arrow />
                </a>
              </li>
            </ul>
          </div>

          <ul className="cs-maker__channels" aria-label="채널">
            {CHANNELS.map(c => (
              <li key={c.key}>
                <a href={c.href} target="_blank" rel="me noopener" className="cs-maker__channel" data-ch={c.key}>
                  <span className="cs-maker__icon">{c.icon}</span>
                  <span className="cs-maker__ch-text">
                    <b>{c.label}</b>
                    <span>{c.handle}</span>
                  </span>
                  <span className="cs-maker__go">
                    <Arrow />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="cs-maker__legal">
          <p>
            집캐치는 공개된 공고 정보를 정리해 보여드리는 참고 서비스입니다. 자격 판정과 당첨 여부를 확정하지 않으며, 신청
            전 반드시 공식 모집공고문을 확인해 주세요.
          </p>
          <p>공고·통계 출처: 공공데이터포털 청약홈 OpenAPI · LH 청약플러스 · 한국부동산원.</p>
          <p className="cs-maker__copy">© 2026 집캐치 · 기획·개발 김유빈</p>
        </div>
      </div>
    </footer>
  )
}
