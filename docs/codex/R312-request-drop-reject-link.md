# R312 — DROP·REJECT DD 행도 연결 후보에 넣고, 연결된 줄은 완료와 같이 흐리게

상태: 미착수.

대상 파일 넷이다. 그 밖에는 열지 않는다.

- `src/data/request-link.ts`
- `src/components/dd/RequestLinkHelperDialog.tsx`
- `src/components/request/DdCandidateDialog.tsx`
- `src/routes/FabricRequest.tsx`

**워킹트리는 깨끗하다.** 직전 작업은 `e9d09b6`로 커밋했다.

## 왜

2026-10-07 박향근 결정이다. DROP과 REJECT로 끝난 DD 행도 요청 옵션에 연결해서 "이 옵션은
이렇게 끝났다"를 남긴다. 연결은 되게 하고, 상태는 보이게 하고, 그 줄은 완료와 같이 흐리게 한다.

지금은 **요청 연결 도우미만** DROP과 REJECT를 후보에서 통째로 빼고 있다
(`request-link.ts` 125행 `HELPER_EXCLUDED_STATUS`). 그래서 도우미로는 영영 연결할 수 없다.
개별 연결 창(`DdCandidateDialog`)은 상태를 안 걸러서 이미 연결된다. 두 경로가 어긋나 있다.

**HOLD는 이번 대상이 아니다.** 되살아날 수 있는 상태라 흐리게 하지 않고, 후보에서도 지금처럼
빼지 않는다. HOLD를 흐림이나 제외 대상에 넣지 마라.

## 틀렸던 가설

없다. 아래는 코드에서 확인했다.

- `requestDdStatus`(`request-link.ts` 267행)는 **DROP·REJECT를 FL# 완료보다 먼저 본다.**
  그래서 FL#이 있는 DROP 행도 `tone: "drop"`이다. 이 순서를 바꾸지 마라.
- `tone: "drop"` 하나가 DROP과 REJECT 둘 다다. 라벨만 갈린다.
- Link 열과 공정 칩은 이미 DROP·REJECT·HOLD를 보여 준다. 표시 코드를 새로 만들지 마라.

## 지금 코드

### `src/data/request-link.ts`

**125행**
```ts
const HELPER_EXCLUDED_STATUS = /^(DROP|REJECT)$/
```

**138행** — `buildLinkHelperGroups` 안
```ts
    if (HELPER_EXCLUDED_STATUS.test(String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase())) return
```

### `src/components/dd/RequestLinkHelperDialog.tsx`

**126행** — DD 행 수 칸
```tsx
                  <td className={`${bodyCell} tabular-nums`}>{group.rows.length}</td>
```

### `src/components/request/DdCandidateDialog.tsx`

**81~82행** — 점수 배지와 그 옆
```tsx
                  <Badge variant="outline" className="tabular-nums text-[10px]">{score}점</Badge>
                  {linkedElsewhere ? <Badge variant="outline" className="text-[10px] text-[var(--warning)]">다른 요청에 연결됨</Badge> : null}
```

### `src/routes/FabricRequest.tsx`

**118~119행**
```ts
/** 완료(FL# 나온) 칸 배경. 선택 강조보다 약해야 해서 연하게 쓴다. */
const DONE_CELL_BG = "bg-[color-mix(in_srgb,var(--muted-foreground)_14%,var(--card))] text-[var(--muted-foreground)]"
```

**988~1004행** — 완료 색인
```ts
  /**
   * FL# 완료 색인. 렌더당 한 번만 만든다.
   * `all`은 스타일의 모든 옵션에 FL#이 있다는 뜻이고, `options`는 FL#이 나온 옵션 id다.
   * 옵션이 없는 스타일은 완료로 보지 않는다.
   */
  const doneByStyle = useMemo(() => {
    const map = new Map<string, { all: boolean; options: Set<string> }>()
    for (const style of visible) {
      const options = new Set<string>()
      for (const option of style.options) {
        if (requestDdStatus(ddByLine, option).tone === "done") options.add(option.optId)
      }
      map.set(style.reqId, { all: style.options.length > 0 && options.size === style.options.length, options })
    }
    return map
  }, [ddByLine, visible])
```

