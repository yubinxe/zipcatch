import localFont from 'next/font/local'

/*
 * 글꼴은 원본(TTF·OTF)이 아니라 줄인 WOFF2 를 싣는다 — scripts/subset-fonts.py.
 * 원본 다섯 벌이 10MB 가까이 되어 휴대폰 첫 방문에서 다른 모든 것보다 먼저
 * 회선을 차지했다. 완성형 한글 2,350자와 기호만 남겨 0.9MB 로 줄였다.
 * 빠진 드문 음절은 대체 글꼴로 그려진다.
 */

export const pretendard = localFont({
  src: [
    { path: './fonts/Pretendard-Regular.woff2', weight: '400 500', style: 'normal' },
    { path: './fonts/Pretendard-Bold.woff2', weight: '600 900', style: 'normal' },
  ],
  variable: '--font-pretendard',
  display: 'swap',
  fallback: ['Arial', 'system-ui', 'sans-serif'],
})

/**
 * Jalnan Gothic — 집캐치 브랜드 · 디스플레이 제목 전용.
 * 굵고 인상이 강해 짧은 후킹 문구에만 쓰고, 본문·입력·상세정보에는 쓰지 않는다.
 */
export const jalnan = localFont({
  src: [{ path: './fonts/JalnanGothicTTF.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
})

/**
 * Gmarket Sans — 섹션 제목 등 보조 브랜드 타이포.
 * 긴 설명·숫자가 많은 상세 UI 에는 쓰지 않는다 (G마켓 공식 가이드).
 * TTF 를 프로젝트에 포함해 next/font 로 self-host 한다.
 */
export const gmarket = localFont({
  src: [
    { path: './fonts/GmarketSansTTFMedium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/GmarketSansTTFBold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-brand',
  display: 'swap',
  // 폰트 로딩 실패·지연 시에도 레이아웃이 흔들리지 않도록 대체 글꼴을 지정한다.
  fallback: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
})
