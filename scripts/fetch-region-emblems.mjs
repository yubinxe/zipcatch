/**
 * 지자체 상징(엠블럼)을 내려받는다.
 *
 *   node scripts/fetch-region-emblems.mjs
 *
 * ── 어디서 받는가 ──
 *
 * 위키미디어 공용(Commons). 한국 지자체 CI 는 대부분 **공공저작물**이라
 * 저작권법 제24조의2에 따라 자유이용 대상이고, Commons 에도 Public domain 으로
 * 올라와 있다. 라이선스가 기계로 읽히는 곳에서 받아야 나중에 근거를 댈 수 있다.
 *
 * 그래서 이 스크립트는 파일만 받지 않고 **출처·저작자·라이선스를 함께 기록**한다.
 * PD 가 아닌 파일은 건너뛴다 — 조건이 붙은 것을 모르고 쓰는 일이 없게.
 *
 * SVG 만 받는다. 공고 카드에서 40px 로 쓰다가 상세에서 키울 수 있어야 하고,
 * 지자체 상징은 선이 가늘어 래스터로 줄이면 뭉개진다.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const UA = 'jipcatch/1.0 (https://zipcatch.vercel.app)'
const OUT = join(process.cwd(), 'public', 'emblems')
const MANIFEST = join(OUT, 'manifest.json')

/**
 * 지역 이름 → Commons 파일 후보.
 *
 * 한 지역에 여러 표기가 있어 순서대로 시도한다.
 * 실제로 찍어 보니 "Emblem of X" 가 가장 흔하고, 도는 "Province" 가 붙는다.
 */
const TARGETS = [
  // ── 광역 17 ──
  ['서울', ['Emblem of Seoul.svg', 'Seal of Seoul.svg', 'Symbol of Seoul.svg']],
  ['부산', ['Emblem of Busan.svg', 'Emblem of Busan-bu.svg']],
  ['대구', ['Emblem of Daegu.svg', 'Emblem of Daegu-bu.svg']],
  ['인천', ['Emblem of Incheon.svg']],
  ['광주', ['Emblem of Gwangju.svg']],
  ['대전', ['Emblem of Daejeon.svg']],
  ['울산', ['Emblem of Ulsan.svg']],
  ['세종', ['Seal of Sejong City, South Korea.svg', 'Emblem of Sejong City.svg']],
  ['경기', ['Emblem of Gyeonggi Province (2021).svg', 'Emblem of Gyeonggi Province.svg']],
  ['강원', ['Emblem of Gangwon Province.svg', 'Emblem of Gangwon State.svg']],
  ['충북', ['Emblem of North Chungcheong Province.svg', 'Emblem of Chungcheongbuk-do.svg']],
  ['충남', ['Emblem of South Chungcheong Province.svg', 'Emblem of Chungcheongnam-do.svg']],
  ['전북', ['Emblem of North Jeolla Province.svg', 'Emblem of Jeonbuk State.svg']],
  ['전남', ['Emblem of South Jeolla Province.svg', 'Emblem of Jeollanam-do.svg']],
  ['경북', ['Emblem of North Gyeongsang Province.svg', 'Emblem of Gyeongsangbuk-do.svg']],
  ['경남', [
    'Emblem of South Gyeongsang Province.svg',
    'Seal of South Gyeongsang Province.svg',
    'Emblem of Gyeongsangnam-do.svg',
    'Symbol of South Gyeongsang Province.svg',
  ]],
  ['제주', ['Emblem of Jeju.svg', 'Emblem of Jeju Province.svg']],

  // ── 우리 공고에 실제로 나오는 시·군·구 ──
  ['평택시', ['Emblem of Pyeongtaek.svg']],
  ['남양주시', ['Emblem of Namyangju.svg']],
  ['여주시', ['Emblem of Yeoju.svg']],
  ['수원시', ['Emblem of Suwon.svg']],
  ['성남시', ['Emblem of Seongnam.svg']],
  ['부천시', ['Emblem of Bucheon.svg']],
  ['천안시', ['Emblem of Cheonan.svg']],
  ['울주군', ['Emblem of Ulju County.svg', 'Emblem of Ulju.svg']],
  ['익산시', ['Emblem of Iksan.svg']],
  ['군산시', ['Emblem of Gunsan.svg']],
  ['시흥시', ['Emblem of Siheung.svg']],
  ['양주시', ['Emblem of Yangju.svg']],
  ['의정부시', ['Emblem of Uijeongbu.svg']],
  ['거제시', ['Emblem of Geoje.svg']],
  ['서산시', ['Emblem of Seosan.svg']],
  ['음성군', ['Emblem of Eumseong County.svg', 'Emblem of Eumseong.svg']],
  ['원주시', ['Emblem of Wonju.svg']],
]

