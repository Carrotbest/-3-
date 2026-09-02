# -*- coding: utf-8 -*-
"""RSS 수집. 재시도, 중복 제거, 키워드 사전 필터.

소스 상태는 config/사이드가 아니라 data/sources_health.json에 쌓는다.
연속 실패가 쌓인 소스는 자동으로 쉬게 하되 설정에서 지우지는 않는다.
"""

import hashlib
import html
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlparse

import feedparser
import requests

from . import config
from .store import read_json, write_json

GOOGLE_NEWS = ("https://news.google.com/rss/search?q={query}"
               "&hl={hl}&gl={gl}&ceid={gl}:{lang}")

TIMEOUT = 20
RETRIES = 3
RETRY_WAIT = 3
COOLDOWN_AFTER = 5        # 연속 실패가 이만큼 쌓이면 하루 쉬게 한다
MAX_AGE_DAYS = 540        # 이보다 오래된 기사는 받지 않는다
GN_WINDOW = "when:45d"    # Google News는 아무 제한이 없으면 2001년 기사까지 올려준다
META_MAX_PER_SOURCE = 20   # RSS 이미지가 없는 신규 기사만 제한적으로 OG 이미지를 확인한다
IMAGE_RETRY_DAYS = 30      # OG 이미지 확인 실패는 이 기간이 지난 뒤에만 다시 시도한다
TAG_STRIP = re.compile(r"<[^>]+>")
NON_WORD = re.compile(r"[^0-9a-z가-힣]+")
HEALTH = config.DATA / "sources_health.json"


def feed_url(source):
    """via에 따라 실제 호출 주소를 만든다.

    direct          url이 RSS 주소 그대로다.
    googlenews      url이 도메인이다. 직접 RSS가 막힌 매체를 Google News로 우회한다.
    googlenews_query  url이 검색어다. 매체가 아니라 주제로 긁는다.
    """
    via = source.get("via", "direct")
    if via not in ("googlenews", "googlenews_query"):
        return source["url"]
    korean = source.get("region") == "국내"
    hl, gl, lang = ("ko", "KR", "ko") if korean else ("en-US", "US", "en")
    query = source["url"] if via == "googlenews_query" else f"site:{source['url']}"
    return GOOGLE_NEWS.format(query=quote(f"{query} {GN_WINDOW}"), hl=hl, gl=gl, lang=lang)


def fetch(url, session):
    """3회까지 재시도한다. 국제섬유신문은 간헐 503이 확인됐다."""
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            res = session.get(url, timeout=TIMEOUT, headers={
                "User-Agent": config.UA,
                "Accept": "application/rss+xml,application/xml,text/xml,*/*"})
            if res.status_code == 200:
                return res.content, None
            last = f"HTTP {res.status_code}"
        except Exception as exc:
            last = type(exc).__name__
        if attempt < RETRIES:
            time.sleep(RETRY_WAIT)
    return None, last


def clean(text):
    if not text:
        return ""
    return re.sub(r"\s+", " ", html.unescape(TAG_STRIP.sub(" ", text))).strip()


def strip_publisher(title):
    """Google News는 제목 끝에 매체명을 붙인다. 중복 판정 전에 떼어낸다."""
    parts = title.rsplit(" - ", 1)
    if len(parts) == 2 and 0 < len(parts[1]) <= 40:
        return parts[0]
    return title


def dedup_key(title):
    base = NON_WORD.sub("", strip_publisher(title).lower())
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]


def published_date(entry):
    for field in ("published_parsed", "updated_parsed"):
        stamp = entry.get(field)
        if stamp:
            return datetime(*stamp[:6], tzinfo=timezone.utc).date().isoformat()
    return datetime.now(timezone.utc).date().isoformat()


def passes_filter(keywords, blob):
    return not keywords or any(k.strip().lower() in blob for k in keywords if k.strip())


def entry_image(entry):
    """RSS가 제공하는 대표 이미지만 사용한다. 기사 페이지를 추가 크롤링하지 않는다."""
    for field in ("media_thumbnail", "media_content"):
        for item in entry.get(field, []) or []:
            url = item.get("url") if isinstance(item, dict) else None
            if url:
                return url
    for item in entry.get("enclosures", []) or []:
        if isinstance(item, dict) and str(item.get("type", "")).startswith("image/") and item.get("href"):
            return item["href"]
    raw = str(entry.get("summary", "") or entry.get("description", ""))
    match = re.search(r'<img[^>]+src=["\']([^"\']+)', raw, re.IGNORECASE)
    return html.unescape(match.group(1)) if match else ""


def entry_content(entry, fallback):
    """피드 발행자가 배포한 본문/요약 중 화면 팝업에 인용할 부분."""
    chunks = [clean(item.get("value", "")) for item in (entry.get("content", []) or [])
              if isinstance(item, dict)]
    text = " ".join(chunk for chunk in chunks if chunk) or fallback
    return text[:1800]


