/**
 * 출품 전 검수 — 사람이 한 화면씩 열어 보는 대신 기계가 먼저 훑는다.
 *
 *   node scripts/audit.mjs
 *   node scripts/audit.mjs --from=https://zipcatch.vercel.app
 *   node scripts/audit.mjs --passcode=접속코드      (운영 화면까지)
 *
 * ── 무엇을 보나 ──
 *
 * 눈으로 봐서는 잘 안 걸리고, 걸렸을 때 창피한 것들만 고른다.
 *
 *  1) 콘솔 오류·페이지 예외·실패한 요청      — 깨진 줄도 모르고 있던 것
 *  2) 가로 스크롤                            — 휴대폰에서 화면이 옆으로 밀린다
 *  3) 화면 밖으로 삐져나간 요소              — 어느 요소가 밀어내는지까지 짚는다
 *  4) 본문 없는 화면 / h1 없는 화면          — 읽는 기계와 사람 모두에게 나쁘다
 *  5) 겹친 id, 빈 링크, alt 없는 이미지      — 접근성
 *  6) 너무 작은 누름 자리                    — 손가락으로 못 누른다
 *  7) '준비 중'·'TODO' 같은 미완 문구        — 출품 화면에 남아 있으면 안 된다
 *
 * ── 이미지 깨짐을 어떻게 재나 ──
 *
 * naturalWidth === 0 으로 재면 안 된다. 크기가 박히지 않은 SVG 는 멀쩡해도
 * 0 이 나온다. 실제로 이걸로 멀쩡한 지자체 상징 27개를 '깨졌다'고 보고한
 * 적이 있다. 그래서 여기서는 **응답 코드**로만 판단한다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

const ORIGIN = (arg('from') ?? 'http://localhost:3000').replace(/\/$/, '')
const PASSCODE = arg('passcode') ?? ''

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p))

const ROUTES = [
  { path: '/', name: '홈' },
  { path: '/notices', name: '공고 찾기', wait: '.cs-notice' },
  { path: '/map', name: '지도', wait: 'a.cs-pin' },
  { path: '/analyze', name: '조건 입력' },
  { path: '/stats', name: '경쟁률·통계', wait: '.cs-heatcard' },
  { path: '/pro', name: '공급 판독', wait: '.cs-read__block' },
  { path: '/biz', name: '사업성 판독', wait: '.cs-mk__row' },
  { path: '/guide', name: '청약 가이드' },
  { path: '/score', name: '가점 계산' },
  { path: '/saved', name: '관심공고' },
  { path: '/news', name: '청약뉴스' },
  { path: '/login', name: '로그인' },
  { path: '/admin/dashboard', name: '운영 · 종합현황', admin: true },
  { path: '/admin/routines', name: '운영 · 루틴', admin: true },
  { path: '/admin/customers', name: '운영 · 고객', admin: true },
  { path: '/admin/properties', name: '운영 · 물건', admin: true },
]

const VIEWPORTS = [
  { label: '휴대폰', width: 390, height: 844, mobile: true },
  { label: '태블릿', width: 768, height: 1024, mobile: false },
  { label: '데스크톱', width: 1440, height: 900, mobile: false },
]

/** 출품 화면에 남아 있으면 안 되는 말 */
const UNFINISHED = /\b(TODO|FIXME|lorem ipsum|undefined|NaN|\[object Object\])\b/i

