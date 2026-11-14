#!/usr/bin/env python3
"""
동네 공간 자산 만들기 — 방문자가 누를 때 바깥 지도 서버에 묻지 않도록, 미리 만들어 정적 파일로 둔다.

  원천   Protomaps Basemap 일일 빌드(OpenStreetMap 파생, ODbL 1.0) — PMTiles 를 HTTP 범위 요청으로 읽는다.
         전 세계 파일(약 130GB)을 내려받지 않고 필요한 z15 타일만 읽는다.
  단위   z15 웹 메르카토르 타일(한국에서 가로세로 약 1km). 인접 공고는 같은 타일을 함께 쓴다.
         공고 id 와 공간 자산 id(15/x/y)는 따로다.
  정제   타일 경계로 자르기(가장자리 겹침 제거) · 형상 바로잡기(make_valid) · 0.25m 단순화
         · 아주 작은 조각 버리기 · 높이는 0 초과 600m 미만의 수치만(그 밖은 높이 없음 → 바닥 윤곽)
  출력   public/spatial/<version>/15/<x>/<y>.json · public/spatial/<version>/manifest.json

필요한 자리: 운영 공개 API(/api/notices/map?range=all)의 공고 가운데 위치 등급이 필지·주소·공고명인 것.
공고명 좌표는 범위가 넓어 반경 600m, 그 밖 450m 를 덮는다(화면의 불확실 범위와 같다). 이미 있는 타일은 다시 만들지 않는다(--force 로 다시).

실행
  python3 -m venv .venv && .venv/bin/pip install pmtiles mapbox-vector-tile shapely requests
  .venv/bin/python scripts/spatial/build_tiles.py --build 20261113
"""
import argparse, gzip, json, math, os, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
import mapbox_vector_tile as mvt
from pmtiles.reader import Reader
from shapely.geometry import shape, Polygon, MultiPolygon, LineString, MultiLineString, GeometryCollection
from shapely.validation import make_valid

Z = 15
EXTENT = 4096
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'spatial')
MAJOR = {'highway', 'major_road'}
MINOR = {'minor_road'}
PARK = {'park', 'forest', 'wood', 'grass', 'garden', 'nature_reserve', 'recreation_ground', 'golf_course', 'cemetery', 'meadow', 'village_green'}
# 일반 지역 고정 좌표(고덕강일 3단지 현장 기준점 — lib/consumer/sites/godeok-gangil-3.ts 의 origin)
EXTRA = [{'id': 'godeok-gangil-3', 'lat': 37.5724007, 'lng': 127.1701512, 'provenance': 'PARCEL_CONFIRMED'}]


def tile_of(lat, lng, z=Z):
    n = 2 ** z
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def cover(lat, lng, r_m, z=Z):
    dlat = r_m / 110540
    dlng = r_m / (111320 * math.cos(math.radians(lat)))
    x0, y0 = tile_of(lat + dlat, lng - dlng, z)
    x1, y1 = tile_of(lat - dlat, lng + dlng, z)
    return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        return [p for gg in g.geoms for p in polys(gg)]
    return []


def lines(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, (MultiLineString, GeometryCollection)):
        return [l for gg in g.geoms for l in lines(gg)]
    return []


def flat(coords):
    out = []
    for x, y in coords:
        out += [int(round(x)), int(round(y))]
    return out


def ring_list(p):
    # 바깥 고리 + 구멍 — 시작점=끝점 중복은 뺀다
    rs = [flat(list(p.exterior.coords)[:-1])]
    for h in p.interiors:
        c = list(h.coords)[:-1]
        if len(c) >= 3:
            rs.append(flat(c))
    return rs


def clean_poly(geom, min_area=4.0):
    g = make_valid(geom) if not geom.is_valid else geom
    g = g.intersection(BOX)
    out = []
    for p in polys(g):
        p = p.simplify(1.0, preserve_topology=True)
        if p.is_empty or p.area < min_area or len(p.exterior.coords) < 4:
            continue
        out.append(p)
    return out


BOX = Polygon([(0, 0), (EXTENT, 0), (EXTENT, EXTENT), (0, EXTENT)])


def height_of(props):
    h = props.get('height')
    if isinstance(h, (int, float)) and math.isfinite(h) and 0 < h < 600:
        return round(float(h), 1)
    return None


