# -*- coding: utf-8 -*-
"""웹이 읽을 JSON 산출. public/data/trend/ 아래 세 파일이 전부다.

React 화면은 이 세 파일만 fetch한다. 서버도 DB도 없다.
Vite가 public/을 그대로 배포하므로 파일을 덮고 커밋하면 Pages가 갱신된다.
"""

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from . import config
from .feeds import load_health
from .kpi import base as kpi_base
from .store import read_json, write_json

WINDOW_DAYS = 120        # 화면에 싣는 기간
MAX_ARTICLES = 1500      # 파일 크기 상한. 넘으면 최신 것만 싣는다
SUMMARY_CHARS = 300
RUNLOG = config.DATA / "run_log.json"


def _entity_sources():
    """바이어 동향 전용 소스. FABRIC 집계에서 뺀다."""
    return config.feed_excluded_sources()


def _entity_labels():
    items = config.load("buyers.json").get("buyers", [])
    return {item["key"]: item["name"] for item in items}


def _facets(rows):
    labels = _entity_labels()
    categories = Counter(r["category"] for r in rows)
    sources = Counter(r["source"] for r in rows)
    tags = Counter(t for r in rows for t in (r.get("tags") or []))
    return {
        "categories": [{"key": k, "n": n} for k, n in categories.most_common()],
        "sources": [{"key": k, "n": n} for k, n in sources.most_common()],
        "tags": [{"key": k, "n": n} for k, n in tags.most_common(40)],
        "entities": [{"key": k, "n": n, "label": labels[k]}
                     for k, n in Counter(e for r in rows for e in (r.get("entities") or [])
                                         if e in labels).most_common()],
    }


def _daily(rows, days=30):
    from datetime import date, timedelta
    today = date.today()
    span = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    per_day = {d: Counter() for d in span}
    for row in rows:
        if row["published"] in per_day:
            per_day[row["published"]][row["category"]] += 1
    return [{"date": d, "total": sum(per_day[d].values()), "by": dict(per_day[d])} for d in span]


def _momentum(rows):
    """최근 28일과 직전 28일 태그 증감을 12주 스파크라인과 함께 만든다."""
    today = date.today()
    recent_cut, prior_cut = today - timedelta(days=27), today - timedelta(days=55)
    recent, prior, weeks = Counter(), Counter(), {}
    monday = today - timedelta(days=today.weekday())
    week_keys = [(monday - timedelta(weeks=i)).isoformat() for i in range(11, -1, -1)]
    for row in rows:
        try:
            day = date.fromisoformat(row["published"])
        except (ValueError, TypeError):
            continue
        for tag in row.get("tags") or []:
            if day >= recent_cut:
                recent[tag] += 1
            elif day >= prior_cut:
                prior[tag] += 1
            wk = (day - timedelta(days=day.weekday())).isoformat()
            if wk in week_keys:
                weeks.setdefault(tag, Counter())[wk] += 1
    candidates = []
    for tag in set(recent) | set(prior):
        if recent[tag] + prior[tag] < 3:
            continue
        candidates.append({"tag": tag, "recent": recent[tag], "prior": prior[tag],
                           "delta": recent[tag] - prior[tag],
                           "weeks": [weeks.get(tag, {}).get(wk, 0) for wk in week_keys]})
    rising = sorted(candidates, key=lambda x: (x["delta"], x["recent"]), reverse=True)[:8]
    used = {x["tag"] for x in rising}
    falling = sorted((x for x in candidates if x["tag"] not in used), key=lambda x: (x["delta"], -x["recent"]))[:4]
    return rising + falling


def _fresh(rows, days=28):
    """직전 기간에 없다가 최근 28일에 처음 나온 태그. 조기 신호를 놓치지 않으려고 따로 센다.

    _momentum은 recent + prior가 3건 미만이면 후보에서 잘라낸다.
    이번에 처음 뜬 태그는 대부분 1~2건이라 그 필터에 통째로 걸린다.
    보관 기간이 짧은 초기에는 과다 검출된다. 비교 대상이 될 과거분이 아직 얇기 때문이다.
    """
    today = date.today()
    cut = today - timedelta(days=days - 1)
    recent, seen_before, first = Counter(), set(), {}
    for row in rows:
        try:
            day = date.fromisoformat(row["published"])
        except (ValueError, TypeError):
            continue
        for tag in row.get("tags") or []:
            if day >= cut:
                recent[tag] += 1
                if tag not in first or row["published"] < first[tag]:
                    first[tag] = row["published"]
            else:
                seen_before.add(tag)
    return [{"tag": tag, "n": n, "first": first[tag]}
            for tag, n in recent.most_common() if tag not in seen_before]


def _intake(store, buyer_only, spans=(7, 30)):
    """기간별 수집 실적. 몇 곳에서 몇 건을 훑어 몇 건을 채택했는지 센다.

    화면이 "전체 중 얼마를 가져왔나"를 말하려면 채택분만으로는 부족하다.
    버린 기사 수가 있어야 비율이 나온다.
    """
    out = {}
    for days in spans:
        rows = [r for r in store.recent(days, relevant_only=False)
                if r["source"] not in buyer_only]
        kept = [r for r in rows if r.get("relevant")]
        out[str(days)] = {
            "sources": len({r["source"] for r in rows}),
            "scanned": len(rows),
            "kept": len(kept),
            "material": sum(1 for r in kept if (r.get("gate") or "") == "material"),
        }
    return out


