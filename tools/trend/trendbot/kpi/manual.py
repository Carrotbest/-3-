# -*- coding: utf-8 -*-
"""자동 수집이 안 되는 지표의 수동 입력 경로.

H&M·패스트리테일링·데카트론은 미국 상장사가 아니라 SEC에 없다.
베트남 VITAS 수출 발표, 한국 섬유 수출 실적도 공개 API가 없다.
config/kpi_manual.csv에 metric,period,value 세 컬럼으로 넣으면 자동 지표와 같은 카드로 나간다.
라벨과 출처는 config/kpi_manual.json에서 읽는다.

여기에 사내 실적·단가를 넣지 않는다. 저장소가 공개다.
"""

import csv

from .. import config
from . import base

CSV = config.CONFIG / "kpi_manual.csv"


def collect(cfg, log):
    if not CSV.exists():
        return []
    meta = config.load("kpi_manual.json").get("metrics", {})
    rows = {}
    with CSV.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            metric = (row.get("metric") or "").strip()
            period = (row.get("period") or "").strip()
            raw = (row.get("value") or "").strip()
            if not metric or not period or not raw:
                continue
            try:
                value = float(raw.replace(",", ""))
            except ValueError:
                log(f"수동 입력 건너뜀 · {metric} {period} 값이 숫자가 아닙니다")
                continue
            rows.setdefault(metric, []).append({"period": period, "value": value})

    out = []
    for metric, points in rows.items():
        spec = meta.get(metric)
        if not spec:
            log(f"수동 입력 건너뜀 · {metric} 정의가 config/kpi_manual.json에 없습니다")
            continue
        out.append(base.Series(
            metric=metric, label=spec.get("label", metric), unit=spec.get("unit", ""),
            freq=spec.get("freq", "월간"), group=spec.get("group", "gov"),
            entity=spec.get("entity", ""), kind=spec.get("kind", "level"),
            source_name=spec.get("source_name", "수동 입력"),
            source_url=spec.get("source_url", ""), note=spec.get("note", ""),
            points=sorted(points, key=lambda p: p["period"])))
        log(f"수동 입력 {spec.get('label', metric)} {len(points)}건")
    return out
