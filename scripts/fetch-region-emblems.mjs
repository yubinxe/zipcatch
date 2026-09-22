/**
 * 지자체 상징(엠블럼)을 내려받는다.
 *
 *   node scripts/fetch-region-emblems.mjs
 *   node scripts/fetch-region-emblems.mjs --from=http://localhost:3000
 *
 * ── 목록을 사람이 적지 않는다 ──
 *
 * 어느 지역이 필요한지는 **지금 올라와 있는 공고가 알고 있다.**
 * 그래서 목록을 손으로 관리하지 않고 `/api/notices` 를 읽어 지역을 캐낸다.
 * 새 지역의 공고가 뜨면 이 스크립트를 다시 돌리는 것으로 끝난다.
 *
 * ── 쓰레기를 어떻게 거르나 ──
 *
 * LH 공고는 지역을 지역본부(경기·경남)까지만 주므로 시·군·구는 제목에서 캔다.
 * 제목을 정규식으로 훑으면 "남악휴먼시아" 에서 `남악휴먼시` 같은 것이 딸려 온다.
 * 이걸 거르는 규칙을 따로 만들지 않는다 — 대신 **한국어 위키백과에 영문 문서가
 * 있는지** 묻는다. 실재하는 지자체만 영문 문서가 있으므로 확인이 곧 필터가 된다.
 *
 * ── 어디서 받나 ──
 *
 * 위키미디어 공용. 한국 지자체 CI 는 공공저작물이라 저작권법 제24조의2 에 따라
 * 자유이용 대상이고 Commons 에도 Public domain 으로 올라와 있다.
 * 파일만 받지 않고 출처·저작자·라이선스를 manifest 에 함께 남긴다.
 * PD 가 아닌 파일은 건너뛴다 — 조건이 붙은 것을 모르고 쓰는 일이 없게.
 *
 * SVG 만 받는다. 카드에서 40px 로 쓰다 상세에서 키울 수 있어야 하고,
 * 지자체 상징은 선이 가늘어 래스터로 줄이면 뭉개진다.
 * 파일 이름은 ASCII 로 둔다 — 한글 파일명은 서버·CDN 마다 퍼센트 인코딩을
 * 다르게 다뤄 404 가 난다. 실제로 겪었다.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const UA = 'jipcatch/1.0 (https://zipcatch.vercel.app)'
const OUT = join(process.cwd(), 'public', 'emblems')
const MANIFEST = join(OUT, 'manifest.json')

const fromArg = process.argv.find(a => a.startsWith('--from='))
const ORIGIN = fromArg ? fromArg.slice('--from='.length) : 'https://zipcatch.vercel.app'

/** 광역 17 — 공고가 지역본부까지만 줄 때 쓰는 바탕 */
const PROVINCES = {
  서울: 'Seoul', 부산: 'Busan', 대구: 'Daegu', 인천: 'Incheon', 광주: 'Gwangju',
  대전: 'Daejeon', 울산: 'Ulsan', 세종: 'Sejong City', 경기: 'Gyeonggi Province',
  강원: 'Gangwon Province', 충북: 'North Chungcheong Province',
  충남: 'South Chungcheong Province', 전북: 'North Jeolla Province',
  전남: 'South Jeolla Province', 경북: 'North Gyeongsang Province',
  경남: 'South Gyeongsang Province', 제주: 'Jeju Province',
}

