#!/usr/bin/env python3
"""
전국 도시철도 · 광역전철 역 정적 데이터 빌드 스크립트.

원천: Wikidata SPARQL (South Korea P17=Q884, connecting line P81, coordinates P625,
      transport network P16, state of use P5817, dissolved/closed P576).
원칙:
  - 공사 중(Q12377751)·계획(Q6498684)·폐쇄(P576) 노선/역은 제외하고 운행 중인 노선만 포함한다.
  - 동일 노선의 분리 표기(예: 서울 지하철 1호선·수도권 전철 1호선·경인선)는 정규 노선 코드로 통합해
    환승 노선 수가 중복 집계되지 않게 한다.
  - 화물선·기지선·삼각선 등 여객 도시철도가 아닌 지선은 제외한다.

출력: public/spatial/transit/stations-v1.json

교정 단계(apply_corrections) — 위키데이터의 노선 연결(P81)만으로는 틀리는 자리를 사람이 확인한 규칙으로 바로잡는다.
  - 신호소·신호장 등 여객이 타고 내리지 않는 점을 뺀다
  - 다른 노선으로 잘못 묶인 기록을 옮기거나 지운다(예: 연신내 2호선, 용산~청량리 경원선 구간의 1호선)
  - 영문으로 남은 이름을 고친다(Gyodae → 교대역)
  - 도시철도·광역전철 운행이 없는 간선 구간(경강선 KTX 구간 등)을 뺀다
  - 이미 있는 역 좌표에 빠진 노선을 붙인다(청량리 경의·중앙선 등)
  - 아예 빠진 역은 위키데이터 검색(wbsearchentities)으로 좌표를 찾되, 노선 구간의 범위 안에서 하나로
    정해질 때만 넣는다. 못 찾거나 둘 이상이면 넣지 않고 보고한다(좌표를 지어내지 않는다).
  --from-json 으로 이미 만든 파일에 교정만 다시 적용할 수 있다(네트워크 없이 — 검색 보강은 건너뛴다).
"""
import argparse
import json
import os
import re
from datetime import datetime, timezone


SPARQL = """
SELECT ?st ?stLabel ?coord ?line ?lineLabel ?netLabel ?stUse ?stClosed ?lineUse ?lineClosed WHERE {
  ?st wdt:P17 wd:Q884 ;
      wdt:P81 ?line ;
      wdt:P625 ?coord .
  OPTIONAL { ?st wdt:P16 ?net . }
  OPTIONAL { ?st wdt:P5817 ?stUse . }
  OPTIONAL { ?st wdt:P576 ?stClosed . }
  OPTIONAL { ?line wdt:P5817 ?lineUse . }
  OPTIONAL { ?line wdt:P576 ?lineClosed . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ko,en". }
}
"""

UNDER_CONSTRUCTION = "Q12377751"
PLANNED = "Q6498684"
CLOSED_USE = {"Q11639308", "Q15850590", "Q19809299"}

METRO_NETS = {"수도권 전철", "서울 지하철", "인천 도시철도", "부산 도시철도", "대구 도시철도", "대전 도시철도", "광주 도시철도"}

