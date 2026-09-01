# -*- coding: utf-8 -*-
"""경로와 설정 파일 로딩.

수집 소스·사전·임계치는 전부 config/*.json에 있다. 코드에 박지 않는다.
차단 정책과 태그 체계는 수시로 바뀌므로 설정만 고쳐서 대응한다.
"""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # tools/trend
REPO = ROOT.parent.parent                          # 저장소 루트
CONFIG = ROOT / "config"
DATA = ROOT / "data"
ARTICLES = DATA / "articles"
KPI_DATA = DATA / "kpi"
PUBLISH = REPO / "public" / "data" / "trend"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# SEC는 연락처가 담긴 User-Agent를 요구한다. 없으면 403으로 막는다.
# 개인 메일을 저장소에 넣지 않는다. GitHub Secrets의 SEC_CONTACT로 주입한다.
SEC_CONTACT = os.environ.get("SEC_CONTACT", "").strip()
CENSUS_KEY = os.environ.get("CENSUS_API_KEY", "").strip()
FRED_KEY = os.environ.get("FRED_API_KEY", "").strip()

# MyMemory 무료 한도를 하루 5천 자에서 5만 자로 올리는 연락처. 없어도 동작한다.
MT_CONTACT = os.environ.get("MT_CONTACT", "").strip()


def load(name):
    path = CONFIG / name
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def feed_excluded_sources():
    """FABRIC 피드에서 제외하고 MACRO 기업 동향에만 쓰는 소스 이름."""
    return {s["name"] for s in load("sources.json").get("sources", [])
            if s.get("kind") == "buyer"}


def proxies():
    """사내망 프록시. requests가 시스템 설정을 자동으로 읽지만, 강제 지정이 필요하면 환경변수를 쓴다."""
    http = os.environ.get("TREND_PROXY", "").strip()
    return {"http": http, "https": http} if http else None


def ensure_dirs():
    for path in (ARTICLES, KPI_DATA, PUBLISH):
        path.mkdir(parents=True, exist_ok=True)
