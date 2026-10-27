import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStage } from './stage'

/**
 * 지금 짓고 있는 집 — 공사 중인 도시.
 *
 * 지역 하나가 탑 하나다. 모든 수는 `/api/progress`(HUG 집계)에서 온다.
 * - 탑의 높이 = 공사 중인 사업장 수. 가장 많은 지역을 가장 높게 두고 정비례로 줄인다
 * - 불 켜진 층 = 공정률 중앙값. 탑 높이의 그 비율까지 창에 불이 들어와 있다
 * - 그 위는 비계(철골 틀)만 서 있다. 경계의 주황 띠가 '지금 공사 중인 층'이다
 * 창이 몇 개 켜졌는지, 크레인이 어디를 보는지, 길 위의 차는 꾸밈이다 — 수를 담지 않는다.
 *
 * 표가 원본이다. 이 그림은 aria-hidden 이고, 같은 내용을 글로 따로 적는다.
 */

export interface SkyTower {
  province: string
  sites: number
  median: number
}

export interface SkyCallbacks {
  onHover: (province: string | null) => void
  onPick: (province: string | null, pointerType: string) => void
  onReady: () => void
  onLost: () => void
}

export interface SkyHandle {
  setHighlight: (province: string | null) => void
  dispose: () => void
}

/** 탑 한 변 · 탑 사이 간격(가로·세로) */
const W = 0.7
const SX = 1.02
const SZ = 1.16
/** 크레인 크기 — 탑을 누르지 않게 탑 한 변 남짓으로 */
const CRANE_S = 0.6
const CRANE_H = 0.78 * CRANE_S
/** 카메라가 정수리에서 기운 각 — 낮게, 거리에 선 사람의 눈높이 쪽으로. 줄이 많으면 조금 높이 */
const POLARS = [1.27, 1.2, 1.12]

interface Tower {
  data: SkyTower
  x: number
  z: number
  H: number
  hf: number
  delay: number
  shell: THREE.Mesh
  mirrorShell: THREE.Mesh
  band: THREE.Mesh
  bandMat: THREE.MeshBasicMaterial
  scaffold: THREE.LineSegments
  mirrorScaffold: THREE.LineSegments
  mirrorScaffoldMat: THREE.LineBasicMaterial
  scaffoldMat: THREE.LineBasicMaterial
  net: THREE.Mesh
  netMat: THREE.MeshBasicMaterial
  crane: THREE.Group | null
  cranePhase: number
  craneSpeed: number
  hit: THREE.Mesh
  u: {
    uSize: { value: THREE.Vector3 }
    uFill: { value: number }
    uGlow: { value: number }
    uFloor: { value: number }
    uSeed: { value: number }
    uTime: { value: number }
  }
  hi: number
  tag: HTMLDivElement
  tagSize: { w: number; h: number }
}

