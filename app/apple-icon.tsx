import { ImageResponse } from 'next/og'

/**
 * iOS 홈 화면 아이콘.
 *
 * `icon.svg` 와 같은 마크지만 애플은 SVG 를 받지 않아 PNG 가 따로 필요하다.
 * 파일을 손으로 굽는 대신 빌드 때 그린다 — 마크가 바뀌면 여기 한 곳만 고치면
 * 두 아이콘이 어긋나지 않는다.
 *
 * 홈 화면에서는 모서리를 iOS 가 직접 깎으므로 여기서는 각진 사각형으로 둔다.
 * 둥글게 그려 보내면 깎인 자리에 여백이 한 겹 더 생긴다.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#C2410C',
        }}
      >
        <svg
          width="112"
          height="112"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9.5h14V10" />
        </svg>
      </div>
    ),
    size,
  )
}
