# R73. FABRIC TREND 탭 분리, 카드뉴스, 유통 분류, 별표 공유함

상태: **미착수**. Codex가 구현한다.

앞선 작업으로 `tools/trend`(파이썬 수집기)와 `src/routes/TrendFabric.tsx`가 워킹트리에 미커밋 상태로 올라와 있다.
`npm run build` 통과 상태다. 그 위에 이어서 작업한다.

배경과 현재 구조는 `tools/trend/README.md`를 먼저 읽는다. 특히 관련도 점수와 rescore 구조를 이해하고 시작한다.

대상 파일

- `tools/trend/config/categories.json`
- `tools/trend/config/relevance.json`
- `tools/trend/trendbot/classify.py`
- `tools/trend/trendbot/publish.py`
- `src/data/trend.ts`
- `src/routes/TrendFabric.tsx`
- `src/data/trend-stars.ts` (신규)
- `firestore.rules`

---

## 1. 패션(유통) 분류 추가

지금은 유통 기사를 노이즈로 보고 점수에서 깎아 버린다. 앞으로는 버리지 않고 별도 분류로 살린다.

### 1-1. 관련도 게이트를 두 갈래로 나눈다

`relevance.json`의 구조를 바꾼다. 지금은 `threshold` 하나와 `signals` 하나다.
앞으로는 게이트 두 개를 둔다.

```json
{
  "gates": {
    "material": { "threshold": 7, "category_pool": ["MATERIAL", "YARN", "FABRIC", "CHEMICAL"] },
    "retail":   { "threshold": 6, "category_pool": ["RETAIL"] }
  }
}
```

`signals` 항목마다 `gate` 키를 붙인다. 값은 `material` 또는 `retail`이다.
기존 `core`, `innovation`, `spec`, `standard`는 `material` 게이트로 간다.
기존 `noise_fashion`, `noise_business`, `noise_event`, `noise_listing`은 **감점 신호에서 유통 게이트의 가점 신호로 성격이 바뀐다.**

새 신호를 다음과 같이 만든다. 이름과 가중치는 아래를 그대로 쓴다.

| 신호 | 게이트 | 가중치 | max_hits | requires | 내용 |
|---|---|---|---|---|---|
| `retail_core` | retail | 3 | 3 | 없음 | retailer, apparel brand, collection, store, consumer, shopper, merchandis, assortment, 유통, 브랜드, 매장, 소비자 |
| `retail_business` | retail | 3 | 2 | retail_core | earnings, revenue, quarterly results, guidance, same-store, inventory, tariff, sourcing shift, 실적, 매출, 관세, 소싱 |
| `retail_launch` | retail | 2 | 2 | retail_core | launches, unveils, collection drop, campaign, capsule, collaboration, 출시, 컬렉션, 캠페인, 협업 |
| `retail_noise` | retail | -4 | 2 | 없음 | recipe, wine, celebrity gossip, red carpet, horoscope, deals of the day, 할인정보, 연예 |

`material` 게이트에는 감점 신호를 하나만 남긴다. `noise_generic` 가중치 -3, max_hits 2.
내용은 기존 `noise_listing`(전시회 일정 게시물)과 인사 발령 어휘만 남긴다.
런웨이, 컬렉션, 실적 어휘는 여기서 뺀다. 이제 유통 게이트가 가져간다.

### 1-2. 판정 순서

`classify.py`의 `apply`를 다음 순서로 고친다.

1. `material` 게이트 점수를 낸다. 임계치를 넘으면 `MATERIAL`, `YARN`, `FABRIC`, `CHEMICAL` 중에서 분류하고 끝낸다.
2. 넘지 못하면 `retail` 게이트 점수를 낸다. 임계치를 넘으면 `RETAIL`로 둔다.
3. 둘 다 못 넘으면 `relevant=False`로 둔다.

소재 게이트를 먼저 본다. 소재 기사가 유통으로 새면 안 된다.

`record`에 `gate` 필드를 추가한다. 값은 `material`, `retail`, `none` 중 하나다.
`score`는 통과한 게이트의 점수를 넣는다. 통과하지 못했으면 두 점수 중 큰 값을 넣는다.

### 1-3. 바이어 전용 소스는 제외