const SLUG = {
  서울: 'seoul', 부산: 'busan', 대구: 'daegu', 인천: 'incheon', 광주: 'gwangju',
  대전: 'daejeon', 울산: 'ulsan', 세종: 'sejong', 경기: 'gyeonggi', 강원: 'gangwon',
  충북: 'chungbuk', 충남: 'chungnam', 전북: 'jeonbuk', 전남: 'jeonnam',
  경북: 'gyeongbuk', 경남: 'gyeongnam', 제주: 'jeju',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function wiki(host, params) {
  const u = new URL(`https://${host}/w/api.php`)
  u.search = new URLSearchParams({ format: 'json', ...params }).toString()
  for (let i = 0; i < 3; i++) {
    const text = await fetch(u, { headers: { 'User-Agent': UA } }).then(r => r.text())
    if (!text.startsWith('You are making too many')) return JSON.parse(text)
    await sleep(15000)
  }
  throw new Error('rate limited')
}

/** 실재하는 지자체인지 묻고 영문명을 받는다. 없으면 null — 그게 필터다 */
async function englishName(korean) {
  const j = await wiki('ko.wikipedia.org', {
    action: 'query',
    prop: 'langlinks',
    lllang: 'en',
    titles: korean,
  })
  const page = Object.values(j.query?.pages ?? {})[0]
  const en = page?.langlinks?.[0]?.['*']
  if (!en) return null
  return { full: en, short: en.replace(/\s+(District|County|City|Province)$/i, '') }
}

/**
 * 제목을 정확히 몰라도 찾는다.
 *
 * "Emblem of Bucheon.svg" 는 없는데 "Flag of Bucheon 2025.svg" 는 있다 —
 * 기초자치단체는 상징보다 **깃발**로 올라와 있는 경우가 많고, 한국 지자체기는
 * 대개 그 지자체 CI 를 담고 있다. 연도가 붙은 이름까지 잡으려면 정확한 제목을
 * 찍어 맞히는 대신 검색을 한 번 돌리는 편이 확실하다.
 */
async function searchTitles(name) {
  const j = await wiki('commons.wikimedia.org', {
    action: 'query',
    list: 'search',
    srsearch: `intitle:"of ${name}" (emblem OR flag OR symbol OR seal) filetype:drawing`,
    srnamespace: '6',
    srlimit: '8',
  })
  await sleep(700)
  return (j.query?.search ?? [])
    .map(r => r.title.replace(/^File:/, ''))
    .filter(t => /\.svg$/i.test(t))
}

/** Commons 에서 PD 상징 파일을 찾는다 */
async function findEmblem(names) {
  const patterns = []
  for (const n of names) {
    patterns.push(`Emblem of ${n}.svg`, `Symbol of ${n}.svg`, `Seal of ${n}.svg`, `Flag of ${n}.svg`)
  }
  // 정확한 제목이 없으면 검색으로 넓힌다 (연도가 붙은 이름 등)
  for (const n of names) {
    for (const hit of await searchTitles(n)) {
      if (!patterns.includes(hit)) patterns.push(hit)
    }
  }

  for (const title of patterns) {
    const j = await wiki('commons.wikimedia.org', {
      action: 'query',
      prop: 'imageinfo|categories',
      iiprop: 'url|extmetadata',
      cllimit: '50',
      titles: `File:${title}`,
    })
    const page = Object.values(j.query?.pages ?? {})[0]
    await sleep(700)
    if (!page || page.missing !== undefined) continue

    const info = (page.imageinfo ?? [])[0]
    if (!info) continue
    const meta = info.extmetadata ?? {}
    const license = (meta.LicenseShortName?.value ?? '').trim()
    if (!/public domain|^pd|cc0/i.test(license)) {
      console.log(`    (${title} — ${license} 이라 건너뜀)`)
      continue
    }

    // 같은 이름의 다른 나라 지명을 물어 오는 일이 실제로 있었다.
    // "소사구" 를 찾다가 일본 지바현 소사시(Sosa, Chiba) 깃발을 받아 왔다.
    // 이름이 비슷하다는 이유로 엉뚱한 나라 상징을 다는 것은 틀린 정보를
    // 그럴듯하게 보여주는 일이라, 한국 것이 맞는지 확인하고 넘어간다.
    const cats = (page.categories ?? []).map(c => c.title).join(' ')
    const desc = (meta.ImageDescription?.value ?? '').replace(/<[^>]+>/g, '')
    const haystack = `${cats} ${desc} ${title}`
    const foreign = /Japan|Chiba|China|Taiwan|Prefecture/i.test(haystack)
    const korean = /Korea|한국|[가-힣]/.test(haystack)
    if (foreign && !korean) {
      console.log(`    (${title} — 한국 지자체가 아니라 건너뜀)`)
      continue
    }
    return {
      title,
      url: info.url.split('?')[0],
      license,
      artist: (meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim(),
    }
  }
  return null
}

function slugOf(region, en) {
  if (SLUG[region]) return SLUG[region]
  const ascii = (en ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return ascii || [...region].map(c => c.codePointAt(0).toString(16)).join('')
}

/** 지금 올라와 있는 공고에서 지역을 캔다 */
async function mineRegions() {
  const data = await fetch(`${ORIGIN}/api/notices?limit=60`, {
    headers: { 'User-Agent': UA },
  }).then(r => r.json())
  const notices = data.notices ?? []

  const locals = new Map()
  for (const n of notices) {
    const p = n.property ?? {}
    for (const src of [p.region, p.district, p.name]) {
      if (!src) continue
      for (const m of String(src).matchAll(/([가-힣]{2,5}(?:시|군|구))/g)) {
        locals.set(m[1], (locals.get(m[1]) ?? 0) + 1)
      }
    }
  }

  /*
   * 일반구는 제 상징이 없는 일이 많다 — 소사구·권선구·분당구가 그렇다.
   * 그럴 때 광역으로 내려보내면 부천 공고에 경기도 상징이 붙는다.
   * 화면(lib/consumer/emblem.ts)은 광역으로 가기 전에 모시를 한 번 거치므로,
   * 여기서 그 **모시의 상징도 함께 받아 둔다.** 같은 표를 읽으니 어긋나지 않는다.
   */
  const guTable = JSON.parse(
    await readFile(join(process.cwd(), 'lib', 'consumer', 'gu-in-city.json'), 'utf8'),
  )
  const parents = new Set()
  for (const name of locals.keys()) {
    const hit = guTable[name]
    if (hit && !locals.has(hit.city)) parents.add(hit.city)
  }

  console.log(
    `공고 ${notices.length}건에서 시·군·구 후보 ${locals.size}개를 캤다` +
      (parents.size ? ` (일반구가 속한 시 ${parents.size}곳을 더한다: ${[...parents].join(', ')})` : ''),
  )
  return [...locals.keys(), ...parents]
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const manifest = existsSync(MANIFEST)
    ? JSON.parse(await readFile(MANIFEST, 'utf8'))
    : { source: 'Wikimedia Commons', note: '', fetchedAt: null, items: {} }

  const locals = await mineRegions()

  const targets = [
    // 광역은 바탕이므로 공고에 없어도 전부 받아 둔다
    ...Object.keys(PROVINCES).map(k => ({
      region: k,
      en: { full: PROVINCES[k], short: PROVINCES[k] },
    })),
    ...locals.map(region => ({ region, en: null })),
  ]

  let got = 0
  const rejected = []
  const noEmblem = []

  for (const t of targets) {
    if (manifest.items[t.region]) {
      got++
      continue
    }

    let en = t.en
    if (!en) {
      en = await englishName(t.region)
      await sleep(900)
      if (!en) {
        rejected.push(t.region)
        continue
      }
    }

    const found = await findEmblem([...new Set([en.full, en.short])])
    if (!found) {
      noEmblem.push(`${t.region}(${en.short})`)
      continue
    }

    const svg = await fetch(found.url, { headers: { 'User-Agent': UA } }).then(r => r.text())
    const file = `${slugOf(t.region, en.short)}.svg`
    await writeFile(join(OUT, file), svg, 'utf8')

    manifest.items[t.region] = {
      file,
      title: found.title,
      license: found.license,
      artist: found.artist,
      source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(found.title)}`,
    }
    got++
    console.log(`OK  ${t.region.padEnd(8)} ${found.title}`)
    await sleep(400)
  }

  manifest.note =
    '한국 지자체 상징은 공공저작물(저작권법 제24조의2). Public domain 으로 공표된 파일만 받는다.'
  manifest.fetchedAt = new Date().toISOString()
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  console.log('')
  console.log(`보유 ${got}개`)
  if (rejected.length) console.log(`실재하지 않는 지명(자동 탈락): ${rejected.join(', ')}`)
  if (noEmblem.length) console.log(`상징 파일 없음: ${noEmblem.join(', ')}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
