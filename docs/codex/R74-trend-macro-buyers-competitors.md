# R74. MACRO TREND 지표 확대, 바이어와 경쟁사 탭 분리

상태: **미착수**. Codex가 구현한다. R73과 독립이므로 순서는 상관없다.

앞선 작업으로 `tools/trend`와 `src/routes/TrendMacro.tsx`가 워킹트리에 미커밋 상태로 올라와 있다.
`npm run build` 통과 상태다. 그 위에 이어서 작업한다.

현재 구조는 `tools/trend/README.md`를 먼저 읽는다. 특히 SEC 분기 매출 산출 방식과 회계연도 처리를 이해하고 시작한다.

대상 파일

- `tools/trend/trendbot/kpi/fred.py` (신규)
- `tools/trend/trendbot/kpi/dart.py` (신규)
- `tools/trend/trendbot/kpi/sec_edgar.py`
- `tools/trend/trendbot/kpi/__init__.py`
- `tools/trend/trendbot/kpi/base.py`
- `tools/trend/trendbot/config.py`
- `tools/trend/config/buyers.json`
- `tools/trend/config/competitors.json` (신규)
- `tools/trend/config/sources.json`
- `tools/trend/trendbot/publish.py`
- `src/data/trend.ts`
- `src/routes/TrendMacro.tsx`
- `.github/workflows/trend.yml`

---

## 1. 원자재와 정부 지표 세 가지 추가

원달러 환율, 미국 의류 소비자물가지수, 미국 의류 소매재고율을 붙인다.

### 1-1. 주 경로는 FRED 하나로 묶는다

세 지표가 전부 FRED에 있다. 어댑터 하나에 키 하나면 끝난다.
API 키는 무료이고 즉시 발급된다. https://fredaccount.stlouisfed.org/apikeys

`config.py`에 `FRED_KEY = os.environ.get("FRED_API_KEY", "").strip()`를 추가한다.

엔드포인트

```
https://api.stlouisfed.org/fred/series/observations
  ?series_id=<ID>&api_key=<KEY>&file_type=json&observation_start=2019-01-01&frequency=m
```

`frequency=m`을 넣으면 일별 계열도 월평균으로 내려받는다. 환율에 이것을 쓴다.

| series_id | 지표 | 단위 | 주기 | note |
|---|---|---|---|---|
| `DEXKOUS` | 원달러 환율 | 원 | 월간 | 원화가 약해지면 달러 매출이 늘고 수입 원부자재 원가가 오릅니다. |
| `CPIAPPSL` | 미국 의류 소비자물가지수 | 지수 (1982-84=100) | 월간 | 소비자 가격에 원가 인상이 반영되는지 봅니다. |
| `MRTSIR448USS` | 미국 의류 소매재고율 | 개월 | 월간 | 재고가 몇 달치 쌓였는지입니다. 이 값이 오르면 신규 발주가 먼저 줄어듭니다. |

응답의 `observations` 배열에서 `date`와 `value`를 읽는다.
`value`가 `"."`이면 결측이므로 건너뛴다. 이것이 이 API의 결측 표기다.
`period`는 `date[:7]`을 쓴다. `group`은 `gov`, `entity`는 `거시`로 둔다.
최근 60개월만 담는다. 기존 World Bank 어댑터와 같은 방식이다.

**검증 완료 사항.** 키 없이 호출하면 HTTP 400과 함께 `api_key is not a 32 character` 메시지가 온다.
엔드포인트 주소는 맞다. 실제 데이터 확인은 키 발급 후에 한다.

### 1-2. 키가 없을 때의 대체 경로

FRED 키가 없어도 두 개는 채운다. 아래 두 경로는 **키 없이 실제 호출해서 응답을 확인했다.**

**원달러 환율** Frankfurter (ECB 기준)

```
https://api.frankfurter.app/2019-01-01..?from=USD&to=KRW
```

일별 값이 온다. 월별 평균으로 접어서 넣는다.
2026-08-28 기준 1374.55가 확인됐다.

**미국 의류 소비자물가지수** BLS 공개 API v1 (키 불필요)

```
POST https://api.bls.gov/publicAPI/v1/timeseries/data/
{"seriesid": ["CUUR0000SAA"], "startyear": "2019", "endyear": "2026"}
```

`Results.series[0].data`에 `year`, `period`(M07 형식), `value`가 온다.
2026-07 기준 134.182가 확인됐다. v1은 하루 25건 제한이라 주 1회 호출로 충분하다.

