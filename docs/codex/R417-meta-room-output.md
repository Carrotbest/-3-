# R417 룸별 성과 표시와 오늘 이력

상태: 구현 완료. 2026-11-11 커밋.

박향근 요구(2026-11-10) 둘을 한 건으로 묶은 것이다.

- "각 룸에서 어떠한 결과물이 추가되었을 때 OUTPUT을 표시(말풍선이나 오브젝트 등에 숫자?)"
- "메타 룸에서 작업된 오늘의 이력이 각 룸의 특정 오브젝트(모니터, 테이블 등)에 표시되고, 오브젝트를 클릭하면 해당 화면으로의 전환 기능을 선택적으로 줄 수 있게"

## 왜 필요한가

지금 방은 빈 사무실이다. 어느 방이 바쁜지 들어가 보기 전에는 모른다. 그래서 META를 다시 열 이유가 없다. **숫자가 보이면 다시 열 이유가 생긴다.**

## 비용 원칙

두 부분의 데이터 출처가 다르다. 섞지 마라.

**A부(상시 숫자)는 공짜다.** `useAppStore`가 이미 들고 있는 값으로 센다. 새 읽기가 없다.

**B부(오늘 이력)는 `auditLog`를 읽는다. 리스너를 붙이지 마라.** `listActions`는 한 번 읽고 끝나는 `getDocs`다(`src/data/audit.ts` 218행). **오브젝트 카드를 열었을 때만 부른다.** 화면을 열 때 미리 읽지 마라. 같은 화면 것은 60초 동안 캐시해 재사용한다. 기본 `max`가 300이므로 **반드시 `max: 120`과 오늘 날짜를 넘겨라.**

## 파일별 조치

| 파일 | 할 일 |
|---|---|
| `src/components/meta/facilities.ts` | `MetaObject`에 `screen`과 `path`를 더한다 |
| `src/data/meta-room-stats.ts` | 새 파일. 방별 숫자를 세는 순수 함수 |
| `src/routes/Meta.tsx` | 숫자를 계산해 씬에 넘기고, 카드에 오늘 이력과 이동 버튼을 붙인다 |
| `src/components/meta/OfficeScene.tsx` | 룸 표지 밑에 숫자판을 달고 갱신 길을 연다 |

---

## 1. `src/data/meta-room-stats.ts` (새 파일)

순수 함수만 둔다. React도 Firestore도 쓰지 마라. 나중에 혼자 시험할 수 있어야 한다.

```ts
export interface RoomStat {
  /** 표지에 적을 짧은 말. 예: "진행 61" */
  label: string
  /** 오늘 새로 생긴 수. 0이면 표시하지 않는다. */
  fresh: number
}

export function buildRoomStats(input: {
  records: DevRecord[]
  requests: RequestStyle[]
  analysisRequests: AnalysisRequest[]
  fabricOverrides: FabricLedgerOverride[]
  events: CalendarEvent[]
  ts: TsRecord[]
  trends: TrendItem[]
}): Record<string, RoomStat>
```

방별 셈은 이렇다. **이미 있는 판정 함수를 쓰고 새로 만들지 마라.**

| 방 | 숫자 | 근거 |
|---|---|---|
| `/development/workspace` | 진행 중 건수 | `derive.ts`의 `isInProgress` |
| `/request` | 진행 중 스타일 수 | `result`가 비었거나 `진행중` |
| `/fabric-analysis` | 분석 대기 수 | 완료가 아닌 건 |
| `/warehouse` | 창고보관 수 | `status === "WAREHOUSE"` |
| `/ts` | 처리 중 수 | TS 화면의 처리중 판정과 같게 |
| `/calendar` | 이번 주 일정 수 | 오늘부터 7일 |
| `/trend/macro` | 수집 기사 수 | `trends.length` |

**없는 방은 넣지 마라.** `RoomStat`이 없는 방은 숫자판을 안 단다. 숫자를 지어내지 말 것.

`fresh`는 오늘 안에 생긴 것만 센다. 날짜 필드가 없는 집합(`fabricOverrides` 등)은 **`fresh`를 0으로 둔다.** 억지로 추정하지 마라.

---

## 2. `src/components/meta/facilities.ts`

`MetaObject`에 두 줄 더한다.

```ts
  /** 이 오브젝트가 보여 줄 작업 이력의 화면. 없으면 이력을 안 읽는다. */
  screen?: AuditScreen
  /** 누르면 갈 화면. 없으면 이동 버튼을 안 보인다. */
  path?: string
```

여섯 개에 이렇게 채운다.

| id | screen | path |
|---|---|---|
| `warehouse-rack` | `warehouse` | `/warehouse` |
| `dd-wall` | `dd` | `/development/workspace` |
| `request-hanger` | `request` | `/request` |
| `rdda-screen` | `rdda` | `/rdda` |
| `macro-ticker` | (없음) | `/trend/macro` |
| `calendar-board` | (없음) | `/calendar` |

