# 실기기 GPU 점검 절차 — HERO → ONE MAP → 단지 탐험(Dive)

상태: **미검증(UNVERIFIED)**. 지금까지의 녹화·수치는 헤드리스 Chromium(소프트웨어 WebGL·SwiftShader, 4코어 이하 컨테이너)에서 나왔다.
이 환경에서는 첫 화면 3D 가 자동으로 켜지지 않아 2D 대체 화면이 기록됐다. 그 녹화를 '부드러운 실시간 3D'의 근거로 쓰지 않는다.
아래 절차로 실제 GPU 기기에서 한 번씩 돌려 결과표를 채워야 이 항목이 닫힌다.

## 1. 기기

| 기기 | 브라우저 | 필수 |
|---|---|---|
| MacBook (Apple Silicon) | Chrome 최신, Safari 최신 | 필수 |
| Windows 노트북(내장 또는 외장 GPU) | Chrome 최신 | 권장 |
| iPhone (최근 3년 안) | Safari | 필수 |
| 중급 Android | Chrome | 권장 |
| 발표용 PC + 프로젝터/대형 화면 1920×1080 | Chrome | 시연 전 필수 |

## 2. 준비

1. Preview 주소: `https://zipcatch-git-preview-zipcatch-4-0-yubin-ki-m-s-projects.vercel.app`
2. 커밋 확인: `/api/preview/env` 의 커밋이 시험할 SHA 와 같은지.
3. Chrome: `chrome://gpu` 에서 *WebGL: Hardware accelerated* 확인. 아니면 결과표에 '소프트웨어'로 적고 중단.
4. 창 크기: 데스크톱 1440×900 이상, 발표용 1920×1080. 브라우저 확대 100%.
5. 저전력 모드·배터리 절약 끄기(끈 상태와 켠 상태를 따로 적는다).

## 3. 3D 가 실제로 켜졌는지 — 대체 화면과 가르기

개발자 도구 콘솔에서:

```js
({
  hero3d: !!document.querySelector('.cs-atlas__stage canvas'),
  oneMap3d: !!document.querySelector('.cs-scene--statement canvas'),
  complex: document.querySelector('.cx-canvas')?.dataset.mode ?? '(단지 탐험 열기 전)',
  gl: (() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a' })(),
})
```

- `hero3d:false` 이면 첫 화면은 2D 다. 첫 화면 오른쪽 위 **'입체로 보기'** 를 눌러 켠 뒤 다시 확인한다.
- `gl` 에 `SwiftShader`·`llvmpipe` 가 보이면 소프트웨어 렌더링 — 이 기기 결과는 무효.

## 4. 순서

1. 홈을 새로 연다(캐시 비우기 한 번, 그 뒤 한 번 더 — 둘 다 적는다).
2. 개발자 도구 **Performance** 에서 기록 시작(Screenshots 켬, CPU 감속 없음).
3. 첫 화면 지도에서 3초 머문다 → 지역 칩 하나를 누른다.
4. 천천히(약 4초) 내려 HERO → ONE MAP 이어 붙이기를 지난다. 다시 올렸다가 다시 내린다(거꾸로 도는지).
5. ONE MAP 네 박자를 지나 끝에서 **서울**을 고른다.
6. 패널의 **'3D 단지 탐험 가능'** 칸(단지 이름)을 누른다(Dive). 도착 뒤 주택형 **59B** 를 고른다.
7. 브라우저 **뒤로** — 단지 탐험이 닫히고 ONE MAP 자리·서울 선택이 그대로인지.
8. 기록 중지.

시연 모드는 `/?director=1` 에서 같은 순서를 PageDown 으로 넘겨 한 번 더 한다.

## 5. 볼 것과 합격선

| 항목 | 보는 법 | 합격선 |
|---|---|---|
| 프레임 간격 | Performance → Frames. 3·4·5·6 단계 구간별 | 데스크톱 60Hz 기준 33ms 넘는 프레임 5% 미만, 100ms 넘는 프레임 0. 휴대폰 33ms 넘는 프레임 10% 미만 |
| 긴 작업 | Main 트랙의 빨간 삼각형 | 지역 고르기·Dive 누른 직후 200ms 넘는 작업 없음 |
| 한글 라벨 | 눈으로. ONE MAP 지역 이름표·단지 탐험 동 번호 | 네모(□)·겹침·잘림 없음. 1920 화면 3m 거리에서 읽힘 |
| 카메라 이어짐 | 녹화 화면 | 이어 붙이기 중 지도 크기·자리 튐 없음, Dive 에서 검은 틈 없음 |
| GPU 메모리 | Chrome 작업 관리자(Shift+Esc) GPU 메모리 열 — 4단계 전·6단계 뒤·7단계 뒤 | 7단계 뒤 6단계 값보다 내려감(탐험을 닫으면 놓아줌). 세 번 반복해도 계속 오르지 않음 |
| 되돌아오기 | 7단계 | 스크롤 자리 ±1화면 안, 서울 선택 유지, 콘솔 오류 없음 |
| 움직임 줄이기 | OS 설정 켜고 3~7 반복 | 이어 붙이기·카메라 비행 없이 바로 바뀜 |

## 6. 결과표(기기마다 한 줄)

| 날짜 | 기기 / GPU(`gl`) | 브라우저 | 3D 켜짐(hero/oneMap/complex) | 33ms 초과 % | 최장 프레임 | 라벨 | GPU 메모리(전/열림/닫힘) | 되돌아오기 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

녹화 파일 이름에 기기·브라우저·SHA 를 넣는다. 2D 대체 화면으로 찍힌 녹화는 '대체 경로 점검'으로만 분류한다.