`sources.json`에서 `kind`가 `buyer`인 소스는 MACRO TREND의 바이어 카드 전용이다.
유통 게이트가 생기면 이 기사들이 전부 FABRIC TREND로 쏟아진다. 반드시 막는다.

`classify.apply`에서 `record["source"]`가 바이어 소스면 게이트 판정 없이 `relevant=False`, `gate="none"`으로 둔다.
바이어 소스 이름 집합은 `publish.py`의 `_buyer_sources()`와 같은 방식으로 `sources.json`에서 읽는다.
중복 구현하지 말고 `config.py`에 `buyer_source_names()` 함수를 하나 만들어 양쪽이 같이 쓴다.

### 1-4. 화면 상수

`src/data/trend.ts`를 고친다.

- `TrendCategory`에 `"RETAIL"` 추가
- `CATEGORY_LABEL.RETAIL = "패션 · 유통"`
- `CATEGORY_ORDER`는 `["MATERIAL", "YARN", "FABRIC", "CHEMICAL", "RETAIL", "ETC"]`
- `CATEGORY_COLOR.RETAIL = "var(--chart-5)"`

`TrendArticle`에 `gate: "material" | "retail" | "none"`을 추가한다. publish에서 `g`가 아니라 `w` 키로 내보낸다(`g`는 이미 태그가 쓰고 있다).

### 1-5. 반영 절차

사전만 바뀌므로 재수집이 필요 없다.

```
python run.py rescore
```

돌린 뒤 `python run.py why "검색어"`로 유통 기사가 RETAIL로 떨어지는지 표본 확인한다.
확인 표본은 최소 20건이다. 소재 기사가 RETAIL로 새면 `material` 게이트 어휘를 보강한다.

---

## 2. 화면을 탭 세 개로 나눈다

`TrendFabric.tsx`를 탭 구조로 바꾼다. `@/components/ui/tabs`(Radix)를 쓴다. 이미 저장소에 있다.

탭 순서와 이름은 다음과 같다.

1. `하이라이트` 카드뉴스
2. `전체 목록` 현행 목록
3. `저장함` 팀 별표 모음

상단 StatCard 4장은 탭 밖에 그대로 둔다. 모든 탭에서 보인다.

### 2-1. 하이라이트 탭

분야별로 가장 주목받은 기사를 카드로 편다. 목표 20장이다.

**선정 규칙**

- 대상은 최근 21일 기사다.
- 분류별로 나눈다. `MATERIAL`, `YARN`, `FABRIC`, `CHEMICAL`, `RETAIL` 다섯 개다.
- 분류마다 heat 점수 상위 4건을 뽑는다. 합계 20장이다.
- 어느 분류가 4건에 못 미치면 그 자리를 비운다. 다른 분류로 채우지 않는다. 분야별 균형이 이 탭의 목적이다.
- `ETC`는 이 탭에 넣지 않는다.

**heat 점수**

```
heat = (hits - 1) * 5 + score + recency
recency = 최근 3일 6점, 7일 4점, 14일 2점, 그 외 0점
```

파이썬이 아니라 화면에서 계산한다. `feed.json`에 이미 `h`, `v`, `d`가 있다.
`src/data/trend.ts`에 `heatScore(article)` 함수를 두고 하이라이트 탭이 쓴다.

**카드 구성**

3열 그리드다. `grid gap-4 md:grid-cols-2 xl:grid-cols-3`.

카드 한 장에 넣을 것

- 상단 4px 색 띠. `CATEGORY_COLOR[c]`를 쓴다.
- 분류 배지. 영문 코드와 한글 라벨을 같이 쓴다. 목록 탭과 같은 형식이다.
- HIT 배지. `h`가 2 이상일 때만 표시한다. 목록 탭과 같은 형식이다.
- 제목. 한국어 제목(`t`)을 2줄까지 표시하고 넘치면 자른다. 클릭하면 원문이 새 탭으로 열린다.
- 원문 제목(`o`). 1줄, 작은 글씨, `text-[var(--muted-foreground)]`. `t`와 같으면 표시하지 않는다.
- 요약(`s`). 3줄까지. `line-clamp-3`.
- 하단 줄. 태그 최대 3개, 매체명, 날짜, 별표 버튼.
- 카드 전체 높이를 맞춘다. `flex h-full flex-col`을 쓰고 요약 영역에 `flex-1`을 준다.

