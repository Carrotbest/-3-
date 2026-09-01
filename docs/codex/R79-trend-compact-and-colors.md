# R79. MACRO 히어로 제거·선 색 그룹화, FABRIC 상단 압축

상태: **설계 완료, 구현 미착수**. Codex가 구현한다.

R76·R77·R78은 완료·검증 끝났다. 이 문서는 그 위에 얹는다.

`npm run build` 통과를 유지한다. 커밋과 푸시는 하지 않는다. 파일 삭제는 없다.

대상은 `src/routes/TrendMacro.tsx`, `src/routes/TrendFabric.tsx`,
그리고 `tools/trend/trendbot/publish.py`와 `src/data/trend.ts`다.

**R77의 숫자 정합을 깨뜨리지 마라.** 기준값은 30일 소재 132, 7일 소재 83, 리사이클 12, 30일 합계 158이다.

---

# 이 작업의 목적

FABRIC TREND의 주인공은 상단 요약이 아니다. **하이라이트, 전체 기사, 저장 기사**다.
팀이 실제로 쓰는 화면이 거기다.

R78에서 요약층에 HOME 톤을 입혔더니 상단이 화면을 다 먹었다.
정보는 맞는데 비중이 틀렸다. 이번 작업은 상단을 눌러서 본론이 먼저 보이게 만드는 것이다.

판단이 갈리면 이 기준으로 돌아온다. **상단은 훑고 지나가는 자리고, 아래가 일하는 자리다.**

---

# MACRO TREND

## 1. 원가 선행 신호 히어로를 지운다

`MacroHero`(258행)와 `MacroHeroMetric`(212행)을 정의까지 지운다.
호출부도 함께 지운다. 지우고 나면 화면 최상단이 바로 `정부 통계 · 거시 지표` 섹션이 된다.

면화와 유가는 아래 6개 타일에 그대로 있다. 정보가 사라지지 않는다.
R78에서 히어로에 올린 두 타일에 붙인 `핵심 원가` 표식은 그대로 둔다.
히어로가 없어져도 그 둘이 먼저 볼 지표라는 사실은 그대로다.

## 2. 선 색을 성격별 세 그룹으로 나눈다

지금은 `rising ? theme.chart[0] : theme.destructive`로 **증감 방향**에 따라 색이 정해진다.
6개가 전부 같은 계열로 보여 지표끼리 구분이 안 된다.

방향 대신 **성격**으로 묶는다.

| 그룹 | 지표 | 뜻 |
|---|---|---|
| A | `usdkrw`, `us_real_gdp` | 거시·통화 |
| B | `cotton_a_index`, `crude_brent` | 원자재 원가 |
| C | `us_apparel_cpi`, `us_apparel_inventory_ratio` | 미국 소비·재고 |

`METRIC_GROUP_COLOR` 같은 상수 맵을 만들어 metric에서 색을 찾는다.
색은 `readChartTheme()`의 `chart[0]`, `chart[1]`, `chart[2]`를 쓴다. 하드코딩하지 마라.
맵에 없는 metric은 `chart[0]`으로 떨어뜨린다. 나중에 지표가 늘어도 안 깨진다.

**방향 정보를 잃는 것에 대해.** 선 색으로 오르내림을 알리던 기능이 없어진다.
그런데 카드에 이미 `직전 +0.1%`, `전년 +3.9%`가 화살표와 색으로 붙어 있다.
같은 정보를 두 번 말하고 있었던 셈이라 손실이 아니다.
그라디언트 채움 색도 선 색을 따라가게 맞춘다.

`ReferenceDot`(145행)의 `fill`도 같은 그룹 색으로 바꾼다.

## 3. 선을 절반으로 얇게

타일 차트의 `strokeWidth={2.5}`를 `1.25`로 내린다(138~139행 부근).
`ReferenceDot`의 반지름 `r={3.5}`도 `2.5`로 함께 줄인다. 선이 얇아지면 점만 커 보인다.

바이어 목록 스파크라인(305행)은 이미 `1.6`이라 그대로 둔다. 여기는 원래 얇다.

---

# FABRIC TREND

## 4. 히어로에서 좌측 수치 블록을 뺀다

`FabricHero`(58행)에서 `materialCount` prop과 그것을 그리는 좌측 블록을 지운다.
**분류 막대만 남긴다.** 제목 `최근 30일 기사 분류`와 우측 `피드 158건`은 유지한다.

`132`가 바로 아래 KPI 카드에도 똑같이 있어서 두 번 나오고 있었다.
막대만 남으면 히어로 높이가 크게 줄고, 그게 이번 작업의 목적이다.

호출부(698행 부근)에서 `materialCount` 인자를 빼는 것도 잊지 마라.

## 5. KPI 카드를 7일 하나로 합치고 내용을 채운다

30일 카드와 7일 카드를 하나로 만든다. **기준은 7일이다.**
`저장된 기사` 카드는 그대로 둔다. 결과적으로 상단 KPI는 두 장이 된다.