/* ── 셰이더 ─────────────────────────────────────────────── */
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`

/*
 * 밤하늘 — 위는 먹빛, 지평선은 도시 불빛에 낮게 달아 있다. 별은 아주 드물게.
 * 지평선 색(uHorizon)은 안개 색과 같다 — 멀어지는 땅이 하늘로 이음매 없이 녹는다.
 */
const SKY_FS = /* glsl */ `
uniform float uTime;
uniform vec3 uHorizon;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 top = vec3(0.003, 0.004, 0.009);
  vec3 mid = vec3(0.009, 0.011, 0.022);
  vec3 col = mix(uHorizon, mid, smoothstep(0.0, 0.28, y));
  col = mix(col, top, smoothstep(0.28, 0.85, y));
  if (y < 0.0) col = uHorizon;
  vec2 sp = vec2(atan(d.z, d.x) * 90.0, y * 160.0);
  vec2 cell = floor(sp);
  float h = hash(cell);
  float star = step(0.986, h) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.1, 0.45, y);
  col += vec3(0.75, 0.82, 1.0) * star * (0.3 + 0.3 * sin(uTime * (1.0 + h * 2.0) + h * 80.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const GROUND_VS = /* glsl */ `
varying vec3 vPos;
varying float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`

/*
 * 땅 — 젖은 아스팔트. 반쯤 비쳐서 아래로 뒤집어 둔 도시(반사)가 보인다.
 * 블록(보도)은 탑 자리에만 있고, 그 사이로 길이 난다.
 */
const GROUND_FS = /* glsl */ `
uniform vec2 uCell;
uniform vec2 uOrigin;
uniform vec2 uExtent;
uniform vec3 uFog;
uniform vec2 uFogRange;
uniform vec2 uSpot;
uniform float uSpotAmt;
uniform float uTime;
varying vec3 vPos;
varying float vDepth;
void main() {
  vec2 g = (vPos.xz - uOrigin) / uCell;
  vec2 f = abs(fract(g) - 0.5);
  vec2 street = vec2(0.17) / uCell;
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 inB = 1.0 - smoothstep(0.5 - street - fw, 0.5 - street + fw, f);
  float inBlock = inB.x * inB.y;
  // 도시 바깥은 블록 없이 어둡게 — 가장자리는 부드럽게 흐린다
  vec2 ex = abs(vPos.xz) - uExtent;
  float city = 1.0 - smoothstep(0.0, 0.9, max(ex.x, ex.y));
  inBlock *= city;
  vec3 asphalt = vec3(0.005, 0.006, 0.009);
  vec3 walk = vec3(0.012, 0.014, 0.02);
  vec3 col = mix(asphalt, walk, inBlock);
  // 보도 테두리의 가는 빛
  vec2 be = abs(f - (0.5 - street));
  float rimLine = (1.0 - smoothstep(0.0, 1.4, min(be.x / fw.x, be.y / fw.y))) * city;
  col += vec3(0.09, 0.11, 0.16) * rimLine * 0.32;
  // 길 가운데 점선
  float cx = (1.0 - smoothstep(0.0, 1.2, (0.5 - f.x) / fw.x)) * step(0.55, fract(vPos.z * 2.6));
  float cz = (1.0 - smoothstep(0.0, 1.2, (0.5 - f.y) / fw.y)) * step(0.55, fract(vPos.x * 2.6));
  col += vec3(0.6, 0.34, 0.12) * max(cx, cz) * city * 0.1;
  // 고른 탑 발밑의 빛
  float d = length(vPos.xz - uSpot);
  float ph = fract(uTime * 0.45);
  float ring = exp(-pow((d - 0.5 - ph * 0.9) / 0.025, 2.0)) * (1.0 - ph);
  col += vec3(1.0, 0.45, 0.15) * (exp(-d * d * 4.0) * 0.22 + ring * 1.4) * uSpotAmt;
  // 반사는 은은하게 — 선형 5%가 sRGB 로는 25%쯤으로 보인다
  float a = mix(0.93, 0.96, inBlock);
  float fog = smoothstep(uFogRange.x, uFogRange.y, vDepth);
  col = mix(col, uFog, fog);
  a = mix(a, 1.0, fog);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const CAR_VS = /* glsl */ `
attribute vec3 aDir;
attribute vec3 aColor;
attribute vec3 aMotion;
uniform float uTime;
uniform float uPx;
varying vec3 vColor;
varying float vA;
void main() {
  float len = aMotion.x;
  float s = mod(aMotion.y + uTime * aMotion.z, len);
  vec3 p = position + aDir * s;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (8.0 / -mv.z);
  vColor = aColor;
  vA = smoothstep(0.0, 0.8, s) * smoothstep(len, len - 0.8, s);
}`

const CAR_FS = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, a * vA);
}`

/*
 * 외벽 — 짙은 유리 커튼월. 층마다 가는 슬래브 선, 칸마다 창.
 * 불 켜진 창은 다 지은 층(uFill 아래)에만 있다. 공사 앞머리(맨 위 몇 층)는
 * 작업등으로 조금 더 밝다. 멀리서 창이 몇 픽셀로 줄면 무늬가 반짝이지 않게
 * 평균 밝기로 녹인다.
 */
const FACADE_PARS_V = /* glsl */ `
uniform vec3 uSize;
varying vec3 vObj;
varying vec3 vObjN;
varying float vWY;
`
const FACADE_PARS_F = /* glsl */ `
uniform vec3 uSize;
uniform float uFill;
uniform float uGlow;
uniform float uFloor;
uniform float uSeed;
uniform float uTime;
varying vec3 vObj;
varying vec3 vObjN;
varying float vWY;
`
const FACADE_EMISSIVE = /* glsl */ `
{
  vec3 an = abs(vObjN);
  float wall = 1.0 - step(0.5, an.y);
  float u = an.x > 0.5 ? vObj.z : vObj.x;
  float fy = vObj.y / uFloor;
  float fl = floor(fy);
  float cy = fract(fy);
  float cu = (u / uSize.x + 0.5) * 6.0;
  float ci = floor(cu);
  float cx = fract(cu);
  vec2 fw = fwidth(vec2(cu, fy));
  float ax = fw.x * 1.2 + 0.01;
  float ay = fw.y * 1.2 + 0.01;
  float win = smoothstep(0.1, 0.1 + ax, cx) * smoothstep(0.9, 0.9 - ax, cx) * smoothstep(0.2, 0.2 + ay, cy) * smoothstep(0.86, 0.86 - ay, cy);
  float detail = 1.0 - smoothstep(0.22, 0.55, max(fw.x, fw.y));
  float face = an.x > 0.5 ? (vObjN.x > 0.0 ? 1.0 : 2.0) : (vObjN.z > 0.0 ? 3.0 : 4.0);
  float h = fract(sin(dot(vec3(fl, ci, face + uSeed), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float done = step(vObj.y, uFill);
  float on = step(0.24, h) * done;
  float flick = 1.0 - 0.45 * step(0.988, h) * (0.5 + 0.5 * sin(uTime * 7.0 + h * 60.0));
  vec3 wc = mix(vec3(1.0, 0.58, 0.28), vec3(1.0, 0.84, 0.62), fract(h * 3.7));
  float front = smoothstep(uFill - uFloor * 4.0, uFill, vObj.y) * done;
  float lum = (0.32 + 0.5 * fract(h * 7.31)) * (0.85 + 0.9 * front) * flick;
  float lit = mix(0.42 * done, win * on, detail);
  totalEmissiveRadiance += wc * lit * wall * lum * uGlow;
  // 층마다 슬래브 선과 네 모서리의 가는 빛
  float slab = (1.0 - smoothstep(0.0, 0.05 + fw.y, cy)) * done * detail;
  float edge = 1.0 - smoothstep(0.0, 0.012 + fw.x * 0.1, 0.5 * uSize.x - abs(u));
  totalEmissiveRadiance += vec3(1.0, 0.52, 0.22) * (slab * 0.07 + edge * 0.3) * wall * uGlow;
  // 땅 아래(반사)는 깊어질수록 흐려진다 — 젖은 길에 비친 불빛처럼
  if (vWY < 0.0) totalEmissiveRadiance *= exp(vWY * 2.4);
}
`

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

function craneGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(x, y, z)
    parts.push(g)
  }
  box(0.04, 0.62, 0.04, 0, 0.31, 0) // 기둥
  box(0.026, 0.13, 0.026, 0, 0.7, 0) // 꼭대기
  box(0.86, 0.026, 0.034, 0.41, 0.62, 0) // 앞 팔
  box(0.28, 0.026, 0.034, -0.16, 0.62, 0) // 뒤 팔
  box(0.09, 0.065, 0.065, -0.27, 0.585, 0) // 평형추
  box(0.06, 0.055, 0.06, 0.05, 0.575, 0) // 운전실
  box(0.045, 0.03, 0.045, 0.6, 0.42, 0) // 갈고리
  const g = mergeGeometries(parts)
  parts.forEach(p => p.dispose())
  return g
}

