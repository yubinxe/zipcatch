// ──────────────────────────────────────────────────────────
// 분양정보 (Stage 37000 · ApplyhomeInfoDetailSvc)
// ──────────────────────────────────────────────────────────
export interface Announcement {
  HOUSE_MANAGE_NO: string
  PBLANC_NO: string
  HOUSE_NM: string
  HOUSE_SECD: string
  HOUSE_SECD_NM: string
  HOUSE_DTL_SECD: string
  HOUSE_DTL_SECD_NM: string
  SUBSCRPT_AREA_CODE: string
  SUBSCRPT_AREA_CODE_NM: string
  HSSPLY_ADRES: string
  TOT_SUPLY_HSHLDCO: string
  RCRIT_PBLANC_DE: string   // 모집공고일 YYYY-MM-DD
  RCEPT_BGNDE: string       // 청약접수 시작일
  RCEPT_ENDDE: string       // 청약접수 종료일
  SPSPLY_RCEPT_BGNDE: string
  SPSPLY_RCEPT_ENDDE: string
  PRZWNER_PRESNATN_DE: string // 당첨자 발표일
  CNTRCT_CNCLS_BGNDE: string
  CNTRCT_CNCLS_ENDDE: string
  MVN_PREARNGE_YM: string   // 입주예정월 YYYYMM
  HMPG_ADRES: string
  BSNS_MBY_NM: string       // 사업주체
  MDHS_TELNO: string
  PBLANC_URL: string
  NSPRC_NM: string          // 분양가상한제 여부
}

export interface AnnouncementsResponse {
  page: number
  perPage: number
  /**
   * 자료 전체의 행 수. **조건을 걸어도 줄지 않는다** — 공공데이터포털이
   * 그렇게 준다. 조건에 맞는 건수는 `matchCount` 다. 이 둘을 바꿔 쓰면
   * 화면이 "총 2,884건"이라고 적어 놓고 82건만 보여주게 된다.
   */
  totalCount: number
  /** 조건(지역·기간·유형)에 맞는 행 수. 화면에 적고 쪽 수를 세는 값 */
  matchCount?: number
  /** 이번 쪽에 실제로 담긴 행 수 */
  currentCount: number
  data: Announcement[]
}

// ──────────────────────────────────────────────────────────
// 경쟁률 상세 (Stage 36148 · ApplyhomeInfoCmpetRtSvc)
// ──────────────────────────────────────────────────────────
export interface CompetitionItem {
  HOUSE_MANAGE_NO: string
  PBLANC_NO: string
  MODEL_NO: string
  HOUSE_TY: string          // 주택형
  SUPLY_HSHLDCO: string     // 공급세대수
  SUBSCRPT_RANK_CODE: string
  RESIDE_SECD: string
  RESIDE_SENM: string       // 해당지역/기타경기/기타지역
  REQ_CNT: string           // 신청건수
  CMPET_RATE: string        // 경쟁률
}

export interface SpecialSupplyItem {
  HOUSE_MANAGE_NO: string
  PBLANC_NO: string
  HOUSE_TY: string
  SPSPLY_HSHLDCO: string
  MNYCH_HSHLDCO: string           // 다자녀
  NWWDS_NMTW_HSHLDCO: string      // 신혼부부
  LFE_FRST_HSHLDCO: string        // 생애최초
  YGMN_HSHLDCO: string            // 청년
  OLD_PARNTS_SUPORT_HSHLDCO: string // 노부모부양
  NWBB_NWBBSHR_HSHLDCO: string    // 신생아
  INSTT_RECOMEND_HSHLDCO: string  // 기관추천
  SUBSCRPT_RESULT_NM: string
}

// ──────────────────────────────────────────────────────────
// 당첨자·신청자 통계 (Stage 42105 · ApplyhomeStatSvc)
// ──────────────────────────────────────────────────────────
export interface AgeStatItem {
  STAT_DE: string   // YYYYMM
  AGE_30: string    // 30대
  AGE_40: string    // 40대
  AGE_50: string    // 50대
  AGE_60: string    // 60대 이상
}

export interface AreaStatItem {
  STAT_DE: string
  SUBSCRPT_AREA_CODE: string
  SUBSCRPT_AREA_CODE_NM: string
  AGE_30: string
  AGE_40: string
  AGE_50: string
  AGE_60: string
}

export interface CompetitionStatItem {
  STAT_DE: string
  SUBSCRPT_AREA_CODE: string
  SUBSCRPT_AREA_CODE_NM: string
  SPSPLY_HSHLDCO: string      // 특별공급 세대수
  SPSPLY_REQ_CNT: string      // 특별공급 신청
  SPSPLY_CMPET_RATE: string   // 특별공급 경쟁률
  SUPLY_HSHLDCO: string       // 일반공급 세대수
  SUPLY_REQ_CNT: string       // 일반공급 신청
  SUPLY_CMPET_RATE: string    // 일반공급 경쟁률
}

export interface ScoreStatItem {
  STAT_DE: string
  SUBSCRPT_AREA_CODE: string
  SUBSCRPT_AREA_CODE_NM: string
  RESIDE_SECD: string
  RESIDE_SECD_NM: string      // 해당지역/기타경기/기타지역
  AVRG_SCORE: string          // 평균가점
  MED_SCORE: string           // 중위가점
  TOP_SCORE: string           // 최고가점
  LWET_SCORE: string          // 최저가점
}

export interface OdcloudResponse<T> {
  page: number
  perPage: number
  totalCount: number
  currentCount: number
  matchCount: number
  data: T[]
}
