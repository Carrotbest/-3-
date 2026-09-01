# R76. MACRO TREND 정리: 경쟁사 제거, 미수집 바이어, 재고율, 카드 시각화

상태: **원인 규명 완료, 구현 미착수**. Codex가 구현한다.

`npm run build` 통과 상태다. 워킹트리 미커밋이다. 커밋은 사용자가 지시할 때만 한다.

R75(FABRIC TREND 카드)와 무관하다. 이 문서는 MACRO TREND와 수집기만 다룬다.

---

# 1. 경쟁사 데이터 완전 제거

UI 탭은 이미 지웠다(`TrendMacro.tsx`). 남은 수집·산출 경로를 걷어낸다.

## 사전 확인된 사실

DART 수집기는 **한 번도 데이터를 만든 적이 없다.** `tools/trend/data/kpi/`에
`competitor_revenue_*`나 `competitor_operating_*` 파일이 하나도 없다.
실제로 쌓인 경쟁사 데이터는 Yahoo 주가 5건뿐이다.

```
competitor_stock_hansae.json    competitor_stock_nobland.json
competitor_stock_shinwon.json   competitor_stock_tp.json
competitor_stock_youngone.json
```

## 지울 것

| 대상 | 조치 |
|---|---|
| `tools/trend/trendbot/kpi/dart.py` | 파일 삭제 |
| `tools/trend/trendbot/kpi/market.py` | 파일 삭제. 경쟁사 주가 전용이다 |
| `tools/trend/trendbot/kpi/__init__.py` | import와 `COLLECTORS`에서 `dart`, `market` 제거 |
| `tools/trend/config/competitors.json` | 파일 삭제 |
| `tools/trend/config/sources.json` | `kind: "competitor"` 5개 항목 삭제 (경쟁사 · 한세실업/신원/노브랜드/영원무역/태평양물산) |
| `tools/trend/data/kpi/competitor_stock_*.json` | 5개 파일 삭제 |
| `tools/trend/run.py` | `competitors.json`을 읽는 두 곳 제거 (33행 부근, 68행 부근) |
| `tools/trend/trendbot/publish.py` | `_entity_labels()`에서 competitors 병합 제거. `kpi()`의 `entity_keys`·`entity_sides`·`entity_codes`·`entity_listed`에서 competitors 제거 |
| `.github/workflows/trend.yml` | 62행 `DART_API_KEY` 환경변수 제거 |
| `tools/trend/README.md` | Secrets 표에서 `DART_API_KEY` 행 제거. 본문의 국내 상장 경쟁사 12개사 설명 제거 |
| `src/data/trend.ts` | `KpiCard.side`를 `"buyer" \| ""`로. `TrendKpi.entity_sides`를 `Record<string, "buyer">`로 하거나 필드 자체 삭제. `entity_listed`는 경쟁사 상장 여부용이므로 삭제 |
| `src/routes/TrendMacro.tsx` | `BuyerRow.stock` 필드와 `card.metric.includes("stock")` 분기 제거 |

`config.feed_excluded_sources()`는 남긴다. `kind: "buyer"` 소스를 FABRIC 피드에서 빼는 역할이 계속 필요하다.

`DART_API_KEY` 저장소 Secret은 사용자가 GitHub에서 직접 지운다. Codex는 건드리지 않는다.

---

# 2. 미수집 바이어 5곳

AEO, Victoria's Secret, Urban Outfitters, Duluth Trading, Nike.

## 처음 추정이 틀렸다

앞선 대화에서 "XBRL 태그 불일치"로 봤다. **아니다.** SEC `companyfacts`를 직접 조회해
5곳 모두 현재 `REVENUE_TAGS`/`INVENTORY_TAGS`/`OPERATING_TAGS` 목록의 태그를 갖고 있는 것을 확인했다.
`sec_edgar.py`의 실제 로직을 그대로 재현해 돌린 결과도 정상이었다.

```
aeo     tag=RevenueFromContractWithCustomerExcludingAssessedTax  산출=31
vsco    tag=RevenueFromContractWithCustomerExcludingAssessedTax  산출=19
urban   tag=RevenueFromContractWithCustomerExcludingAssessedTax  산출=27
duluth  tag=RevenueFromContractWithCustomerExcludingAssessedTax  산출=20
nike    tag=RevenueFromContractWithCustomerExcludingAssessedTax  산출=29
```

**태그 목록은 고치지 말 것.** 원인은 아래 두 가지다.

## 원인 A. SEC 요청이 막혔다 (5곳 전부)