def feed(store):
    rows = store.recent(WINDOW_DAYS, relevant_only=True)[:MAX_ARTICLES]
    buyer_keys = set(_entity_labels())
    buyer_only = _entity_sources()
    scanned = [r for r in store.recent(WINDOW_DAYS, relevant_only=False)
               if r["source"] not in buyer_only]
    noise = len(scanned) - len(rows)
    translated = sum(1 for r in rows if (r.get("title_ko") or "").strip())
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window_days": WINDOW_DAYS,
        "total": len(rows),
        "translated": translated,
        "filtered_out": max(noise, 0),
        "intake": {
            "source_total": len(config.load("sources.json").get("sources", [])) - len(buyer_only),
            "days": _intake(store, buyer_only),
        },
        "facets": _facets(rows),
        "daily": _daily(rows),
        "momentum": _momentum(rows),
        "fresh": _fresh(rows),
        "articles": [{
            "id": r["key"], "d": r["published"],
            "t": (r.get("title_ko") or "").strip() or r["title"],   # 화면 제목은 한국어 우선
            "o": r["title"],                                        # 원문 제목
            "u": r["link"],
            "s": (r.get("summary") or "")[:SUMMARY_CHARS], "c": r["category"],
            "x": (r.get("content") or r.get("summary") or "")[:1800],
            "i": r.get("image") or "",
            "g": r.get("tags") or [], "m": r["source"], "r": r.get("region", ""),
            "v": r.get("score", 0),
            "h": r.get("hits") or 1,                                  # 같은 기사를 다룬 매체 수
            "w": r.get("gate") or "none",
            "e": [key for key in (r.get("entities") or []) if key in buyer_keys],
            "ms": r.get("sources") or [r["source"]],
        } for r in rows],
    }
    write_json(config.PUBLISH / "feed.json", payload, indent=0)
    return payload


BUYER_NEWS_DAYS = 90
BUYER_NEWS_MAX = 8


def entity_news(store, buyer_keys):
    """바이어별 최근 기사. 소재 점수와 무관하게 보관소 전체에서 고른다."""
    from datetime import date, timedelta
    cut = (date.today() - timedelta(days=BUYER_NEWS_DAYS)).isoformat()
    grouped = {}
    for row in store.records.values():
        if (row.get("published") or "") < cut:
            continue
        for key in row.get("entities") or []:
            if key in buyer_keys:
                grouped.setdefault(key, []).append(row)
    out = {}
    for key, rows in grouped.items():
        rows.sort(key=lambda r: r.get("published") or "", reverse=True)
        out[key] = [{
            "d": r["published"],
            "t": (r.get("title_ko") or "").strip() or r["title"],
            "o": r["title"], "u": r["link"], "m": r["source"],
        } for r in rows[:BUYER_NEWS_MAX]]
    return out


def kpi(store=None):
    buyers = config.load("buyers.json").get("buyers", [])
    buyer_names = {item["name"] for item in buyers}
    buyer_keys = {item["key"] for item in buyers}
    cards = [kpi_base.card(p) for p in kpi_base.load_all()]
    cards = [card for card in cards if card["group"] != "buyer" or card["entity"] in buyer_names]
    cards.sort(key=lambda c: (c["group"] != "buyer", c.get("side", ""), c["entity"], c["label"]))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cards": cards,
        "entity_keys": {item["name"]: item["key"] for item in buyers},
        "entity_sides": {item["name"]: "buyer" for item in buyers},
        "entity_codes": {item["name"]: item.get("ticker", "") for item in buyers},
        "news": entity_news(store, buyer_keys) if store else {},
    }
    write_json(config.PUBLISH / "kpi.json", payload, indent=0)
    return payload


def status(store, sources):
    health = load_health()
    rows = []
    for src in sources:
        state = health.get(src["name"], {})
        rows.append({
            "name": src["name"], "region": src.get("region", ""), "via": src.get("via", "direct"),
            "last_ok": state.get("last_ok"), "fail_count": state.get("fail_count", 0),
            "last_error": state.get("last_error"),
            "resting": bool(state.get("cooldown_until")),
        })
    total = len(store.records)
    relevant = sum(1 for r in store.records.values() if r.get("relevant"))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": rows,
        "healthy": sum(1 for r in rows if r["last_ok"] and not r["fail_count"]),
        "source_total": len(rows),
        "archive_total": total,
        "archive_relevant": relevant,
        "runs": read_json(RUNLOG, [])[-14:],
    }
    write_json(config.PUBLISH / "status.json", payload)
    return payload


def log_run(entry):
    runs = read_json(RUNLOG, [])
    runs.append(entry)
    write_json(RUNLOG, runs[-60:])
