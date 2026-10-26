# R351 주간보고 진행 집계를 HOME 기준으로 맞춘다

상태: 미착수

## 배경

주간보고 팝업의 "전체 진행"이 HOME의 "N건 진행 중", DD MASTER 전체 탭 행 수와 셋 다 달랐다.
2026-10-26 실데이터(DD 204행)로 세 기준을 돌려 원인을 확정했다.

| 화면 | 기준 | 건수 |
|---|---|---|
| DD MASTER 전체 탭 | Status가 완료·DROP·REJECT가 아닌 행 (HOLD 포함) | 83 |
| HOME 진행 중 | `isInProgress` = Status가 "진행중" | 79 |
| 주간보고 진행 | DROP·HOLD·REJECT 제외 + Received date 공란 | 73 |

차이는 둘뿐이다.

- 83 − 79 = **HOLD 4건.** DD MASTER에만 보인다. 이번 작업 대상이 아니다.
- 79 − 73 = **Status가 진행중인데 Received date가 이미 찍힌 6건.**

그 6건 중 수취일이 보고 구간(10/19~10/26) 밖인 **4건**(10/14 세 건, 10/16 한 건)은
`progressRows`(수취일 공란)에도 `doneRows`(구간 안 수취)에도 들지 않아 **보고서에서 통째로 빠졌다.**
박향근 지시로 진행 집계를 HOME 기준에 맞춘다.

## 하지 말 것

- **"완료인데 Received date 공란" 경로를 건드리지 마라.** 2026-10-26 실데이터 기준 0건이고 이번 원인이 아니다.
- **`doneRows`의 기준을 바꾸지 마라.** 완료는 계속 Received date이고 구간 안이다. FL#으로 되돌리지 마라.
- **`EXCLUDED_STATUS`에 "완료"를 넣지 마라.** `doneRows`가 같이 죽는다.
- **`weekly-report.ts`의 지역 함수 `statusOf`를 `derive.ts`의 같은 이름 함수와 섞지 마라.** 이름만 같고 무관하다. 지역 `statusOf`는 그대로 둔다.
- 날짜 구간(`from`, `to`) 계산을 손대지 마라.

## 파일별 조치

### 1. `src/data/weekly-report.ts`

**(a) import에 `isInProgress`를 더한다.** 24행 근처, 기존 import 블록 바로 아래.

현재:
```ts
import { normalizeCategory } from "./xlsx-parsers"
import { toDate } from "./format"
import { ownerDisplayName, type DevRecord } from "./schema"
```

교체:
```ts
import { normalizeCategory } from "./xlsx-parsers"
import { isInProgress } from "./derive"
import { toDate } from "./format"
import { ownerDisplayName, type DevRecord } from "./schema"
```

`derive.ts`는 `weekly-report.ts`를 import 하지 않으므로 순환은 생기지 않는다. 확인했다.

**(b) 파일 머리말 주석을 바꾼다.** 1~18행의 블록 주석 전체를 아래로 교체한다.

```ts
/**
 * 주간 업무 보고용 집계.
 *
 * **진행은 HOME과 같은 기준이고, 완료만 화면과 다르다.**
 *
 * 진행은 `derive.ts`의 `isInProgress`(DD Status 컬럼이 "진행중")를 그대로 쓴다.
 * HOME의 "N건 진행 중" 카드와 언제나 같은 수가 나온다. 2026-10-26에 박향근이 맞추라고 정했다.
 * 예전에는 "Received date가 공란인 건"을 진행으로 셌는데, 실물을 받았는데 Status를 진행중으로
 * 둔 행이 진행에도 완료에도 안 들어가 보고서에서 통째로 사라졌다(실데이터 4건).
 * **이 기준을 "수취일 공란"으로 되돌리지 말 것.** 그 구멍이 다시 열린다.
 *
 * 완료는 **원단 실물을 받은 날(Received date)**이고 보고 구간 안인 건이다.
 * 리뷰용 원단을 받는 날과 FL 등록에 필요한 FDS를 받는 날 사이 간격이 커서, 이번 주에 원단을
 * 받아 리뷰까지 끝냈는데 FDS가 늦어 FL은 다음 주에 등록되는 일이 흔하다. 그래서 화면의 완료
 * 판정(FL#)을 쓰지 않는다. **완료를 FL# 기준으로 되돌리지 말 것.**
 *
 * 진행은 지금 열려 있는 건을 세는 스냅샷이고 완료는 구간 안에 끝난 건을 세는 흐름이다.
 * 종류가 다르므로 **한 행이 진행과 완료 양쪽에 들 수 있다.** 실물을 받았는데 Status가 아직
 * 진행중인 행이 그렇다. HOME의 진행 카드와 완료 카드도 같은 식으로 겹친다. 버그가 아니다.
 *
 * 담당별 문장은 DD에 적힌 것까지만 만든다. "as is ok", "overweight 로 중량 개선 재가공 요청"
 * 같은 판단과 협의 내용은 데이터에 없다. 뼈대를 뽑아 주고 나머지는 사람이 채운다.
 */
```

