import localFont from 'next/font/local'

/*
 * 글꼴은 원본(TTF·OTF)이 아니라 줄인 WOFF2 를 싣는다 — scripts/subset-fonts.py.
 * 원본 다섯 벌이 10MB 가까이 되어 휴대폰 첫 방문에서 다른 모든 것보다 먼저
 * 회선을 차지했다. 완성형 한글 2,350자와 기호만 남겨 0.9MB 로 줄였다.
 * 빠진 드문 음절은 대체 글꼴로 그려진다.
 */

/*
 * Pretendard 는 가변 글꼴 한 벌로 싣는다 — 100~900 이 모두 실제 굵기로 그려진다.
 * Regular·Bold 두 벌만 있을 때는 500 이 400 으로, 600 이 700 으로 뭉개져
 * 본문·보조·강조의 위계가 둘로만 나뉘었다. 원본은 pretendard@1.3.9 의
 * PretendardVariable.ttf, 같은 글자 집합(scripts/subset-fonts.py)으로 줄였다.
 */
export const pretendard = localFont({
  src: [{ path: './fonts/PretendardVariable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-pretendard',
  display: 'swap',
  fallback: ['Arial', 'system-ui', 'sans-serif'],
})

/*
 * Jalnan Gothic · Gmarket Sans 는 2.1 디자인(밤)에서 내렸다. 제목도 Pretendard 굵기로만
 * 위계를 세운다. 글꼴 파일은 라이선스 문서와 함께 app/fonts 에 남겨 둔다.
 */
