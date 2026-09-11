# R128 Overall status 공정 비율 지난주 대비 %p

상태: **폐기.** 구현했다가 걷어냈다. 대체 설계는 아래 "왜 걷어냈나"와 "대체 설계"를 본다.

이 문서는 지표를 다시 붙이려는 사람을 막기 위해 남긴다. 화면에 붙였던 `%p` 증감과
`processFunnelAsOf`, `processReachedAsOf` 는 모두 제거됐다.

## 왜 걷어냈나

원사 도달률이 마이너스로 떴고, 원인을 따져 보니 지표 설계 자체가 거꾸로 읽히는 구조였다.

비율은 `도달 건수 ÷ 진행 중 건수`다. 분모가 살아 움직이는 집단이라 두 가지 정상적인 활동이
모두 비율을 끌어내린다.

1. 신규 접수가 들어오면 분자는 그대로인데 분모만 늘어난다. 원사 미도달 건이니 당연하다.
2. 완료 건이 진행 중에서 빠질 때도 내려간다. 완료 건은 네 공정 모두 도달로 세어졌으므로
   분자와 분모가 같이 1씩 줄어든다. 비율이 100%가 아닌 이상 `(a-1)/(b-1)` 은 늘 `a/b` 보다 작다.
   39/78 은 50% 인데 38/77 은 49.35% 다.

즉 **접수도 완료도 활발한 주에 지표가 나빠 보인다.** 비율을 올리는 유일한 길은 기존 진행 건이
새로 그 공정에 도달하는 것뿐인데, 그 효과가 위 두 힘에 묻힌다. 원사는 첫 공정이라 유입 영향을
가장 직접 받아 마이너스가 제일 크게 보였다.

이 비율은 성과가 아니라 **구성비**다. 스냅샷으로는 쓸 만하지만 주간 증감으로는 못 쓴다.

## 대체 설계 (구현됨)

- `processWeeklyFlow` 가 공정별 주간 통과 건수를 센다. 분모가 없어 코호트 변동에 안 흔들린다.
  기준은 `tech.processDates` 의 공정별 완료일이고 주는 월요일에 시작한다.
- `weeklyIntakeBalance` 가 이번 주 접수와 완료, 순증을 센다. 비율이 흔들리던 원인을 정면으로 보여준다.
- HOME Overall status 카드는 큰 숫자로 현황 비율을, 그 아래 줄에 이번 주 통과 건수와 지난주 대비
  증감을 건수로 보여준다. 카드 위에는 주간 흐름 한 줄이 붙는다.

코호트 고정 비교(지난주에 이미 진행 중이던 건만 모아 도달률 상승을 보는 안)도 검토했으나
"이번 주에 몇 건 움직였나" 라는 실무 질문에 직접 답하지 않아 채택하지 않았다.

---

아래는 폐기된 원래 지시서 내용이다. 참고용으로만 둔다.

상태: 구현 후 폐기.

HOME "Overall status"의 네 공정 카드에 지난주 같은 요일 대비 몇 %p 변했는지 함께 적는다.
증가는 붉은색 `+`, 감소는 파란색 `-` 다.

## 비교 기준 (사용자 확정)

**DD 날짜로 7일 전 시점을 다시 계산한다.** 주간 스냅샷을 쌓는 방식은 채택하지 않았다.
오늘 바로 숫자가 나와야 한다는 것이 이유다.

이 방식의 한계를 알고 들어간다. 오늘 값은 `isInProgress`(DD의 Status 문자열 "진행중")로 모집단을 정하는데,
7일 전 시점에는 그 문자열이 그때 무엇이었는지 알 수 없다. 그래서 과거 모집단은 날짜로 근사한다.
**이 차이는 버그가 아니다.** 고치려 들지 말고 문서와 화면 문구에 남긴다.

## A. `src/data/dd-workflow.ts`

`reached(value, today)`(70행)는 지금 모듈 안에만 있다. 공정 도달 판정을 밖에서도 같은 규칙으로
쓸 수 있게 함수 하나를 내보낸다.

```ts
/** 특정 시점 기준 공정 도달 여부. recalculateDevelopmentRecords 와 같은 규칙이다. */
export function processReachedAsOf(record: DevRecord, asOf: Date): { yarn: boolean; knitting: boolean; dyeing: boolean; finishing: boolean }
```

- 안에서 `record.tech?.processDates`를 보고 각 공정을 `reached(date, asOf)`로 판정한다.
- **`flDone`을 그대로 더하지 마라.** `recalculateDevelopmentRecords`(103행)는 `flDone || reached(...)`인데,
  `isCompletedFlNo(record.flNo)`는 현재 값이라 7일 전에도 완료였다고 단정할 수 없다.
  대신 `record.receivedDate`가 있고 그 날짜가 `asOf` 이하일 때만 네 공정을 모두 참으로 본다.
  Hanger 수취일이 완료의 실물 기준이라는 것은 CLAUDE.md 데이터 소스 규칙과 같다.
- `processDates`가 하나도 없는 레코드(데모 데이터)는 네 값 모두 거짓이다. 여기서 `stage` 문자열 폴백을 쓰지 마라.
  `stage`는 현재 값이라 과거 시점에 쓰면 틀린다.

## B. `src/data/derive.ts`

### B-1. `ProcessFunnelDatum`(153행)에 한 칸을 더한다

```ts
  /** 지난주 같은 요일 대비 증감(%p). 비교 모집단이 0건이면 null 이다. */
  deltaPp?: number | null
```

선택 필드로 둔다. `processFunnel`을 쓰는 다른 화면(DEVELOPMENT OVERVIEW)이 깨지지 않아야 한다.

