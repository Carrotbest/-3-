# -*- coding: utf-8 -*-
"""TREND REPORT 수집 진입점. AI 호출이 없다. 사전과 공개 API만 쓴다.

  python run.py collect     기사 수집 후 웹 JSON 재생성        (매일)
  python run.py kpi         바이어·정부 지표 수집 후 재생성    (주 1회)
  python run.py rescore     재수집 없이 사전만 다시 적용       (사전 수정 후)
  python run.py translate   비어 있는 한국어 제목만 채움       (번역 실패 후 재시도)
  python run.py publish     수집 없이 웹 JSON만 재생성
  python run.py images      기존 최신 기사의 대표 이미지 보강
  python run.py status      소스 상태와 보관 건수
  python run.py doctor      사내망에서 소스별 접근 가능 여부 점검
  python run.py why "검색어"  왜 걸렸는지/왜 걸러졌는지 점수 근거 확인
"""

import sys
from datetime import datetime, timezone

from trendbot import classify, config, feeds, publish, translate
from trendbot.kpi import COLLECTORS, base as kpi_base
from trendbot.store import Store


def _log(line):
    print("  " + line)


def _sources():
    return config.load("sources.json").get("sources", [])


def _classifier():
    entities = config.load("buyers.json").get("buyers", [])
    return classify.build(config.load("tags.json"),
                          config.load("categories.json"),
                          config.load("relevance.json"),
                          entities, config.feed_excluded_sources())


def _republish(store):
    feed = publish.feed(store)
    kpi = publish.kpi(store)
    publish.status(store, _sources())
    print(f"웹 JSON 생성 · 기사 {feed['total']}건 (노이즈 {feed['filtered_out']}건 제외), "
          f"지표 {len(kpi['cards'])}개 → {config.PUBLISH}")


def cmd_collect():
    store = Store().load()
    before = len(store.records)
    result = feeds.run(store, _classifier(), _sources())
    print(f"수집 성공 {result['ok']} · 실패 {result['fail']} · "
          f"신규 {result['new']}건 (소재 {result['kept']}건) · "
          f"중복보도 {result['hits']}건 · 보관 {before}→{len(store.records)}")
    for line in result["detail"]:
        _log(line)
    # 제목 번역은 신규 기사에만 붙는다. 실패해도 수집 결과는 그대로 저장한다.
    trans = translate.run(store, _log)
    store.save()
    publish.log_run({"at": result["ran_at"], "kind": "collect", "ok": result["ok"],
                     "fail": result["fail"], "new": result["new"], "kept": result["kept"],
                     "hits": result["hits"], "translated": trans["done"]})
    _republish(store)


def cmd_kpi():
    cfg = {"buyers": config.load("buyers.json").get("buyers", [])}
    total = 0
    for name, collect in COLLECTORS.items():
        print(f"[{name}]")
        try:
            for series in collect(cfg, _log):
                total += kpi_base.merge(series)
        except Exception as exc:                      # 한 소스가 죽어도 나머지는 계속한다
            _log(f"{name} 예외 · {type(exc).__name__} {exc}")
    print(f"지표 {total}개 기간 갱신")
    publish.log_run({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                     "kind": "kpi", "points": total})
    _republish(Store().load())


def cmd_rescore():
    store = Store().load()
    classifier = _classifier()
    before = sum(1 for r in store.records.values() if r.get("relevant"))
    for record in store.records.values():
        classifier.apply(record)
    after = sum(1 for r in store.records.values() if r.get("relevant"))
    store.touch_all()
    store.save()
    print(f"재판정 {len(store.records)}건 · 소재 기사 {before}→{after}")
    _republish(store)


def cmd_translate():
    store = Store().load()
    translate.run(store, _log)
    store.save()
    _republish(store)


def cmd_images():
    store = Store().load()
    feeds.enrich_images(store, _log)
    store.save()
    _republish(store)