`buyers.json` 순서와 수집 결과를 맞춰 보면 패턴이 드러난다.

```
1 walmart  ○   6 anf     ○   11 vsco    ×
2 target   ○   7 aeo     ×   12 urban   ×
3 kohls    ○   8 carters ○   13 duluth  ×
4 costco   ○   9 pvh     ○   14 nike    ×
5 amazon   ○  10 ua      ○
```

뒤 4곳이 연속으로 실패했다. 전형적인 누적 레이트리밋이다.
`data/kpi/`에 해당 5곳 파일이 **아예 없다.** 값이 틀린 게 아니라 수집 자체가 안 됐다.

`_get()`이 200과 404만 구분하고 403·429·5xx를 전부 `None`으로 뭉갠다.
그래서 차단당한 것이 "태그를 찾지 못했습니다" 로그로 나온다. 이 오해가 처음 진단을 틀리게 했다.

### 조치 A-1. `companyconcept`을 `companyfacts`로 바꾼다

지금은 회사당 최대 12회 요청한다(지표 3종 × 태그 후보 최대 4개).
`companyfacts`는 **회사당 1회**로 모든 태그를 한 번에 준다. 14곳이면 14회다.

```
https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
  → json["facts"]["us-gaap"][tag]["units"]["USD"]
```

행 구조(`start`/`end`/`val`/`fy`/`fp`/`form`/`filed`)가 `companyconcept`과 같다.
`_duration_points`와 `_instant_points`를 그대로 재사용할 수 있는 것을 실측으로 확인했다.

### 조치 A-2. `_get()`이 상태코드를 구분하게 한다

- 200: 성공
- 404: 진짜 없음. 즉시 포기하고 "태그 없음"으로 기록
- 403 / 429 / 5xx: 차단 또는 일시 오류. 2초, 5초, 15초 백오프로 재시도
- 재시도가 다 실패하면 "태그 없음"이 아니라 **"요청이 막혔습니다"로 따로 로그**한다

수집 실패와 데이터 부재를 로그에서 구분할 수 있어야 한다. 이게 이번 오진의 재발 방지책이다.

## 원인 B. Nike는 태그 선택 로직이 따로 걸린다 (Nike 전용)

`companyfacts`로 돌려 보면 Nike만 두 가지가 더 나온다.

**B-1. 재고가 2011년에서 멈춘다**

Nike는 `InventoryNet`을 2011년까지만 쓰고 그 뒤로는 `InventoryFinishedGoodsNetOfReserves`를 쓴다.

```
InventoryNet                          rows=16   2025년 이후=0   last=2011-05-31
InventoryFinishedGoodsNetOfReserves   rows=122  2025년 이후=10  last=2026-05-31
```

`_concept()`이 **첫 번째로 비어 있지 않은 태그**에서 멈추기 때문에,
`INVENTORY_TAGS` 맨 앞의 `InventoryNet`이 15년 묵은 값을 반환하고 끝난다.

조치. `INVENTORY_TAGS`에 `InventoryFinishedGoodsNetOfReserves`를 추가하고,
**`_concept()`이 후보 태그를 모두 평가한 뒤 최신 `end`가 가장 늦은 태그를 고르도록** 바꾼다.
"첫 번째 비지 않은 태그"는 이런 태그 교체 이력에 취약하다. 다른 회사에도 같은 일이 생길 수 있다.

`InventoryFinishedGoodsNetOfReserves`로 `_instant_points`를 돌리면 60건, 최신 2026-Q4 = 7,501백만 달러가 나온다. 검증했다.

**B-2. 영업이익 태그가 없다**

Nike는 `OperatingIncomeLoss`를 XBRL로 공시하지 않는다. 대신 세전이익만 있다.

```
IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments  rows=158
```

**이걸 "분기 영업이익" 라벨로 그냥 넣지 말 것.** 다른 지표다.
`OPERATING_TAGS`에 예비 태그로 넣되, 예비 경로가 쓰이면 카드 `label`을 "분기 세전이익"으로,
`note`에 "영업이익을 공시하지 않아 세전이익으로 대체했습니다"를 넣는다.
바이어 간 비교 시 오독을 막아야 한다.

## 검증 방법

```
$env:SEC_CONTACT="<회사 대표 주소>"
python run.py kpi
```

`data/kpi/`에 `buyer_*` 파일이 14곳 × 3지표 = 42개가 되어야 한다. 현재 27개다.
Nike 재고의 최신 period가 2026-Q4인지 함께 본다.

---

# 3. 데이터 수집 제어 창 삭제

## 지울 것

