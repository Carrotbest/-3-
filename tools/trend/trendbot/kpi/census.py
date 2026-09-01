# -*- coding: utf-8 -*-
"""미국 의류·원단 수입액과 생산국 점유율. US Census Bureau 국제무역 통계가 원천이다.

OTEXA가 보던 숫자와 같은 원자료다. OTEXA는 API가 없고 사이트 인증서도 불안정해서
정부 원천인 Census API를 직접 쓴다. 무료 키가 필요하다(즉시 발급).
  https://api.census.gov/data/key_signup.html
발급받은 키는 GitHub Secrets의 CENSUS_API_KEY에 넣는다.

키가 없으면 조용히 건너뛴다. 나머지 지표 수집은 계속한다.
"""

import time
from datetime import date

import requests

from .. import config
from ..store import read_json
from . import base

ENDPOINT = "https://api.census.gov/data/timeseries/intltrade/imports/hs"
TOTAL = "TOTAL FOR ALL COUNTRIES"

# HS 2단위 묶음. 우리 팀이 보는 것은 니트 의류와 원단이다.
CHAPTERS = {
    "us_import_apparel": {"codes": ["61", "62"], "label": "미국 의류 수입액",
                          "note": "니트·우븐 의류 합계. 바이어 발주 총량의 대리 지표다."},
    "us_import_knit_fabric": {"codes": ["60"], "label": "미국 니트 원단 수입액",
                              "note": "원단 단위 교역량. 의류보다 우리 개발 물량에 가깝다."},
}

# 점유율을 따로 뽑을 생산국. Census가 주는 국가명 그대로 맞춘다.
COUNTRIES = {"VIETNAM": "베트남", "CHINA": "중국", "BANGLADESH": "방글라데시",
             "INDIA": "인도", "INDONESIA": "인도네시아", "CAMBODIA": "캄보디아",
             "KOREA, SOUTH": "한국", "HONDURAS": "온두라스"}

LOOKBACK = 24        # 처음 돌릴 때 채울 개월 수
REVISE = 3           # 최근 몇 개월은 수정 공표를 반영해 다시 받는다


def _months(existing):
    """받아야 할 달만 고른다. 최근 몇 달은 수정될 수 있으니 다시 받는다."""
    today = date.today()
    wanted = []
    for back in range(1, LOOKBACK + 1):
        month = today.month - back
        year = today.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        wanted.append(f"{year}-{month:02d}")
    fresh = set(wanted[:REVISE])
    return sorted(m for m in wanted if m not in existing or m in fresh)


def _fetch(session, chapter, month, key, log):
    params = {"get": "CTY_NAME,GEN_VAL_MO", "COMM_LVL": "HS2",
              "I_COMMODITY": chapter, "time": month, "key": key}
    try:
        res = session.get(ENDPOINT, params=params, timeout=40)
    except Exception as exc:
        log(f"Census {chapter} {month} 실패 · {type(exc).__name__}")
        return None
    if res.status_code == 204:
        return {}                       # 아직 공표되지 않은 달
    if res.status_code != 200:
        log(f"Census {chapter} {month} HTTP {res.status_code} · {res.text[:120]}")
        return None
    try:
        rows = res.json()
    except ValueError:
        log(f"Census {chapter} {month} 응답이 JSON이 아닙니다 · {res.text[:120]}")
        return None
    head, body = rows[0], rows[1:]
    name_at, value_at = head.index("CTY_NAME"), head.index("GEN_VAL_MO")
    out = {}
    for row in body:
        try:
            out[row[name_at].strip().upper()] = float(row[value_at])
        except (ValueError, IndexError):
            continue
    return out


def collect(cfg, log):
    if not config.CENSUS_KEY:
        log("Census 건너뜀 · CENSUS_API_KEY 환경변수가 없습니다 (무료 발급 필요)")
        return []

    session = requests.Session()
    proxy = config.proxies()
    if proxy:
        session.proxies.update(proxy)

    out = []
    for metric, spec in CHAPTERS.items():
        stored = read_json(config.KPI_DATA / f"{metric}.json", {})
        have = {p["period"] for p in stored.get("points", [])}
        months = _months(have)

        totals, shares = [], {code: [] for code in COUNTRIES}
        for month in months:
            merged = {}
            failed = False
            for chapter in spec["codes"]:
                rows = _fetch(session, chapter, month, config.CENSUS_KEY, log)
                if rows is None:
                    failed = True
                    break
                for name, value in rows.items():
                    merged[name] = merged.get(name, 0.0) + value
                time.sleep(0.3)
            if failed or not merged:
                continue

            grand = merged.get(TOTAL) or sum(v for k, v in merged.items() if k != TOTAL)
            if not grand:
                continue
            totals.append({"period": month, "value": round(grand / 1e6, 1)})
            for name in COUNTRIES:
                if name in merged:
                    shares[name].append({"period": month,
                                         "value": round(merged[name] / grand * 100, 2)})

        if totals:
            out.append(base.Series(
                metric=metric, label=spec["label"], unit="백만 달러", freq="월간",
                group="gov", entity="미국 수입", source_name="US Census Bureau · International Trade",
                source_url="https://usatrade.census.gov/", note=spec["note"], points=totals))
            log(f"Census {spec['label']} {len(totals)}개월 갱신")

        for name, points in shares.items():
            if not points:
                continue
            out.append(base.Series(
                metric=f"{metric}_share_{name.split(',')[0].lower().replace(' ', '_')}",
                label=f"{spec['label']} 중 {COUNTRIES[name]} 비중",
                unit="%", freq="월간", group="gov", entity=COUNTRIES[name], kind="share",
                source_name="US Census Bureau · International Trade",
                source_url="https://usatrade.census.gov/",
                note="생산국 이동 흐름. 우리 생산 거점 판단의 배경 자료다.", points=points))
    return out
