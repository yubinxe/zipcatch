import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { findOfficialProperty } from '@/lib/consumer/official'
import { checkUrgency } from '@/lib/crm/services/scoring'
import { isRental } from '@/lib/consumer/classify'

/**
 * 공고 하나를 링크로 보냈을 때 딸려 가는 그림.
 *
 * 사람이 카카오톡으로 보내는 것은 대개 서비스가 아니라 공고 하나다.
 * "이거 봐" 하고 붙이는데 미리보기가 서비스 소개면, 받는 사람은 무엇을
 * 보라는 건지 모른 채 눌러야 한다.
 *
 * 공고 이름과 남은 날을 그림에 적는다. 링크를 열지 않아도 급한지 아닌지는
 * 알 수 있어야 한다.
 *
 * 바탕은 대표 미리보기와 같은 밤 지도(app/og-night.jpg — scripts/og/render-og.mjs).
 * satori 는 원근·번짐을 그리지 못하므로 바탕은 미리 찍어 두고 글만 얹는다.
 * satori 는 woff2 를 읽지 못해 Pretendard 원본 OTF 를 먹인다.
 */

export const alt = '집캐치 모집공고'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const NIGHT = '#070A10'
const ORANGE = '#C2410C'
const GLOW = '#FFB27A'
const RENT = '#3B6FD9'

/** 제목이 길면 그림 밖으로 밀린다. 글자 수에 따라 크기를 낮춘다 */
function titleSize(len: number) {
  if (len <= 16) return 72
  if (len <= 26) return 60
  if (len <= 38) return 50
  return 42
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const [bold, regular, night, mark] = await Promise.all([
    readFile(join(process.cwd(), 'app/fonts/Pretendard-Bold.otf')),
    readFile(join(process.cwd(), 'app/fonts/Pretendard-Regular.otf')),
    readFile(join(process.cwd(), 'app/og-night.jpg')),
    // 집캐치 마크(지붕 하나, 문 하나) — scripts/og/render-og.mjs 가 BrandMark 와 같은 모양으로 굽는다
    readFile(join(process.cwd(), 'app/og-mark.svg')),
  ])

  const { id } = await params
  // 공고를 못 찾아도 그림은 나와야 한다. 미리보기가 깨지는 것보다 낫다.
  const property = await findOfficialProperty(id).catch(() => null)

  const urgency = property ? checkUrgency(property, new Date()) : null
  const rent = property ? isRental(property.housingType) : false
  const name = property?.name ?? '모집공고'
  const where = [property?.region, property?.district].filter(Boolean).join(' ')

  const dday =
    urgency === null || urgency.daysLeft === null
      ? null
      : urgency.daysLeft < 0
        ? '마감'
        : urgency.daysLeft === 0
          ? 'D-DAY'
          : `D-${urgency.daysLeft}`
  const closed = dday === '마감'
  const hot = !closed && urgency?.daysLeft !== null && urgency?.daysLeft !== undefined && urgency.daysLeft <= 7

  const pill = {
    display: 'flex',
    alignItems: 'center',
    height: 40,
    padding: '0 18px',
    borderRadius: 6,
    fontSize: 21,
    fontWeight: 700,
  } as const

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: NIGHT,
          fontFamily: 'Pretendard',
          color: '#fff',
        }}
      >
        <img
          src={`data:image/jpeg;base64,${night.toString('base64')}`}
          width={1200}
          height={630}
          alt=""
          style={{ position: 'absolute', left: 0, top: 0, width: 1200, height: 630 }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '64px 72px',
          }}
        >
          {/* 위 — 누가, 무엇을 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img
                src={`data:image/svg+xml;base64,${mark.toString('base64')}`}
                width={48}
                height={48}
                alt=""
                // 그림자가 타일 모서리(32 격자의 7.5 → 48px 에서 11.25)를 따라가게
                style={{ width: 48, height: 48, borderRadius: 11, boxShadow: '0 12px 32px -10px rgba(255,110,40,0.85)' }}
              />
              <span style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>집캐치</span>
              <span style={{ display: 'flex', marginLeft: 10, fontSize: 18, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.5)' }}>
                모집공고
              </span>
            </div>

            {dday && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 72,
                  padding: '0 30px',
                  borderRadius: 10,
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: -1,
                  background: closed ? 'rgba(255,255,255,0.10)' : hot ? ORANGE : 'rgba(255,255,255,0.12)',
                  color: closed ? 'rgba(255,255,255,0.55)' : hot ? '#fff' : GLOW,
                  border: closed || hot ? 'none' : '1px solid rgba(255,178,122,0.45)',
                  boxShadow: hot ? '0 16px 44px -12px rgba(255,110,40,0.9)' : 'none',
                }}
              >
                {dday}
              </div>
            )}
          </div>

          {/* 가운데 — 공고 이름. 이 그림에서 가장 무거운 것 */}
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 860 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
              <span style={{ ...pill, background: rent ? RENT : ORANGE, color: '#fff' }}>{rent ? '임대' : '분양'}</span>
              {property?.housingType && (
                <span
                  style={{
                    ...pill,
                    background: 'rgba(255,255,255,0.10)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.88)',
                  }}
                >
                  {property.housingType}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: titleSize(name.length),
                fontWeight: 700,
                lineHeight: 1.18,
                letterSpacing: -2,
              }}
            >
              {name.length > 52 ? `${name.slice(0, 52)}…` : name}
            </div>
            {where && (
              <div style={{ display: 'flex', marginTop: 20, fontSize: 28, fontWeight: 400, color: 'rgba(255,255,255,0.72)' }}>
                {where}
              </div>
            )}
          </div>

          {/* 아래 — 언제까지 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 24,
              borderTop: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 23, fontWeight: 700 }}>
              <span style={{ display: 'flex', width: 8, height: 8, borderRadius: 8, background: GLOW, boxShadow: '0 0 12px 3px rgba(255,138,61,0.9)' }} />
              {property?.applicationEnd ? `접수 마감 ${property.applicationEnd}` : '청약홈 · LH 공식 모집공고'}
            </div>
            <div style={{ display: 'flex', fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>zipcatch.vercel.app</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Pretendard', data: bold, style: 'normal', weight: 700 },
        { name: 'Pretendard', data: regular, style: 'normal', weight: 400 },
      ],
    },
  )
}
