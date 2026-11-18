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
"""
import argparse
import json
import os
import re
from datetime import datetime, timezone

import requests

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out",
        default=os.path.join(os.path.dirname(__file__), "..", "..", "public", "spatial", "transit", "stations-v1.json"),
    )
    a = ap.parse_args()

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
                "version": "transit-v1",
            }
        )

    out_path = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    payload = {
        "version": "transit-v1",
        "source": "Wikidata SPARQL (CC0)",
        "attribution": "Wikidata contributors (CC0) · 도시철도·광역전철 운행 노선 기준 정제",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "recordCount": len(records),
        "records": records,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps({"records": len(records), "out": out_path}, ensure_ascii=False))


if __name__ == "__main__":
    main()
