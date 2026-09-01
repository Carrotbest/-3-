# -*- coding: utf-8 -*-
"""면화가와 유가. World Bank Commodity Markets(Pink Sheet)가 원천이다. API 키가 없다.

파일 주소에 업로드 해시가 박혀 있어 고정 주소로 긁으면 옛 스냅샷이 잡힌다.
실제로 2021년 경로의 파일은 2024년 12월에서 멈춰 있었다.
그래서 목록 페이지를 먼저 읽고 현재 링크를 찾는 2단계로 간다. USDA를 이걸로 대체했다.
"""

import io
import re

import openpyxl
import requests

from .. import config
from . import base

LANDING = "https://www.worldbank.org/en/research/commodity-markets"
LINK = re.compile(r"https://thedocs\.worldbank\.org[^\"'\s<>]+CMO-Historical-Data-Monthly\.xlsx")
SHEET = "Monthly Prices"

# 시트 헤더 문자열 -> 우리 지표
WANTED = {
    "cotton, a index": {
        "metric": "cotton_a_index", "label": "면화 A Index", "unit": "$/kg",
        "note": "면 원사 원가의 선행 지표. 급등하면 코튼 개발 건의 원가 재검토가 필요하다.",
    },
    "crude oil, brent": {
        "metric": "crude_brent", "label": "국제 유가 (Brent)", "unit": "$/bbl",
        "note": "폴리에스터 원료(PTA·MEG) 가격의 선행 지표.",
    },
}


def _session():
    session = requests.Session()
    proxy = config.proxies()
    if proxy:
        session.proxies.update(proxy)
    return session


def latest_workbook_url(session):
    """목록 페이지에서 현재 월간 파일 링크를 찾는다."""
    res = session.get(LANDING, headers={"User-Agent": config.UA}, timeout=40)
    res.raise_for_status()
    found = LINK.search(res.text)
    if not found:
        raise LookupError("Pink Sheet 월간 파일 링크를 찾지 못했습니다. 페이지 구조가 바뀌었습니다.")
    return found.group(0)


def collect(cfg, log):
    session = _session()
    try:
        url = latest_workbook_url(session)
        res = session.get(url, headers={"User-Agent": config.UA}, timeout=90)
        res.raise_for_status()
    except Exception as exc:
        log(f"World Bank 실패 · {type(exc).__name__} {exc}")
        return []

    book = openpyxl.load_workbook(io.BytesIO(res.content), read_only=True, data_only=True)
    rows = list(book[SHEET].iter_rows(values_only=True))
    header = [str(c).strip().lower() if c else "" for c in rows[4]]

    columns = {}
    for index, name in enumerate(header):
        for needle, meta in WANTED.items():
            if name.startswith(needle):
                columns[index] = meta

    if not columns:
        log("World Bank 실패 · 면화/유가 열을 찾지 못했습니다")
        return []

    out = []
    for index, meta in columns.items():
        points = []
        for row in rows[6:]:
            period = str(row[0] or "")
            if "M" not in period:
                continue
            value = row[index]
            if not isinstance(value, (int, float)):
                continue                       # 결측은 '..' 문자열로 들어온다
            year, month = period.split("M")
            points.append({"period": f"{year}-{int(month):02d}", "value": round(float(value), 4)})
        if not points:
            continue
        out.append(base.Series(
            metric=meta["metric"], label=meta["label"], unit=meta["unit"],
            freq="월간", group="gov", entity="원자재",
            source_name="World Bank Commodity Markets (Pink Sheet)",
            source_url=LANDING, note=meta["note"],
            points=points[-60:]))
        log(f"World Bank {meta['label']} {points[-1]['period']}까지 {len(points)}개월")
    return out