미국 의류 소매재고율은 대체 경로가 없다. FRED 키가 없으면 이 지표만 비운다.
카드에 값이 없으면 화면이 이미 미수집으로 표시하므로 별도 처리가 필요 없다.

구현은 `fred.py` 안에 다 넣는다. FRED 키가 있으면 세 개를 FRED로 받고, 없으면 대체 두 개만 받는다.
모듈을 셋으로 쪼개지 않는다.

### 1-3. 등록

`kpi/__init__.py`의 `COLLECTORS`에 `"fred": fred.collect`를 추가한다.
`.github/workflows/trend.yml`의 KPI 단계 `env`에 `FRED_API_KEY: ${{ secrets.FRED_API_KEY }}`를 추가한다.

---

## 2. 기업 모니터링을 바이어와 경쟁사 탭으로 나눈다

`기업 모니터링` 카드 안을 탭 두 개로 나눈다. `바이어`와 `경쟁사`다.

탭 안의 구조는 지금과 같다. 왼쪽에 회사 목록, 오른쪽에 카드 세 장과 기사 목록이다.
`MetricTile`과 `NewsList`는 그대로 재사용한다.

경쟁사 탭의 카드 세 장은 매출, 영업이익, 재고자산이다. 바이어와 항목이 같다.

`KpiCard`에 `side: "buyer" | "competitor"`를 추가한다. `group`은 지금처럼 `buyer`와 `gov` 둘만 쓴다.
`group`을 늘리면 원자재 섹션 필터가 깨진다.

---

## 3. 바이어 14개사

`config/buyers.json`을 아래 14개사로 교체한다. 사용자가 제공한 조직도 기준 목록에 Costco와 Amazon을 유지한다.
CIK는 SEC 공식 티커 파일에서 실제 조회해 확인했다.
저장소가 공개이므로 회사명과 공개 브랜드명만 남긴다. 사내 조직이나 담당 라인은 적지 않는다.

| key | 이름 | 티커 | CIK | 매칭에 쓸 브랜드 |
|---|---|---|---|---|
| `walmart` | Walmart | WMT | 0000104169 | Walmart, 월마트 |
| `target` | Target | TGT | 0000027419 | Target Corp, 타깃, 타겟 |
| `kohls` | Kohl's | KSS | 0000885639 | Kohl's, 콜스 |
| `costco` | Costco | COST | 0000909832 | Costco, 코스트코 |
| `amazon` | Amazon | AMZN | 0001018724 | Amazon, 아마존 |
| `anf` | Abercrombie & Fitch | ANF | 0001018840 | Abercrombie, Hollister, 아베크롬비 |
| `aeo` | American Eagle Outfitters | AEO | 0000919012 | American Eagle, Aerie, 아메리칸이글 |
| `carters` | Carter's | CRI | 0001060822 | Carter's, OshKosh, 카터스 |
| `pvh` | PVH | PVH | 0000078239 | PVH, Calvin Klein, Tommy Hilfiger |
| `ua` | Under Armour | UAA | 0001336917 | Under Armour, 언더아머 |
| `vs` | Victoria's Secret | VSXY | 0001856437 | Victoria's Secret, 빅토리아 시크릿 |
| `urbn` | Urban Outfitters | URBN | 0000912615 | Urban Outfitters, Free People |
| `duluth` | Duluth Holdings | DLTH | 0001649744 | Duluth Trading |
| `nike` | Nike | NKE | 0000320187 | Nike, 나이키 |

`alias`는 기존 형식대로 채운다. 한글 표기를 같이 넣는다.
`Target`과 `Amazon`은 보통명사·플랫폼 문맥과 겹치므로 `"ambiguous": true`를 유지한다. `Nike`는 붙이지 않아도 된다.
`Duluth`, `Free People`은 이름이 길어 오탐이 적다.

**유지하는 항목.** Costco와 Amazon은 조직도 표에 없더라도 사용자가 명시적으로 유지 요청한 바이어다.
기존 설정, 뉴스 소스, 과거 기사 매칭에서 제거하지 않는다. Amazon은 의류가 전체 매출의 일부이므로 절대 규모보다 증감 방향을 본다는 기존 note를 유지한다.

**목록에 있으나 SEC에 없는 곳.** 아래는 미국 상장사가 아니라 자동 수집이 안 된다.
`cik`를 비우고 `config/kpi_manual.json`에 정의만 만들어 둔다. 값은 사용자가 넣는다.