# 노선 QID -> (정규 lineId, 표기 lineName, 수도권/광역 망 필터 필요 여부)
CANONICAL_LINES = {
    "Q92501": ("METRO_1", "수도권 1호선", False),
    "Q20280": ("METRO_1", "수도권 1호선", False),
    "Q20998": ("METRO_1", "수도권 1호선", False),
    "Q483052": ("METRO_1", "수도권 1호선", True),
    "Q17501": ("METRO_2", "서울 2호선", False),
    "Q15150984": ("METRO_2", "서울 2호선", False),
    "Q20391": ("METRO_3", "수도권 3호선", False),
    "Q20393": ("METRO_3", "수도권 3호선", False),
    "Q626574": ("METRO_3", "수도권 3호선", False),
    "Q92502": ("METRO_4", "수도권 4호선", False),
    "Q489253": ("METRO_4", "수도권 4호선", False),
    "Q16190374": ("METRO_4", "수도권 4호선", False),
    "Q484317": ("METRO_4", "수도권 4호선", False),
    "Q483339": ("METRO_4", "수도권 4호선", False),
    "Q92530": ("METRO_5", "수도권 5호선", False),
    "Q21060694": ("METRO_5", "수도권 5호선", False),
    "Q92549": ("METRO_6", "서울 6호선", False),
    "Q22910": ("METRO_7", "서울 7호선", False),
    "Q45086": ("METRO_8", "수도권 8호선", False),
    "Q16219900": ("METRO_8", "수도권 8호선", False),
    "Q17503": ("METRO_9", "서울 9호선", False),
    "Q110408469": ("METRO_9", "서울 9호선", False),
    "Q20388": ("SHINBUNDANG", "신분당선", False),
    "Q84389881": ("SUIN_BUNDANG", "수인·분당선", False),
    "Q16266": ("SUIN_BUNDANG", "수인·분당선", False),
    "Q16948": ("SUIN_BUNDANG", "수인·분당선", False),
    "Q18233162": ("GYEONGUI_JUNGANG", "경의·중앙선", False),
    "Q17488": ("GYEONGUI_JUNGANG", "경의·중앙선", True),
    "Q32713": ("GYEONGUI_JUNGANG", "경의·중앙선", True),
    "Q20192": ("GYEONGCHUN", "경춘선", False),
    "Q24044969": ("GYEONGGANG", "경강선", False),
    "Q23933857": ("GYEONGGANG", "경강선", False),
    "Q626243": ("SEOHAE", "서해선", False),
    "Q109116480": ("SEOHAE", "서해선", False),
    "Q487643": ("AREX", "공항철도", False),
    "Q22974067": ("GTX_A", "GTX-A", False),
    "Q3832795": ("UI_SINSEOL", "우이신설선", False),
    "Q3832768": ("SILLIM", "신림선", False),
    "Q12589088": ("GIMPO_GOLD", "김포골드라인", False),
    "Q489609": ("EVERLINE", "용인경전철", False),
    "Q491655": ("UIJEONGBU", "의정부경전철", False),
    "Q487733": ("INCHEON_1", "인천 1호선", False),
    "Q484739": ("INCHEON_2", "인천 2호선", False),
    "Q86356": ("BUSAN_1", "부산 1호선", False),
    "Q86467": ("BUSAN_2", "부산 2호선", False),
    "Q86468": ("BUSAN_3", "부산 3호선", False),
    "Q86469": ("BUSAN_4", "부산 4호선", False),
    "Q87056": ("BGL", "부산-김해경전철", False),
    "Q11235800": ("DONGHAE", "동해선", True),
    "Q200331": ("DAEGU_1", "대구 1호선", False),
    "Q200332": ("DAEGU_2", "대구 2호선", False),
    "Q4706906": ("DAEGU_3", "대구 3호선", False),
    "Q200310": ("DAEJEON_1", "대전 1호선", False),
    "Q626996": ("GWANGJU_1", "광주 1호선", False),
}

# lineUse 가 폐쇄됨으로 적혀도 승계 노선으로 계속 운행 중인 구 노선 QID
LEGACY_ACTIVE_LINE_QIDS = {"Q16266", "Q16948"}


VERSION = "transit-v1.1"


def norm(name):
    """'서울역 (공항철도)' · '서울 역' → '서울'"""
    n = re.sub(r"\(.*?\)", "", name)
    n = re.sub(r"\s+", "", n)
    return re.sub(r"역$", "", n)


# 여객 역이 아닌 점
NON_PASSENGER = re.compile(r"(신호소|신호장|조차장|기지)$")

# 영문·잘못된 이름 → 실제 역명
RENAME = {
    "Gyodae": "교대역",
    "Geoje": "거제역",
    "Daejeo": "대저역",
    "지하철 영등포역": "영등포역",
    "건국대역": "건대입구역",
}

# (정규화 이름, 노선) — 그 노선을 지나지 않는 기록. 값이 있으면 그 노선으로 옮긴다
MOVE_OR_DROP = {
    ("연신내", "METRO_2"): None,  # 3·6호선·GTX-A 역
    # 용산~청량리 경원선 구간은 경의·중앙선이 다닌다. 1호선 전동차는 서울역·시청 지하로 간다
    ("이촌", "METRO_1"): "GYEONGUI_JUNGANG",
    ("서빙고", "METRO_1"): "GYEONGUI_JUNGANG",
    ("한남", "METRO_1"): "GYEONGUI_JUNGANG",
    ("옥수", "METRO_1"): "GYEONGUI_JUNGANG",
    ("응봉", "METRO_1"): "GYEONGUI_JUNGANG",
    ("왕십리", "METRO_1"): "GYEONGUI_JUNGANG",
    # 1호선은 연천에서 끝난다
    ("대광리", "METRO_1"): None,
    ("신탄리", "METRO_1"): None,
    # 경강선 원주~강릉은 KTX 간선 구간 — 광역전철이 다니지 않는다
    ("만종", "GYEONGGANG"): None,
    ("횡성", "GYEONGGANG"): None,
    ("둔내", "GYEONGGANG"): None,
    ("평창", "GYEONGGANG"): None,
    ("진부", "GYEONGGANG"): None,
    ("강릉", "GYEONGGANG"): None,
    # 서해선 서화성~홍성은 간선 열차만 다닌다
    ("서화성", "SEOHAE"): None,
    ("안중", "SEOHAE"): None,
    ("인주", "SEOHAE"): None,
}