| 대상 | 조치 |
|---|---|
| `src/routes/TrendMacro.tsx` | `CollectionControl` 섹션 전체, `run`·`notice` state, 상태 폴링 `useEffect`, `runStatus()` 헬퍼, 관련 import |
| `src/data/trend-collection.ts` | 파일 삭제 |
| `functions/` | 디렉터리 삭제. 이 두 함수 말고 다른 용도가 없다 |
| `firebase.json` | `functions` 블록이 전부다. 파일 삭제 |
| `src/data/firebase.ts` | `getFunctions` import와 `export const functions` 제거 |

`.firebaserc`는 남긴다. `firestore.rules` 배포에 쓴다.

`GITHUB_ACTION_TOKEN` Firebase Secret은 사용자가 직접 지운다.

## 반드시 같이 할 것

수동 버튼이 없어지므로 **자동 수집이 유일한 경로가 된다.**
`.github/workflows/trend.yml`이 아직 로컬·원격 `main` 어디에도 없다(미추적 파일).
지금 상태로는 cron이 뜨지 않아 수집이 영영 안 돈다. 이 워크플로를 `main`에 올려야 한다.
푸시는 사용자 지시를 받고 한다.

---

# 4. 미국 의류 소매 재고율 갱신 지연

## 수집 실패가 아니다

FRED 공개 CSV를 직접 조회해 확인했다. 원천이 6월까지만 갖고 있다.

```
MRTSIR448USS  최신 3건: (2026-04, 2.13) (2026-05, 2.11) (2026-06, 2.14)
CPIAPPSL      최신 3건: (2026-05, 137.069) (2026-06, 136.313) (2026-07, 136.434)
```

Census MTIS 재고 통계는 월말 기준 6주쯤 뒤에 나온다. CPI(2주)보다 훨씬 늦다.
수집기는 정상 동작했다. 마지막 kpi 실행이 2026-08-31이고 그때도 6월이 최신이었다.

## 진짜 문제는 stale 판정 기준이다

`tools/trend/trendbot/kpi/base.py:15`

```python
STALE_DAYS = {"일간": 7, "월간": 50, "분기": 130, "연간": 400, "주간": 12}
```

월간 전체에 50일을 적용한다. 재고율은 6월말 기준으로 오늘(9/1) 63일이다.
7월분이 9월 중순에 나오면 잠깐 46일로 떨어졌다가 곧 다시 50일을 넘는다.
**이 카드는 사실상 상시 "갱신 지연" 배지를 달고 있다.** 실제로는 정상인데 경고가 뜬다.

## 조치

지표별 임계값 override를 만든다.

1. `base.Series`에 `stale_days: int | None = None` 필드를 추가한다.
2. `base.card()`의 `limit` 계산을 `payload.get("stale_days") or STALE_DAYS.get(freq, 50)`로 바꾸고,
   `merge()`가 이 값을 카드 payload로 넘기게 한다.
3. `fred.py`의 `SERIES`에서 `us_apparel_inventory_ratio`에 `stale_days=80`을 준다.
   최악의 경우 7월분 공표 직전에 75일이므로 80일이면 여유가 있다.
4. `src/data/trend.ts`의 `KpiCard`는 `stale`만 읽으므로 화면 변경은 없다.

추가로 카드 `note`에 "Census 재고 통계는 월말 기준 약 6주 뒤에 공표됩니다"를 넣어 준다.
사용자가 6월 데이터를 보고 또 지연을 의심하지 않게 하는 것이 목적이다.

---

# 5. 정부·원자재 카드 6개: 증감 체감과 진입 모션

대상은 `GovernmentIndicators`가 그리는 6개다.
`usdkrw`, `us_real_gdp`, `us_apparel_cpi`, `us_apparel_inventory_ratio`, `crude_brent`, `cotton_a_index`.
모두 `MetricTile`을 `chart="line"`으로 쓴다.

## 왜 밋밋한가

13개 관측치의 진폭을 재 봤다.

| 지표 | 최소 | 최대 | 진폭 |
|---|---|---|---|
| crude_brent | 62.70 | 120.40 | 47.9% |
| cotton_a_index | 1.63 | 2.03 | 19.7% |
| usdkrw | 1,389.0 | 1,529.5 | 9.2% |
| us_real_gdp | 22,580 | 24,270 | 7.0% |
| us_apparel_cpi | 131.21 | 137.07 | 4.3% |
| us_apparel_inventory_ratio | 2.100 | 2.190 | 4.1% |