**(c) `buildSections`가 완료 묶음을 `doneSet`으로 가른다.**

현재 시그니처(147행 근처):
```ts
function buildSections(
  rows: readonly DevRecord[],
  today: Date,
  freshRows: Set<DevRecord>,
  level: ReportDetailLevel,
): WeeklyReportSection[] {
```

교체:
```ts
function buildSections(
  rows: readonly DevRecord[],
  today: Date,
  freshRows: Set<DevRecord>,
  level: ReportDetailLevel,
  doneSet: ReadonlySet<DevRecord>,
): WeeklyReportSection[] {
```

바로 아래 두 줄이 지금 이렇다.
```ts
    const scoped = rows.filter((record) => normalizeCategory(record.category) === category.key)
    if (!scoped.length) return []
    const progress = scoped.filter((record) => !receivedKey(record)).length
    const label = `${category.label} (진행 ${progress}건 / 완료 ${scoped.length - progress}건)`
```

교체:
```ts
    const scoped = rows.filter((record) => normalizeCategory(record.category) === category.key)
    if (!scoped.length) return []
    // 완료 묶음은 구간 안에 실물이 온 건이다. 수취일이 있어도 구간 밖이면 진행에 남는다.
    const done = scoped.filter((record) => doneSet.has(record)).length
    const label = `${category.label} (진행 ${scoped.length - done}건 / 완료 ${done}건)`
```

같은 함수 아래쪽 요약 분기의 두 줄이 지금 이렇다.
```ts
    const doneLines = summarize(scoped.filter((record) => receivedKey(record)), false)
    const progressLines = summarize(scoped.filter((record) => !receivedKey(record)), true)
```

교체:
```ts
    const doneLines = summarize(scoped.filter((record) => doneSet.has(record)), false)
    const progressLines = summarize(scoped.filter((record) => !doneSet.has(record)), true)
```

`stateOf`와 `receivedKey`는 그대로 둔다. 수취일이 있는 행은 계속 "샘플 수취 완료"로 표시된다.
구간 밖 수취 4건은 그 문구를 달고 `[진행]` 아래에 선다. 그게 이번 작업에서 노리는 신호다.

**(d) `buildWeeklyReport`의 집계를 바꾼다.**

현재(314행 근처):
```ts
  // 보고 기준 진행 중 = 실물이 아직 안 온 건. 화면의 진행 중(FL# 기준)과 다르다.
  const progressRows = counted.filter((record) => !receivedKey(record))
  const doneRows = counted.filter((record) => inRange(receivedKey(record)))
  const freshRows = progressRows.filter((record) => inRange(requestKey(record)))
```

교체:
```ts
  // 진행은 HOME과 같은 기준이다(Status "진행중"). 수취일을 보지 않는다.
  const progressRows = counted.filter(isInProgress)
  const doneRows = counted.filter((record) => inRange(receivedKey(record)))
  const freshRows = progressRows.filter((record) => inRange(requestKey(record)))
  // 두 묶음이 겹칠 수 있으므로 문장은 합집합으로 만든다. 같은 행이 두 줄로 나오면 안 된다.
  const reportRows = [...new Set([...progressRows, ...doneRows])]
  const doneSet = new Set(doneRows)
```

그리고 return 객체 마지막 두 줄이 지금 이렇다.
```ts
    sections: owner ? buildSections([...progressRows, ...doneRows], today, new Set(freshRows), "summary") : [],
    detailSections: owner ? buildSections([...progressRows, ...doneRows], today, new Set(freshRows), "detail") : [],
```

교체:
```ts
    sections: owner ? buildSections(reportRows, today, new Set(freshRows), "summary", doneSet) : [],
    detailSections: owner ? buildSections(reportRows, today, new Set(freshRows), "detail", doneSet) : [],
```