UNIQLO (Fast Retailing, 도쿄), M&S (런던), Giordano (홍콩), Aritzia (토론토),
Talbots와 Justice (KnitWell Brands, 비상장), Chico's (비상장), Centric Brands (비상장),
JCPenney (Catalyst Brands, 비상장), SanMar (비상장), Express (비상장), K-Mart Australia,
PXG (비상장), MLB (F&F, 한국 상장), TUOMIO와 MEA (자사 OBM 브랜드)

### 3-1. 바이어 뉴스 소스 갱신

`sources.json`의 `kind: buyer` 소스를 위 14개사에 맞춰 다시 만든다.
기존 Costco와 Amazon 소스는 유지한다. H&M, Fast Retailing, Decathlon 소스는 빼고 American Eagle Outfitters, Victoria's Secret, Urban Outfitters, Duluth Trading, Nike 소스를 추가한다.

질의 형식은 기존과 같다. 회사명을 큰따옴표로 묶고 업무 어휘를 괄호로 묶는다.
`keyword_filter`는 기존 바이어 소스에 있는 배열을 그대로 복사한다.
이것을 안 넣으면 커클랜드 와인 기사와 동명이인 연예 기사가 들어온다. 이미 겪은 문제다.

새로 만들 질의 예시

```
"Victoria's Secret" (apparel OR sourcing OR earnings OR inventory)
"American Eagle Outfitters" OR "Aerie" (apparel OR sourcing OR earnings)
"Urban Outfitters" OR "Free People" (apparel OR sourcing OR earnings)
"Duluth Trading" (apparel OR sourcing OR earnings)
Nike (apparel OR sourcing OR "supply chain" OR earnings) -sneaker -shoe
```

바이어를 갈아치우면 예전 바이어 기사가 보관소에 남는다. 지우지 않는다.
`entities` 매칭이 없어져 화면에 안 나올 뿐이다.

---

## 4. 경쟁사 12개사

한국 상장 의류·신발 OEM/ODM 벤더가 대상이다. 2025 사업보고서의 연결 매출을 기준으로 규모가 큰 12개사를 선정한다.
상장 여부와 종목코드는 2026-08-31 기준 한국거래소 KIND에서 확인한다. 원천은 금융감독원 DART 오픈API다.

`config/competitors.json`을 새로 만든다. 형식은 `buyers.json`과 같되 `cik` 대신 `corp_code`를 쓴다.

| key | 이름 | 종목코드 | 2025 연결 매출 규모 | 비고 |
|---|---|---|---|---|
| `youngone` | 영원무역 | 111770 | 약 4조 원 | 의류·아웃도어 OEM |
| `hansae` | 한세실업 | 105630 | 약 2조 원 | 의류 OEM/ODM |
| `hwaseung` | 화승엔터프라이즈 | 241590 | 1조 5,643억 원 | 신발 중심, 모자·의류 ODM 포함 |
| `jscorp` | 제이에스코퍼레이션 | 194370 | 1조 2,882억 원 | 핸드백·의류 OEM |
| `shinwon` | 신원 | 009270 | 1조 2,524억 원 | 의류 OEM·패션 |
| `tp` | 티피(구 태평양물산) | 007980 | 1조 290억 원 | 의류 OEM 중심 |
| `hojeon` | 호전실업 | 111110 | 5,209억 원 | 스포츠웨어 OEM |
| `nobland` | 노브랜드 | 145170 | 약 4,762억 원 | 의류 ODM |
| `kido` | 기도산업 | 282620 | 3,466억 원 | 기능성 아웃도어 OEM, 2026-08-21 상장 |
| `kukdong` | 국동 | 005320 | 약 3,119억 원 | 니트 의류 OEM |
| `wilbes` | 윌비스 | 008600 | 1,883억 원 | 섬유 수출·교육 복합 |
| `ssite` | 씨싸이트 | 109670 | 1,697억 원 | 니트 의류 OEM/ODM |

매출액은 후보군 선정을 위한 규모 기준이며 화면에는 DART에서 수집한 원 단위 값을 쓴다. 공시 정정에 따라 수치가 달라질 수 있으므로 하드코딩하지 않는다.

**제외 대상.** 세아상역과 한솔섬유는 비상장이라 종목코드 기반 자동 수집 대상에서 제외한다. 신성통상은 2025-09-30 상장폐지되어 제외한다. SG세계물산은 상장사지만 2025 연결 매출이 약 1,323억 원으로 이번 12개사 컷 아래라 제외한다.

