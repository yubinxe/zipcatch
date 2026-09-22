'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { MAP_SCOPE, type MapScope } from '@/lib/consumer/geo'
import { formatManOr } from '@/lib/crm/services/scoring'
import { PillChoice } from './Choose'

/**
 * 지도로 보는 공고 (카카오맵).
 *
 * 목록은 "무엇이 있는지"를, 달력은 "언제인지"를 답한다. 지도는 "어디인지"다.
 * 집을 고르는 일은 결국 지도 위에서 끝나므로, 남은 날짜를 표시에 얹어
 * 어디가 급한지까지 한 번에 보이게 한다.
 *
 * 좌표의 출처를 숨기지 않는다. 주소를 좌표로 바꿔 찍은 점과 지역 기준의 대략
 * 위치를 다르게 그리고, 지도에 올리지 못한 공고 수를 아래에 적는다.
 * 지도에 없는 공고가 없는 공고처럼 읽히면 지도를 믿고 목록을 안 보게 된다.
 */

interface Pin {
  id: string
  name: string
  province: string
  region: string
  housingType: string
  address: string | null
  kind: 'SALE' | 'RENT'
  deposit: number | null
  monthlyRent: number | null
  applicationEnd: string | null
  daysLeft: number | null
  urgencyLabel: string
  lat: number
  lng: number
  coordSource: 'GEOCODED' | 'DISTRICT' | 'PROVINCE'
}

