/**
 * 사이트를 그대로 떠서 사업보고용 PDF 로 만든다.
 *
 *   node scripts/capture-pdf.mjs --passcode=접속코드
 *   node scripts/capture-pdf.mjs --from=http://localhost:3000 --passcode=…
 *
 * ── 왜 스크린샷이 아니라 브라우저 인쇄인가 ──
 *
 * 스크린샷을 이어 붙이면 글자가 이미지가 되어 흐려지고 검색도 안 된다.
 * 브라우저 인쇄를 쓰면 글자가 글자로 남는다 — 보고서를 받은 사람이 본문을
 * 긁어 인용할 수 있고, 확대해도 깨지지 않는다.
 *
 * ── 무엇이 어려운가 ──
 *
 *  1) 운영 화면은 매 요청 서버에서 인증을 검사한다. 로그인해 쿠키를 받아
 *     브라우저에 심고 들어간다. 접속 코드는 인자로만 받고 어디에도 남기지 않는다.
 *  2) 지도·통계는 그려지는 데 시간이 걸린다. 다 그려졌는지를 시간으로 짐작하지
 *     않고 **화면에 실제로 나타났는지** 확인하고 찍는다. 빈 상자를 찍어 보고서에
 *     넣는 것이 가장 나쁘다.
 *  3) 화면에서만 뜨는 것들(챗봇 단추, 고정 티커, 스크롤 진행선)은 종이에서
 *     떠다니므로 인쇄 전에 감춘다.
 */
import puppeteer from 'puppeteer-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

const ORIGIN = (arg('from') ?? 'https://zipcatch.vercel.app').replace(/\/$/, '')
const OUTDIR = resolve(arg('out') ?? 'docs/보고/pages')
const PASSCODE = arg('passcode') ?? process.env.ADMIN_PASSCODE ?? ''

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p))

/**
 * 담을 화면 — 쓰는 순서대로.
 * `wait` 는 이 화면이 다 그려졌다고 볼 수 있는 표식이다.
 */
const PAGES = [
  { path: '/', name: '01_홈', title: '홈 — 첫 화면' },
  { path: '/notices', name: '02_공고찾기', title: '공고 찾기 · 목록', wait: '.cs-notice' },
  { path: '/map', name: '03_지도', title: '지도로 보는 공고', wait: 'a.cs-pin' },
  { path: '/analyze', name: '04_조건입력', title: '내 조건 입력' },
  { path: '/stats', name: '05_경쟁률통계', title: '경쟁률 · 당첨 통계', wait: '.cs-heatcard' },
  { path: '/pro', name: '06_공급판독', title: '공급 판독', wait: '.cs-read__block' },
  { path: '/guide', name: '07_청약가이드', title: '청약 가이드' },
  { path: '/score', name: '08_가점계산', title: '가점 계산' },
  { path: '/login', name: '09_계정', title: '계정 · 로그인' },
  { path: '/admin/dashboard', name: '10_운영_종합현황', title: '운영 · CRM 종합현황', admin: true, wait: '.crm-stat, .rt-title, .crm-page-title' },
  { path: '/admin/routines', name: '11_운영_루틴', title: '운영 · 루틴 자동화', admin: true, wait: '.rt-title' },
  { path: '/admin/customers', name: '12_운영_고객관리', title: '운영 · 고객관리', admin: true },
  { path: '/admin/properties', name: '13_운영_물건관리', title: '운영 · 물건관리', admin: true },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 종이에서는 떠다니기만 하는 것들을 감춘다 */
const PRINT_CSS = `
  .cs-chat, .cs-chat-fab, .cs-progress, .cs-skip { display: none !important; }
  /* 고정 티커는 본문을 덮으므로 흐름 안으로 내린다 */
  .cs-ticker { position: static !important; box-shadow: none !important; }
  /* 등장 효과가 걸린 채 찍히면 반투명하게 남는다 */
  [data-reveal] { opacity: 1 !important; transform: none !important; filter: none !important; }
  * { animation: none !important; transition: none !important; }
`

async function main() {
  if (!CHROME) throw new Error('크롬·엣지를 찾지 못했습니다.')
  await mkdir(OUTDIR, { recursive: true })

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,1000'],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 2 },
  })

  const page = await browser.newPage()

  // 운영 화면용 세션. 실패해도 소비자 화면은 그대로 찍는다.
  let adminOk = false
  if (PASSCODE) {
    const res = await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
    if (res) {
      const ok = await page.evaluate(async code => {
        const r = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: code }),
        })
        return r.ok
      }, PASSCODE)
      adminOk = ok
    }
  }
  console.log(adminOk ? '운영 세션 확보' : '※ 운영 세션 없음 — 관리자 화면은 로그인 화면으로 찍힙니다')

  const done = []
  for (const p of PAGES) {
    process.stdout.write(`  ${p.name} … `)
    try {
      await page.goto(`${ORIGIN}${p.path}`, { waitUntil: 'networkidle2', timeout: 60000 })

      // 다 그려졌는지를 시간이 아니라 화면으로 확인한다
      if (p.wait) {
        await page.waitForSelector(p.wait, { timeout: 25000 }).catch(() => {
          process.stdout.write('(표식 못 봄) ')
        })
      }
      // 지연 로딩되는 이미지·타일을 끌어내리려 한 번 훑는다
      await page.evaluate(async () => {
        const step = window.innerHeight
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise(r => setTimeout(r, 220))
        }
        window.scrollTo(0, 0)
      })
      await sleep(1200)

      await page.addStyleTag({ content: PRINT_CSS })
      await sleep(300)

      const file = join(OUTDIR, `${p.name}.pdf`)
      await page.pdf({
        path: file,
        width: '1440px',
        // 높이를 지정하지 않고 화면 전체를 한 장으로 뽑는다.
        // A4 로 자르면 카드 한가운데가 잘려 보고서가 지저분해진다.
        height: `${await page.evaluate(() => document.body.scrollHeight)}px`,
        printBackground: true,
        pageRanges: '1',
      })
      done.push({ ...p, file })
      console.log('ok')
    } catch (err) {
      console.log(`실패 — ${String(err.message).split('\n')[0]}`)
    }
  }

  await browser.close()

  await writeFile(
    join(OUTDIR, 'pages.json'),
    JSON.stringify(
      { origin: ORIGIN, capturedAt: new Date().toISOString(), adminIncluded: adminOk, pages: done.map(d => ({ name: d.name, title: d.title, path: d.path })) },
      null,
      2,
    ),
    'utf8',
  )

  console.log('')
  console.log(`${done.length}장 저장 → ${OUTDIR}`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