/** 페이지 안에서 재는 것들 — 브라우저 쪽에서 돈다 */
function inspect() {
  const out = {
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    overflowing: [],
    dupIds: [],
    emptyLinks: [],
    noAlt: [],
    smallTargets: [],
    h1: document.querySelectorAll('h1').length,
    main: !!document.querySelector('main'),
    title: document.title,
    textFlags: [],
  }

  const vw = document.documentElement.clientWidth
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    // 가로로 삐져나간 것. 화면 밖으로 일부러 밀어 둔 장식은 뺀다.
    if (r.right > vw + 1 || r.left < -1) {
      const cs = getComputedStyle(el)
      if (cs.position === 'fixed' || cs.overflow === 'hidden') continue
      // 가로 스크롤을 스스로 가진 상자 안쪽은 정상이다
      let scroller = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pcs = getComputedStyle(p)
        if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') {
          scroller = true
          break
        }
      }
      if (scroller) continue
      out.overflowing.push(
        `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} → ${Math.round(r.right)}px`,
      )
    }
  }
  out.overflowing = [...new Set(out.overflowing)].slice(0, 6)

  const seen = new Set()
  for (const el of document.querySelectorAll('[id]')) {
    if (seen.has(el.id)) out.dupIds.push(el.id)
    seen.add(el.id)
  }
  out.dupIds = [...new Set(out.dupIds)].slice(0, 6)

  for (const a of document.querySelectorAll('a')) {
    const label = (a.textContent || '').trim() || a.getAttribute('aria-label') || a.title
    if (!label) out.emptyLinks.push(a.getAttribute('href') || '(href 없음)')
  }
  out.emptyLinks = [...new Set(out.emptyLinks)].slice(0, 6)

  for (const img of document.querySelectorAll('img')) {
    if (img.getAttribute('alt') === null && img.getAttribute('aria-hidden') !== 'true') {
      out.noAlt.push(img.getAttribute('src') || '(src 없음)')
    }
  }
  out.noAlt = [...new Set(out.noAlt)].slice(0, 6)

  // WCAG 2.2 의 최소 누름 자리는 24x24 다. 그보다 작은 것만 짚는다 —
  // 44px 을 일괄로 밀어붙이면 조밀한 표와 그래프가 다 벌어진다.
  if (window.innerWidth < 768) {
    for (const el of document.querySelectorAll('button, a, [role="button"], input, select')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 24 || r.width < 24) {
        const label = (el.textContent || '').trim().slice(0, 14) || el.tagName.toLowerCase()
        out.smallTargets.push(`${label} (${Math.round(r.width)}×${Math.round(r.height)})`)
      }
    }
    out.smallTargets = [...new Set(out.smallTargets)].slice(0, 8)
  }

  const body = document.body.innerText
  for (const m of body.matchAll(/\b(TODO|FIXME|undefined|NaN|\[object Object\])\b/g)) {
    out.textFlags.push(m[1])
  }
  out.textFlags = [...new Set(out.textFlags)]

  return out
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!CHROME) throw new Error('크롬·엣지를 찾지 못했습니다.')

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()

  let adminOk = false
  if (PASSCODE) {
    await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
    adminOk = await page.evaluate(async code => {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      })
      return r.ok
    }, PASSCODE)
  }

  const problems = []
  const note = (where, what) => problems.push(`${where} — ${what}`)

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.mobile })
    console.log(`\n══ ${vp.label} ${vp.width}px ${'═'.repeat(30)}`)

    for (const route of ROUTES) {
      if (route.admin && !adminOk) continue
      const where = `${vp.label} ${route.name}`

      const errors = []
      const failed = []
      const onConsole = m => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 160))
      }
      const onPageError = e => errors.push(`예외: ${String(e.message).slice(0, 160)}`)
      const onResponse = r => {
        if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(ORIGIN, '').slice(0, 80)}`)
      }
      page.on('console', onConsole)
      page.on('pageerror', onPageError)
      page.on('response', onResponse)

      let res = null
      try {
        res = await page.goto(`${ORIGIN}${route.path}`, {
          waitUntil: 'networkidle2',
          timeout: 45000,
        })
        if (route.wait) {
          await page.waitForSelector(route.wait, { timeout: 25000 }).catch(() => {
            note(where, `표식(${route.wait})이 끝내 안 나타남 — 비어 보일 수 있음`)
          })
        }
        await sleep(700)
      } catch (err) {
        note(where, `열지 못함: ${String(err.message).split('\n')[0]}`)
      }

      let r = null
      if (res) {
        if (res.status() >= 400) note(where, `HTTP ${res.status()}`)
        r = await page.evaluate(inspect).catch(() => null)
      }

      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('response', onResponse)

      const marks = []
      if (errors.length) {
        note(where, `콘솔 오류 ${errors.length}건 — ${errors[0]}`)
        marks.push('오류')
      }
      if (failed.length) {
        note(where, `실패한 요청 — ${[...new Set(failed)].slice(0, 3).join(' · ')}`)
        marks.push('요청실패')
      }
      if (r) {
        if (r.scrollW > r.clientW + 1) {
          note(where, `가로 스크롤 ${r.scrollW}px > ${r.clientW}px${r.overflowing.length ? ` · 범인 후보 ${r.overflowing.join(', ')}` : ''}`)
          marks.push('가로넘침')
        }
        if (!r.main) {
          note(where, 'main 요소가 없음')
          marks.push('main없음')
        }
        if (r.h1 === 0) {
          note(where, 'h1 이 없음')
          marks.push('h1없음')
        }
        if (r.h1 > 1) {
          note(where, `h1 이 ${r.h1}개`)
          marks.push('h1중복')
        }
        if (r.dupIds.length) {
          note(where, `겹친 id — ${r.dupIds.join(', ')}`)
          marks.push('id중복')
        }
        if (r.emptyLinks.length) {
          note(where, `이름 없는 링크 — ${r.emptyLinks.join(', ')}`)
          marks.push('빈링크')
        }
        if (r.noAlt.length) {
          note(where, `alt 없는 이미지 — ${r.noAlt.join(', ')}`)
          marks.push('alt없음')
        }
        if (r.smallTargets.length) {
          note(where, `누르기 작은 자리 — ${r.smallTargets.join(', ')}`)
          marks.push('작은버튼')
        }
        if (r.textFlags.length) {
          note(where, `화면에 남은 말 — ${r.textFlags.join(', ')}`)
          marks.push('미완문구')
        }
        if (!r.title || UNFINISHED.test(r.title)) {
          note(where, `제목이 이상함 — "${r.title}"`)
          marks.push('제목')
        }
      }

      console.log(`  ${marks.length ? '✗' : '·'} ${route.name.padEnd(14)} ${marks.join(' ') || 'ok'}`)
    }
  }

  await browser.close()

  console.log(`\n${'═'.repeat(50)}`)
  if (problems.length === 0) {
    console.log('걸린 것 없음.')
  } else {
    console.log(`걸린 것 ${problems.length}건\n`)
    for (const p of problems) console.log(' · ' + p)
  }
  if (!adminOk) console.log('\n※ 운영 화면은 접속 코드를 주지 않아 건너뛰었습니다.')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