def cmd_status():
    store = Store().load()
    health = feeds.load_health()
    for src in _sources():
        state = health.get(src["name"], {})
        mark = "정상" if state.get("last_ok") and not state.get("fail_count") else "확인필요"
        print(f"  {src['name']:22} {mark:5} 최근성공 {str(state.get('last_ok'))[:10]:12} "
              f"실패 {state.get('fail_count', 0)} {state.get('last_error') or ''}")
    relevant = sum(1 for r in store.records.values() if r.get("relevant"))
    print(f"\n보관 {len(store.records)}건 · 소재 기사 {relevant}건")


def cmd_doctor():
    """사내망에서 먼저 돌린다. 무엇이 막히는지 코드 고치기 전에 안다."""
    import requests
    session = requests.Session()
    proxy = config.proxies()
    if proxy:
        session.proxies.update(proxy)
        print(f"프록시 {proxy['https']}")
    else:
        print("프록시 없음 (시스템 설정을 따릅니다)")

    print("\n[뉴스 소스]")
    for src in _sources():
        raw, err = feeds.fetch(feeds.feed_url(src), session)
        head = (raw or b"")[:200].lower()
        ok = raw and (b"<rss" in head or b"<feed" in head or b"<?xml" in head)
        print(f"  {src['name']:22} {'정상' if ok else '확인필요 ' + str(err or 'XML 아님')}")

    print("\n[KPI 원천]")
    print(f"  SEC_CONTACT      {'설정됨' if config.SEC_CONTACT else '없음 · 바이어 매출을 못 받습니다'}")
    print(f"  CENSUS_API_KEY   {'설정됨' if config.CENSUS_KEY else '없음 · 미국 수입 통계를 못 받습니다'}")
    for label, url in [("data.sec.gov", "https://data.sec.gov/api/xbrl/companyfacts/CIK0000104169.json"),
                       ("World Bank", "https://www.worldbank.org/en/research/commodity-markets"),
                       ("api.census.gov", "https://api.census.gov/data/timeseries/intltrade/imports/hs")]:
        try:
            res = session.get(url, headers={"User-Agent": config.UA}, timeout=30)
            print(f"  {label:16} HTTP {res.status_code}")
        except Exception as exc:
            print(f"  {label:16} 실패 {type(exc).__name__}")


def cmd_why(term):
    """사전 튜닝용. 점수가 어떤 어휘 때문에 나왔는지 보여준다."""
    store = Store().load()
    classifier = _classifier()
    needle = term.lower()
    hits = [r for r in store.records.values()
            if needle in (r["title"] + " " + (r.get("summary") or "")).lower()]
    hits.sort(key=lambda r: r.get("published") or "", reverse=True)
    print(f"{len(hits)}건 (상위 15건)")
    for row in hits[:15]:
        blob = f"{row['title']} {row.get('summary', '')}".lower()
        material, why_m = classifier.score(blob, row["source"], "material")
        retail, why_r = classifier.score(blob, row["source"], "retail")
        gate = "material" if material >= classifier.gates["material"]["threshold"] else "retail" if retail >= classifier.gates["retail"]["threshold"] else "none"
        score, why = (material, why_m) if gate != "retail" else (retail, why_r)
        print(f"\n  [{gate} {score:+3d}] {row['category']:9} {row['title'][:66]}")
        print(f"        {row['source']} · {row['published']}")
        for name, terms in why.items():
            print(f"        {name}: {', '.join(terms)}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "collect"
    if cmd == "collect":
        cmd_collect()
    elif cmd == "kpi":
        cmd_kpi()
    elif cmd == "rescore":
        cmd_rescore()
    elif cmd == "translate":
        cmd_translate()
    elif cmd == "publish":
        _republish(Store().load())
    elif cmd == "images":
        cmd_images()
    elif cmd == "status":
        cmd_status()
    elif cmd == "doctor":
        cmd_doctor()
    elif cmd == "why":
        if len(sys.argv) < 3:
            print("검색어를 입력하십시오")
            return
        cmd_why(sys.argv[2])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