7일 카드에 들어갈 내용이다. 실측값을 같이 적는다.

```
최근 7일 소재 기사
83건
소스 24곳 중 20곳에서 273건을 훑어 105건 채택 (38%)
그중 소재 게이트 통과 83건
```

30일 값이 필요하면 사용자가 기간 칩으로 바꾸면 된다. 카드로 둘 이유가 없다.

### 5-1. `publish.py`에 수집 실적을 추가한다

지금 `feed.json`에는 기간별 훑은 건수가 없다. `filtered_out`은 120일 창 합계 하나뿐이다.
그래서 "전체 중 얼마를 가져왔나"를 화면에서 계산할 수 없다.

`feed()` 안에 블록을 하나 더 만든다. 이미 `scanned`를 구하고 있으니 재료는 다 있다.

```python
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
```

payload에 이렇게 싣는다. `source_total`은 바이어 전용을 뺀 FABRIC 대상 소스 수다.

```python
"intake": {
    "source_total": len(config.load("sources.json").get("sources", [])) - len(buyer_only),
    "days": _intake(store, buyer_only),
},
```

`src/data/trend.ts`의 `TrendFeed`에 옵셔널로 타입을 추가한다.
구버전 `feed.json`이 배포된 상태에서도 화면이 안 깨지도록 반드시 `?`를 붙인다.

```ts
intake?: {
  source_total: number
  days: Record<string, { sources: number; scanned: number; kept: number; material: number }>
}
```

`intake`가 없으면 카드는 큰 수치와 기존 캡션만 보여 준다. 상세 줄만 빠지면 된다.

검증용 실측값이다. 수집 시점에 따라 달라지지만 자릿수가 크게 다르면 계산이 틀린 것이다.

| 기간 | 소스 | 훑음 | 채택 | 비율 | 그중 소재 |
|---|---|---|---|---|---|
| 7일 | 20 | 273 | 105 | 38% | 83 |
| 30일 | 23 | 462 | 158 | 34% | 132 |

등록 소스 38곳 중 바이어 전용 14곳을 뺀 24곳이 FABRIC 대상이다.

## 6. 급상승 키워드를 4장으로

`rising`을 `slice(0, 3)`에서 `slice(0, 4)`로 늘린다.
격자는 `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`.

현재 제외 목록을 적용한 상승 태그가 넉넉한지 확인한다.
4개가 안 나오면 나오는 만큼만 그린다. 빈 카드를 채우지 마라.

## 7. 상단 전체를 압축한다

여기가 이번 작업의 핵심이다. 아래 목록이 첫 화면에 들어와야 한다.

- **섹션 간격.** 최상위 `space-y-8`을 `space-y-5`로
- **카드 안쪽 여백.** `p-6 sm:p-7`을 `p-4 sm:p-5`로
- **썸네일.** 핫 키워드 카드의 `aspect-[16/9]`를 `aspect-[2/1]`로 낮춘다.
  4장이 되면서 한 장 폭이 줄었으니 세로도 같이 줄어야 비율이 산다
- **큰 수치.** KPI 카드의 `text-4xl`을 `text-3xl`로
- **급상승 섹션 머리말.** 제목만 남기고 설명 문장(`최근 28일과 직전 28일의 소재 태그를 비교합니다`)은 지운다.
  우측 `처음 등장` 목록은 유지한다
- **히어로 막대 높이.** `h-8`을 `h-6`으로

**아래 작업층은 건드리지 마라.** 하이라이트 그리드, 전체 기사 목록, 필터 패널,
저장 기사의 간격과 크기는 지금 그대로 둔다. 줄일 곳은 상단뿐이다.

---

# 검증

```
cd tools/trend && python run.py publish
npm run build
```

`publish`는 수집 없이 JSON만 다시 만든다. `intake` 블록이 들어갔는지 확인한다.

숫자 확인은 `public/data/trend/feed.json`을 파이썬으로 파싱해서 한다.

1. `intake.days["7"]`이 위 표와 맞는가
2. R77 정합이 그대로인가. 30일 소재 132, 7일 소재 83, 리사이클 12, 30일 합계 158
3. MACRO 6개 타일의 선 색이 세 그룹으로 갈리는가
4. 선 굵기가 `1.25`인가
5. `MacroHero`, `MacroHeroMetric`이 정의까지 사라졌는가
6. `FabricHero`에 `materialCount`가 남아 있지 않은가

dev 서버 실행이나 로그인이 필요한 확인은 하지 마라. 사람이 한다.

## 하지 말 것

- 하이라이트·전체 기사·저장 기사 영역의 크기나 간격을 바꾸는 것
- `Home.tsx`를 고치는 것
- 수집기의 판정 로직(`relevance.json`, `classify.py`)을 건드리는 것.
  이번 파이썬 변경은 `publish.py`의 집계 추가 하나뿐이다
- 6개 지표에서 면화·유가를 빼는 것. 히어로만 없어지고 타일은 남는다
