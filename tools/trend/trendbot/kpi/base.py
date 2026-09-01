# -*- coding: utf-8 -*-
"""KPI 계열 자료구조와 저장.

계열 하나가 data/kpi/<metric>.json 파일 하나다. 기간별 값을 병합해서 덮는다.
수집이 실패해도 지난 값은 남는다. 카드에는 기준일과 노후 여부를 함께 표시한다.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from .. import config
from ..store import read_json, write_json

# 갱신 주기별로 이 일수를 넘기면 화면에서 오래됨으로 표시한다.
STALE_DAYS = {"일간": 7, "월간": 50, "분기": 130, "연간": 400, "주간": 12}


@dataclass
class Series:
    metric: str
    label: str
    unit: str
    freq: str
    group: str                 # buyer 또는 gov
    source_name: str
    source_url: str
    # [{"period": "2026-07", "value": 1.96}] · 회계분기는 end로 실제 종료일을 함께 넣는다
    points: list = field(default_factory=list)
    note: str = ""
    entity: str = ""           # 바이어명 등 묶음 키
    kind: str = "level"        # level 또는 share
    side: str = ""             # buyer. gov는 빈 값
    stale_days: int | None = None

    def path(self):
        return config.KPI_DATA / f"{self.metric}.json"


def merge(series):
    """기존 파일과 병합해서 저장한다. 같은 period는 새 값으로 덮는다."""
    config.ensure_dirs()
    old = read_json(series.path(), {})
    points = {p["period"]: p for p in old.get("points", [])}
    for point in series.points:
        points[point["period"]] = point
    payload = {
        "metric": series.metric, "label": series.label, "unit": series.unit,
        "freq": series.freq, "group": series.group, "entity": series.entity,
        "kind": series.kind, "side": series.side, "note": series.note,
        "stale_days": series.stale_days,
        "source_name": series.source_name, "source_url": series.source_url,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # 회계 라벨이 아니라 공시가 준 실제 종료일로 정렬한다.
        # 1~2월 결산 유통사는 "2026-Q4"(2월 종료)가 "2026-Q1"(5월 종료)보다 앞이라
        # 문자열로 정렬하면 마지막 원소가 최신이 아니게 된다.
        # end가 없는 계열(정부 지표)은 라벨이 달력 순서와 같아 그대로 두어도 맞다.
        "points": [points[k] for k in sorted(points, key=lambda k: (points[k].get("end") or "", k))],
    }
    write_json(series.path(), payload)
    return len(series.points)


def load_all():
    config.ensure_dirs()
    return [read_json(p, None) for p in sorted(config.KPI_DATA.glob("*.json"))
            if read_json(p, None)]


def _period_end(period):
    """YYYY, YYYY-MM, YYYY-MM-DD, YYYY-Qn을 모두 날짜로 바꾼다."""
    text = str(period)
    try:
        if "Q" in text:
            year, quarter = text.split("-Q")
            month = int(quarter) * 3
            return date(int(year), month, 28)
        parts = text.split("-")
        if len(parts) == 1:
            return date(int(parts[0]), 12, 31)
        if len(parts) == 2:
            return date(int(parts[0]), int(parts[1]), 28)
        return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except (ValueError, IndexError):
        return None


def _pct(new, old):
    if old in (None, 0) or new is None:
        return None
    return round((new - old) / abs(old) * 100, 1)


def card(payload, history=13):
    """화면에 올릴 카드 한 장. 직전 대비와 전년 동기 대비를 함께 계산한다."""
    points = payload.get("points", [])[-history:]
    out = {
        "metric": payload["metric"], "label": payload["label"], "unit": payload["unit"],
        "freq": payload["freq"], "group": payload["group"], "entity": payload.get("entity", ""),
        "kind": payload.get("kind", "level"), "side": payload.get("side", ""), "note": payload.get("note", ""),
        "source_name": payload["source_name"], "source_url": payload["source_url"],
        "points": points, "value": None, "period": None, "period_end": None,
        "prev": None, "yoy": None, "stale": True,
    }
    if not points:
        return out

    latest = points[-1]
    out["value"] = latest["value"]
    out["period"] = latest["period"]
    if len(points) >= 2:
        out["prev"] = _pct(latest["value"], points[-2]["value"])

    # 전년 동기는 인덱스가 아니라 기간 문자열로 찾는다. 결측 달이 있어도 어긋나지 않는다.
    by_period = {p["period"]: p["value"] for p in payload.get("points", [])}
    out["yoy"] = _pct(latest["value"], by_period.get(_year_ago(latest["period"])))
    # 소매업 회계분기는 달력과 어긋난다. 공시가 준 실제 종료일이 있으면 그것으로 판단한다.
    out["period_end"] = latest.get("end")
    end = None
    if latest.get("end"):
        try:
            end = date.fromisoformat(latest["end"])
        except ValueError:
            end = None
    end = end or _period_end(latest["period"])
    limit = payload.get("stale_days") or STALE_DAYS.get(payload["freq"], 50)
    out["stale"] = end is None or (date.today() - end).days > limit
    return out


def _year_ago(period):
    text = str(period)
    if "-Q" in text:
        year, quarter = text.split("-Q")
        return f"{int(year) - 1}-Q{quarter}"
    parts = text.split("-")
    parts[0] = str(int(parts[0]) - 1)
    return "-".join(parts)