def process(raw):
    t = mvt.decode(raw, default_options={'y_coord_down': True})
    out = {'b': [], 'r': [], 'w': [], 'p': []}
    seen = set()
    for f in t.get('buildings', {}).get('features', []):
        if f['geometry']['type'] not in ('Polygon', 'MultiPolygon'):
            continue
        h = height_of(f.get('properties', {}))
        for p in clean_poly(shape(f['geometry'])):
            key = (round(p.centroid.x), round(p.centroid.y), round(p.area))
            if key in seen:  # 같은 건물이 두 번 실린 경우
                continue
            seen.add(key)
            out['b'].append([h, ring_list(p)])
    for f in t.get('roads', {}).get('features', []):
        kind = f.get('properties', {}).get('kind')
        if kind not in MAJOR and kind not in MINOR:
            continue
        g = shape(f['geometry']).intersection(BOX)
        for l in lines(g):
            l = l.simplify(1.0)
            if l.length < 4:
                continue
            out['r'].append([1 if kind in MAJOR else 0, flat(l.coords)])
    for f in t.get('water', {}).get('features', []):
        if f['geometry']['type'] in ('Polygon', 'MultiPolygon'):
            for p in clean_poly(shape(f['geometry']), 16):
                out['w'].append(ring_list(p))
    for f in t.get('landuse', {}).get('features', []):
        if f.get('properties', {}).get('kind') in PARK and f['geometry']['type'] in ('Polygon', 'MultiPolygon'):
            for p in clean_poly(shape(f['geometry']), 16):
                out['p'].append(ring_list(p))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--build', required=True, help='Protomaps 일일 빌드 날짜(YYYYMMDD)')
    ap.add_argument('--version', default='v1')
    ap.add_argument('--api', default='https://zipcatch.vercel.app/api/notices/map?range=all')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()

    url = f'https://build.protomaps.com/{a.build}.pmtiles'
    local = threading.local()

    def sess():
        if not hasattr(local, 's'):
            local.s = requests.Session()
            local.s.headers['User-Agent'] = 'zipcatch-spatial-build/1.0 (+https://zipcatch.vercel.app)'
        return local.s

    def get(off, ln):
        for i in range(4):
            try:
                r = sess().get(url, headers={'Range': f'bytes={off}-{off + ln - 1}'}, timeout=60)
                r.raise_for_status()
                return r.content
            except Exception:
                if i == 3:
                    raise
                time.sleep(2 ** i)

    rd = Reader(get)
    meta = rd.metadata()
    s = sess()

    pins = s.get(a.api, timeout=60).json()['pins']
    need = {}
    for p in pins + EXTRA:
        pv = p.get('provenance')
        if pv not in ('PARCEL_CONFIRMED', 'ADDRESS_GEOCODED', 'NAME_GEOCODED'):
            continue
        r = 600 if pv == 'NAME_GEOCODED' else 450
        for xy in cover(p['lat'], p['lng'], r):
            need.setdefault(xy, []).append(p['id'])

    root = os.path.join(ROOT, a.version)
    os.makedirs(root, exist_ok=True)
    counts = {'made': 0, 'skipped': 0, 'empty': 0, 'failed': 0}
    lock = threading.Lock()

    def one(xy):
        x, y = xy
        path = os.path.join(root, str(Z), str(x), f'{y}.json')
        if os.path.exists(path) and not a.force:
            k = 'skipped'
        else:
            try:
                raw = Reader(get).get(Z, x, y)
                if not raw:
                    k = 'empty'
                else:
                    if raw[:2] == b'\x1f\x8b':
                        raw = gzip.decompress(raw)
                    body = {'v': 1, 'z': Z, 'x': x, 'y': y, 'extent': EXTENT, **process(raw)}
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    with open(path, 'w') as fh:
                        json.dump(body, fh, separators=(',', ':'))
                    k = 'made'
            except Exception as e:
                print('fail', x, y, e, file=sys.stderr)
                k = 'failed'
        with lock:
            counts[k] += 1

    # 원천 서버에 무리를 주지 않게 동시 요청은 여섯까지
    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(one, sorted(need)))

    tiles = sorted(f'{Z}/{x}/{y}' for (x, y) in need if os.path.exists(os.path.join(root, str(Z), str(x), f'{y}.json')))
    manifest = {
        'version': a.version,
        'source': f"{meta.get('name', 'Protomaps Basemap')} {meta.get('version', '')}".strip(),
        'build': a.build,
        'origin': 'OpenStreetMap',
        'license': 'ODbL 1.0 — © OpenStreetMap 기여자. 이 타일 묶음은 OSM 파생 데이터베이스이며 ODbL 로 다시 배포한다.',
        'attribution': '© OpenStreetMap 기여자 (ODbL) · Protomaps',
        'z': Z,
        'extent': EXTENT,
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'tiles': tiles,
    }
    with open(os.path.join(root, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({'needed': len(need), **counts, 'tiles': len(tiles)}))


if __name__ == '__main__':
    main()