**카드는 `Reveal`로 감싸지 않는다.** 20장이 한 화면을 넘긴다.
`SectionCard` 대신 `Card`를 직접 쓴다. 이유는 `CLAUDE.md`의 TREND 항목에 적혀 있다.

### 2-2. 전체 목록 탭

현재 구현을 그대로 옮긴다. 사이드 필터 패널과 목록, 정렬, 검색, 더 보기가 전부 유지된다.

필터 패널의 분류 목록에 `RETAIL`이 자동으로 들어온다. `CATEGORY_ORDER`만 고치면 된다.

### 2-3. 저장함 탭

3절에서 다룬다.

### 2-4. 상태 유지

탭을 옮겨도 필터 상태가 날아가면 안 된다. 상태는 `TrendFabric` 최상단에 그대로 두고 탭은 렌더만 나눈다.
Radix Tabs의 기본 언마운트 동작을 쓰되, 필터 state가 상위에 있으므로 값은 유지된다.

---

## 3. 별표 공유함

팀원이 각자 별표를 찍어도 한 곳에 모여 보여야 한다.

### 3-1. 저장 위치

Firestore를 쓴다. 앱에 이미 Firebase가 붙어 있다.

컬렉션은 `trendStars`, 문서 아이디는 사용자 uid다. 사용자 한 명이 문서 하나를 통째로 덮어쓴다.

```
trendStars/{uid} = {
  email: string,
  updatedAt: string,          // ISO8601
  items: Array<{
    id: string,               // 기사 dedup key
    t: string,                // 한국어 제목
    o: string,                // 원문 제목
    u: string,                // 원문 링크
    d: string,                // 발행일
    c: TrendCategory,
    m: string,                // 매체
    at: string                // 별표를 찍은 시각 ISO8601
  }>
}
```

**기사 메타를 문서 안에 복사해 넣는 것이 중요하다.**
`feed.json`은 최근 120일만 담는다. 링크만 저장하면 넉 달 뒤 저장함이 빈칸이 된다.

### 3-2. Firestore 규칙

`firestore.rules`에 아래를 추가한다. `state` 블록 다음에 넣는다.

```
match /trendStars/{uid} {
  allow read: if isApproved();
  allow create, update: if isApproved() && request.auth.uid == uid;
  allow delete: if isOwner() || (isApproved() && request.auth.uid == uid);
}
```

**현재 규칙은 쓰기를 소유자에게만 허용한다.** 이 블록을 넣지 않으면 팀원이 찍은 별표가 저장되지 않는다.
규칙 파일만 고치고 배포는 하지 않는다. 배포는 사용자가 직접 한다.

### 3-3. 클라이언트 모듈

`src/data/trend-stars.ts`를 새로 만든다. `src/data/firestore-sync.ts`의 스타일을 따른다.

내보낼 함수

- `subscribeTeamStars(handler)` `trendStars` 컬렉션 전체를 `onSnapshot`으로 구독한다. 해제 함수를 돌려준다.
- `pushMyStars(items)` 내 uid 문서를 통째로 덮어쓴다. 디바운스 1초를 건다. 별표를 연달아 찍을 때 쓰기가 몰리는 것을 막는다.
- 로그인하지 않았거나 승인 전이면 두 함수 모두 조용히 아무것도 하지 않는다.

기존 `readStars` / `writeStars`(localStorage)는 남긴다. 오프라인과 로그인 실패 시의 대비다.
로그인 상태에서는 localStorage와 Firestore에 같이 쓴다. 화면 표시는 Firestore 값을 우선한다.

### 3-4. 저장함 탭 화면

팀 전체 별표를 한 목록으로 모은다.

- 기본 정렬은 별표를 찍은 시각(`at`) 최신순이다.
- 같은 기사를 여러 명이 찍었으면 한 줄로 합친다. 찍은 사람 수를 배지로 보여 준다. 마우스를 올리면 이메일 앞부분(@ 앞)이 나온다.
- 필터 두 개를 둔다. `전체` / `내 별표만`, 그리고 분류 필터다.
- 각 줄에 제목, 원문 제목, 분류 배지, 매체, 날짜, 원문 링크, 별표 해제 버튼을 넣는다.
- 별표 해제는 내가 찍은 것만 된다. 남이 찍은 것은 해제 버튼을 비활성으로 둔다.
- 상단에 `링크 전체 복사` 버튼을 하나 둔다. 현재 목록의 `제목\t링크` 를 줄바꿈으로 이어 클립보드에 넣는다. 주간 보고에 붙일 때 쓴다.
- 비어 있으면 안내 문구를 띄운다. "아직 별표한 기사가 없습니다. 하이라이트나 전체 목록에서 별표를 찍으면 여기에 모입니다."

