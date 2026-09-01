# -*- coding: utf-8 -*-
"""바이어 매출·재고. 미국 SEC XBRL 공시(data.sec.gov)가 원천이다.

API 키가 없다. 다만 연락처가 담긴 User-Agent를 요구한다. 없으면 403이다.
개인 메일을 저장소에 넣지 않는다. SEC_CONTACT 환경변수(GitHub Secrets)로 주입한다.

분기 매출은 공시에 그대로 있지 않다. 10-Q는 3개월 구간과 누계 구간을 함께 싣고,
4분기는 아예 3개월 구간이 없다. 연간에서 1~3분기를 빼서 만든다.
"""

import time

import requests

from .. import config
from . import base

FACT = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
BACKOFFS = (2, 5, 15)

# 유통사마다 쓰는 태그가 다르다. 후보를 모두 평가해 최신 값이 있는 태그를 고른다.
REVENUE_TAGS = ("RevenueFromContractWithCustomerExcludingAssessedTax",
                "RevenueFromContractWithCustomerIncludingAssessedTax",
                "Revenues", "SalesRevenueNet")
INVENTORY_TAGS = ("InventoryNet", "RetailRelatedInventoryMerchandise",
                  "InventoryFinishedGoodsNetOfReserves")
# 영업이익을 공시하지 않는 회사의 예비 지표. 회사마다 쓰는 세전이익 태그가 다르고,
# 같은 회사가 도중에 갈아타기도 한다. Nike는 2021년까지 MinorityInterest... 를 쓰다가
# ExtraordinaryItems... 로 옮겼다. _concept가 최신 관측치가 늦은 쪽을 고르므로 둘 다 둔다.
PRETAX_TAGS = (
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
)
OPERATING_TAGS = ("OperatingIncomeLoss",) + PRETAX_TAGS

QUARTER_DAYS = (80, 100)
YEAR_DAYS = (350, 380)
FORMS = ("10-K", "10-Q")


def _headers():
    if not config.SEC_CONTACT:
        return None
    return {"User-Agent": f"Hansoll Fabric R&D trend bot ({config.SEC_CONTACT})",
            "Accept-Encoding": "gzip, deflate"}


class SecRequestBlocked(RuntimeError):
    """SEC가 차단했거나 일시적으로 응답하지 않아 재시도를 소진했다."""


def _get(session, url, headers):
    last_error = "응답 없음"
    for attempt in range(len(BACKOFFS) + 1):
        try:
            res = session.get(url, headers=headers, timeout=30)
            if res.status_code == 200:
                return res.json()
            if res.status_code == 404:
                return None
            last_error = f"HTTP {res.status_code}"
            retryable = res.status_code in (403, 429) or 500 <= res.status_code < 600
            if not retryable:
                raise SecRequestBlocked(last_error)
        except requests.RequestException as exc:
            last_error = type(exc).__name__
        if attempt < len(BACKOFFS):
            time.sleep(BACKOFFS[attempt])
    raise SecRequestBlocked(last_error)


def _days(row):
    from datetime import date
    try:
        start = date.fromisoformat(row["start"])
        end = date.fromisoformat(row["end"])
    except (KeyError, ValueError):
        return 0
    return (end - start).days


def _fiscal_quarter(row):
    """공시의 fy/fp를 그대로 쓴다. 소매업 회계연도는 달력과 어긋나므로 자체 계산하지 않는다."""
    fp = row.get("fp") or ""
    fy = row.get("fy")
    if not fy:
        return None
    if fp.startswith("Q"):
        return f"{fy}-{fp}"
    if fp == "FY":
        return f"{fy}-Q4"
    return None


def _duration_points(rows):
    """3개월 구간을 뽑고, 없는 4분기는 연간에서 1~3분기를 빼서 채운다."""
    quarters, years = {}, {}
    for row in rows:
        if row.get("form") not in FORMS or "start" not in row:
            continue
        span = _days(row)
        label = _fiscal_quarter(row)
        if not label:
            continue
        # 같은 구간이 여러 번 공시된다. 마지막에 제출된 값을 신뢰한다.
        if QUARTER_DAYS[0] <= span <= QUARTER_DAYS[1] and row.get("fp", "").startswith("Q"):
            prior = quarters.get(label)
            if not prior or row.get("filed", "") >= prior["filed"]:
                quarters[label] = {"val": row["val"], "filed": row.get("filed", ""), "end": row["end"]}
        elif YEAR_DAYS[0] <= span <= YEAR_DAYS[1]:
            prior = years.get(row["fy"])
            if not prior or row.get("filed", "") >= prior["filed"]:
                years[row["fy"]] = {"val": row["val"], "filed": row.get("filed", ""), "end": row["end"]}

    for fy, year in years.items():
        label = f"{fy}-Q4"
        if label in quarters:
            continue
        three = [quarters.get(f"{fy}-Q{n}") for n in (1, 2, 3)]
        if all(three):
            quarters[label] = {"val": year["val"] - sum(q["val"] for q in three),
                               "filed": year["filed"], "end": year["end"]}

    # 회계 라벨이 아니라 실제 종료일로 정렬한다.
    # 1~2월 결산 유통사는 "2026-Q4"(2월 종료)가 "2026-Q1"(5월 종료)보다 뒤에 오는데,
    # 문자열로 정렬하면 순서가 뒤집혀 화면이 두 분기 전 값을 최신으로 잡는다.
    return [{"period": k, "value": round(v["val"], 2), "end": v["end"]}
            for k, v in sorted(quarters.items(), key=lambda item: (item[1]["end"], item[0]))]