`categoryCount`, `uncategorized`, `ownerMap`을 만드는 코드는 손대지 않는다.
`progressRows`가 바뀌었으므로 자동으로 따라온다.

### 2. `src/routes/DevelopmentMasterSheet.tsx`

**(a) 팝업 안내 문구.** 3378~3383행.

현재:
```tsx
          <DialogDescription>최근 7일 기준입니다. 탭을 골라 고친 뒤 복사하세요.</DialogDescription>
          <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            <strong className="font-semibold text-[var(--foreground)]">완료는 Received date 기준입니다.</strong> FL# 기준이 아닙니다.
            FDS가 늦어 FL 등록이 다음 주로 넘어가는 건도 원단을 받았으면 완료로 셉니다.
            화면의 진행·완료 숫자와 다른 것이 정상입니다. DROP·HOLD·REJECT는 양쪽 모두에서 뺍니다.
```

교체:
```tsx
          <DialogDescription>완료와 신규는 최근 7일 기준입니다. 탭을 골라 고친 뒤 복사하세요.</DialogDescription>
          <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            <strong className="font-semibold text-[var(--foreground)]">진행은 HOME과 같은 기준입니다.</strong> DD Status가 진행중인 행을 셉니다.
            <strong className="font-semibold text-[var(--foreground)]"> 완료는 Received date 기준입니다.</strong> FL# 기준이 아닙니다.
            FDS가 늦어 FL 등록이 다음 주로 넘어가는 건도 원단을 받았으면 완료로 셉니다.
            DROP·HOLD·REJECT는 양쪽 모두에서 뺍니다. 실물을 받았는데 Status가 진행중인 행은 진행과 완료 양쪽에 듭니다.
```

그 아래 두 줄(담당 탭 설명, 요약·상세 설명)은 그대로 둔다.

**(b) `openWeeklyReport` 위 JSDoc.** 1318~1324행.

현재:
```ts
  /**
   * 보고용 숫자를 만들어 팝업을 띄운다.
   *
   * 완료 판정이 화면과 다르다. 화면은 FL#, 보고는 실물 도착일(Received date)이다.
   * FDS가 늦어 FL이 다음 주로 넘어가는 건이 흔해서 팀은 실물 기준으로 보고한다.
   * 자세한 이유는 `src/data/weekly-report.ts` 머리말에 적어 두었다.
   */
```

교체:
```ts
  /**
   * 보고용 숫자를 만들어 팝업을 띄운다.
   *
   * 진행은 HOME과 같은 기준(DD Status "진행중")이고, 완료만 화면과 다르다.
   * 화면의 완료는 FL#, 보고의 완료는 실물 도착일(Received date)이다.
   * FDS가 늦어 FL이 다음 주로 넘어가는 건이 흔해서 팀은 실물 기준으로 보고한다.
   * 자세한 이유는 `src/data/weekly-report.ts` 머리말에 적어 두었다.
   */
```

**(c) 주간 보고 버튼 title.** 3147행.

현재: `title="주간 업무 보고에 붙일 현황 문장을 만듭니다. 완료는 Received date 기준입니다"`

교체: `title="주간 업무 보고에 붙일 현황 문장을 만듭니다. 진행은 HOME과 같고 완료는 Received date 기준입니다"`

## 근거 수치 (2026-10-26 DD 204행)

고친 뒤 전체 탭 문장이 이렇게 나와야 한다. Codex는 데이터에 접근할 수 없으므로 대조는 클로드가 한다.

```
1. Total Sample Status Summary
- 전체 진행 79건 (EU 0건 + Season 21건 + Core 3건 + Project 55건)
- 신규 : 2건 / 공정 중 : 77건 / 완료 : 11건
```

담당별 줄도 나오지만 공개 저장소라 여기 적지 않는다. 합계는 진행 79, 완료 11이다.
고치기 전은 진행 73, Season 18, Project 52였다. 차이 6건은 Status가 진행중인데 수취일이 찍힌 행이고,
그중 4건은 수취일이 구간 밖이라 진행에도 완료에도 안 들어가던 건이다.

## 검증

```
npm run build
git status --short
```

빌드가 통과하고, 바뀐 파일이 `src/data/weekly-report.ts`와 `src/routes/DevelopmentMasterSheet.tsx` 둘뿐이면 된다.
빌드가 실패하면 고치고 다시 돌려라. 실패한 채로 보고하지 마라.