종목코드는 한국거래소에서 확인했지만 `corp_code`와는 다른 값이다.
`corp_code`는 반드시 DART가 주는 회사 목록에서 **회사명으로 조회해서** 얻는다. 종목코드는 교차 확인용으로만 쓴다.
일치하지 않으면 그 회사는 건너뛰고 로그에 남긴다. 잘못된 회사의 재무를 붙이는 것이 최악이다.

### 4-1. DART 어댑터

`config.py`에 `DART_KEY = os.environ.get("DART_API_KEY", "").strip()`를 추가한다.
키는 무료다. https://opendart.fss.or.kr 에서 발급한다.

**회사 코드 목록**

```
https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=<KEY>
```

zip이 온다. 안에 `CORPCODE.xml`이 있고 `corp_code`, `corp_name`, `stock_code`가 들어 있다.
파일이 크므로 실행마다 받지 않는다. `data/dart_corpcode.json`에 이름과 코드 맵만 뽑아 저장하고 30일마다 갱신한다.

**재무제표**

```
https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json
  ?crtfc_key=<KEY>&corp_code=<CODE>&bsns_year=<YYYY>&reprt_code=<CODE>&fs_div=CFS
```

`reprt_code`는 `11013`(1분기), `11012`(반기), `11014`(3분기), `11011`(사업보고서)다.
`fs_div`는 연결 `CFS`를 쓴다. 연결이 없으면 개별 `OFS`로 한 번 더 시도한다.

읽을 계정은 `account_nm` 기준이다.

- 매출액: `매출액` 또는 `수익(매출액)`
- 영업이익: `영업이익` 또는 `영업이익(손실)`
- 재고자산: `재고자산`

금액은 `thstrm_amount`(당기)를 쓴다. 문자열이고 쉼표가 들어 있다. 음수는 괄호가 아니라 `-`로 온다.
단위는 원이다. 백만 원으로 나눠서 넣는다. `unit`은 `백만 원`이다.

**분기 단독값 계산**

SEC와 같은 문제가 있다. 손익 항목은 누계로 온다.

- 1분기는 그대로 쓴다.
- 2분기는 반기에서 1분기를 뺀다.
- 3분기는 3분기 누계에서 반기를 뺀다.
- 4분기는 사업보고서 연간에서 3분기 누계를 뺀다.

재고자산은 시점 값이라 빼지 않는다. 그대로 쓴다.

`period`는 `2026-Q2` 형식이다. `end`에는 해당 분기말 날짜를 넣는다.
한국 기업은 대부분 12월 결산이므로 Q1은 03-31, Q2는 06-30, Q3은 09-30, Q4는 12-31이다.
결산월이 다른 회사가 있으면 `corpCode`가 아니라 `company.json` API의 `acc_mt`로 확인한다.

**호출량과 속도**

회사 12곳에 연도 3년치, 보고서 4종이면 144회다. DART 한도는 분당 1000건이다.
안전하게 요청 사이에 0.3초를 둔다. 이미 받은 연도와 분기는 다시 받지 않는다.
`data/kpi/*.json`에 있는 기간은 건너뛰되, 최근 2개 분기는 정정 공시를 반영해 다시 받는다.

**주의.** 분기보고서는 분기 종료 후 45일, 사업보고서는 90일 안에 제출한다.
SEC보다 늦다. 최신 분기가 비어 있는 것은 정상이다. 노후 판정이 이것을 이미 처리한다.

키가 없으면 조용히 건너뛴다. 로그에 `DART 건너뜀 · DART_API_KEY 환경변수가 없습니다`를 남긴다.
나머지 수집은 계속된다.

**검증 완료 사항.** 잘못된 키로 호출하면 `{"status":"010","message":"등록되지 않은 인증키입니다."}`가 온다.
엔드포인트 주소는 맞다. 실제 데이터 확인은 키 발급 후에 한다.

### 4-2. 경쟁사 뉴스

경쟁사도 기사를 붙인다. `sources.json`에 `kind: "competitor"` 소스를 12개 추가한다.
`via`는 `googlenews_query`, `region`은 `국내`다.

질의 예시

```
"한세실업" (수주 OR 실적 OR 매출 OR 생산 OR 소싱)
"영원무역" (수주 OR 실적 OR 매출 OR 생산 OR OEM)
```

`keyword_filter`는 국내용으로 새로 만든다.
`["수주", "실적", "매출", "영업이익", "생산", "소싱", "공장", "수출", "바이어", "증설"]`

