# 글꼴 라이선스

이 디렉터리의 글꼴은 웹 서비스 제공을 위해 저장소에 포함되어 있으며
`next/font/local` 로 self-host 된다.

## Jalnan Gothic (`JalnanGothicTTF.ttf`)

- 제공: 여기어때컴퍼니
- 배포처: https://www.goodchoice.kr/font
- 조건: 개인·기업 상업적 이용 무료. 글꼴 파일 자체의 유료 판매는 금지된다.
  출처 표기를 권장한다.
- 사용 범위: **브랜드·디스플레이 제목에만** 사용한다.

## Gmarket Sans (`GmarketSansTTFBold.ttf`, `GmarketSansTTFMedium.ttf`)

- 제공: 지마켓
- 배포처: https://corp.gmarket.com/fonts/
- 조건: 개인·기업 상업적 이용 무료. 글꼴 자체의 유료 판매 금지.
- 사용 범위: 섹션 제목 등 보조 브랜드 타이포.

## Pretendard (`Pretendard-Bold.otf`, `Pretendard-Regular.otf`)

- 제작: 길형진 (orioncactus)
- 배포처: https://github.com/orioncactus/pretendard
- 라이선스: SIL Open Font License 1.1
- 사용 범위: 본문·입력·버튼·상세정보 전부.

---

배포 전 각 배포처의 최신 라이선스 조건을 다시 확인할 것.

## 웹 전송용 축소본 (`*.woff2`)

`scripts/subset-fonts.py` 가 원본에서 KS X 1001 완성형 한글 2,350자와 기호만 남겨
WOFF2 로 바꾼 것이다. 글자 모양은 바꾸지 않는다.

- Pretendard — SIL OFL 1.1 은 수정·재배포를 허용한다.
- Gmarket Sans · Jalnan Gothic — 배포처 조건에 **형식 변환·글자 축소에 대한 명시가 없다.**
  배포 전 각 배포처 조건을 확인하고, 허용되지 않으면 `app/fonts.ts` 의 경로를
  원본 `.ttf` 로 되돌린다(축소본은 이 두 글꼴만 원본으로 돌려도 된다).
