# -*- coding: utf-8 -*-
"""환율·미국 의류 CPI·의류점 재고율·미국 GDP. FRED 우선, 공개 CSV 예비 경로."""

from collections import defaultdict
from datetime import date, timedelta
import csv
import io

import requests

from .. import config
from . import base

FRED = "https://api.stlouisfed.org/fred/series/observations"
SERIES = {
    "usdkrw": {"code": "DEXKOUS", "label": "USD/KRW 환율", "unit": "원/달러", "freq": "월간"},
    "us_apparel_cpi": {"code": "CPIAPPSL", "label": "미국 의류 CPI", "unit": "지수", "freq": "월간"},
    "us_apparel_inventory_ratio": {
        "code": "MRTSIR448USS", "label": "미국 의류 소매 재고율", "unit": "배", "freq": "월간",
        "stale_days": 80, "note": "Census 재고 통계는 월말 기준 약 6주 뒤에 공표됩니다",
    },
    "us_real_gdp": {"code": "GDPC1", "label": "미국 실질 GDP", "unit": "십억 달러", "freq": "분기"},
}


def _session():
    session = requests.Session()
    if config.proxies():
        session.proxies.update(config.proxies())
    return session


def _period_label(value, freq):
    if freq == "분기":
        year, month = value[:7].split("-")
        return f"{year}-Q{(int(month) - 1) // 3 + 1}"
    return value[:7]


def _fred(session, code, freq):
    frequency = "q" if freq == "분기" else "m"
    res = session.get(FRED, params={"series_id": code, "api_key": config.FRED_KEY,
                                   "file_type": "json", "frequency": frequency, "aggregation_method": "avg",
                                   "sort_order": "desc", "limit": 60}, timeout=30)
    res.raise_for_status()
    rows = []
    for item in reversed(res.json().get("observations", [])):
        if item.get("value") in (None, "."):
            continue
        rows.append({"period": _period_label(item["date"], freq), "value": round(float(item["value"]), 3)})
    return rows


def _fred_csv(session, code, freq):
    """API 키가 없을 때 FRED 공개 CSV를 지표 주기에 맞춰 접는다."""
    res = session.get("https://fred.stlouisfed.org/graph/fredgraph.csv", params={"id": code}, timeout=30)
    res.raise_for_status()
    monthly = defaultdict(list)
    for item in csv.DictReader(io.StringIO(res.text)):
        value = item.get(code)
        if value not in (None, "", "."):
            monthly[_period_label(item["observation_date"], freq)].append(float(value))
    return [{"period": month, "value": round(sum(values) / len(values), 3)}
            for month, values in sorted(monthly.items())[-60:]]


def _fallback_fx(session):
    start = (date.today() - timedelta(days=365 * 5 + 30)).isoformat()
    data = session.get(f"https://api.frankfurter.app/{start}..", params={"from": "USD", "to": "KRW"}, timeout=30).json()
    monthly = defaultdict(list)
    for day, rates in data.get("rates", {}).items():
        if rates.get("KRW") is not None:
            monthly[day[:7]].append(float(rates["KRW"]))
    return [{"period": month, "value": round(sum(values) / len(values), 2)}
            for month, values in sorted(monthly.items())[-60:]]


def _fallback_cpi(session):
    this_year = date.today().year
    payload = {"seriesid": ["CUUR0000SAA"], "startyear": str(this_year - 5), "endyear": str(this_year)}
    data = session.post("https://api.bls.gov/publicAPI/v2/timeseries/data/", json=payload, timeout=30).json()
    rows = []
    for item in data.get("Results", {}).get("series", [{}])[0].get("data", []):
        period = item.get("period", "")
        if period.startswith("M") and period != "M13":
            rows.append({"period": f"{item['year']}-{period[1:]}", "value": float(item["value"])})
    return sorted(rows, key=lambda row: row["period"])[-60:]


def collect(cfg, log):
    session, out = _session(), []
    points_by_metric = {}
    fallback_sources = {}
    if config.FRED_KEY:
        for metric, series in SERIES.items():
            code, freq = series["code"], series["freq"]
            try:
                points_by_metric[metric] = _fred(session, code, freq)
            except Exception as exc:
                log(f"FRED {code} 실패 · {type(exc).__name__}")
    else:
        log("FRED_API_KEY 없음 · FRED 공개 CSV 예비 경로를 사용합니다")
        for metric, series in SERIES.items():
            code, freq = series["code"], series["freq"]
            try:
                points_by_metric[metric] = _fred_csv(session, code, freq)
            except Exception as exc:
                log(f"FRED CSV {code} 실패 · {type(exc).__name__}")
        if not points_by_metric.get("usdkrw"):
            try:
                points_by_metric["usdkrw"] = _fallback_fx(session)
                fallback_sources["usdkrw"] = "Frankfurter"
            except Exception as exc:
                log(f"Frankfurter 환율 실패 · {type(exc).__name__}")

    for metric, points in points_by_metric.items():
        if not points:
            continue
        series = SERIES[metric]
        code, label, unit, freq = series["code"], series["label"], series["unit"], series["freq"]
        source = fallback_sources.get(metric, "FRED")
        url = "https://www.frankfurter.app/" if source == "Frankfurter" else f"https://fred.stlouisfed.org/series/{code}"
        out.append(base.Series(metric=metric, label=label, unit=unit, freq=freq, group="gov",
                               source_name=f"{source} · {code}",
                               source_url=url, points=points, note=series.get("note", ""),
                               stale_days=series.get("stale_days")))
    return out