/**
 * 파일 이름은 ASCII 로 둔다.
 * 한글 파일명은 서버·CDN 마다 퍼센트 인코딩을 다르게 다뤄 404 가 난다.
 * 실제로 `/emblems/경기.svg` 가 404, `%EA%B2%BD%EA%B8%B0.svg` 만 200 이었다.
 */
const SLUG = {
  서울: 'seoul', 부산: 'busan', 대구: 'daegu', 인천: 'incheon', 광주: 'gwangju',
  대전: 'daejeon', 울산: 'ulsan', 세종: 'sejong', 경기: 'gyeonggi', 강원: 'gangwon',
  충북: 'chungbuk', 충남: 'chungnam', 전북: 'jeonbuk', 전남: 'jeonnam',
  경북: 'gyeongbuk', 경남: 'gyeongnam', 제주: 'jeju',
}

/** 사전에 없으면 알파벳·숫자만 남긴다. 그래도 비면 코드포인트로 만든다 */
function slugOf(region) {
  if (SLUG[region]) return SLUG[region]
  const ascii = region.replace(/[^a-zA-Z0-9]/g, '')
  return ascii || [...region].map(c => c.codePointAt(0).toString(16)).join('')
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function api(params) {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  u.search = new URLSearchParams({ format: 'json', ...params }).toString()
  const res = await fetch(u, { headers: { 'User-Agent': UA } })
  const text = await res.text()
  if (text.startsWith('You are making too many')) throw new Error('RATE')
  return JSON.parse(text)
}

/** 파일 하나의 실주소·라이선스를 읽는다. PD 가 아니면 null */
async function lookup(title) {
  const j = await api({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    titles: `File:${title}`,
  })
  const page = Object.values(j.query?.pages ?? {})[0]
  if (!page || page.missing !== undefined) return null

  const info = (page.imageinfo ?? [])[0]
  if (!info) return null

  const meta = info.extmetadata ?? {}
  const license = (meta.LicenseShortName?.value ?? '').trim()
  const artist = (meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim()

  // 조건이 붙은 파일은 쓰지 않는다. 모르고 쓰는 것이 가장 나쁘다.
  const free = /public domain|^pd|cc0/i.test(license)
  return { title, url: info.url.split('?')[0], license, artist, free }
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const manifest = existsSync(MANIFEST)
    ? JSON.parse(await readFile(MANIFEST, 'utf8'))
    : { source: 'Wikimedia Commons', fetchedAt: null, items: {} }

  let ok = 0
  let skipped = 0
  const missing = []

  for (const [region, candidates] of TARGETS) {
    if (manifest.items[region]) {
      ok++
      continue // 이미 받은 것은 다시 부르지 않는다
    }

    let found = null
    for (const c of candidates) {
      try {
        found = await lookup(c)
      } catch (err) {
        if (err.message === 'RATE') {
          console.log('  … 속도 제한. 20초 쉰다')
          await sleep(20000)
          found = await lookup(c).catch(() => null)
        }
      }
      await sleep(900) // Commons 에 부담을 주지 않는다
      if (found) break
    }

    if (!found) {
      missing.push(region)
      console.log(`--  ${region.padEnd(8)} 찾지 못함`)
      continue
    }
    if (!found.free) {
      skipped++
      console.log(`!!  ${region.padEnd(8)} ${found.license} — 조건이 붙어 건너뜀`)
      continue
    }

    const svg = await fetch(found.url, { headers: { 'User-Agent': UA } }).then(r => r.text())
    const file = `${slugOf(region)}.svg`
    await writeFile(join(OUT, file), svg, 'utf8')

    manifest.items[region] = {
      file,
      title: found.title,
      license: found.license,
      artist: found.artist,
      source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(found.title)}`,
    }
    ok++
    console.log(`OK  ${region.padEnd(8)} ${found.title}  (${found.license})`)
    await sleep(400)
  }

  manifest.fetchedAt = new Date().toISOString()
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  console.log('')
  console.log(`받음 ${ok} · 건너뜀 ${skipped} · 못 찾음 ${missing.length}`)
  if (missing.length) console.log('못 찾음:', missing.join(', '))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