/** 다 지은 층과 비계의 경계 — 위아래가 뚫린 네모 띠. 윗면이 주황 판으로 보이지 않게 */
function bandGeometry() {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true)
  g.rotateY(Math.PI / 4)
  g.translate(0, 0.5, 0)
  return g
}

export function mountSkyline(host: HTMLElement, input: SkyTower[], cb: SkyCallbacks): SkyHandle {
  const data = input.filter(d => d.sites > 0)
  const maxSites = Math.max(1, ...data.map(d => d.sites))
  const target = new THREE.Vector3()
  let dist = 14
  let highlight: string | null = null
  let readySent = false
  let frames = 0
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false }
  // 지평선의 도시 불빛 — 안개와 하늘이 같은 색을 쓴다(선형 값)
  const FOG = new THREE.Color().setRGB(0.036, 0.017, 0.012)

  /*
   * 배치 — 원형 극장. 많은 곳은 뒤 가운데, 적은 곳은 앞과 양옆으로.
   * 줄 수는 칸의 모양을 따른다. 넓은 칸(데스크톱)에서는 한두 줄로 길게 늘어선
   * 스카이라인, 좁은 칸(휴대폰)에서는 서너 줄로 모인 도시가 된다.
   */
  const sorted = [...data].sort((a, b) => b.sites - a.sites || a.province.localeCompare(b.province, 'ko'))
  const n = sorted.length
  const aspect = Math.max(0.6, (host.clientWidth || 16) / (host.clientHeight || 9))
  const rows =
    aspect >= 1.8 ? (n <= 10 ? 1 : 2) : aspect >= 1.25 ? (n <= 6 ? 1 : n <= 12 ? 2 : 3) : n <= 4 ? 1 : n <= 10 ? 2 : 3
  const cols = Math.max(1, Math.ceil(n / rows))
  const POLAR = POLARS[rows - 1]
  const slots: { r: number; c: number }[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ r, c })
  const mid = (cols - 1) / 2
  // r 이 클수록 뒤(카메라에서 먼 쪽 = -z). 큰 탑부터 뒤 가운데를 채운다
  slots.sort((a, b) => b.r - a.r || Math.abs(a.c - mid) - Math.abs(b.c - mid) || a.c - b.c)
  const originZ = -((rows - 1) * SZ) / 2
  const slotPos = (s: { r: number; c: number }) => ({
    x: (s.c - mid) * SX,
    z: originZ + (rows - 1 - s.r) * SZ,
  })

  /*
   * 가장 높은 탑의 높이. 수는 탑끼리의 비율에만 담긴다 — 전체 크기는 칸의 모양에
   * 맞춘다. 넓은 칸이면 도시의 폭에 맞춰 낮게, 좁은 칸이면 높게 세워 칸을 채운다.
   */
  const cityW = cols * SX
  const H_MAX = Math.min(4.4, Math.max(2.2, (cityW / aspect) * 1.12))
  const FLOOR = H_MAX / 26

  const stage = createStage({
    host,
    transparent: false,
    background: 0x07090d,
    fov: 30,
    exposure: 1.05,
    shadows: false,
    environment: 0.24,
    bloom: { strength: 0.7, radius: 0.42, threshold: 0.84 },
    onResize: () => {
      fit()
      carMat.uniforms.uPx.value = stage.renderer.getPixelRatio() * 2.2
      for (const t of towers) t.tagSize.w = 0
    },
    onFrame: (dt, t) => frame(dt, t),
    onLost: () => cb.onLost(),
  })
  const { scene, camera, canvas } = stage
  scene.fog = new THREE.Fog(FOG, 16, 40)

  /* ── 하늘 ───────────────────────────────────────────── */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uHorizon: { value: FOG.clone() } },
    }),
  )
  sky.renderOrder = -10
  scene.add(sky)

  /* ── 빛 ─────────────────────────────────────────────── */
  scene.add(new THREE.HemisphereLight('#7F96C4', '#0B0E14', 0.45))
  const moon = new THREE.DirectionalLight('#C9D6F5', 1.0)
  moon.position.set(-6, 8, 4)
  scene.add(moon)
  // 뒤에서 오는 도시의 주황 — 탑의 등에 결을 세운다
  const glow = new THREE.DirectionalLight('#FF8A3D', 0.9)
  glow.position.set(4, 1.2, -8)
  scene.add(glow)

  /* ── 공용 기하·재질 ─────────────────────────────────── */
  const unitBox = new THREE.BoxGeometry(1, 1, 1)
  unitBox.translate(0, 0.5, 0)
  const bandGeo = bandGeometry()
  const craneGeo = craneGeometry()
  // 크레인은 밤하늘에 비친 그림자 — 짙은 강철에 작업등이 스친 정도만
  const craneMat = new THREE.MeshStandardMaterial({
    color: '#4A4F59',
    metalness: 0.6,
    roughness: 0.42,
    emissive: '#FF8A3D',
    emissiveIntensity: 0.1,
  })
  const tipGeo = new THREE.SphereGeometry(0.02, 10, 8)
  const tipMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FF2A1A').multiplyScalar(3),
  })
  const cableMat = new THREE.LineBasicMaterial({ color: '#3A4253' })
  const cableGeo = new THREE.BufferGeometry()
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.6, 0.6, 0, 0.6, 0.44, 0], 3))

  const city = new THREE.Group()
  const mirror = new THREE.Group()
  mirror.scale.y = -1
  scene.add(city, mirror)

  const tagLayer = document.createElement('div')
  tagLayer.className = 'cs3d-tags cs3d-tags--sky'
  tagLayer.setAttribute('aria-hidden', 'true')
  host.appendChild(tagLayer)

  const towers: Tower[] = []
  const hits: THREE.Mesh[] = []

  sorted.forEach((d, i) => {
    const { x, z } = slotPos(slots[i])
    const H = (d.sites / maxSites) * H_MAX
    const median = Math.max(0, Math.min(100, d.median))
    const hf = H * (median / 100)
    const floors = Math.max(1, Math.round(H / FLOOR))
    const floorH = H / floors

    const u = {
      uSize: { value: new THREE.Vector3(W, 0.0001, W) },
      uFill: { value: 0 },
      uGlow: { value: 1.6 },
      uFloor: { value: floorH },
      uSeed: { value: i * 7.13 },
      uTime: { value: 0 },
    }
    const mat = new THREE.MeshStandardMaterial({
      color: '#0C121C',
      metalness: 0.8,
      roughness: 0.24,
      emissive: '#000000',
    })
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + FACADE_PARS_V)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position * uSize;\nvObjN = normal;\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FACADE_PARS_F)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FACADE_EMISSIVE)
    }
    mat.customProgramCacheKey = () => 'cs3d-facade'
    const shell = new THREE.Mesh(unitBox, mat)
    shell.position.set(x, 0, z)
    shell.scale.set(W, 0.0001, W)
    city.add(shell)
    const mirrorShell = new THREE.Mesh(unitBox, mat)
    mirrorShell.position.copy(shell.position)
    mirrorShell.scale.copy(shell.scale)
    mirror.add(mirrorShell)

    // 지금 공사 중인 층 — 다 지은 층과 비계의 경계
    const bandMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FF8A3D').multiplyScalar(2.4),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const band = new THREE.Mesh(bandGeo, bandMat)
    band.scale.set(W + 0.03, 0.02, W + 0.03)
    band.position.set(x, 0, z)
    city.add(band)

    // 비계 — 다 짓지 못한 층의 철골 틀
    const seg: number[] = []
    const hw = W / 2 + 0.016
    if (H - hf > 0.002) {
      const levels: number[] = [hf]
      for (let k = 1; k <= floors; k++) {
        const y = k * floorH
        if (y > hf + 0.02) levels.push(y)
      }
      if (levels[levels.length - 1] < H - 0.001) levels.push(H)
      const cs: [number, number][] = [
        [-hw, -hw],
        [hw, -hw],
        [hw, hw],
        [-hw, hw],
      ]
      for (const [cx, cz] of cs) seg.push(cx, hf, cz, cx, H, cz)
      for (const [cx, cz] of [
        [0, -hw],
        [0, hw],
        [-hw, 0],
        [hw, 0],
      ])
        seg.push(cx, hf, cz, cx, H, cz)
      levels.forEach((y, li) => {
        for (let k = 0; k < 4; k++) {
          const a = cs[k]
          const b = cs[(k + 1) % 4]
          seg.push(a[0], y, a[1], b[0], y, b[1])
          if (li > 0) {
            const y0 = levels[li - 1]
            if (li % 2) seg.push(a[0], y0, a[1], b[0], y, b[1])
            else seg.push(b[0], y0, b[1], a[0], y, a[1])
          }
        }
      })
    }
    const scaffoldGeo = new THREE.BufferGeometry()
    scaffoldGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    const scaffoldMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#FFB27A'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const scaffold = new THREE.LineSegments(scaffoldGeo, scaffoldMat)
    scaffold.position.set(x, 0, z)
    city.add(scaffold)
    // 비계의 반사는 따로 옅게 — 반사가 앞줄 탑을 가로지르지 않게
    const mirrorScaffoldMat = scaffoldMat.clone()
    const mirrorScaffold = new THREE.LineSegments(scaffoldGeo, mirrorScaffoldMat)
    mirrorScaffold.position.set(x, 0, z)
    mirror.add(mirrorScaffold)

    // 비계를 두른 그물 — 아주 옅게
    const netMat = new THREE.MeshBasicMaterial({
      color: '#FF8A3D',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const net = new THREE.Mesh(unitBox, netMat)
    net.position.set(x, hf, z)
    net.scale.set(W + 0.028, Math.max(0.0001, H - hf), W + 0.028)
    net.visible = H - hf > 0.002
    city.add(net)

    // 다 지은 곳(중앙값 100%)에는 크레인을 세우지 않는다
    let crane: THREE.Group | null = null
    if (median < 100) {
      crane = new THREE.Group()
      const body = new THREE.Mesh(craneGeo, craneMat)
      const tip = new THREE.Mesh(tipGeo, tipMat)
      tip.position.set(0.84, 0.64, 0)
      const tip2 = new THREE.Mesh(tipGeo, tipMat)
      tip2.position.set(0, 0.78, 0)
      crane.add(body, tip, tip2, new THREE.LineSegments(cableGeo, cableMat))
      crane.position.set(x, H, z)
      crane.scale.setScalar(0.0001)
      city.add(crane)
    }

    const hit = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ visible: false }))
    hit.position.set(x, 0, z)
    hit.scale.set(W + 0.3, Math.max(0.3, H + (crane ? CRANE_H * 0.8 : 0.1)), W + 0.3)
    hit.userData.province = d.province
    city.add(hit)
    hits.push(hit)

    const tag = document.createElement('div')
    tag.className = 'cs3d-tag cs3d-tag--sky'
    const inner = document.createElement('span')
    inner.className = 'cs3d-tag__in'
    const nm = document.createElement('b')
    nm.textContent = d.province
    const num = document.createElement('i')
    num.textContent = `${d.sites.toLocaleString('ko-KR')}곳`
    const med = document.createElement('em')
    med.textContent = `${Math.round(median * 10) / 10}%`
    inner.append(nm, num, med)
    tag.appendChild(inner)
    tagLayer.appendChild(tag)

    towers.push({
      data: d,
      x,
      z,
      H,
      hf,
      delay: 0.2 + i * 0.1,
      shell,
      mirrorShell,
      band,
      bandMat,
      scaffold,
      mirrorScaffold,
      mirrorScaffoldMat,
      scaffoldMat,
      net,
      netMat,
      crane,
      cranePhase: (i * 2.399) % (Math.PI * 2),
      craneSpeed: (0.1 + ((i * 0.37) % 1) * 0.14) * (i % 2 ? 1 : -1),
      hit,
      u,
      hi: 0,
      tag,
      tagSize: { w: 0, h: 0 },
    })
  })
  const byProvince = new Map(towers.map(t => [t.data.province, t]))

  /* ── 땅 — 젖은 아스팔트, 블록, 길 ─────────────────────── */
  const extentX = (cols * SX) / 2 + 0.35
  const extentZ = (rows * SZ) / 2 + 0.35
  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VS,
    fragmentShader: GROUND_FS,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCell: { value: new THREE.Vector2(SX, SZ) },
      // 칸의 가운데가 탑 자리다 — 탑 x = (c - mid)·SX 이므로 원점을 반 칸 당긴다
      uOrigin: {
        value: new THREE.Vector2(-mid * SX - SX / 2, originZ - SZ / 2),
      },
      uExtent: { value: new THREE.Vector2(extentX, extentZ) },
      uFog: { value: FOG.clone() },
      uFogRange: { value: new THREE.Vector2(16, 40) },
      uSpot: { value: new THREE.Vector2(999, 999) },
      uSpotAmt: { value: 0 },
      uTime: { value: 0 },
    },
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.renderOrder = 1
  scene.add(ground)

  /* ── 길 위의 차 — 앞은 흰 불, 뒤는 붉은 불 ─────────────── */
  const carPos: number[] = []
  const carDir: number[] = []
  const carCol: number[] = []
  const carMotion: number[] = []
  const head = new THREE.Color('#FFE6C2').multiplyScalar(1.6)
  const tail = new THREE.Color('#FF3B24').multiplyScalar(1.4)
  const lane = (sx: number, sz: number, dx: number, dz: number, len: number, count: number, seed: number) => {
    for (let k = 0; k < count; k++) {
      const fwd = k % 2 === 0
      const off = fwd ? 0.05 : -0.05
      const ox = dz !== 0 ? off : 0
      const oz = dx !== 0 ? off : 0
      const startX = fwd ? sx : sx + dx * len
      const startZ = fwd ? sz : sz + dz * len
      carPos.push(startX + ox, 0.015, startZ + oz)
      carDir.push(fwd ? dx : -dx, 0, fwd ? dz : -dz)
      const c = fwd ? head : tail
      carCol.push(c.r, c.g, c.b)
      const r = Math.abs(Math.sin(seed * 91.7 + k * 13.1))
      carMotion.push(len, r * len, 0.3 + r * 0.45)
    }
  }
  const spanX = cols * SX + 6
  const spanZ = rows * SZ + 6
  for (let r = 0; r <= rows; r++) {
    const zl = originZ - SZ / 2 + r * SZ
    lane(-spanX / 2, zl, 1, 0, spanX, 8, r + 1)
  }
  for (let c = 0; c <= cols; c++) {
    const xl = (c - mid - 0.5) * SX
    lane(xl, -spanZ / 2, 0, 1, spanZ, 4, c + 11)
  }
  const carGeo = new THREE.BufferGeometry()
  carGeo.setAttribute('position', new THREE.Float32BufferAttribute(carPos, 3))
  carGeo.setAttribute('aDir', new THREE.Float32BufferAttribute(carDir, 3))
  carGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(carCol, 3))
  carGeo.setAttribute('aMotion', new THREE.Float32BufferAttribute(carMotion, 3))
  const carMat = new THREE.ShaderMaterial({
    vertexShader: CAR_VS,
    fragmentShader: CAR_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 2.2 } },
  })
  const cars = new THREE.Points(carGeo, carMat)
  cars.frustumCulled = false
  cars.renderOrder = 2
  scene.add(cars)

  /* ── 고른 탑 발밑의 고리 ─────────────────────────────── */
  const haloGeo = new THREE.RingGeometry(0.5, 0.525, 72)
  haloGeo.rotateX(-Math.PI / 2)
  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FFB27A').multiplyScalar(2),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  halo.position.y = 0.01
  halo.renderOrder = 3
  scene.add(halo)

  /* ── 카메라 ───────────────────────────────────────────── */
  const fitPts: THREE.Vector3[] = []
  for (const t of towers) {
    const top = t.H + (t.crane ? CRANE_H : 0.1)
    for (const dx of [-W / 2, W / 2]) {
      for (const dz of [-W / 2, W / 2]) {
        fitPts.push(new THREE.Vector3(t.x + dx, 0, t.z + dz), new THREE.Vector3(t.x + dx, top, t.z + dz))
      }
    }
  }
  if (!fitPts.length) fitPts.push(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 1, 0))
  const box = new THREE.Box3().setFromPoints(fitPts)
  target.set(0, box.max.y * 0.34, (box.min.z + box.max.z) / 2)
  const tmp = new THREE.Vector3()
  function place(d: number, polar: number, az: number) {
    camera.position.setFromSphericalCoords(d, polar, az).add(target)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  function fit() {
    const { w, h } = stage.size()
    if (!w || !h) return
    camera.clearViewOffset()
    let lo = 2
    let hi = 80
    const spanAt = (d: number) => {
      place(d, POLAR, 0)
      const s = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
      for (const p of fitPts) {
        tmp.copy(p).project(camera)
        s.x0 = Math.min(s.x0, tmp.x)
        s.x1 = Math.max(s.x1, tmp.x)
        s.y0 = Math.min(s.y0, tmp.y)
        s.y1 = Math.max(s.y1, tmp.y)
      }
      return s
    }
    // 좌우로 흔들려도 모서리가 잘리지 않게 폭에 여유를 둔다. 위로는 표가 설 자리
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2
      const s = spanAt(m)
      if (s.x1 - s.x0 < 1.56 && s.y1 - s.y0 < 1.42) hi = m
      else lo = m
    }
    dist = hi
    const span = spanAt(dist)
    const cx = (span.x0 + span.x1) / 2
    // 아래쪽에 길과 반사가 보이도록 도시를 살짝 위로, 위에는 표 자리를 남긴다
    const cy = (span.y0 + span.y1) / 2 - 0.02
    camera.setViewOffset(w, h, (cx * w) / 2, (-cy * h) / 2, w, h)
  }

  /* ── 손 ─────────────────────────────────────────────── */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hovered: string | null = null
  function pick(e: PointerEvent | MouseEvent): string | null {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(hits, false)[0]
    return (hit?.object.userData.province as string | undefined) ?? null
  }
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1
    pointer.inside = true
    if (e.pointerType !== 'mouse') return
    const p = pick(e)
    canvas.style.cursor = p ? 'pointer' : ''
    if (p !== hovered) {
      hovered = p
      cb.onHover(p)
    }
  }
  const onLeave = () => {
    pointer.inside = false
    canvas.style.cursor = ''
    if (hovered !== null) {
      hovered = null
      cb.onHover(null)
    }
  }
  let lastType = 'mouse'
  const onDown = (e: PointerEvent) => {
    lastType = e.pointerType
  }
  const onClick = (e: MouseEvent) => cb.onPick(pick(e), lastType)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('click', onClick)

  /* ── 매 장면 ───────────────────────────────────────── */
  const spot = new THREE.Vector2(999, 999)
  let spotAmt = 0
  const placed: { x: number; y: number; w: number; h: number }[] = []

  function frame(dt: number, t: number) {
    frames++
    const k = (rate: number) => 1 - Math.exp(-dt * rate)
    const any = highlight && byProvince.has(highlight) ? 1 : 0
    tipMat.color.setRGB(1, 0.16, 0.1).multiplyScalar(0.4 + 2.8 * Math.pow(0.5 + 0.5 * Math.sin(t * 3.2), 6))

    for (const tw of towers) {
      const on = tw.data.province === highlight ? 1 : 0
      tw.hi += (on - tw.hi) * k(7)
      // 세워지는 차례: 다 지은 층이 오르고 → 비계가 서고 → 크레인이 얹힌다
      const g = ease((t - tw.delay) / 1.6)
      const sc = ease((t - tw.delay - 1.0) / 1.0)
      const cr = ease((t - tw.delay - 1.6) / 0.8)
      const shellH = Math.max(0.0001, tw.hf * g)
      tw.shell.scale.y = shellH
      tw.mirrorShell.scale.y = shellH
      tw.u.uSize.value.y = shellH
      tw.u.uFill.value = shellH
      tw.u.uTime.value = t
      // 하나를 가리키면 나머지는 한 걸음 물러난다
      const dim = 1 - any * 0.45 * (1 - tw.hi)
      tw.u.uGlow.value = (1.45 + tw.hi * 1.1) * dim
      tw.band.position.y = shellH - 0.01
      const building = tw.hf > 0.001 && tw.H - tw.hf > 0.002
      tw.bandMat.opacity = building
        ? Math.min(1, g * 1.2) * (0.7 + 0.3 * Math.sin(t * 2.2 + tw.cranePhase)) * (0.6 + 0.4 * dim)
        : 0
      tw.band.visible = tw.bandMat.opacity > 0.01
      tw.scaffoldMat.opacity = sc * (0.42 + tw.hi * 0.45) * dim
      tw.mirrorScaffoldMat.opacity = tw.scaffoldMat.opacity * 0.3
      tw.netMat.opacity = sc * (0.03 + tw.hi * 0.05)
      tw.scaffold.visible = tw.mirrorScaffold.visible = sc > 0.01
      if (tw.crane) {
        tw.crane.scale.setScalar(Math.max(0.0001, cr * CRANE_S))
        tw.crane.rotation.y = tw.cranePhase + t * tw.craneSpeed
      }
    }

    const ht = highlight ? byProvince.get(highlight) : undefined
    if (ht) spot.set(ht.x, ht.z)
    spotAmt += ((ht ? 1 : 0) - spotAmt) * k(5)
    groundMat.uniforms.uSpot.value.copy(spot)
    groundMat.uniforms.uSpotAmt.value = spotAmt
    groundMat.uniforms.uTime.value = t
    halo.position.set(spot.x, 0.012, spot.y)
    const ph = (t * 0.6) % 1
    halo.scale.setScalar(0.9 + ph * 0.6)
    haloMat.opacity = spotAmt * (1 - ph) * 0.85
    halo.visible = spotAmt > 0.01
    carMat.uniforms.uTime.value = t
    ;(sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t

    // 천천히 흐르는 시선 + 손 따라 기우는 시선
    pointer.sx += ((pointer.inside ? pointer.x : 0) - pointer.sx) * k(2.5)
    pointer.sy += ((pointer.inside ? pointer.y : 0) - pointer.sy) * k(2.5)
    const intro = ease(t / 3)
    const az = Math.sin(t * 0.08) * 0.22 + pointer.sx * 0.1 + (1 - intro) * 0.45
    const polar = POLAR - (1 - intro) * 0.14 + Math.sin(t * 0.11) * 0.018 + pointer.sy * 0.035
    place(dist * (1 + (1 - intro) * 0.22 + Math.sin(t * 0.06) * 0.012), polar, az)

    if (frames === 2 && !readySent) {
      readySent = true
      cb.onReady()
    }
    placeTags(t)
  }

  function placeTags(t: number) {
    const { w, h } = stage.size()
    if (!w) return
    placed.length = 0
    const limit = w < 420 ? 5 : w < 760 ? 8 : 12
    let count = 0
    const order = [...towers].sort(
      (a, b) =>
        (b.data.province === highlight ? 1 : 0) - (a.data.province === highlight ? 1 : 0) ||
        b.data.sites - a.data.sites,
    )
    for (const tw of order) {
      const on = tw.data.province === highlight
      let show = false
      const born = t - tw.delay > 1.4
      if (born && (count < limit || on)) {
        if (!tw.tagSize.w) {
          const el = tw.tag.firstElementChild as HTMLElement | null
          tw.tagSize.w = el?.offsetWidth ?? 0
          tw.tagSize.h = el?.offsetHeight ?? 0
        }
        tmp.set(tw.x, tw.H + (tw.crane ? CRANE_H * 0.92 : 0.06), tw.z).project(camera)
        const sx = (tmp.x * 0.5 + 0.5) * w
        const sy = (-tmp.y * 0.5 + 0.5) * h
        const bx = {
          x: sx - tw.tagSize.w / 2 - 2,
          y: sy - tw.tagSize.h - 14,
          w: tw.tagSize.w + 4,
          h: tw.tagSize.h + 4,
        }
        const inView = bx.x > 4 && bx.x + bx.w < w - 4 && bx.y > 4
        if (
          inView &&
          !placed.some(o => bx.x < o.x + o.w && bx.x + bx.w > o.x && bx.y < o.y + o.h && bx.y + bx.h > o.y)
        ) {
          placed.push(bx)
          show = true
          count++
          tw.tag.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`
        }
      }
      if (show !== (tw.tag.dataset.show === '1')) {
        if (show) tw.tag.dataset.show = '1'
        else delete tw.tag.dataset.show
      }
      if (on !== (tw.tag.dataset.on === '1')) {
        if (on) tw.tag.dataset.on = '1'
        else delete tw.tag.dataset.on
        tw.tagSize.w = 0
      }
    }
  }

  fit()

  return {
    setHighlight(p) {
      highlight = p
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('click', onClick)
      stage.dispose()
      tagLayer.remove()
    },
  }
}