LINE_NAME = {lid: lname for (lid, lname, _) in CANONICAL_LINES.values()}

# 구간 범위(위도 lo, hi, 경도 lo, hi) — 같은 이름의 다른 도시 역을 집지 않게
SEOUL = (37.40, 37.75, 126.70, 127.20)
GYEONGUI = (37.52, 37.92, 126.68, 126.96)
JUNGANG = (37.45, 37.66, 127.00, 127.66)
LINE1_SOUTH = (36.70, 37.30, 126.90, 127.20)
BUSAN_DONGHAE = (35.15, 35.57, 129.05, 129.40)

# 이미 있는 역 좌표에 붙일 노선: (이름, 노선, 범위)
ADD_TO_EXISTING = [
    ("청량리", "GYEONGUI_JUNGANG", SEOUL),
    ("서울", "GYEONGUI_JUNGANG", SEOUL),
    ("서울", "GTX_A", SEOUL),
    ("망우", "GYEONGUI_JUNGANG", SEOUL),
    ("상봉", "GYEONGCHUN", SEOUL),
    ("까치산", "METRO_2", SEOUL),
    ("대곡", "SEOHAE", SEOUL),
    ("능곡", "SEOHAE", SEOUL),
    ("부천종합운동장", "SEOHAE", SEOUL),
    ("교대", "DONGHAE", BUSAN_DONGHAE),
    ("거제", "DONGHAE", BUSAN_DONGHAE),
    ("벡스코", "DONGHAE", BUSAN_DONGHAE),
]

# 검색으로 찾은 역에 붙일 노선(검색 뒤에 처리한다)
ADD_AFTER_LOOKUP = [
    ("수원", "SUIN_BUNDANG", LINE1_SOUTH),
]

# 아예 빠진 역 — 위키데이터 검색으로 좌표를 찾는다(네트워크가 있을 때만)
LOOKUP = [
    *[(n, "GYEONGUI_JUNGANG", GYEONGUI) for n in ["서강대", "수색", "화전", "강매", "곡산", "백마", "풍산", "일산", "탄현", "야당", "운정", "금릉", "금촌", "월롱", "파주"]],
    *[(n, "GYEONGUI_JUNGANG", JUNGANG) for n in ["서빙고", "한남", "중랑", "양원", "도농", "양정", "덕소", "도심", "팔당", "운길산", "양수", "신원", "국수", "아신", "오빈", "양평", "원덕", "용문"]],
    *[(n, "METRO_1", LINE1_SOUTH) for n in ["수원", "병점", "평택지제", "천안", "온양온천", "신창"]],
    *[(n, "METRO_2", SEOUL) for n in ["도림천", "양천구청", "신정네거리"]],
    *[(n, "DONGHAE", BUSAN_DONGHAE) for n in ["좌천", "월내", "서생", "남창", "망양", "덕하", "개운포", "태화강"]],
]


def inside(box, lat, lng):
    return box[0] <= lat <= box[1] and box[2] <= lng <= box[3]


def record(name, lid, lat, lng, source_id, source="Wikidata"):
    return {
        "sourceId": source_id,
        "name": name,
        "lineId": lid,
        "lineName": LINE_NAME[lid],
        "operator": None,
        "status": "OPERATING",
        "lat": lat,
        "lng": lng,
        "complexKey": None,
        "source": source,
        "version": VERSION,
    }