def page_image(url, session):
    """RSS에 이미지가 없을 때 기사 페이지의 og:image만 제한적으로 확인한다."""
    try:
        res = session.get(url, timeout=8, headers={"User-Agent": config.UA, "Accept": "text/html"})
        if res.status_code != 200 or "text/html" not in res.headers.get("Content-Type", ""):
            return ""
        head = res.text[:250_000]
        patterns = (
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        )
        for pattern in patterns:
            match = re.search(pattern, head, re.IGNORECASE)
            if match:
                return html.unescape(match.group(1))
    except Exception:
        pass
    return ""


def is_google_news_link(url):
    """중간 페이지뿐인 Google News 링크는 OG 이미지 확인 대상에서 제외한다."""
    return urlparse(url).hostname == "news.google.com"


def image_retry_due(record, now=None):
    """마지막 OG 이미지 확인 실패 후 재시도 간격이 지났는지 확인한다."""
    tried = record.get("image_tried")
    if not tried:
        return True
    try:
        tried_at = datetime.fromisoformat(tried.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return True
    if tried_at.tzinfo is None:
        tried_at = tried_at.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    return tried_at <= now - timedelta(days=IMAGE_RETRY_DAYS)


def load_health():
    return read_json(HEALTH, {})


def run(store, classifier, sources, session=None):
    session = session or requests.Session()
    proxy = config.proxies()
    if proxy:
        session.proxies.update(proxy)

    health = load_health()
    today = datetime.now(timezone.utc).date().isoformat()
    oldest = (datetime.now(timezone.utc).date() - timedelta(days=MAX_AGE_DAYS)).isoformat()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ok = fail = new = kept = hits = 0
    detail = []

    for src in sources:
        name = src["name"]
        state = health.setdefault(name, {"fail_count": 0, "last_ok": None,
                                         "last_error": None, "cooldown_until": None})
        if state.get("cooldown_until") and state["cooldown_until"] > today:
            detail.append(f"{name} 휴지 중 ({state['cooldown_until']}까지)")
            continue

        raw, err = fetch(feed_url(src), session)
        if raw is None:
            fail += 1
            state["fail_count"] += 1
            state["last_error"] = err
            if state["fail_count"] >= COOLDOWN_AFTER:
                state["cooldown_until"] = today
                detail.append(f"{name} 실패 {err} · {state['fail_count']}회 연속으로 휴지")
            else:
                detail.append(f"{name} 실패 {err}")
            continue

        parsed = feedparser.parse(raw)
        if not parsed.entries:
            fail += 1
            state["fail_count"] += 1
            state["last_error"] = "빈 피드"
            detail.append(f"{name} 빈 피드")
            continue

        keywords = src.get("keyword_filter") or []
        added = added_kept = repeated = metadata_checked = 0
        for entry in parsed.entries:
            title = clean(entry.get("title", ""))
            link = entry.get("link", "")
            if not title or not link:
                continue
            summary = clean(entry.get("summary", "") or entry.get("description", ""))
            blob = f"{title} {summary}".lower()
            if not passes_filter(keywords, blob):
                continue
            when = published_date(entry)
            if when < oldest:
                continue                 # Google News 검색이 올려주는 오래된 아카이브를 막는다
            key = dedup_key(title)
            image = entry_image(entry)
            image_tried = None
            if (not image and metadata_checked < META_MAX_PER_SOURCE
                    and not store.has(key) and not is_google_news_link(link)):
                image = page_image(link, session)
                metadata_checked += 1
                if not image:
                    image_tried = now
            record = {
                "key": key,
                "title": strip_publisher(title),
                "link": link,
                "published": when,
                "collected": today,
                "summary": summary[:600],
                "content": entry_content(entry, summary),
                "image": image,
                "image_tried": image_tried,
                "source": name,
                "region": src.get("region", ""),
            }
            classifier.apply(record)
            outcome = store.upsert(record)
            if outcome == "new":
                added += 1
                added_kept += 1 if record["relevant"] else 0
            elif outcome == "hit":
                repeated += 1

        ok += 1
        new += added
        kept += added_kept
        state.update(fail_count=0, last_ok=now, last_error=None, cooldown_until=None)
        hits += repeated
        detail.append(f"{name} 신규 {added}건 (소재 {added_kept}건"
                      + (f", 중복보도 {repeated}건)" if repeated else ")"))

    write_json(HEALTH, health)
    return {"ok": ok, "fail": fail, "new": new, "kept": kept, "hits": hits,
            "detail": detail, "ran_at": now}


def enrich_images(store, log, limit=240):
    """기존 최신 기사 중 이미지가 비어 있는 항목의 og:image를 병렬 보강한다."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    now = datetime.now(timezone.utc)
    candidates = [row for row in store.recent(120, relevant_only=True)
                  if not row.get("image")
                  and not is_google_news_link(row.get("link", ""))
                  and image_retry_due(row, now)][:limit]

    def fetch_one(row):
        session = requests.Session()
        if config.proxies():
            session.proxies.update(config.proxies())
        return row, page_image(row["link"], session)

    found = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_one, row) for row in candidates]
        for future in as_completed(futures):
            row, image = future.result()
            if image:
                row["image"] = image
                found += 1
            else:
                row["image_tried"] = now.isoformat(timespec="seconds")
            store.mark(row)
    log(f"기사 대표 이미지 {found}/{len(candidates)}건 보강")
    return found
