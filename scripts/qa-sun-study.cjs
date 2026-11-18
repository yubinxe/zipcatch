/**
 * 해 그림자 연구 점검(headless WebGL) — 미리보기 가상 공고 fx-04(동네 타일 있음)로 돈다. 운영 DB 를 읽거나 쓰지 않는다.
 *   npm run build && VERCEL_ENV=preview npx next start -p 3000
 *   QA_OUT=/tmp/qa node scripts/qa-sun-study.cjs
 */
const { chromium } = require('playwright')
const OUT = process.env.QA_OUT || require('os').tmpdir()
const res = []
const ok = (n, c, d = '') => { res.push({ n, pass: !!c, d }); console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }
;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, acceptDownloads: true })
    await ctx.addCookies([{ name: 'zc_fixture', value: '1', domain: 'localhost', path: '/' }])
    const p = await ctx.newPage()
    const errs = []
    const T0 = Date.now()
    p.on('pageerror', e => errs.push(`${Date.now() - T0}ms ${e.message}`))
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|kakao|daumcdn/i.test(m.text())) errs.push(`${Date.now() - T0}ms ${m.text().slice(0, 200)}`) })
    await p.goto('http://localhost:3000/notices/fx-04?view=3d', { waitUntil: 'networkidle', timeout: 120000 })
    await p.waitForSelector('.zx-levels', { timeout: 60000 })
    const lv = await p.$('.zx-levels button:has-text("주변")')
    if ((await lv.getAttribute('aria-pressed')) !== 'true') await lv.click({ force: true })
    const t0 = Date.now()
    await p.waitForSelector('.zx-nb[data-live]', { timeout: 90000 }).catch(() => {})
    ok(`[${W}] 동네 3D 켜짐`, await p.$('.zx-nb[data-live]'), `${Date.now() - t0}ms`)
    // 솟는 등장 — 세 장
    for (const [i, ms] of [[0, 150], [1, 900], [2, 2600]]) {
      await p.waitForTimeout(i === 0 ? ms : ms - [150, 900, 2600][i - 1])
      await p.screenshot({ path: `${OUT}/${W}-rise-${i}.png` })
    }
    // 해 그림자 조작판
    if (W < 800 && !(await p.$('.zx-sun'))) await p.click('.zx-sun-pill').catch(() => {})
    await p.waitForSelector('.zx-sun', { timeout: 20000 }).catch(() => {})
    ok(`[${W}] 해 그림자 조작판`, await p.$('.zx-sun'))
    await p.click('.zx-sun__days button:has-text("동지")', { force: true })
    const setT = async v => {
      await p.$eval('.zx-sun__track input', (el, val) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        set.call(el, String(val))
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, v)
      await p.waitForTimeout(700)
    }
    const read = async () => (await p.textContent('.zx-sun__read')).replace(/\s+/g, ' ').trim()
    const ticks = await p.textContent('.zx-sun__ticks')
    ok(`[${W}] 동지 해돋이·해넘이(인천 검단)`, /07:4\d.*17:2\d|07:4\d.*17:1\d/.test(ticks.replace(/\s+/g, ' ')), ticks.replace(/\s+/g, ' '))
    for (const [lbl, v] of [['0830', 510], ['1230', 750], ['1600', 960]]) {
      await setT(v)
      await p.screenshot({ path: `${OUT}/${W}-winter-${lbl}.png` })
      ok(`[${W}] 동지 ${lbl} 읽기`, true, await read())
    }
    const sum = await p.textContent('.zx-sun__sum').catch(() => '')
    ok(`[${W}] 일조 띠 요약`, /직사광/.test(sum), sum.replace(/\s+/g, ' '))
    const ref = await p.$('.zx-sun__ref')
    ok(`[${W}] 동지 참고선 문구(판정 아님)`, W < 800 ? true : ref && (await ref.textContent()).includes('판정이 아닙니다'))
    // 하지 정오 — 그림자가 짧아진다
    await p.click('.zx-sun__days button:has-text("하지")', { force: true })
    await setT(750)
    await p.screenshot({ path: `${OUT}/${W}-summer-1230.png` })
    ok(`[${W}] 하지 12:30 고도 70° 이상`, /고도 7\d\.\d°/.test(await read()), await read())
    // 재생
    const tPlay = await p.textContent('.zx-sun__time')
    await p.click('.zx-sun__play')
    await p.waitForTimeout(2500)
    const tPlay2 = await p.textContent('.zx-sun__time')
    ok(`[${W}] 하루 재생 — 시각이 흐른다`, tPlay !== tPlay2, `${tPlay} → ${tPlay2}`)
    if (await p.$('.zx-sun__play[aria-label="멈춤"]')) await p.click('.zx-sun__play')
    // 이미지 저장
    if (W > 800) {
      const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null)
      await p.click('.zx-sun__icon[title*="이미지"]')
      const d = await dl
      if (d) {
        const f = `${OUT}/${W}-capture.png`
        await d.saveAs(f)
        const { size } = require('fs').statSync(f)
        ok(`[${W}] 장면 이미지 저장(1080×1350)`, size > 50000, `${(size / 1024).toFixed(0)}KB ${d.suggestedFilename()}`)
      } else ok(`[${W}] 장면 이미지 저장`, false, 'download 없음')
    }
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ok(`[${W}] 가로 넘침 0`, over <= 0, `${over}`)
    ok(`[${W}] 페이지 오류 0`, errs.length === 0, errs.slice(0, 3).join(' | '))
    await ctx.close()
  }
  // 움직임 줄이기 — 재생·영상 단추 없음, 등장 없이 완성된 모습
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await ctx.addCookies([{ name: 'zc_fixture', value: '1', domain: 'localhost', path: '/' }])
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000/notices/fx-04?view=3d', { waitUntil: 'networkidle' })
  await p.waitForSelector('.zx-levels')
  await p.click('.zx-levels button:has-text("주변")')
  await p.waitForSelector('.zx-sun', { timeout: 90000 }).catch(() => {})
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/reduced.png` })
  ok('움직임 줄이기: 재생 단추 없음', !(await p.$('.zx-sun__play')))
  await b.close()
  require('fs').writeFileSync(`${OUT}/results.json`, JSON.stringify(res, null, 1))
  console.log(`${res.filter(r => r.pass).length}/${res.length} PASS`)
})()