interface MapData {
  pins: Pin[]
  total: number
  noCoord: number
  noAddress: number
  geocoded: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type KakaoNS = any

const JS_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ?? ''
const SCRIPT_ID = 'kakao-maps-sdk'

/**
 * 지도 SDK 를 한 번만 싣는다.
 *
 * `autoload=false` 로 받아 `kakao.maps.load()` 안에서 시작한다. 카카오가 정한
 * 방법이고, "언제 준비됐는지"를 이벤트 순서로 짐작하지 않아도 되는 유일한
 * 길이다 — 그 판단을 신호로 대신하려다 지도 없는 화면을 여러 번 만들었다.
 *
 * 도메인이 콘솔에 등록돼 있지 않으면 스크립트가 401 로 떨어진다. 그때는
 * 무엇을 해야 하는지까지 화면에 적는다. 회색 판만 남기지 않는다.
 */
function loadKakao(): Promise<KakaoNS> {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저 전용'))
  const w = window as unknown as { kakao?: KakaoNS; __kakaoMapPromise?: Promise<KakaoNS> }
  if (w.kakao?.maps?.Map) return Promise.resolve(w.kakao)
  if (w.__kakaoMapPromise) return w.__kakaoMapPromise

  // 무엇을 등록해야 하는지 화면이 직접 말하게 한다. "도메인을 등록하세요"만
  // 적어두면, 무엇을 어디에 적어야 하는지는 여전히 사람이 찾아야 한다.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const DOMAIN_HINT =
    `카카오 개발자 콘솔 › 내 애플리케이션 › 앱 설정 › 플랫폼 › Web › 사이트 도메인에 ` +
    `「${origin}」 를 그대로 등록해 주세요. ` +
    `Redirect URI 가 아니라 사이트 도메인 칸이고, 이 키(${JS_KEY.slice(0, 8)}…)를 발급한 그 앱이어야 합니다.`

  w.__kakaoMapPromise = new Promise<KakaoNS>((resolve, reject) => {
    if (!JS_KEY) {
      reject(new Error('지도 키가 설정되지 않았습니다.'))
      return
    }

    const start = () => {
      const k = (window as unknown as { kakao?: KakaoNS }).kakao
      if (!k?.maps) {
        reject(new Error(`지도를 불러오지 못했습니다. ${DOMAIN_HINT}`))
        return
      }
      k.maps.load(() => resolve(k))
    }

    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', start)
      return
    }

    const el = document.createElement('script')
    el.id = SCRIPT_ID
    el.async = true
    el.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false`
    el.onload = start
    el.onerror = () => reject(new Error(`지도를 불러오지 못했습니다. ${DOMAIN_HINT}`))
    document.head.appendChild(el)

    setTimeout(() => reject(new Error('지도를 불러오는 데 너무 오래 걸립니다.')), 15000)
  }).catch(err => {
    // 실패한 약속을 캐시에 남기면 다시 들어와도 영영 지도가 없다.
    delete (window as unknown as { __kakaoMapPromise?: unknown }).__kakaoMapPromise
    throw err
  })

  return w.__kakaoMapPromise
}

/** 남은 날을 사람 말로. 표시 안에 들어가므로 짧아야 한다 */
function dday(n: number | null) {
  if (n === null) return '미정'
  if (n === 0) return 'D-DAY'
  if (n < 0) return '마감'
  return `D-${n}`
}

function priceLine(p: Pin) {
  if (p.deposit === null && p.monthlyRent === null) return '공급금액 공고문 확인'
  const dep = formatManOr(p.deposit)
  if (p.monthlyRent === null || p.monthlyRent === 0) return dep
  return `${dep} · 월 ${p.monthlyRent.toLocaleString()}만원`
}

/** 범위가 가리키는 지역 — '서울'을 눌렀는데 부산 공고가 보이면 범위가 거짓말이 된다 */
const SCOPE_PROVINCES: Record<MapScope, string[] | null> = {
  서울: ['서울'],
  수도권: ['서울', '경기', '인천'],
  전국: null,
}

/**
 * 카카오의 level 은 작을수록 확대이고, 한 단 오를 때마다 대략 두 배씩 넓어진다.
 * 7 은 가로 1km 남짓 — 서울 도심 몇 블록이다. 처음에 이 값을 "서울"로 잡았더니
 * 지도 범위가 37.53~37.59 로 잡혀, 의정부·시흥·양주에 있는 공고가 전부 화면
 * 밖으로 나갔다. 표시는 102개 다 만들어졌는데 하나도 안 보였던 이유다.
 *
 *   9 ≈ 4km    서울 전역
 *  11 ≈ 16km   수도권
 *  13 ≈ 64km   전국
 */
const LEVEL: Record<MapScope, number> = { 서울: 9, 수도권: 11, 전국: 13 }

export default function NoticeMap() {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoNS>(null)
  /** 마지막으로 화면을 맞춘 범위. 같은 범위로 두 번 움직이지 않으려고 둔다 */
  const framedRef = useRef<MapScope | null>(null)
  const overlaysRef = useRef<KakaoNS[]>([])

  /**
   * 기본 범위.
   *
   * '서울'로 두었더니 빈 지도가 열렸다 — 지금 접수 중인 서울 공식 공고가 0건이다.
   * 처음 본 화면이 비어 있으면 서비스에 공고가 없다고 읽힌다. 공고가 있는 데서 연다.
   */
  const [scope, setScope] = useState<MapScope>('수도권')
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  /** 지금 화면에 들어온 공고 — 지도를 움직이면 따라 바뀐다 */
  const [visible, setVisible] = useState<Pin[]>([])
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/notices/map', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('공고를 불러오지 못했어요.'))))
      .then(json => {
        if (!alive) return
        if (json.error) setError(json.error)
        else setData(json)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : '공고를 불러오지 못했어요.')
      })
    return () => {
      alive = false
    }
  }, [])

  /** 고른 범위의 공고 수 — 비어 있을 때 이유를 말하는 데 쓴다 */
  const scopeCount = data
    ? (SCOPE_PROVINCES[scope]
        ? data.pins.filter(p => SCOPE_PROVINCES[scope]!.includes(p.province))
        : data.pins
      ).length
    : 0

  /** 그 범위에 실제로 있는 공고 */
  const pinsInScope = (pins: Pin[]) => {
    const allow = SCOPE_PROVINCES[scope]
    return allow ? pins.filter(p => allow.includes(p.province)) : pins
  }

  /** 주어진 공고를 한 화면에 담는다. 담을 게 없으면 범위의 기본 자리로 */
  const frame = (kakao: KakaoNS, map: KakaoNS, pins: Pin[], animate: boolean) => {
    const s = MAP_SCOPE[scope]
    if (pins.length === 0) {
      const c = new kakao.maps.LatLng(s.center.lat, s.center.lng)
      map.setLevel(LEVEL[scope])
      if (animate) map.panTo(c)
      else map.setCenter(c)
      return
    }
    const box = new kakao.maps.LatLngBounds()
    pins.forEach(p => box.extend(new kakao.maps.LatLng(p.lat, p.lng)))
    map.setBounds(box, 32, 32, 32, 32)
  }

  /**
   * 지도를 세운다 — **공고가 도착한 뒤에.**
   *
   * 예전에는 서울로 먼저 띄우고 400ms 뒤 공고가 있는 데로 옮겼다. 화면이 한 번
   * 잡혔다가 곧바로 튀어 눈이 끊겼다. 사용자는 자기가 만지지도 않았는데 지도가
   * 움직이면 그것을 오작동으로 읽는다.
   *
   * 지도는 한 번만 그린다. 그릴 때 이미 맞는 자리에 있으면 옮길 일이 없다.
   */
  useEffect(() => {
    let alive = true
    if (!data) return
    loadKakao()
      .then(kakao => {
        if (!alive || !host.current || mapRef.current) return
        const s = MAP_SCOPE[scope]
        const map = new kakao.maps.Map(host.current, {
          center: new kakao.maps.LatLng(s.center.lat, s.center.lng),
          level: LEVEL[scope],
        })
        mapRef.current = map
        // 첫 화면을 여기서 정한다. 그린 뒤에는 옮기지 않는다.
        frame(kakao, map, pinsInScope(data.pins), false)
        framedRef.current = scope
        setReady(true)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
    // scope 는 아래 효과가 맡는다 — 지도를 다시 만들지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  /**
   * 범위를 누르면 옮긴다. 이건 사용자가 시킨 움직임이라 부드럽게 따라가도 된다.
   * 첫 그림이 이미 자리를 잡았으므로 지도가 저절로 움직이는 곳은 여기뿐이다.
   */
  useEffect(() => {
    const w = window as unknown as { kakao?: KakaoNS }
    if (!ready || !mapRef.current || !data || !w.kakao?.maps) return
    // 첫 그림이 이미 이 범위로 잡혀 있으면 아무것도 하지 않는다
    if (framedRef.current === scope) return
    frame(w.kakao, mapRef.current, pinsInScope(data.pins), true)
    framedRef.current = scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, ready])

  // 표시를 그린다. 기본 핀 대신 지면의 글자꼴로 만든 표를 얹는다.
  useEffect(() => {
    const w = window as unknown as { kakao?: KakaoNS }
    if (!ready || !mapRef.current || !data || !w.kakao?.maps) return
    const kakao = w.kakao
    const map = mapRef.current

    overlaysRef.current.forEach(o => {
      try {
        o.setMap(null)
      } catch {
        /* 이미 떨어져 나간 표시 */
      }
    })
    overlaysRef.current = []

    // 표시는 HTML 문자열로 넘긴다. DOM 요소를 넘기면 React 가 다시 그릴 때
    // 그 요소가 바뀌어 지도 위에서 사라지는 일이 생긴다. 실패를 조용히
    // 삼키지 않고 한 번만 모아서 화면에 알린다 — 지난번에 표시가 하나도
    // 안 뜨는데 아무 말도 없어 원인을 찾는 데 오래 걸렸다.
    let failed = 0
    data.pins.forEach(pin => {
      const urgent = pin.daysLeft !== null && pin.daysLeft <= 3
      const approx = pin.coordSource !== 'GEOCODED'
      // 신호등. 급한 쪽이 붉고, 여유가 있으면 푸르다.
      // 색은 남은 날이 결정을 바꾸는 구간까지만 쓴다 — 여드레 넘게 남은 공고를
      // 물들여 봐야 화면만 시끄럽고 급한 것이 묻힌다.
      const dayClass =
        pin.daysLeft === null
          ? ''
          : pin.daysLeft === 0
            ? 'cs-pin--d0' // 오늘 마감 — 지금 넣지 않으면 끝난다
            : pin.daysLeft <= 3
              ? 'cs-pin--d1' // 사흘 안 — 서류를 챙길 시간이 빠듯하다
              : pin.daysLeft <= 7
                ? 'cs-pin--d2' // 한 주 안 — 준비하면 된다
                : ''
      const cls = [
        'cs-pin',
        `cs-pin--${pin.kind.toLowerCase()}`,
        urgent ? 'cs-pin--urgent' : '',
        dayClass,
        approx ? 'cs-pin--approx' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const label = dday(pin.daysLeft)
      const title = `${pin.name} · ${pin.province}`.replace(/"/g, '&quot;')

      try {
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(pin.lat, pin.lng),
          content: `<a class="${cls}" href="/notices/${pin.id}" title="${title}">${label}</a>`,
          yAnchor: 0.5,
          xAnchor: 0.5,
          clickable: true,
          zIndex: urgent ? 3 : pin.kind === 'SALE' ? 2 : 1,
        })
        ov.setMap(map)
        overlaysRef.current.push(ov)
      } catch {
        failed++
      }
    })
    if (failed > 0 && failed === data.pins.length) {
      // 효과 안에서 곧바로 상태를 바꾸면 그리기가 한 번 더 돈다. 한 박자 뒤로 미룬다.
      queueMicrotask(() => setError('지도에 공고를 표시하지 못했습니다. 잠시 뒤 새로고침해 주세요.'))
    }

    // 지도를 움직이면 옆 목록이 따라온다. 보이는 것과 읽는 것을 어긋나게 두지 않는다.
    const sync = () => {
      const b = map.getBounds()
      if (!b) return
      const sw = b.getSouthWest()
      const ne = b.getNorthEast()
      const inView = data.pins.filter(
        p =>
          p.lat >= sw.getLat() &&
          p.lat <= ne.getLat() &&
          p.lng >= sw.getLng() &&
          p.lng <= ne.getLng(),
      )
      inView.sort((a, z) => (a.daysLeft ?? 9999) - (z.daysLeft ?? 9999))
      setVisible(inView)
    }
    sync()
    // 처음 그릴 때 bounds 가 아직 0 인 순간이 있어 한 박자 뒤 다시 센다.
    // 화면은 건드리지 않고 옆 목록만 맞춘다 — 저절로 움직이는 지도를 만들지 않는다.
    const settle = setTimeout(sync, 300)
    kakao.maps.event.addListener(map, 'idle', sync)

    return () => {
      clearTimeout(settle)
      try {
        kakao.maps.event.removeListener(map, 'idle', sync)
      } catch {
        /* 떠나는 길에 난 예외로 다음 화면을 망치지 않는다 */
      }
      overlaysRef.current.forEach(o => {
        try {
          o.setMap(null)
        } catch {
          /* 같은 이유 */
        }
      })
      overlaysRef.current = []
    }
    // scope 가 바뀌면 다시 맞출 기회를 준다
  }, [ready, data, scope])

  return (
    <section className="cs-wrap cs-section" id="map">
      <header>
        <h2 className="cs-section-title">지도로 보는 공고</h2>
        <p className="cs-sub" style={{ marginTop: 12, marginBottom: 22 }}>
          공고가 있는 곳부터 보여 드려요. 표시의 숫자는 접수 마감까지 남은 날이고, 붉은 쪽이 분양,
          푸른 쪽이 임대입니다. 지도를 움직이면 옆 목록이 보이는 범위의 공고로 바뀝니다.
        </p>
      </header>

      <div className="cs-map__bar">
        <PillChoice
          label="범위"
          value={scope}
          onChange={v => setScope(v as MapScope)}
          items={(Object.keys(MAP_SCOPE) as MapScope[]).map(k => {
            const allow = SCOPE_PROVINCES[k]
            const n = data
              ? allow
                ? data.pins.filter(p => allow.includes(p.province)).length
                : data.pins.length
              : undefined
            // 건수를 함께 적어 어디에 공고가 몰려 있는지 누르기 전에 보이게 한다
            return { value: k, label: k, count: n }
          })}
        />
        <div className="cs-map__legend" aria-hidden="true">
          <span className="cs-map__key">
            <i className="cs-pin cs-pin--sale cs-pin--chip" />
            분양
          </span>
          <span className="cs-map__key">
            <i className="cs-pin cs-pin--rent cs-pin--chip" />
            임대
          </span>
          <span className="cs-map__key">
            <i className="cs-pin cs-pin--rent cs-pin--approx cs-pin--chip" />
            지역 기준
          </span>

          {/* 색을 썼으면 무슨 뜻인지 적는다. 신호등이라도 밝혀 두는 편이 낫다 */}
          <span className="cs-map__days">
            <span className="cs-map__legend-day">
              <i className="cs-map__legend-dot" data-d="0" />
              오늘 마감
            </span>
            <span className="cs-map__legend-day">
              <i className="cs-map__legend-dot" data-d="1" />
              사흘 안
            </span>
            <span className="cs-map__legend-day">
              <i className="cs-map__legend-dot" data-d="2" />
              한 주 안
            </span>
          </span>
        </div>
      </div>

      <div className="cs-map">
        {error ? (
          <div className="cs-map__fallback">
            <span className="cs-vacancy__eyebrow">지도를 열지 못했습니다</span>
            <p className="cs-vacancy__title">{error}</p>
            <p className="cs-vacancy__desc">지도가 없어도 공고는 아래 목록에서 전부 보실 수 있어요.</p>
          </div>
        ) : (
          <div className="cs-map__canvas" ref={host} role="application" aria-label="공고 지도" />
        )}

        <aside className="cs-map__side" aria-label="보이는 범위의 공고">
          <div className="cs-map__side-head">
            <strong>보이는 범위의 공고</strong>
            <span className="cs-num">{visible.length}건</span>
          </div>
          {visible.length === 0 ? (
            <p className="cs-note" style={{ padding: '18px 16px' }}>
              {error
                ? '지도를 열지 못해 범위를 셀 수 없어요.'
                : scopeCount === 0
                  ? `지금 ${scope}에는 접수 중인 공고가 없어요. 다른 범위를 눌러 보세요.`
                  : '이 범위에는 표시된 공고가 없어요. 지도를 넓히거나 범위를 바꿔 보세요.'}
            </p>
          ) : (
            <ul className="cs-map__list">
              {visible.map(p => (
                <li key={p.id} data-hover={hovered === p.id} data-kind={p.kind.toLowerCase()}>
                  <Link
                    href={`/notices/${p.id}`}
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span
                      className="cs-map__dday"
                      data-d={
                        p.daysLeft === null
                          ? undefined
                          : p.daysLeft === 0
                            ? '0'
                            : p.daysLeft <= 3
                              ? '1'
                              : p.daysLeft <= 7
                                ? '2'
                                : undefined
                      }
                    >
                      {dday(p.daysLeft)}
                    </span>
                    <span className="cs-map__name">{p.name}</span>
                    <span className="cs-map__meta">
                      {p.province} · {p.housingType} · {priceLine(p)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {data && (
        <p className="cs-note" style={{ marginTop: 16 }}>
          지도에 표시된 공고 {data.pins.length}건
          {data.geocoded > 0 && ` · 주소로 정확히 찍은 공고 ${data.geocoded}건`}
          {data.noAddress > 0 &&
            ` · 주소가 없어 지역 기준으로 표시한 공고 ${data.noAddress}건(LH 목록에는 주소 칸이 없습니다)`}
          {data.noCoord > 0 && ` · 위치를 찾지 못한 공고 ${data.noCoord}건`}.{' '}
          <Link href="/notices" className="cs-btn cs-btn--text" style={{ padding: 0 }}>
            목록에서 전체 보기
          </Link>
        </p>
      )}
    </section>
  )
}