### B-2. 7일 전 시점 함수를 새로 만든다

```ts
/**
 * 7일 전 시점의 공정 누적 도달률.
 *
 * 그날의 모집단을 DD 날짜로 되짚는다. 접수일이 그 시점 이후인 건은 아직 없던 건이고,
 * 수취일이 그 시점 이전인 건은 이미 끝난 건이다. 둘을 빼고 남은 것이 그날 진행 중이던 건이다.
 */
export function processFunnelAsOf(records: readonly DevRecord[], asOf: Date): ProcessFunnelDatum[]
```

모집단 규칙

1. `requestDate`가 있고 그 값이 `asOf`보다 크면 제외한다. 그 시점에 아직 접수되지 않은 건이다.
   `requestDate`가 비어 있으면 포함한다. 언제 들어왔는지 모르면 이미 있던 것으로 본다.
2. `receivedDate`가 있고 그 값이 `asOf` 이하면 제외한다. 그 시점에 이미 끝난 건이다.
3. DROP, HOLD, REJECT 는 현재 `devStatus` 값으로 제외한다. 그 시점 상태를 알 수 없어 현재 값으로 근사한다.
   판정 문자열은 `isInProgress`(308행)가 쓰는 `String(record.devStatus ?? "").replace(/\s+/g, "")`와 같은 정규화를 쓴다.
4. 남은 집합의 크기가 `total`, 각 공정 도달 건수가 `done`, `pct(done, total)`가 비율이다.
   `processReachedAsOf`를 쓴다. 저장된 `record.processReached`를 쓰지 마라. 그것은 현재 시점 값이다.

날짜 비교는 문자열 비교로 한다. `requestDate`와 `receivedDate`는 `YYYY-MM-DD` 문자열이라
`asOf`를 같은 형식으로 만들어 `<=`, `>`로 비교하면 된다. `new Date()` 변환을 섞지 마라.

### B-3. `homeSectionCards`(904행)에서 붙인다

```ts
const asOf = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)
const previous = processFunnelAsOf(records, asOf)
```

`progress.process`는 `processFunnel(active)` 결과에 `deltaPp`를 얹은 값이다.
같은 `key`끼리 짝지어라. 배열 순서에 기대지 마라.

- `previous`의 그 공정 `total`이 0이면 `deltaPp = null`이다.
- 아니면 `Math.round((item.pct - prev.pct) * 10) / 10`이다. 소수 한 자리다.
- 결과가 `0`이면 `0`으로 둔다. `null`로 바꾸지 마라. 화면에서 다르게 그린다.

`HomeSectionCards` 타입은 이미 `process: ProcessFunnelDatum[]`(225행)이라 따로 고칠 것이 없다.

## C. `src/routes/Home.tsx`

`ProcessFunnel`(299행)만 고친다.

- props 타입(300행)의 `process` 항목에 `deltaPp?: number | null`을 더한다.
- 비율 숫자(318행) 오른쪽에 증감 알약을 붙인다. 같은 줄에 두고 `items-baseline`으로 밑선을 맞춘다.
- 표기는 `+3.2%p`, `-1.4%p`, `0%p` 다. 부호를 항상 붙인다. 소수점이 `.0`이면 지운다.
- 색: 양수 `text-rose-500`, 음수 `text-sky-500`, 0 `text-[var(--muted-foreground)]`.
  주말 색과 같은 계열이라 이 저장소 안에서 새 색이 아니다. 새 토큰을 만들지 마라.
- `deltaPp`가 `null`이면 알약을 그리지 않는다. 빈 자리를 남기지도 마라.
- 알약에 `title`을 준다. `지난주 같은 요일(M.D) 기준 재계산` 형태다. 날짜는 오늘에서 7일 전이다.
- `NumberTicker`를 쓰지 마라. 증감은 작은 보조 숫자다. 그냥 텍스트로 적는다.
  탭이 비활성일 때 0으로 보이는 문제도 피한다(CLAUDE.md 주의 항목).
- 그룹 `aria-label`(306행)에 증감을 함께 넣는다. 화면을 못 보는 사람에게도 값이 가야 한다.
  예: `Yarn in-fac 39건 50%, 지난주 대비 3.2%p 증가`.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/dd-workflow.ts` | `processReachedAsOf` 내보내기 추가 |
| `src/data/derive.ts` | `deltaPp` 필드, `processFunnelAsOf` 추가, `homeSectionCards`에서 결합 |
| `src/routes/Home.tsx` | `ProcessFunnel` props와 비율 옆 증감 알약 |
| `CLAUDE.md` | 데이터 소스 규칙 표에 한 줄 |

`CLAUDE.md` 표에 넣을 줄

```
| HOME Overall status 증감 | DD | 7일 전 시점 재계산(`processFunnelAsOf`). 접수일·수취일로 그날 모집단을 되짚는다. 진행중 판정만 현재 Status 값으로 근사 |
```

## 검증

`npm run build` 한 번. 그 외 검증은 하지 마라.

## 하지 말 것

- 주간 스냅샷을 저장하지 마라. localStorage 도, Firestore 도 아니다. 사용자가 재계산 방식을 골랐다.
- `record.processReached`로 과거를 계산하지 마라. 업로드 시점에 굳은 현재 값이다.
- `stage` 문자열로 과거 공정을 유추하지 마라. 현재 값이다.
- `processFunnel`의 기존 시그니처를 바꾸지 마라. DEVELOPMENT OVERVIEW가 같이 쓴다.
- 증감을 소수 두 자리 이상으로 늘리지 마라. 카드가 좁다.
- `deltaPp`가 null 인 칸에 `0%p`나 `-`를 그리지 마라. 비교할 것이 없다는 뜻이다.