**`renderDataCell` 안**
```ts
    // 전부 완료면 병합된 스타일 칸까지, 일부만 완료면 그 옵션 줄의 옵션 칸만 흐리게 한다.
    const done = doneByStyle.get(line.style.reqId)
    const dimmed = Boolean(done && (done.all || (line.kind === "option" && done.options.has(line.option.optId))))
```

**블록 범위**
```ts
                // 스타일 전체가 완료면 블록의 모든 칸을 흐리게 한다. 액션 칸과 옵션 추가 줄도 포함이다.
                const blockDone = doneByStyle.get(style.reqId)?.all ?? false
```
`blockDone`은 행 번호 칸, 액션 칸, 옵션 추가 줄 세 자리에서 쓴다.

**초록 `DD n/m` 라벨**
```tsx
                        const allDone = doneByStyle.get(style.reqId)?.all ?? false
```

## 할 일

### 1. 도우미의 DROP·REJECT 제외를 없앤다 (`request-link.ts`)

125행 상수와 138행 한 줄을 **지운다.** 그 자리에 아무것도 넣지 않는다.
대신 상태 판정을 한 곳에 모아 두도록 125행 자리에 아래를 넣는다.

```ts
/**
 * 더 할 일이 없는 DD 행인지. DROP과 REJECT만이다.
 * HOLD는 되살아날 수 있어 넣지 않는다. 연결 후보에서 빼지도, 흐리게 하지도 않는다.
 */
export const isClosedDdRecord = (record: DevRecord): boolean =>
  /^(DROP|REJECT)$/.test(String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase())
```

`DevRecord` 타입은 이 파일에서 이미 쓰고 있다. 새 import를 넣지 마라.

### 2. 도우미에 종료 행 수를 보인다 (`RequestLinkHelperDialog.tsx`)

이제 DROP·REJECT 행이 후보에 섞여 들어오므로, 그 사실이 보여야 한다. 126행을 바꾼다.

```tsx
                  <td className={`${bodyCell} tabular-nums`}>
                    {group.rows.length}
                    {(() => {
                      const closed = group.rows.filter(isClosedDdRecord).length
                      return closed ? <span className="ml-1 rounded bg-[var(--muted)] px-1 text-[10px] font-normal text-[var(--muted-foreground)]">종료 {closed}</span> : null
                    })()}
                  </td>
```

이 파일의 `request-link` import 줄에 `isClosedDdRecord`를 더한다. 이미 `buildLinkHelperGroups`나
`defaultLinkPairs`를 들여오는 줄이 있다. 그 줄에 붙인다.

### 3. 개별 연결 창에 종료 배지 (`DdCandidateDialog.tsx`)

82행 `linkedElsewhere` 배지 **바로 뒤**에 더한다.

```tsx
                  {isClosedDdRecord(record) ? <Badge variant="outline" className="text-[10px] text-[var(--destructive)]">{record.devStatus}</Badge> : null}
```

9행 `import { MATCH_MIN_SCORE, scoreRowForOption } from "@/data/request-link-match"` 아래에
한 줄 더한다.
```ts
import { isClosedDdRecord } from "@/data/request-link"
```

### 4. 흐림 범위를 종료까지 넓힌다 (`FabricRequest.tsx`)

**4-1.** 118~119행의 상수 이름과 주석을 바꾼다. 색은 그대로다.

```ts
/** 완료(FL#) 또는 종료(DROP·REJECT) 칸 배경. 선택 강조보다 약해야 해서 연하게 쓴다. */
const CLOSED_CELL_BG = "bg-[color-mix(in_srgb,var(--muted-foreground)_14%,var(--card))] text-[var(--muted-foreground)]"
```

`DONE_CELL_BG`를 쓰던 두 자리(액션 칸, 옵션 추가 줄)와 `renderDataCell`의 배경 삼항을
`CLOSED_CELL_BG`로 바꾼다. 색 값을 바꾸지 마라.

**4-2.** 색인을 바꾼다. **초록 `DD n/m` 라벨은 FL# 기준을 그대로 써야 하므로 둘을 따로 센다.**

