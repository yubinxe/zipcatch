'use client'

import { useEffect, useState } from 'react'

/**
 * 시연 마지막 장면의 QR — 공개된 집캐치 화면 주소만 담는다(세션·개인 정보 없음).
 * 부호기(qrcode-generator, MIT, 약 11KB gzip)는 이 장면에 왔을 때만 받는다. 그림은 SVG 칸으로 그려
 * 대형 화면에서도 흐려지지 않는다.
 */
export default function DirectorQr({ url, label }: { url: string; label: string }) {
  const [cells, setCells] = useState<{ n: number; on: [number, number][] } | null>(null)
  useEffect(() => {
    let alive = true
    import('qrcode-generator')
      .then(({ default: qrcode }) => {
        const qr = qrcode(0, 'M')
        qr.addData(url)
        qr.make()
        const n = qr.getModuleCount()
        const on: [number, number][] = []
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) on.push([c, r])
        if (alive) setCells({ n, on })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [url])
  return (
    <figure className="dir-qr">
      {cells ? (
        <svg viewBox={`-4 -4 ${cells.n + 8} ${cells.n + 8}`} role="img" aria-label={`${label} QR 코드 — ${url}`} shapeRendering="crispEdges">
          <rect x={-4} y={-4} width={cells.n + 8} height={cells.n + 8} fill="#fff" />
          <path d={cells.on.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')} fill="#0a1322" />
        </svg>
      ) : (
        <div className="dir-qr__wait" aria-hidden="true" />
      )}
      <figcaption>
        <b>{label}</b>
        <span>{url.replace(/^https?:\/\//, '')}</span>
      </figcaption>
    </figure>
  )
}