---

## 4. 최근 30일 수집량을 태그 모멘텀으로 교체

`최근 30일 수집량` 카드를 통째로 지운다. `CollectionStripe` 컴포넌트도 지운다.
수집이 되고 있는지는 하단 `수집 상태` 카드에서 이미 본다. 같은 정보를 두 번 보여 줄 이유가 없다.

대신 **태그 모멘텀**을 넣는다. 무엇이 뜨고 있는지가 트렌드 리포트의 본론이다.

### 4-1. 파이썬 쪽

`publish.py`의 `feed()` 페이로드에 `momentum`을 추가한다.

```
momentum: Array<{
  tag: string,
  recent: number,      // 최근 28일 출현 건수
  prior: number,       // 그 직전 28일 출현 건수
  delta: number,       // recent - prior
  weeks: number[]      // 최근 12주 주별 출현 건수, 오래된 주가 앞
}>
```

- 대상은 `relevant`가 참인 기사다.
- 최근 28일과 직전 28일을 합쳐 한 번이라도 3건 이상 나온 태그만 담는다. 1, 2건짜리는 잡음이다.
- `delta` 내림차순으로 정렬한다.
- 상위 8개와 하위 4개만 담는다. 파일 크기를 늘리지 않는다.
- 주 경계는 월요일 시작으로 한다.

### 4-2. 화면 쪽

`SectionCard` 제목은 `떠오르는 주제`, 부제는 `최근 4주 태그 출현을 직전 4주와 비교했습니다. 12주 추이를 같이 봅니다.`

한 행에 태그 하나를 놓는다. 최대 12행이다.

- 왼쪽 태그명
- 가운데 12주 스파크라인. `@/components/charts/Sparkline`을 쓴다. 이미 있다.
- 오른쪽 `최근 28일 건수`와 증감. 증가면 `text-[var(--chart-1)]`, 감소면 `text-[var(--destructive)]`, 변화 없으면 muted.
- 행을 누르면 전체 목록 탭으로 이동하면서 그 태그 필터가 걸린다.

행 클릭으로 탭이 바뀌므로 탭 상태를 `TrendFabric` 안에서 제어형으로 관리한다.

---

## 5. 완료 기준

1. `python run.py rescore` 한 번으로 RETAIL 분류가 생긴다. 재수집이 필요 없다.
2. 바이어 전용 소스 기사가 FABRIC TREND 어느 탭에도 나오지 않는다.
3. 하이라이트 탭에 분야별 카드가 최대 20장 뜬다. 한 분야가 4장을 넘지 않는다.
4. 전체 목록 탭의 필터, 정렬, 검색, 더 보기가 전부 이전과 같이 동작한다.
5. 별표를 찍으면 Firestore `trendStars/{uid}`에 저장된다. 다른 계정으로 로그인해도 저장함에서 보인다.
6. 저장함의 `링크 전체 복사`가 동작한다.
7. 최근 30일 수집량 카드가 사라지고 떠오르는 주제 카드가 그 자리에 있다.
8. 떠오르는 주제의 행을 누르면 전체 목록 탭으로 넘어가며 태그 필터가 걸린다.
9. `npm run build` 통과.

---

## 6. 하지 말 것

- `SectionCard`로 긴 목록을 감싸지 않는다. `Reveal`의 노출 임계값이 0.12라 카드가 뷰포트보다 훨씬 길면 영영 안 보인다. 이미 한 번 겪은 문제다.
- `tools/trend/data/` 아래 보관 파일을 손으로 고치지 않는다. `rescore`가 다시 쓴다.
- Firestore 배포와 git 커밋은 하지 않는다. 사용자가 직접 한다.
- 저장소가 공개다. 사내 실적, 단가, 협력사명, 개인 이메일을 코드나 설정 파일이나 문서에 넣지 않는다.
