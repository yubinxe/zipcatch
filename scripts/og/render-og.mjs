/**
 * 링크 미리보기 그림(app/opengraph-image.jpg)을 만든다.
 *
 * satori(next/og)는 flexbox 와 일부 CSS 만 알아듣는다. 원근으로 눕힌 지도,
 * 번지는 빛, 유리 같은 카드는 그릴 수 없다. 그래서 실제 브라우저(Chrome)로
 * 한 장을 찍어 정적 파일로 싣는다. 문구나 그림을 바꾸면 다시 찍는다:
 *
 *   node scripts/og/render-og.mjs
 *
 * 지도는 화면의 지도와 같은 @svg-maps/south-korea 경로를 쓴다.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(join(ROOT, 'package.json'))
const puppeteer = require('puppeteer-core')
const mapMod = require('@svg-maps/south-korea')
const map = mapMod.default ?? mapMod
const { svgPathBbox } = require('svg-path-bbox')

/** components/consumer/BrandMark.tsx 와 같은 마크. square 면 모서리를 깎지 않는다(iOS 가 깎는다) */
const mark = (size, { square = false } = {}) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9248"/><stop offset="1" stop-color="#C2410C"/></linearGradient>
  <linearGradient id="mh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <rect width="32" height="32" rx="${square ? 0 : 9}" fill="url(#mg)"/><rect width="32" height="32" rx="${square ? 0 : 9}" fill="url(#mh)"/>
  <ellipse cx="16" cy="25.2" rx="8.2" ry="2.3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>
  <path d="M16 5.2c-4.2 0-7.5 3.2-7.5 7.3 0 5.2 6 11 6.9 11.8.35.32.85.32 1.2 0 .9-.8 6.9-6.6 6.9-11.8 0-4.1-3.3-7.3-7.5-7.3Z" fill="#fff"/>
  <circle cx="16" cy="12.5" r="2.9" fill="#C2410C"/></svg>`

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const font = readFileSync(join(ROOT, 'app/fonts/PretendardVariable.woff2')).toString('base64')

/** 빛을 둘러 세울 지역 — 공고가 자주 열리는 수도권·영남과 섬 하나 */
const GLOW = new Set(['seoul', 'gyeonggi', 'incheon', 'busan', 'south-gyeongsang'])
/** 빛기둥이 서는 자리 */
const PINS = ['seoul', 'busan', 'gwangju', 'daejeon', 'daegu']

const center = id => {
  const loc = map.locations.find(l => l.id === id)
  const [x0, y0, x1, y1] = svgPathBbox(loc.path)
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}

const land = map.locations
  .map(l => `<path d="${l.path}" class="land${GLOW.has(l.id) ? ' glow' : ''}"/>`)
  .join('')

/* 도시의 불빛 — 지역마다 정해진 자리에 흩뿌린다(난수 없이, 매번 같은 그림) */
const lights = map.locations
  .flatMap((l, i) => {
    const [x0, y0, x1, y1] = svgPathBbox(l.path)
    return Array.from({ length: GLOW.has(l.id) ? 14 : 6 }, (_, k) => {
      const t = (k * 0.618 + i * 0.37) % 1
      const u = (k * 0.382 + i * 0.71) % 1
      const x = x0 + (x1 - x0) * (0.2 + 0.6 * t)
      const y = y0 + (y1 - y0) * (0.2 + 0.6 * u)
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.9 + (k % 3) * 0.5).toFixed(1)}" class="lt"/>`
    })
  })
  .join('')

