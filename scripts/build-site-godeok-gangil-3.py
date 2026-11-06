"""
고덕강일지구 3단지 현장 데이터(lib/consumer/sites/godeok-gangil-3.ts)를 다시 만든다.

준비물(작업 폴더에 둔다 — 저장소에 넣지 않는다)
  osm.xml     https://api.openstreetmap.org/api/0.6/map?bbox=127.1600,37.5655,127.1790,37.5795
  units.json  SH 정정본 공고문 52~80쪽 가격표를 `pdftotext -layout` 로 읽어 줄마다
              {dong, ho, type, plan, price, deposit, balance, balcony} 로 옮긴 것(1,305행)
실행
  python3 scripts/build-site-godeok-gangil-3.py   (osm.xml·units.json 이 있는 폴더에서)
지리 부분은 ODbL 1.0 — © OpenStreetMap 기여자.
"""
import os, sys
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib', 'consumer', 'sites', 'godeok-gangil-3.ts')
import xml.etree.ElementTree as ET, json, math, collections
r = ET.parse('osm.xml').getroot()
nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in r.iter('node')}
ways = {}
for w in r.iter('way'):
    ways[w.get('id')] = ({x.get('k'): x.get('v') for x in w.iter('tag')}, [nd.get('ref') for nd in w.iter('nd')], w.get('timestamp'))
site_tags, site_nds, _ = ways['901455440']
spts = [nodes[n] for n in site_nds]
lat0 = sum(p[0] for p in spts[:-1]) / (len(spts) - 1); lng0 = sum(p[1] for p in spts[:-1]) / (len(spts) - 1)
KX = 111320 * math.cos(math.radians(lat0)); KZ = 110574
def xy(p): return (round((p[1] - lng0) * KX, 1), round(-(p[0] - lat0) * KZ, 1))
def pts(nds): return [xy(nodes[n]) for n in nds if n in nodes]
def dp(P, tol):
    if len(P) < 3: return P
    a, b = P[0], P[-1]; dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1e-9
    i, dm = 0, 0
    for k in range(1, len(P)-1):
        d = abs(dy*P[k][0]-dx*P[k][1]+b[0]*a[1]-b[1]*a[0]) / L if L > 1e-6 else math.hypot(P[k][0]-a[0], P[k][1]-a[1])
        if d > dm: i, dm = k, d
    if dm > tol: return dp(P[:i+1], tol)[:-1] + dp(P[i:], tol)
    return [a, b]
def rnd(P, q=0.5): return [[round(x/q)*q, round(z/q)*q] for x, z in P]
def cen(P): return (sum(p[0] for p in P)/len(P), sum(p[1] for p in P)/len(P))
R = 700
def near(P, r=R): return any(math.hypot(x, z) < r for x, z in P)

if not os.path.exists('units.json'):
    # 정정본 공고문 텍스트(`pdftotext -layout 공고문.pdf notice.txt`)에서 가격표 줄을 읽는다
    import re
    rx = re.compile(r'^\s*(\d{3})\s+(\d{3,4})\s+(0\d\d\.0000[A-K])\s+(\d\d[A-K]\d?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$')
    rows = []
    for line in open('notice.txt').read().split('\n'):
        m = rx.match(line)
        if m:
            n = lambda v: int(v.replace(',', ''))
            d, h, ty, pl, tot, dep, bal, bx = m.groups()
            rows.append(dict(dong=int(d), ho=int(h), type=ty, plan=pl, price=n(tot), deposit=n(dep), balance=n(bal), balcony=n(bx)))
    assert len(rows) == 1305 and all(r['deposit'] + r['balance'] == r['price'] for r in rows)
    json.dump(rows, open('units.json', 'w'))
units = json.load(open('units.json'))
types = sorted({u['type'] for u in units}); plans = sorted({u['plan'] for u in units})
by_dong = collections.defaultdict(list)
for u in units: by_dong[u['dong']].append(u)