```ts
  /**
   * 흐림 판정 색인. 렌더당 한 번만 만든다.
   * `closed`는 FL# 완료이거나 DROP·REJECT로 끝난 옵션 id다. 더 할 일이 없는 줄이라 흐리게 한다.
   * `allFl`은 모든 옵션이 FL# 완료라는 뜻이고 초록 `DD n/m` 라벨에만 쓴다. 종료는 완료가 아니다.
   * HOLD는 되살아날 수 있어 어느 쪽에도 넣지 않는다. 옵션이 없는 스타일은 둘 다 거짓이다.
   */
  const closedByStyle = useMemo(() => {
    const map = new Map<string, { allClosed: boolean; allFl: boolean; closed: Set<string> }>()
    for (const style of visible) {
      const closed = new Set<string>()
      let fl = 0
      for (const option of style.options) {
        const tone = requestDdStatus(ddByLine, option).tone
        if (tone === "done") fl += 1
        if (tone === "done" || tone === "drop") closed.add(option.optId)
      }
      const total = style.options.length
      map.set(style.reqId, { allClosed: total > 0 && closed.size === total, allFl: total > 0 && fl === total, closed })
    }
    return map
  }, [ddByLine, visible])
```

**4-3.** `renderDataCell` 안
```ts
    // 전부 끝났으면 병합된 스타일 칸까지, 일부만 끝났으면 그 옵션 줄의 옵션 칸만 흐리게 한다.
    const closed = closedByStyle.get(line.style.reqId)
    const dimmed = Boolean(closed && (closed.allClosed || (line.kind === "option" && closed.closed.has(line.option.optId))))
```

**4-4.** 블록 범위
```ts
                // 스타일의 모든 옵션이 끝났으면 블록의 모든 칸을 흐리게 한다. 액션 칸과 옵션 추가 줄도 포함이다.
                const blockClosed = closedByStyle.get(style.reqId)?.allClosed ?? false
```
`blockDone`을 쓰던 세 자리(행 번호 칸, 액션 칸, 옵션 추가 줄)를 `blockClosed`로 바꾼다.

**4-5.** 초록 라벨은 FL# 기준을 지킨다.
```tsx
                        const allDone = closedByStyle.get(style.reqId)?.allFl ?? false
```

## 하지 말 것

- **HOLD를 흐림이나 제외 대상에 넣지 마라.** 되살아날 수 있는 상태다.
- **초록 `DD n/m` 라벨을 `allClosed`로 바꾸지 마라.** 전부 DROP인 스타일이 완료처럼 초록이 된다. 그 라벨은 FL# 기준이다.
- **`requestDdStatus`의 판정 순서를 바꾸지 마라.** DROP·REJECT가 FL#보다 먼저다. 끝난 행은 FL#이 있어도 끝난 행이다.
- **`DdCandidateDialog`의 후보 필터(검색어, `unlinkedOnly`, 최소 점수)를 건드리지 마라.** 상태로 거르지 않는 지금이 맞다.
- **`defaultLinkPairs`를 건드리지 마라.** 번호 순 짝짓기 규칙은 그대로다.
- **흐림 색 값을 바꾸지 마라.** 이름만 `CLOSED_CELL_BG`로 바꾼다.
- **선택 강조가 흐림보다 세다.** 배경 삼항에서 `sel.inRange`가 먼저인 순서를 바꾸지 마라.
- **`opacity`를 쓰지 마라.** 선택 테두리와 채우기 미리보기 점선까지 흐려진다.
- `src/routes/DevelopmentMasterSheet.tsx`, `src/routes/Warehouse.tsx`, `src/data/dd-workflow.ts`는 열지 않는다. `isStoppedRecord`는 HOLD를 포함하므로 여기서 쓰지 마라.
- 새 패키지를 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다. 로컬 dev 서버가 5175에서 돌고 있다. 끄지 마라.

그리고 세어라.
- `HELPER_EXCLUDED_STATUS`가 저장소 전체에 **0번**이어야 한다.
- `isClosedDdRecord`가 **4번**(선언 1, 도우미 1, 개별 연결 창 1, import 2 중 … 정확히는 선언 1 + import 2 + 사용 2 = 5번). **5번**이 맞다.
- `src/routes/FabricRequest.tsx`에서 `closedByStyle` **4번**, `blockClosed` **4번**, `CLOSED_CELL_BG` **3번**, `doneByStyle` **0번**, `blockDone` **0번**, `DONE_CELL_BG` **0번**.
- `git status --short`에 네 파일만 `M`이어야 한다.

## 보고

수정한 파일, `npm run build` 결과, 위 숫자들, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
