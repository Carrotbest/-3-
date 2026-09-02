# -*- coding: utf-8 -*-
"""기사 보관소. 월별 JSON 샤드 하나가 원장이다.

SQLite 대신 JSON을 쓰는 이유는 GitHub Actions가 결과를 저장소에 커밋해야 하기 때문이다.
바이너리는 매일 통째로 바뀌어 이력이 남지 않는다. 월별로 쪼개면 diff가 읽히고 파일도 커지지 않는다.

수집한 기사는 지우지 않는다. 관련도 점수가 낮은 것도 relevant=False로 남긴다.
사전을 고친 뒤 rescore만 돌리면 재수집 없이 판정이 갱신된다.
"""

import json
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone

from . import config

FIELDS = ("key", "title", "title_ko", "link", "published", "collected", "summary", "content", "image", "image_tried",
          "source", "region", "category", "tags", "entities", "score", "relevant",
          "gate", "hits", "sources")


def _shard_name(record):
    stamp = record.get("published") or record.get("collected") or ""
    return (stamp[:7] or datetime.now(timezone.utc).strftime("%Y-%m")) + ".json"


class Store:
    def __init__(self):
        self.records = OrderedDict()
        self._dirty = set()

    def load(self):
        config.ensure_dirs()
        for path in sorted(config.ARTICLES.glob("*.json")):
            for row in json.loads(path.read_text(encoding="utf-8")):
                # 필드가 늘기 전에 저장된 기록을 현재 형태로 맞춘다.
                if not row.get("sources"):
                    row["sources"] = [row.get("source")]
                if not row.get("hits"):
                    row["hits"] = len(row["sources"])
                self.records[row["key"]] = row
        return self

    def has(self, key):
        return key in self.records

    def upsert(self, record):
        """신규면 "new". 이미 있는데 다른 매체가 또 보도했으면 "hit". 그대로면 None.

        같은 기사가 직접 피드와 Google News 양쪽으로 들어온다. 본문은 먼저 들어온 쪽을 남긴다.
        대신 몇 곳이 다뤘는지를 센다. 이 값이 화면의 HIT다. RSS는 조회수를 주지 않는다.
        여러 매체가 같이 다뤘다는 사실이 우리가 쓸 수 있는 유일한 주목도 신호다.
        """
        existing = self.records.get(record["key"])
        if existing is None:
            record.setdefault("sources", [record["source"]])
            record["hits"] = len(record["sources"])
            self.records[record["key"]] = record
            self._dirty.add(_shard_name(record))
            return "new"

        sources = existing.get("sources") or [existing["source"]]
        if record["source"] in sources:
            return None
        sources.append(record["source"])
        existing["sources"] = sources
        existing["hits"] = len(sources)
        self._dirty.add(_shard_name(existing))
        return "hit"

    def touch_all(self):
        """rescore처럼 전체를 다시 쓸 때 쓴다."""
        for row in self.records.values():
            self._dirty.add(_shard_name(row))

    def save(self):
        config.ensure_dirs()
        buckets = {}
        for row in self.records.values():
            buckets.setdefault(_shard_name(row), []).append(row)
        written = 0
        for name in sorted(self._dirty):
            rows = sorted(buckets.get(name, []),
                          key=lambda r: (r.get("published") or "", r["key"]), reverse=True)
            slim = [{k: r.get(k) for k in FIELDS} for r in rows]
            path = config.ARTICLES / name
            path.write_text(json.dumps(slim, ensure_ascii=False, indent=1) + "\n",
                            encoding="utf-8")
            written += 1
        self._dirty.clear()
        return written

    def untranslated(self, days=180):
        """번역이 아직 안 붙은 최근 기사. 한 번 번역하면 다시 부르지 않는다."""
        cut = (date.today() - timedelta(days=days)).isoformat()
        return [r for r in self.records.values()
                if (r.get("published") or "") >= cut
                and (r.get("relevant") or r.get("entities"))
                and not (r.get("title_ko") or "").strip()]

    def mark(self, record):
        self._dirty.add(_shard_name(record))

    def recent(self, days, relevant_only=True):
        cut = (date.today() - timedelta(days=days)).isoformat()
        rows = [r for r in self.records.values() if (r.get("published") or "") >= cut]
        if relevant_only:
            rows = [r for r in rows if r.get("relevant")]
        return sorted(rows, key=lambda r: r.get("published") or "", reverse=True)


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback


def write_json(path, payload, indent=1):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=indent) + "\n",
                    encoding="utf-8")