여섯 중 넷이 진폭 10% 미만이다. `YAxis domain={["auto", "auto"]}`가 잡는 넓은 축에서는
4% 움직임이 거의 직선으로 보인다. 데이터가 아니라 축 설정 문제다.

## 조치 5-1. 축을 데이터에 맞춰 좁힌다 (가장 효과가 크다)

`domain={["auto", "auto"]}`를 버리고 명시적으로 계산한다.

```
const lo = Math.min(...values)
const hi = Math.max(...values)
const span = hi - lo || Math.abs(hi) * 0.05 || 1
const pad = span * 0.18
domain = [lo - pad, hi + pad]
```

`span`이 0인 평탄 구간에서 축이 붕괴하지 않도록 대체값을 둔다.
0을 기준선으로 삼지 않는다. 이 여섯 지표는 모두 수준값이라 0이 의미가 없다.

## 조치 5-2. 선 아래를 채운다

`LineChart`를 `AreaChart`로 바꾸고 `linearGradient`로 위에서 아래로 투명해지는 채움을 준다.
면적이 생기면 같은 진폭도 훨씬 크게 읽힌다. 선 두께는 2.5로 올린다.

## 조치 5-3. 방향을 색으로 말한다

`card.yoy >= 0`이면 `--chart-1`, 음수면 `--destructive` 계열로 선과 그라디언트 색을 맞춘다.
지금은 6개가 전부 같은 색이라 오르는 것과 내리는 것이 구분되지 않는다.

## 조치 5-4. 기준선과 최신점

- 1년 전 값 위치에 점선 `ReferenceLine`을 그린다. 전년 대비 증감이 눈에 바로 들어온다.
- 마지막 관측치에만 `dot`을 남기고 `ReferenceDot`으로 강조한다. 나머지 점은 지금처럼 숨긴다.

## 조치 5-5. 진입 모션

기존 컴포넌트를 그대로 쓴다. 새로 만들지 말 것.

- **KPI 수치**: `src/components/motion/NumberTicker.tsx`에 `startOnView` prop이 이미 있다.
  `fmtValue`가 단위별로 소수 자릿수를 정하므로(`abs >= 1000 ? 0 : abs >= 10 ? 1 : 2`),
  같은 규칙으로 `decimals`를 계산해 넘기고 단위는 `suffix`로 준다.
- **차트**: `isAnimationActive={false}`를 `true`로 바꾸고 `animationDuration`은 700ms 안팎으로 둔다.
  `src/lib/useInView.ts`(`once: true`)로 타일이 뷰포트에 들어온 뒤에 그리기 시작하게 한다.
  화면 밖에서 애니메이션이 끝나 버리면 의미가 없다.
- **타일 등장**: `src/components/motion/Reveal.tsx`로 각 타일을 감싸고
  `revealDelay`를 60ms씩 계단으로 준다. 6개가 순차로 올라온다.

`Reveal`과 `NumberTicker` 모두 `prefers-reduced-motion`을 이미 처리한다.
Recharts 애니메이션에도 같은 가드를 넣어 감소 설정에서는 즉시 완성 상태로 그린다.

## 적용 범위 주의

`MetricTile`은 바이어 모니터링(`compact` 모드)에서도 쓴다.
축·채움·색은 공통으로 적용하고, 진입 모션은 정부 지표 카드에만 걸거나
`compact`일 때 딜레이를 0으로 둔다. 바이어 탭은 좌측 목록 클릭으로 내용이 바뀌므로
매번 카운트업이 다시 도는 것은 방해가 된다.

---

# 작업 순서 제안

1. 3번(수집 제어 삭제) — 다른 작업과 겹치지 않는다
2. 1번(경쟁사 제거) — 파일 삭제 위주
3. 2번(SEC) — `companyfacts` 전환이 핵심. `python run.py kpi`로 42개 파일 확인
4. 4번(stale override) — 3번과 같은 `base.py`를 건드리므로 이어서
5. 5번(시각화·모션) — 화면만

각 단계마다 `npm run build`로 확인한다. 파이썬 변경은 `python run.py kpi` 후
`public/data/trend/kpi.json`을 열어 카드 수와 최신 period를 눈으로 본다.

---

# 조사에 쓴 명령 기록

SEC 조회에는 연락처가 담긴 User-Agent가 필요하다.
저장소 `functions/index.js`에 이미 있던 회사 주소를 읽기 전용 진단에만 썼고 파일에 기록하지 않았다.
개인 메일은 쓰지 않았다. 운영 값은 계속 GitHub Secrets의 `SEC_CONTACT`로만 주입한다.