`AuditScreen` 타입은 `@/data/audit`에서 가져온다.

---

## 3. `src/routes/Meta.tsx`

(가) `buildRoomStats`를 `useMemo`로 돌려 `roomStats`를 만든다. 스토어 조각은 이미 여섯을 구독하고 있다. 모자라는 것(`analysisRequests`, `ts`)만 더 구독한다.

(나) 씬에 넘긴다. **`roomStats`를 그대로 prop으로 주되, `OfficeScene` 쪽에서 문자열 키로 바뀜을 판정한다**(아래 4-다). 객체 자체는 매 렌더 새로 생기므로 그대로 의존성에 넣으면 끝없이 돈다.

(다) 오브젝트 카드(`objectCard`)에 두 가지를 더한다.

- **오늘 이력.** `meta.screen`이 있으면 카드를 열 때 `listActions({ from: 오늘, to: 오늘, screen: meta.screen, max: 120 })`를 한 번 부른다. 결과에서 사람 이름과 종류를 모아 `"박○○ 수정 12건"` 꼴로 최대 네 줄을 적는다. **같은 screen은 60초 동안 다시 읽지 마라.** 모듈 바깥 `Map`에 `{ at, actions }`로 담아 둔다.
- **이동 버튼.** `meta.path`가 있으면 `해당 화면으로 이동` 버튼을 띄우고 `navigate(meta.path)`를 건다.

**이력을 못 읽었거나 오늘 아무 일도 없으면 "오늘 기록 없음"으로 적어라.** 숫자를 지어내지 마라(R406에 같은 규칙이 있다).

---

## 4. `src/components/meta/OfficeScene.tsx`

(가) prop을 하나 더 받는다.

```ts
  roomStats?: Record<string, { label: string; fresh: number }>
```

(나) **룸 표지 밑에 숫자판을 단다.** `roomFlag` 안이다. 이름 명패(`sign`, `y = 3.9`) 아래 `y = 3.28`에 작은 판을 하나 더 둔다. 폭은 이름 명패의 0.62배, 높이 0.42다. 기둥에 같이 매달린 모습이 된다.

- 명패와 같은 방식으로 **켜진 판과 꺼진 판을 각각 구워 두고 갈아 끼운다.** 꺼진 판은 회색 바탕(`SIGN_OFF_FACE`)에 짙은 글자(`SIGN_OFF_INK`), 켜진 판은 흰 바탕에 방 색 글자다. 지금 `setLit`이 하는 일에 이 판을 더하면 된다.
- 글자는 `label` 한 줄이다. `fresh`가 0보다 크면 뒤에 `+N`을 **방 색으로** 붙인다.
- **숫자가 없는 방은 판 자체를 만들지 마라.** `visible = false`로 숨기지 말고 아예 안 만든다. 메시가 는다.

(다) 갱신 길. `SceneApi`에 `setRoomStats(stats)`를 더하고, 방마다 캔버스를 다시 구워 `map`을 갈아 끼운다. React 쪽은 이렇게 건다.

```ts
  const statsKey = useMemo(
    () => Object.entries(roomStats ?? {}).map(([path, stat]) => `${path}:${stat.label}:${stat.fresh}`).sort().join("|"),
    [roomStats],
  )
  useEffect(() => {
    apiRef.current?.setRoomStats(roomStats ?? {})
  }, [statsKey])
```

**의존성에 `roomStats` 객체를 직접 넣지 마라.** 매 렌더 새 객체라 effect가 끝없이 돈다. 2026-11-10에 `peopleKey`에서 같은 종류의 문제를 겪었다.

**캔버스를 매 프레임 굽지 마라.** 값이 바뀐 방만 다시 굽는다. 직전 `label`과 `fresh`를 방마다 기억해 두고 비교해라.

---

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일을 지우지 마라.
- **`auditLog`에 `onSnapshot`을 붙이지 마라.** 한 번 읽고 끝나는 `listActions`만 쓴다.
- **화면을 열 때 이력을 미리 읽지 마라.** 카드를 열었을 때만 읽는다.
- `listActions`를 `max` 없이 부르지 마라. 기본이 300이다.
- 바닥에 눕힌 글자나 공중에 뜬 방 이름표를 만들지 마라. 2026-11-06과 R403에서 폐기했다.
- 숫자를 모르는 방에 `0`이나 `TBD`를 적지 마라. 판을 안 만드는 것이 맞다.
- `META_FACILITIES`와 `META_OBJECTS`를 한 배열로 합치지 마라. 하는 일이 다르다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON을 열지 마라.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

- 모든 수정을 마친 뒤 `npm run build`를 한 번만 돌린다.
- 개발 서버는 띄우지 마라. 화면 확인은 클로드가 한다.
- 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만.