dongs = []
for wid, (t, nds, ts) in ways.items():
    if t.get('building') == 'construction' and t.get('name', '').endswith('동') and t['name'][:3].isdigit() and 301 <= int(t['name'][:3]) <= 317:
        d = int(t['name'][:3]); us = by_dong[d]; fl = [u['ho'] // 100 for u in us]
        dongs.append({'id': d, 'osm': int(wid), 'footprint': rnd(dp(pts(nds)[:-1], 0.3)),
                      'floors': max(fl), 'lowest': min(fl), 'units': len(us),
                      'lines': sorted({u['ho'] % 100 for u in us}),
                      'types': {ty: c for ty, c in sorted(collections.Counter(u['type'] for u in us).items())}})
dongs.sort(key=lambda d: d['id'])
assert len(dongs) == 17 and sum(d['units'] for d in dongs) == 1305

ctx_b, roads, water, parks, rivers = [], [], [], [], []
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link'}
MINOR = {'residential', 'unclassified', 'living_street'}
for wid, (t, nds, ts) in ways.items():
    P = pts(nds)
    if len(P) < 2 or not near(P): continue
    if 'building' in t and wid not in {str(d['osm']) for d in dongs}:
        if not nds or nds[0] != nds[-1]: continue
        c = cen(P)
        if math.hypot(*c) > 620: continue
        h = None
        try:
            if 'height' in t: h = float(t['height'].replace('m', ''))
            elif 'building:levels' in t: h = float(t['building:levels']) * 3.0
        except ValueError: h = None
        ctx_b.append({'f': rnd(dp(P[:-1], 0.5)), 'h': h, **({'n': t['name']} if 'name' in t and h else {})})
    elif t.get('highway') in MAJOR | MINOR:
        roads.append({'k': 1 if t['highway'] in MAJOR else 0, 'p': rnd(dp(P, 1.5), 1)})
    elif t.get('natural') == 'water' and nds[0] == nds[-1]:
        water.append(rnd(dp(P[:-1], 2), 1))
    elif t.get('waterway') in ('river', 'stream'):
        rivers.append({'n': t.get('name'), 'p': rnd(dp(P, 2), 1)})
    elif t.get('leisure') == 'park' and nds[0] == nds[-1]:
        parks.append(rnd(dp(P[:-1], 1.5), 1))

labels = []
def lab(name, kind):
    for wid, (t, nds, ts) in ways.items():
        if t.get('name') == name:
            P = [p for p in pts(nds) if math.hypot(*p) < 650]
            if P:
                p = min(P, key=lambda q: abs(math.hypot(*q) - 420))
                labels.append({'n': name, 'k': kind, 'x': round(p[0]), 'z': round(p[1])}); return
for n, k in [('한강', 'water'), ('고덕천', 'water'), ('올림픽대로', 'road'), ('수도권제1순환고속도로', 'road'), ('여울빛공원', 'park'), ('강동리버스트 6단지', 'place')]: lab(n, k)

ts_max = max(v[2] for v in ways.values())
out = {
    'origin': {'lat': round(lat0, 7), 'lng': round(lng0, 7)},
    'boundary': rnd(dp(pts(site_nds)[:-1], 0.5)),
    'dongs': dongs,
    'context': {'buildings': ctx_b, 'roads': roads, 'water': water, 'rivers': rivers, 'parks': parks, 'labels': labels},
    'types': types, 'plans': plans,
    'units': [[u['dong'], u['ho'], types.index(u['type']), plans.index(u['plan']), u['price']] for u in sorted(units, key=lambda u: (u['dong'], u['ho']))],
    'osmSnapshot': ts_max[:10],
}
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
print(len(s), len(ctx_b), len(roads), len(water), len(rivers), len(parks), labels)
print([(d['id'], d['floors'], d['lowest'], d['units'], d['lines']) for d in dongs])
hdr = '''/**
 * 고덕강일지구 3단지(청약홈 2026000373) 현장 데이터 — 스크립트로 뽑은 파일이다. 손으로 고치지 않는다.
 *
 *  - 동 윤곽·주변 건물·길·물·공원: OpenStreetMap 기여자 (ODbL 1.0, https://www.openstreetmap.org/copyright)
 *    API 0.6 bbox 127.1600,37.5655,127.1790,37.5795 를 받은 그대로 좌표만 줄였다. 이 파일의 지리 부분은 ODbL 을 따른다.
 *    3단지 동 윤곽은 공사 중(building=construction) 상태로 지도 기여자가 그린 것이다 — SH 가 확인한 형상이 아니다.
 *  - 동·호·주택형·평면유형·주택가격(천원): SH 입주자모집공고(2026.10.16, 정정본 동일) 52~80쪽 가격표 1,305행
 *  - 층수(floors)는 그 가격표의 가장 높은 호수 층이다. 높이는 층수 × 3m 로 가정한다(실제 층고 아님).
 * 좌표: origin 기준 미터. x = 동쪽, z = 남쪽.
 */
import type { SiteData } from '../complex-visualization'

export const SITE: SiteData = '''
open(OUT, 'w').write(hdr + s + '\n')
