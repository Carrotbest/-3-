# -*- coding: utf-8 -*-
"""기사 제목 한국어 변환.

LLM을 쓰지 않는다. 무료 기계번역 엔드포인트 두 곳을 순서대로 시도한다.
둘 다 실패하면 원문 제목을 그대로 둔다. 수집 자체는 절대 멈추지 않는다.

용어는 번역하지 않는다. TENCEL, Lyocell, r-PET 같은 말은 한글로 풀면 오히려 못 읽는다.
번역 전에 자리표로 바꿔 두고 번역 후 원문 표기로 되돌린다.
자리표는 qqaqq 형태다. 번역기가 이 토큰을 건드리지 않고 어순만 옮기는 것을 실측으로 확인했다.

한 번 번역한 제목은 보관소에 남는다. 같은 기사를 다시 부르지 않는다.
그래서 하루 호출량은 신규 기사 수만큼이다.
"""

import json
import re
import time

import requests

from . import config

CLIENTS5 = "https://clients5.google.com/translate_a/t"
MYMEMORY = "https://api.mymemory.translated.net/get"

SLOTS = [f"qq{chr(code)}qq" for code in range(ord("a"), ord("z") + 1)]
HANGUL = re.compile(r"[가-힣]")
TIMEOUT = 20
PAUSE = 0.7          # 무료 엔드포인트다. 몰아치지 않는다
MAX_PER_RUN = 120    # 한 번 실행에서 번역할 최대 건수


def is_korean(text):
    """한글이 15%를 넘으면 이미 우리말 제목으로 본다."""
    letters = [c for c in text if not c.isspace()]
    if not letters:
        return True
    return len(HANGUL.findall(text)) / len(letters) > 0.15


class Glossary:
    """원문 그대로 둘 용어 사전."""

    def __init__(self, terms):
        # 긴 것부터 찾는다. TENCEL Lyocell이 TENCEL만 잡히는 것을 막는다.
        self.terms = sorted({t.strip() for t in terms if len(t.strip()) >= 2},
                            key=len, reverse=True)
        self.res = [(t, re.compile(r"(?<![0-9A-Za-z])" + re.escape(t) + r"(?![0-9A-Za-z])",
                                   re.IGNORECASE)) for t in self.terms]

    def protect(self, text):
        """용어를 자리표로 바꾸고 (바뀐 문장, 복원표)를 준다."""
        restore = {}
        for term, pattern in self.res:
            if len(restore) >= len(SLOTS):
                break
            found = pattern.search(text)
            if not found:
                continue
            slot = SLOTS[len(restore)]
            restore[slot] = found.group(0)          # 화면에는 원문 표기를 그대로 쓴다
            text = pattern.sub(slot, text)
        return text, restore

    @staticmethod
    def restore(text, table):
        for slot, original in table.items():
            # 번역기가 자리표 대소문자를 바꾸는 경우가 있다. 무시하고 되돌린다.
            text = re.sub(re.escape(slot), original.replace("\\", ""), text, flags=re.IGNORECASE)
        return text


def _clients5(session, text):
    res = session.get(CLIENTS5, params={"client": "dict-chrome-ex", "sl": "en", "tl": "ko",
                                        "q": text},
                      headers={"User-Agent": config.UA}, timeout=TIMEOUT)
    if res.status_code != 200:
        return None
    data = res.json()
    if isinstance(data, list) and data and isinstance(data[0], str):
        return data[0]
    return None


def _mymemory(session, text):
    params = {"q": text, "langpair": "en|ko"}
    if config.MT_CONTACT:
        # 연락처를 넣으면 무료 한도가 하루 5천 자에서 5만 자로 올라간다.
        params["de"] = config.MT_CONTACT
    res = session.get(MYMEMORY, params=params, headers={"User-Agent": config.UA}, timeout=TIMEOUT)
    if res.status_code != 200:
        return None
    payload = res.json().get("responseData") or {}
    text_ko = (payload.get("translatedText") or "").strip()
    if not text_ko or text_ko.upper().startswith(("MYMEMORY WARNING", "QUERY LENGTH LIMIT")):
        return None
    return text_ko


PROVIDERS = (("clients5", _clients5), ("mymemory", _mymemory))


def load_glossary():
    data = config.load("glossary.json")
    terms = list(data.get("keep_original", []))
    # 태그 사전의 영문 매칭어 중 고유명사와 약어만 가져온다.
    # recycled, coating 같은 일반 명사까지 원문으로 두면 문장이 읽히지 않는다.
    for values in config.load("tags.json").values():
        if not isinstance(values, list):
            continue
        terms += [v for v in values
                  if v.isascii() and len(v) >= 3
                  and (any(c.isupper() for c in v) or any(c.isdigit() for c in v) or "-" in v)]
    return Glossary(terms)


def run(store, log, limit=MAX_PER_RUN):
    """번역이 없는 최근 기사에 title_ko를 채운다."""
    pending = [r for r in store.untranslated() if not is_korean(r["title"])][:limit]
    # 한글 제목은 번역할 것이 없다. 원문을 그대로 표시용으로 복사한다.
    for record in store.untranslated():
        if is_korean(record["title"]):
            record["title_ko"] = record["title"]
            store.mark(record)

    if not pending:
        return {"done": 0, "failed": 0}

    glossary = load_glossary()
    session = requests.Session()
    proxy = config.proxies()
    if proxy:
        session.proxies.update(proxy)

    done = failed = 0
    dead = set()
    for record in pending:
        masked, table = glossary.protect(record["title"])
        result = None
        for name, provider in PROVIDERS:
            if name in dead:
                continue
            try:
                result = provider(session, masked)
            except Exception:
                result = None
            if result:
                break
            dead.add(name)          # 한 번 막히면 이번 실행에서는 다시 부르지 않는다
        if not result:
            failed += 1
            if len(dead) == len(PROVIDERS):
                log("번역 중단 · 두 엔드포인트가 모두 응답하지 않습니다. 원문 제목으로 둡니다")
                break
            continue
        record["title_ko"] = Glossary.restore(result, table).strip()
        store.mark(record)
        done += 1
        time.sleep(PAUSE)

    log(f"제목 번역 {done}건, 실패 {failed}건")
    return {"done": done, "failed": failed}
