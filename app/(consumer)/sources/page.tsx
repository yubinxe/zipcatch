import PageMasthead from '@/components/consumer/PageMasthead'
import manifest from '@/public/emblems/manifest.json'

export const metadata = { title: '출처와 라이선스 — 집캐치' }

/**
 * 출처와 라이선스.
 *
 * 첫 화면 지도 아래에 기술 문구(지도 윤곽 svg-maps · CC BY 4.0 …)를 늘어놓으면
 * 소비자 화면이 설명서처럼 보인다. 그렇다고 저작자 표시 의무를 버릴 수는 없다 —
 * 지도 밑에는 이 화면으로 가는 링크 하나만 두고, 표시는 여기서 빠짐없이 한다.
 */

const DATA = [
  {
    name: '청약홈 분양정보 · 경쟁률 · 당첨자 통계',
    by: '한국부동산원 · 공공데이터포털',
    note: '분양 모집공고, 주택형별 경쟁률, 당첨 가점 통계',
  },
  {
    name: 'LH 청약플러스 임대·분양 공고',
    by: '한국토지주택공사 · 공공데이터포털',
    note: '국민임대·행복주택·매입임대 등 LH 공고',
  },
  {
    name: '마이홈포털 공공주택 모집공고 (15108420)',
    by: '국토교통부 · 공공데이터포털',
    note: 'LH·지방공사 공공임대 모집공고',
  },
  {
    name: '마이홈포털 예비입주자 대기현황 (15108378)',
    by: '국토교통부 · 공공데이터포털',
    note: '단지·형별 입주 대기자 수와 퇴거 건수',
  },
  {
    name: '월별 집합건물 사업장 공정율 현황 (15083037)',
    by: '주택도시보증공사(HUG) · 공공데이터포털',
    note: '지역별 분양 아파트 공정률',
  },
  {
    name: '아파트 매매·전월세 실거래가',
    by: '국토교통부 · 공공데이터포털',
    note: '주거비 비교와 사업성 판독의 시장 참고',
  },
  {
    name: '상가(상권)정보',
    by: '소상공인시장진흥공단 · 공공데이터포털',
    note: '단지 주변 생활 상권',
  },
  {
    name: '대중교통 경로',
    by: 'ODsay LAB',
    note: '공고 단지에서 목적지까지 대중교통 경로(요청 시에만 조회)',
  },
]

export default function SourcesPage() {
  const emblems = Object.entries(manifest.items as Record<string, { file: string; title: string; license: string; artist: string; source: string }>)

  return (
    <>
      <PageMasthead
        eyebrow="Sources & Licenses"
        title="출처와 라이선스"
        lead="집캐치가 보여주는 숫자와 그림이 어디에서 왔는지, 어떤 조건으로 쓰는지 적어 둡니다."
      />

      <div className="cs-wrap cs-src">
        <section className="cs-src__block">
          <h2 className="cs-src__h">공고·통계 자료</h2>
          <p className="cs-src__p">
            모든 공고와 통계는 공공기관이 공개한 원자료에서 옵니다. 집캐치는 원문을 다시 쓰지 않고, 정리해 보여준 뒤 원문 링크를
            함께 둡니다. 지원 자격과 일정은 반드시 공식 모집공고문으로 확인해 주세요.
          </p>
          <ul className="cs-src__list">
            {DATA.map(d => (
              <li key={d.name}>
                <b>{d.name}</b>
                <span>{d.by}</span>
                <em>{d.note}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="cs-src__block">
          <h2 className="cs-src__h">지도</h2>
          <ul className="cs-src__list">
            <li>
              <b>대한민국 시·도 지도 윤곽</b>
              <span>
                <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener noreferrer">
                  svg-maps
                </a>{' '}
                · Victor Cazanave ·{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/deed.ko" target="_blank" rel="noopener noreferrer">
                  CC BY 4.0
                </a>
              </span>
              <em>
                변경함 — 보는 틀을 본토·제주로 잘라 울릉도·독도를 따로 상자에 표시, 입체 지도에서는 윤곽을 단순화하고 높이를 더함
              </em>
            </li>
            <li>
              <b>지도 화면의 지도 타일</b>
              <span>카카오맵 API</span>
              <em>카카오 지도 이용약관에 따름</em>
            </li>
          </ul>
        </section>

        <section className="cs-src__block">
          <h2 className="cs-src__h">지자체 상징</h2>
          <p className="cs-src__p">
            공고 카드의 시·도 상징은 각 지자체의 공식 상징을 위키미디어 공용에서 받아 씁니다. 상징의 권리는 각 지자체에 있습니다.
          </p>
          <ul className="cs-src__grid">
            {emblems.map(([region, e]) => (
              <li key={region}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 원본 SVG 를 그대로 보인다 */}
                <img src={`/emblems/${e.file}`} alt="" width={28} height={28} loading="lazy" />
                <div>
                  <b>{region}</b>
                  <span>
                    {e.artist} · {e.license} ·{' '}
                    <a href={e.source} target="_blank" rel="noopener noreferrer">
                      원본
                    </a>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="cs-src__block">
          <h2 className="cs-src__h">글꼴</h2>
          <ul className="cs-src__list">
            <li>
              <b>Pretendard</b>
              <span>Kil Hyung-jin · SIL Open Font License 1.1</span>
            </li>
          </ul>
        </section>
      </div>
    </>
  )
}
