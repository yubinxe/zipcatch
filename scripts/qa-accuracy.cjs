/**
 * 정확도 점검(headless) — 정정·재공고 정리, 역세권 패널, 비교 행, 주요 화면의 가로 넘침·페이지 오류.
 *
 * 미리보기 픽스처(가상 공고)로 돈다. 운영 DB 를 읽거나 쓰지 않는다.
 *   npm run build && VERCEL_ENV=preview npx next start -p 3000
 *   QA_OUT=/tmp/qa node scripts/qa-accuracy.cjs
 * 결과: QA_OUT 아래 스크린샷과 qa-results.json. 하나라도 실패하면 종료 코드 1.
 */
const { chromium } = require('playwright')
const OUT = process.env.QA_OUT || require('os').tmpdir()
const BASE = process.env.QA_BASE || 'http://localhost:3000'
const results = []
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

;(async () => {
  const b = await chromium.launch()
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H } })
    await ctx.addCookies([{ name: 'zc_fixture', value: '1', domain: 'localhost', path: '/' }])
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(`pageerror ${e.message}`))
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|kakao|daumcdn|favicon/i.test(m.text())) errs.push(`console ${m.text().slice(0, 160)}`) })
    const visit = async (path, waitFor) => {
      errs.length = 0
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 120000 })
      if (waitFor) await page.waitForSelector(waitFor, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(800)
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      ok(`[${W}] ${path} 가로 넘침 0`, over <= 0, `${over}px`)
      ok(`[${W}] ${path} 페이지 오류 0`, errs.length === 0, errs.slice(0, 3).join(' | '))
    }
    const shot = async name => page.screenshot({ path: `${OUT}/${W}-${name}.png`, fullPage: false })

    // 1) 목록 — 정정 전 원공고·이전 회차가 따로 서지 않는다
    await visit('/notices', 'a[href^="/notices/fx-"]')
    const hrefs = await page.$$eval('a[href^="/notices/fx-"]', as => [...new Set(as.map(a => a.getAttribute('href')))])
    ok(`[${W}] 목록: 정정공고(fx-17) 보임`, hrefs.includes('/notices/fx-17'), hrefs.join(','))
    ok(`[${W}] 목록: 정정 전 원공고(fx-02) 숨김`, !hrefs.includes('/notices/fx-02'))
    ok(`[${W}] 목록: 이전 회차(fx-18) 숨김, 최근 회차(fx-14) 보임`, !hrefs.includes('/notices/fx-18') && hrefs.includes('/notices/fx-14'))
    await shot('notices')

    // 2) 가려진 원공고를 링크로 열면 정정공고를 먼저 안내하고, 누르면 그쪽으로 간다
    await visit('/notices/fx-02', '.cs-sa-lineage')
    const banner = await page.textContent('.cs-sa-lineage').catch(() => null)
    ok(`[${W}] 원공고 상세: 정정공고 안내`, banner && banner.includes('정정공고가 있습니다'), banner?.trim().slice(0, 60))
    await page.locator('.cs-sa-lineage').scrollIntoViewIfNeeded()
    await shot('detail-superseded')
    await page.click('.cs-sa-lineage__go')
    await page.waitForURL('**/notices/fx-17', { timeout: 30000 }).catch(() => {})
    ok(`[${W}] 안내 단추 → 정정공고로 이동`, page.url().endsWith('/notices/fx-17'), page.url())
    await page.waitForSelector('.cs-sa-lineage', { timeout: 30000 }).catch(() => {})
    const back = await page.textContent('.cs-sa-lineage').catch(() => null)
    ok(`[${W}] 정정공고 상세: 원공고를 대신한다고 밝힘`, back && back.includes('정정공고입니다'), back?.trim().slice(0, 60))

    // 3) 역세권 — 주소 좌표 공고는 역·노선·직선거리, 위치 미확인 공고는 산정 제외 사유
    await visit('/notices/fx-01', '.tx-list, .tx-msg')
    await page.waitForSelector('.tx-list', { timeout: 30000 }).catch(() => {})
    const tx = await page.textContent('.tx').catch(() => '')
    ok(`[${W}] 역세권: 가장 가까운 역·노선`, tx.includes('마포구청역') && tx.includes('6호선'), tx.replace(/\s+/g, ' ').slice(0, 90))
    ok(`[${W}] 역세권: 직선거리임을 밝힘`, tx.includes('직선거리 추정') && tx.includes('보행 시간이나 실제 도보 거리가 아닙니다'))
    ok(`[${W}] 역세권: 가격 보정 계수 비노출`, !/1\.2|1\.17|프리미엄|가산/.test(tx))
    await page.locator('.tx').scrollIntoViewIfNeeded()
    await shot('detail-transit')

    await visit('/notices/fx-07', '.tx-msg')
    await page.waitForFunction(() => { const m = document.querySelector('.tx-msg'); return m && !m.textContent.includes('확인하는 중') }, null, { timeout: 30000 }).catch(() => {})
    const tx2 = await page.textContent('.tx').catch(() => '')
    ok(`[${W}] 역세권: 위치 미확인 공고는 거리 산정 제외`, tx2.includes('정확한 주거지 위치가 확인되지 않아'), tx2.replace(/\s+/g, ' ').slice(0, 80))
    ok(`[${W}] 역세권: 위치 미확인 공고에 0m 없음`, !/\b0m\b/.test(tx2))

    // 4) 비교 — 가까운 역 행
    await visit('/compare?ids=fx-01,fx-14,fx-07', 'table, .cs-cmp')
    await page.waitForFunction(() => document.body.innerText.includes('가까운 역') && !document.body.innerText.includes('확인 중'), null, { timeout: 30000 }).catch(() => {})
    const body = await page.evaluate(() => document.body.innerText)
    ok(`[${W}] 비교: 가까운 역 행`, body.includes('가까운 역') && body.includes('마포구청역'))
    ok(`[${W}] 비교: 위치 미확인은 '주소 미확인(산정 제외)'`, body.includes('주소 미확인(산정 제외)'))
    await shot('compare')

    // 5) 지도·홈 — 깨지지 않는다
    await visit('/map')
    await shot('map')
    await visit('/')
    await shot('home')
    await ctx.close()
  }
  await b.close()
  require('fs').writeFileSync(`${OUT}/qa-results.json`, JSON.stringify(results, null, 1))
  const fail = results.filter(r => !r.pass)
  console.log(`\n${results.length - fail.length}/${results.length} PASS`)
  process.exit(fail.length ? 1 : 0)
})()