def _instant_points(rows):
    """재고처럼 시점 값. 분기 말 잔액을 그대로 쓴다."""
    picked = {}
    for row in rows:
        if row.get("form") not in FORMS or "start" in row:
            continue
        label = _fiscal_quarter(row)
        if not label:
            continue
        prior = picked.get(label)
        if not prior or row.get("filed", "") >= prior["filed"]:
            picked[label] = {"val": row["val"], "filed": row.get("filed", ""), "end": row["end"]}
    # _duration_points와 같은 이유로 종료일 기준이다.
    return [{"period": k, "value": round(v["val"], 2), "end": v["end"]}
            for k, v in sorted(picked.items(), key=lambda item: (item[1]["end"], item[0]))]


def _concept(data, tags, point_builder):
    """후보 태그 중 화면에 쓸 수 있는 최신 관측치의 end가 가장 늦은 것을 고른다."""
    gaap = data.get("facts", {}).get("us-gaap", {})
    candidates = []
    for order, tag in enumerate(tags):
        rows = gaap.get(tag, {}).get("units", {}).get("USD", [])
        points = point_builder(rows) if rows else []
        dated = [point.get("end", "") for point in points if point.get("end")]
        if points:
            candidates.append((max(dated, default=""), -order, tag, points))
    if not candidates:
        return None, []
    _, _, tag, points = max(candidates, key=lambda item: (item[0], item[1]))
    return tag, points


def collect(cfg, log):
    """config/buyers.json에 있는 상장 바이어를 훑는다."""
    headers = _headers()
    if not headers:
        log("SEC 건너뜀 · SEC_CONTACT 환경변수가 없습니다 (연락처 없는 요청은 403)")
        return []

    buyers = [b for b in cfg.get("buyers", []) if b.get("cik")]
    if not buyers:
        log("SEC 건너뜀 · config/buyers.json에 cik가 있는 항목이 없습니다")
        return []

    session = requests.Session()
    proxy = config.proxies()
    if proxy:
        session.proxies.update(proxy)

    out = []
    for buyer in buyers:
        cik = str(buyer["cik"]).zfill(10)
        name = buyer["name"]

        try:
            facts = _get(session, FACT.format(cik=cik), headers)
        except SecRequestBlocked as exc:
            log(f"SEC {name} 요청이 막혔습니다 · {exc}")
            continue
        if not facts:
            log(f"SEC {name} companyfacts가 없어 태그를 찾지 못했습니다")
            continue

        tag, points = _concept(facts, REVENUE_TAGS, _duration_points)
        if points:
            out.append(base.Series(
                metric=f"buyer_revenue_{buyer['key']}",
                label=f"{name} 분기 매출", unit="백만 달러", freq="분기", group="buyer",
                entity=name, source_name=f"SEC EDGAR XBRL · {tag}",
                side="buyer",
                source_url=f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-",
                note=buyer.get("note", ""),
                points=[{"period": p["period"], "value": round(p["value"] / 1e6, 1),
                         "end": p["end"]} for p in points]))
        else:
            log(f"SEC {name} 매출 태그를 찾지 못했습니다")

        tag, points = _concept(facts, OPERATING_TAGS, _duration_points)
        if points:
            pretax = tag in PRETAX_TAGS
            out.append(base.Series(
                metric=f"buyer_operating_{buyer['key']}",
                label=f"{name} 분기 {'세전이익' if pretax else '영업이익'}", unit="백만 달러", freq="분기", group="buyer",
                entity=name, source_name=f"SEC EDGAR XBRL · {tag}",
                side="buyer",
                source_url=f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-",
                note=("영업이익을 공시하지 않아 세전이익으로 대체했습니다" if pretax else
                      "매출이 늘어도 이익이 눌리면 원가 압박이 우리 쪽으로 넘어온다."),
                points=[{"period": p["period"], "value": round(p["value"] / 1e6, 1),
                         "end": p["end"]} for p in points]))
        else:
            log(f"SEC {name} 영업이익 태그를 찾지 못했습니다")

        tag, points = _concept(facts, INVENTORY_TAGS, _instant_points)
        if points:
            out.append(base.Series(
                metric=f"buyer_inventory_{buyer['key']}",
                label=f"{name} 분기말 재고", unit="백만 달러", freq="분기", group="buyer",
                entity=name, source_name=f"SEC EDGAR XBRL · {tag}",
                side="buyer",
                source_url=f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-",
                note="재고가 쌓이면 신규 발주가 줄어든다. 매출과 함께 본다.",
                points=[{"period": p["period"], "value": round(p["value"] / 1e6, 1),
                         "end": p["end"]} for p in points]))
        else:
            log(f"SEC {name} 재고 태그를 찾지 못했습니다")

        time.sleep(0.3)     # SEC 권고 한도는 초당 10건이다. 넉넉히 둔다.
    return out