`classify.py`의 엔티티 매칭에 경쟁사도 넣는다. `buyers.json`과 `competitors.json`을 합쳐서 넘긴다.
`publish.buyer_news`는 이름을 `entity_news`로 바꾸고 양쪽을 다 담는다.

**바이어 소스와 마찬가지로 경쟁사 소스도 FABRIC TREND에서 제외한다.**
`config.buyer_source_names()`를 `feed_excluded_sources()`로 바꾸고 `kind`가 `buyer` 또는 `competitor`인 것을 전부 반환한다.
R73을 먼저 했다면 그쪽 함수를 고친다. R74를 먼저 했다면 여기서 만들고 R73이 쓴다.

---

## 5. 화면 반영

### 5-1. 타입

`src/data/trend.ts`

- `KpiCard`에 `side: "buyer" | "competitor"` 추가
- `TrendKpi.news`는 그대로 두되 바이어와 경쟁사 키가 섞여 들어온다
- `TrendKpi.entity_keys`도 양쪽을 합쳐서 내보낸다

### 5-2. TrendMacro.tsx

상단 StatCard 4장을 다음으로 바꾼다.

1. 바이어 14개사 (실적 수집 성공 개수)
2. 경쟁사 12개사 (실적 수집 성공 개수)
3. 원달러 환율 (최신값, 전년비)
4. 면화 A Index (최신값, 전년비)

유가와 CPI와 재고율은 하단 원자재 섹션에서 본다. 상단에는 가장 자주 보는 둘만 올린다.

`기업 모니터링` 카드 안에 `Tabs`를 넣는다. `바이어`와 `경쟁사`다.
선택한 회사 상태를 탭마다 따로 둔다. 탭을 오갈 때 선택이 리셋되면 안 된다.

`원자재 · 정부 통계` 섹션에는 지표가 여섯 개가 된다.
면화 A Index, 유가 Brent, 원달러 환율, 미국 의류 CPI, 미국 의류 소매재고율, 미국 의류 수입액이다.
`grid md:grid-cols-2 xl:grid-cols-3`을 유지하면 두 줄로 떨어진다.

경쟁사 카드의 단위가 `백만 원`이라 `fmtValue`의 자릿수 규칙이 그대로 맞는다. 따로 손대지 않는다.

---

## 6. 완료 기준

1. `python run.py kpi`가 FRED 키 없이도 환율과 의류 CPI를 채운다.
2. FRED 키를 넣으면 세 지표가 전부 FRED 경로로 들어온다.
3. 바이어 14개사 전부에서 SEC 경로로 매출, 영업이익, 재고가 들어온다.
4. 경쟁사는 DART 키가 있으면 상장 12개사 전부에서 들어온다. 키가 없으면 조용히 건너뛴다.
5. 회사명과 종목코드가 어긋나는 경쟁사는 건너뛰고 로그에 남는다.
6. 기업 모니터링 탭 전환과 회사 선택이 각각 독립으로 동작한다.
7. 바이어와 경쟁사 소스 기사가 FABRIC TREND에 나오지 않는다.
8. `npm run build` 통과.

---

## 7. 검증 방법

분기 단독값 계산은 반드시 교차 검증한다. 이미 SEC 쪽에서 한 번 했다.

```
Target 회계연도 2025년 Q1부터 Q4 합계 = 10-K 매출 104,780백만 달러
```

DART도 같은 방식으로 한 곳만 확인한다.
한세실업의 어느 한 해 4개 분기 매출 합계가 그 해 사업보고서 연간 매출과 일치해야 한다.
일치하지 않으면 누계 처리가 틀린 것이다. 화면을 만들기 전에 여기서 잡는다.

---

## 8. 하지 말 것

- 회사명 매칭이 애매하면 임의로 고르지 않는다. 건너뛰고 로그에 남긴다.
- 새 API 키를 코드나 설정 파일에 넣지 않는다. 전부 GitHub Secrets와 환경변수로만 받는다.
- 원자재 지표를 더 늘리지 않는다. 전략기획팀 대시보드와 겹치는 부분이 이미 많다.
- git 커밋과 Firestore 배포는 하지 않는다. 사용자가 직접 한다.
- 저장소가 공개다. 사내 실적, 단가, 협력사명, 조직도 내용, 개인 이름과 이메일을 코드나 설정 파일이나 문서에 넣지 않는다. 이 지시서에도 회사명만 남겼다.