const pins = PINS.map((id, i) => {
  const { x, y } = center(id)
  const main = i === 0
  return `<g class="pin${main ? ' main' : ''}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <ellipse rx="${main ? 34 : 18}" ry="${main ? 34 : 18}" class="ring r3"/>
    <ellipse rx="${main ? 21 : 11}" ry="${main ? 21 : 11}" class="ring r2"/>
    <circle r="${main ? 6.5 : 4}" class="core"/>
  </g>`
}).join('')

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: P; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: #070A10; }
body { font-family: P, sans-serif; color: #fff; position: relative; -webkit-font-smoothing: antialiased; }

/* 밤하늘 — 위는 남색, 아래로 갈수록 도시의 주황이 번진다 */
.sky { position: absolute; inset: 0;
  background:
    radial-gradient(900px 520px at 78% 112%, rgba(255,122,48,.30), transparent 62%),
    radial-gradient(620px 420px at 70% 40%, rgba(46,84,160,.22), transparent 70%),
    linear-gradient(180deg, #0B1020 0%, #080B13 55%, #0A0C12 100%); }

/* 눕힌 지도 — 비행기에서 내려다본 각도 */
.stage { position: absolute; left: 470px; top: -150px; width: 820px; height: 980px; perspective: 1100px; }
.tilt { width: 100%; height: 100%; transform: rotateX(54deg) rotateZ(-14deg) translateY(30px); transform-origin: 50% 60%; }
.tilt svg { width: 100%; height: 100%; overflow: visible; }
.land { fill: #111827; stroke: rgba(148,163,184,.22); stroke-width: .8; }
.land.glow { fill: #1A1F2B; stroke: #FF8A3D; stroke-width: 1.6;
  filter: drop-shadow(0 0 3px rgba(255,138,61,.95)) drop-shadow(0 0 14px rgba(255,110,40,.7)); }
.grid line { stroke: rgba(148,163,184,.07); stroke-width: .6; }
.lt { fill: #FFC58A; opacity: .85; filter: drop-shadow(0 0 2px rgba(255,170,90,.9)); }
.ring { fill: none; stroke: #FF9B52; }
.r2 { stroke-width: 1.4; opacity: .75; }
.r3 { stroke-width: 1; opacity: .4; }
.core { fill: #FFE2C4; filter: drop-shadow(0 0 4px #FF9B52) drop-shadow(0 0 12px #FF7A30); }
.pin.main .core { fill: #fff; }

/* 빛기둥 — 지도 위로 곧게 선다 (눕힌 면 바깥에 따로 그린다) */
.beam { position: absolute; width: 3px; border-radius: 2px; background: linear-gradient(0deg, #FFE2C4 0%, rgba(255,155,82,.85) 35%, rgba(255,138,61,0) 100%);
  box-shadow: 0 0 14px 3px rgba(255,120,48,.45); }

/* 떠 있는 유리 카드 */
.card { position: absolute; border-radius: 14px; padding: 16px 18px;
  background: linear-gradient(160deg, rgba(255,255,255,.13), rgba(255,255,255,.04));
  border: 1px solid rgba(255,255,255,.16);
  box-shadow: 0 24px 60px -20px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.12);
  backdrop-filter: blur(14px); }
.card small { display: block; font-size: 13px; font-weight: 600; letter-spacing: .02em; color: rgba(255,255,255,.62); }
.card b { display: block; font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin-top: 4px; }
.card b em { font-style: normal; color: #FFB27A; }
.bars { display: flex; align-items: flex-end; gap: 6px; height: 46px; margin-top: 12px; }
.bars i { width: 12px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #FFB27A, rgba(255,138,61,.35)); }
.bars i:nth-child(odd) { background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.12)); }
.dot { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #FFE2C4; box-shadow: 0 0 10px 2px rgba(255,138,61,.9); }
.line { position: absolute; height: 1px; background: linear-gradient(90deg, rgba(255,155,82,0), rgba(255,155,82,.9)); transform-origin: 0 50%; filter: drop-shadow(0 0 4px rgba(255,138,61,.8)); }

/* 글이 앉는 왼쪽은 어둡게 눌러 읽히게 한다 */
.veil { position: absolute; inset: 0; background: linear-gradient(90deg, #070A10 0%, rgba(7,10,16,.94) 34%, rgba(7,10,16,.55) 52%, rgba(7,10,16,0) 70%); }

.copy { position: absolute; left: 76px; top: 0; bottom: 0; width: 640px; display: flex; flex-direction: column; justify-content: center; }
.brand { display: flex; align-items: center; gap: 12px; font-size: 26px; font-weight: 800; letter-spacing: -.03em; }
.mark { display: block; width: 46px; height: 46px; border-radius: 12px; box-shadow: 0 12px 32px -10px rgba(255,110,40,.85); }
.mark svg { display: block; }
.eyebrow { margin-top: 46px; font-size: 15px; font-weight: 700; letter-spacing: .22em; color: rgba(255,255,255,.5); }
h1 { margin-top: 16px; font-size: 74px; line-height: 1.1; font-weight: 800; letter-spacing: -.045em; }
h1 em { font-style: normal; color: #FFB27A; text-shadow: 0 0 34px rgba(255,138,61,.55); }
.sub { margin-top: 24px; font-size: 25px; font-weight: 500; line-height: 1.5; letter-spacing: -.02em; color: rgba(255,255,255,.72); }
.foot { margin-top: 40px; display: flex; align-items: center; gap: 14px; font-size: 17px; font-weight: 600; color: rgba(255,255,255,.55); }
.foot i { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.35); }
.cta { display: inline-flex; align-items: center; gap: 10px; height: 48px; padding: 0 22px; border-radius: 6px; background: #C2410C; color: #fff; font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
</style></head><body>
<div class="sky"></div>
<div class="stage"><div class="tilt"><svg viewBox="${map.viewBox}" xmlns="http://www.w3.org/2000/svg">
  <g class="grid">${Array.from({ length: 15 }, (_, i) => `<line x1="${-200 + i * 64}" y1="-200" x2="${-200 + i * 64}" y2="900"/><line x1="-200" y1="${-200 + i * 64}" x2="800" y2="${-200 + i * 64}"/>`).join('')}</g>
  ${land}${lights}${pins}
</svg></div></div>


<div class="card" id="c1" style="left:952px; top:40px; width:204px">
  <small>지금 열려 있는 공고</small>
  <b>지도로 <em>한눈에</em></b>
  <div class="bars"><i style="height:40%"></i><i style="height:72%"></i><i style="height:55%"></i><i style="height:100%"></i><i style="height:66%"></i><i style="height:84%"></i><i style="height:48%"></i><i style="height:92%"></i></div>
</div>
<div class="card" id="c2" style="left:1000px; top:250px; width:172px">
  <small>마감 임박</small>
  <b><em>D-day</em> 알림</b>
</div>

<div class="veil"></div>

<div class="copy">
  <div class="brand"><span class="mark">${mark(46)}</span>집캐치</div>
  <div class="eyebrow">청약 · 공공임대 · ZIPCATCH</div>
  <h1>내 첫 집,<br>감이 아니라 <em>근거</em>로.</h1>
  <p class="sub">청약홈·LH 실제 모집공고를<br>지도와 숫자로, 내 조건에 맞게.</p>
  <div class="foot"><span class="cta">내 조건으로 집 찾기 →</span><span>가입 없이 바로</span></div>
</div>
</body></html>`

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
/* 눕힌 지도 위 핀의 화면 자리를 재서, 그 자리에 빛기둥을 세우고 카드까지 선을 긋는다 */
await page.evaluate(() => {
  const at = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
  const cores = [...document.querySelectorAll('.pin .core')].map(at)
  const add = (cls, css) => { const d = document.createElement('div'); d.className = cls; Object.assign(d.style, css); document.body.insertBefore(d, document.querySelector('.veil')); return d }
  const beam = (p, h, o = 1) => { add('beam', { left: p.x - 1 + 'px', top: p.y - h + 'px', height: h + 'px', opacity: o }); return { x: p.x, y: p.y - h } }
  const link = (a, card, side) => {
    const r = card.getBoundingClientRect()
    const b = { x: side === 'left' ? r.left : r.left + 24, y: side === 'left' ? r.top + r.height / 2 : r.bottom }
    const dx = b.x - a.x, dy = b.y - a.y
    add('line', { left: a.x + 'px', top: a.y + 'px', width: Math.hypot(dx, dy) + 'px', transform: 'rotate(' + Math.atan2(dy, dx) + 'rad)' })
    add('dot', { left: a.x - 3 + 'px', top: a.y - 3 + 'px' })
  }
  const [seoul, busan, gwangju, daejeon, daegu] = cores
  link(beam(seoul, 120), document.getElementById('c1'), 'left')
  link(beam(busan, 96), document.getElementById('c2'), 'bottom')
  beam(daejeon, 60, .7); beam(daegu, 52, .6); beam(gwangju, 44, .55)
})
// app/opengraph-image.jpg — Next 가 og:image 와 크기·형식 메타를 알아서 붙인다
const out = join(ROOT, 'app/opengraph-image.jpg')
await page.screenshot({ path: out, type: 'jpeg', quality: 92 })

// 공고별 미리보기(notices/[id]/opengraph-image.tsx)의 바탕 — 글과 카드를 걷어낸 같은 밤.
// satori 는 원근·번짐을 못 그리므로 바탕만 사진처럼 깔고 글은 그 위에 얹는다.
await page.evaluate(() => {
  document.querySelectorAll('.copy, .card, .line, .dot').forEach(el => el.remove())
  document.querySelector('.veil').style.background =
    'linear-gradient(90deg, #070A10 0%, rgba(7,10,16,.92) 40%, rgba(7,10,16,.6) 62%, rgba(7,10,16,.15) 82%)'
})
const bg = join(ROOT, 'app/og-night.jpg')
await page.screenshot({ path: bg, type: 'jpeg', quality: 86 })
// iOS 홈 화면 아이콘 — 애플은 SVG 를 받지 않는다. 같은 마크를 PNG 로 굽는다
await page.setViewport({ width: 180, height: 180, deviceScaleFactor: 1 })
await page.setContent(`<html><body style="margin:0;width:180px;height:180px">${mark(180, { square: true })}</body></html>`)
const apple = join(ROOT, 'app/apple-icon.png')
await page.screenshot({ path: apple, type: 'png', clip: { x: 0, y: 0, width: 180, height: 180 } })

// 탭 아이콘(favicon.ico) — 16·32·48 PNG 를 ICO 한 통에 담는다. 사파리·구형 브라우저가 이것을 먼저 찾는다
const pngs = []
for (const px of [16, 32, 48]) {
  await page.setViewport({ width: px, height: px, deviceScaleFactor: 1 })
  await page.setContent(`<html><body style="margin:0;width:${px}px;height:${px}px;background:transparent">${mark(px)}</body></html>`)
  pngs.push({ px, data: await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } }) })
}
const head = Buffer.alloc(6 + 16 * pngs.length)
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4)
let offset = head.length
pngs.forEach(({ px, data }, i) => {
  const o = 6 + 16 * i
  head.writeUInt8(px, o); head.writeUInt8(px, o + 1); head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3)
  head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6)
  head.writeUInt32LE(data.length, o + 8); head.writeUInt32LE(offset, o + 12)
  offset += data.length
})
writeFileSync(join(ROOT, 'app/favicon.ico'), Buffer.concat([head, ...pngs.map(p => Buffer.from(p.data))]))

// 공고별 미리보기(satori)에 얹을 마크 — satori 가 그레이디언트 SVG 를 그대로 읽도록 파일로 둔다
writeFileSync(join(ROOT, 'app/og-mark.svg'), mark(64))
console.log('wrote', out, bg, apple)
await browser.close()