def wikidata_lookup(name, box):
    """'수원역' 을 위키데이터에서 찾아 범위 안의 좌표 하나를 돌려준다. 없거나 여럿이면 None"""
    import requests

    ua = {"User-Agent": "zipcatch-spatial-build/1.1 (+https://zipcatch.vercel.app)"}
    api = "https://www.wikidata.org/w/api.php"
    found = requests.get(api, params={"action": "wbsearchentities", "search": f"{name}역", "language": "ko", "type": "item", "limit": 15, "format": "json"}, headers=ua, timeout=30).json()
    ids = [h["id"] for h in found.get("search", [])]
    if not ids:
        return None, "검색 결과 없음"
    ents = requests.get(api, params={"action": "wbgetentities", "ids": "|".join(ids), "props": "claims|labels", "languages": "ko", "format": "json"}, headers=ua, timeout=30).json().get("entities", {})
    hits = {}
    for qid, e in ents.items():
        claims = e.get("claims", {})
        if not any(c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") == "Q884" for c in claims.get("P17", [])):
            continue
        if claims.get("P576"):
            continue
        label = e.get("labels", {}).get("ko", {}).get("value", "")
        if norm(label) != name:
            continue
        for c in claims.get("P625", []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if v and inside(box, v["latitude"], v["longitude"]):
                hits[qid] = (round(v["latitude"], 6), round(v["longitude"], 6))
                break
    if not hits:
        return None, "범위 안 후보 없음"
    pts = list(hits.items())
    # 같은 역의 다른 항목(노선별 항목)일 수 있다 — 서로 400m 안이면 첫 항목으로
    lat0, lng0 = pts[0][1]
    if all(abs(lat - lat0) < 0.004 and abs(lng - lng0) < 0.005 for _, (lat, lng) in pts):
        return (pts[0][0], lat0, lng0), None
    return None, f"범위 안 후보 {len(pts)}곳(서로 다른 자리)"


def apply_corrections(records, lookup=True):
    report = {"dropped": [], "renamed": [], "moved": [], "added": [], "unresolved": []}
    out = []
    for r in records:
        r = dict(r, version=VERSION)
        if r["name"] in RENAME:
            report["renamed"].append(f"{r['name']} → {RENAME[r['name']]}")
            r["name"] = RENAME[r["name"]]
        key = (norm(r["name"]), r["lineId"])
        if NON_PASSENGER.search(norm(r["name"])):
            report["dropped"].append(f"{r['name']} ({r['lineName']}) — 여객 역 아님")
            continue
        if key in MOVE_OR_DROP:
            to = MOVE_OR_DROP[key]
            if to is None:
                report["dropped"].append(f"{r['name']} ({r['lineName']})")
                continue
            report["moved"].append(f"{r['name']}: {r['lineName']} → {LINE_NAME[to]}")
            r.update(lineId=to, lineName=LINE_NAME[to], sourceId=r["sourceId"].split(":")[0] + ":" + to)
        out.append(r)

    def has(name, lid):
        return any(norm(x["name"]) == name and x["lineId"] == lid for x in out)

    # 같은 역·같은 노선 두 번(옮기다 겹친 것) — 하나만
    seen, dedup = set(), []
    for r in out:
        k = (norm(r["name"]), r["lineId"], round(r["lat"], 3), round(r["lng"], 3))
        if k in seen:
            continue
        seen.add(k)
        dedup.append(r)
    out = dedup

    for name, lid, box in ADD_TO_EXISTING:
        if has(name, lid):
            continue
        base = next((x for x in out if norm(x["name"]) == name and inside(box, x["lat"], x["lng"])), None)
        if not base:
            report["unresolved"].append(f"{name} ({LINE_NAME[lid]}) — 붙일 역 좌표 없음")
            continue
        out.append(record(base["name"], lid, base["lat"], base["lng"], base["sourceId"].split(":")[0] + ":" + lid, base["source"]))
        report["added"].append(f"{name} +{LINE_NAME[lid]} (기존 좌표)")

    for name, lid, box in LOOKUP:
        if has(name, lid):
            continue
        base = next((x for x in out if norm(x["name"]) == name and inside(box, x["lat"], x["lng"])), None)
        if base:
            out.append(record(base["name"], lid, base["lat"], base["lng"], base["sourceId"].split(":")[0] + ":" + lid, base["source"]))
            report["added"].append(f"{name} +{LINE_NAME[lid]} (기존 좌표)")
            continue
        if not lookup:
            report["unresolved"].append(f"{name} ({LINE_NAME[lid]}) — 검색 보강 생략(네트워크 없음)")
            continue
        try:
            hit, why = wikidata_lookup(name, box)
        except Exception as e:  # noqa: BLE001 — 하나가 실패해도 나머지는 계속
            hit, why = None, f"검색 실패: {e}"
        if not hit:
            report["unresolved"].append(f"{name} ({LINE_NAME[lid]}) — {why}")
            continue
        qid, lat, lng = hit
        out.append(record(f"{name}역", lid, lat, lng, f"{qid}:{lid}"))
        report["added"].append(f"{name} +{LINE_NAME[lid]} ({qid})")

    for name, lid, box in ADD_AFTER_LOOKUP:
        if has(name, lid):
            continue
        base = next((x for x in out if norm(x["name"]) == name and inside(box, x["lat"], x["lng"])), None)
        if not base:
            report["unresolved"].append(f"{name} ({LINE_NAME[lid]}) — 붙일 역 좌표 없음")
            continue
        out.append(record(base["name"], lid, base["lat"], base["lng"], base["sourceId"].split(":")[0] + ":" + lid, base["source"]))
        report["added"].append(f"{name} +{LINE_NAME[lid]} (기존 좌표)")

    out.sort(key=lambda x: (x["lineId"], norm(x["name"])))
    return out, report


def write(out_path, records, report):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    payload = {
        "version": VERSION,
        "source": "Wikidata SPARQL·검색 (CC0) + 집캐치 교정 규칙(scripts/spatial/build_stations.py)",
        "attribution": "Wikidata contributors (CC0) · 도시철도·광역전철 운행 노선 기준 정제",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "recordCount": len(records),
        "corrections": {k: len(v) for k, v in report.items()},
        "unresolved": report["unresolved"],
        "records": records,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps({"records": len(records), "out": out_path, **{k: len(v) for k, v in report.items()}}, ensure_ascii=False))
    for k, v in report.items():
        for line in v:
            print(f"  [{k}] {line}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out",
        default=os.path.join(os.path.dirname(__file__), "..", "..", "public", "spatial", "transit", "stations-v1.json"),
    )
    ap.add_argument("--from-json", help="이미 만든 파일에 교정만 다시 적용한다(네트워크 없이)")
    a = ap.parse_args()
    out_path = os.path.abspath(a.out)

    if a.from_json:
        with open(a.from_json, encoding="utf-8") as fh:
            base = json.load(fh)["records"]
        records, report = apply_corrections(base, lookup=False)
        write(out_path, records, report)
        return

    import requests

    r = requests.get(
        "https://query.wikidata.org/sparql",
        params={"query": SPARQL, "format": "json"},
        headers={
            "User-Agent": "zipcatch-spatial-build/1.0 (+https://zipcatch.vercel.app)",
            "Accept": "application/sparql-results+json",
        },
        timeout=45,
    )
    r.raise_for_status()
    rows = r.json()["results"]["bindings"]

    # 같은 (역 QID, 정규 노선) 조합을 묶으면서 transport network 정보도 모은다
    grouped = {}
    for b in rows:
        lq = b["line"]["value"].split("/")[-1]
        if lq not in CANONICAL_LINES:
            continue
        if "stClosed" in b or ("lineClosed" in b and lq not in LEGACY_ACTIVE_LINE_QIDS):
            continue
        su = b.get("stUse", {}).get("value", "").split("/")[-1]
        lu = b.get("lineUse", {}).get("value", "").split("/")[-1]
        if su in (UNDER_CONSTRUCTION, PLANNED) or su in CLOSED_USE:
            continue
        if lu in (UNDER_CONSTRUCTION, PLANNED) or (lu in CLOSED_USE and lq not in LEGACY_ACTIVE_LINE_QIDS):
            continue

        m = re.match(r"Point\(([-0-9.]+) ([-0-9.]+)\)", b.get("coord", {}).get("value", ""))
        if not m:
            continue
        lng, lat = round(float(m.group(1)), 6), round(float(m.group(2)), 6)
        if not (33.0 <= lat <= 38.9 and 124.0 <= lng <= 132.0):
            continue

        lid, lname, require_metro_net = CANONICAL_LINES[lq]
        sid = b["st"]["value"].split("/")[-1]
        name = b.get("stLabel", {}).get("value", "").strip()
        if not name or re.match(r"^Q\d+$", name):
            continue

        key = (sid, lid)
        entry = grouped.setdefault(
            key,
            {
                "sourceId": f"{sid}:{lid}",
                "stationQid": sid,
                "name": name,
                "lineId": lid,
                "lineName": lname,
                "lat": lat,
                "lng": lng,
                "nets": set(),
                "requireMetro": require_metro_net,
            },
        )
        net = b.get("netLabel", {}).get("value")
        if net:
            entry["nets"].add(net)
        if not require_metro_net:
            entry["requireMetro"] = False

    records = []
    for key in sorted(grouped):
        e = grouped[key]
        if e["requireMetro"] and not (e["nets"] & METRO_NETS):
            continue
        records.append(
            {
                "sourceId": e["sourceId"],
                "name": e["name"],
                "lineId": e["lineId"],
                "lineName": e["lineName"],
                "operator": None,
                "status": "OPERATING",
                "lat": e["lat"],
                "lng": e["lng"],
                "complexKey": None,
                "source": "Wikidata",
                "version": VERSION,
            }
        )

    records, report = apply_corrections(records, lookup=True)
    write(out_path, records, report)


if __name__ == "__main__":
    main()
