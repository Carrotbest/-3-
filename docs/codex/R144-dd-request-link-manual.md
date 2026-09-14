# R144 DD MASTER REQ 표시와 기존 행 수동 연결·해제

상태: 미착수. R142(`request-link.ts`, `RequestPickerDialog`, `tech.requestLink`) 위에서 한다.

## 요구 (사용자, 2026-09-14)
- 기존 DD 현황 행을 FABRIC REQUEST 스타일·옵션에 **수동으로 연결**할 방법이 필요하다. R142는 신규 접수 때만 연결한다.
- 순서는 R144(REQ 표시 + 행 단위 연결·해제), R145(연결 도우미), R146(요청 화면에 DD 상태·FL# 표시)다. 이번은 R144만 한다.

## 확인된 사실
- 연결 저장 위치는 DD 행 `tech.requestLink { reqId, lineId }` 한 곳이다(`schema.ts` 16행). 요청 쪽에는 저장하지 않는다.
- `src/data/request-link.ts`
  - `normalizeStyleKey`, `linkedLineIds(records)`
  - `ensureRequestLineIds(requests)` → `{ next, changed }`
  - `requestCandidates(requests, records, styleNo, query, includeLinked)`
  - `requestToIntakeRecords`
- `src/components/dd/RequestPickerDialog.tsx`: 불러오기 전용이다. 왼쪽 후보 목록, 오른쪽 옵션 체크 목록, `onConfirm(style, options)`로 되어 있다.
- `src/routes/DevelopmentMasterSheet.tsx`
  - 1135행 `pushUndoSnapshot(snapshot)`.
  - `src/store/useAppStore.ts` 606행 `writeDevelopmentRecords(records, recalculate = true, kind: AuditKind = "paste")`. 기존 붙여넣기처럼 **스냅샷 → 새 배열 → write 한 번**으로 한다.
  - 2607행 Style No. 칸 렌더(`isRecent` 신규 배지 + `record.styleNo` + 경고 아이콘).
  - 2630~2662행 우클릭 메뉴. `menu.kind === "cells"` 목록 끝이 2645행 `row`(행 전체 선택)다.
  - 선택 행 수집은 `requestDeleteSelectedRows`가 쓰는 방식(현재 `rect`의 행 범위 → `filtered`)을 그대로 따른다.
  - `editEnabled`가 거짓이면 쓰기를 막고 `EDIT_DISABLED_MESSAGE`를 띄우는 기존 규칙을 따른다.
  - 978행 근처 `records`, R142에서 추가한 `requests`, `saveRequests` import가 있다.
- `src/routes/FabricRequest.tsx`
  - 스타일 행에 `tr[data-req-id]`, 셀에 `td[data-col-id][data-slot-index]`가 있다.
  - `appendBlankStyles`가 새 스타일을 선택·스크롤하는 방식(두 번 rAF → querySelector → `setRange` → `scrollIntoView`)이 있다.
  - 필터 state는 `stage`, `chart`, `urgentOnly`다.

## 설계
### 1. `src/data/request-link.ts` 추가 함수
```ts
export interface RequestLinkTarget { style: RequestStyle; option: RequestOption }
export function requestLinkIndex(requests: readonly RequestStyle[]): Map<string, RequestLinkTarget> // key: lineId
export function resolveRequestLink(index: Map<string, RequestLinkTarget>, record: DevRecord): RequestLinkTarget | "missing" | null
// null = 연결 없음, "missing" = 연결은 있으나 요청 스타일·옵션이 없음(reqId 불일치 포함)

export interface LinkPair { rowId: string; optId: string | null }
export function defaultLinkPairs(rows: readonly DevRecord[], style: RequestStyle, blockedLineIds: ReadonlySet<string>): LinkPair[]
export function applyRequestLinks(records: readonly DevRecord[], style: RequestStyle, pairs: readonly LinkPair[], fillEmpty: boolean): { next: DevRecord[]; linked: number }
export function removeRequestLinks(records: readonly DevRecord[], rowIds: ReadonlySet<string>): { next: DevRecord[]; removed: number }
```
- `rowId`는 기존 `recordIdentity`(`${_src.sheet}::${_src.row}`)와 같은 형식이다. `request-link.ts` 안에 같은 식으로 만든다.
- `defaultLinkPairs`
  - 대상 행 정렬: `Number(opt)` 오름차순. 숫자가 아니면 뒤로 보내고, 같으면 원래 순서를 따른다.
  - 대상 옵션 정렬: `no` 오름차순. `blockedLineIds`(이 대상 행이 아닌 **다른 DD 행**이 이미 연결한 lineId)는 뺀다.
  - 행에 이미 이 스타일 옵션으로의 연결이 있으면 그 옵션을 먼저 유지한다. 나머지는 순서대로 짝짓는다. 옵션이 모자란 행은 `optId: null`이다.
- `applyRequestLinks`
  - `pairs`의 `optId`를 `style.options`에서 찾는다. 찾은 옵션에 `lineId`가 없으면 그 짝은 건너뛴다(부모가 `ensureRequestLineIds`를 먼저 부른다).
  - 대상 행의 `tech.requestLink = { reqId: style.reqId, lineId }`를 쓴다. `optId: null`인 행은 이 스타일로의 기존 연결이 있으면 지운다.
  - `fillEmpty`가 참이면 **비어 있는 칸만** 채운다.
    - 스타일 값: `buyer ← brand`, `planner ← requester`
    - 옵션 값: `color`, `dyeing ← dyeingMethod`, `note ← remark`, `tech.yarnDetail`
    - **`styleNo`와 `owner`는 채우지 않는다.** owner는 편집 권한·담당 레인에 영향이 있다.
  - 바뀐 행만 새 객체로 바꾸고 나머지는 같은 참조를 유지한다.
- `removeRequestLinks`: 대상 행의 `tech.requestLink`를 지운다(키 삭제).

### 2. `RequestPickerDialog` 연결 모드
- props를 더한다: `mode?: "import" | "link"`(기본 import), `linkRows?: readonly DevRecord[]`, `onConfirmLink?: (style: RequestStyle, pairs: LinkPair[], fillEmpty: boolean) => void`. import 모드 동작은 **그대로** 둔다.
- link 모드
  - 제목은 `FABRIC REQUEST 연결 · {linkRows.length}행`이다.
  - `includeLinked` 기본값을 true로 한다(이미 일부 연결된 스타일에도 붙일 수 있게). `styleNo`는 대상 행의 첫 `styleNo`다.
  - 대상 행이 이미 한 스타일에 연결돼 있으면 `initialReqId`로 그 스타일을 선택해 연다(부모가 넘긴다).
  - **오른쪽 영역은 짝 표다.** 행마다 왼쪽에 DD 행 요약(`Opt {opt} · {color} · {dyeing}`, 아래 줄에 `tech.yarnDetail` 말줄임), 오른쪽에 요청 옵션 `Select`(`연결 안 함` + `Opt {no} · {color} · {dyeingMethod}`)를 둔다.
    - 초기값은 `defaultLinkPairs`다.
    - 다른 DD 행에 이미 연결된 옵션은 목록에 `다른 행 연결됨`을 붙여 비활성이다.
    - 같은 표에서 이미 다른 행이 고른 옵션을 고르면 그 행을 `연결 안 함`으로 바꾼다(중복 금지).
  - 짝 표 위에 요약 줄 `요청 옵션 {options.length}개 · DD 행 {rows}개`를 둔다. 개수가 다르면 `개수가 달라 일부 행은 연결되지 않습니다`를 warning 톤으로 보인다.
  - 짝 표 아래에 `Checkbox` `비어 있는 칸만 요청 값으로 채우기(Buyer·Planner·Color·Dyeing·Remark·Yarn Detail)`를 둔다. 기본은 꺼짐이다.
  - 푸터 확인 버튼은 `{짝이 있는 행 수}행 연결`이다. 0이면 비활성이다. 누르면 `onConfirmLink(style, pairs, fillEmpty)`를 부른다.

### 3. DD MASTER
- `requestIndex = useMemo(() => requestLinkIndex(requests), [requests])`.
- **REQ 표시** (2607행 Style No. 칸, `record.styleNo` 뒤, 경고 아이콘 앞)
  - `resolveRequestLink`가 대상을 돌리면 작은 버튼 `REQ`를 둔다. 모양은 `shrink-0 rounded px-1 py-0.5 text-[8px] font-bold tracking-wide text-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_22%,transparent)]`다.
    - `title`은 `FABRIC REQUEST · {chart} · #{seq} · Opt {option.no} · 클릭해서 열기`다.
    - `onMouseDown`에서 `stopPropagation()`(셀 선택 시작 방지), `onDoubleClick`에서 `stopPropagation()`을 부른다.
    - `onClick`은 `navigate(`/request?focus=${reqId}`)`(react-router `useNavigate`)다.
  - `"missing"`이면 같은 크기로 `REQ?`를 destructive 톤(글자 `var(--destructive)`, 배경 destructive 12%)으로 둔다. `title`은 `연결된 요청 스타일 또는 옵션을 찾을 수 없습니다. 우클릭 > 요청 연결 해제로 정리하세요.`이고 클릭 동작은 없다.
- **우클릭 메뉴** (`menu.kind === "cells"`, 2645행 `row` 항목 뒤): 구분선 다음에 두 항목을 둔다.
  - `FABRIC REQUEST 연결…`: 아이콘 lucide `Link2`, 힌트 `선택 행`, `disabled: !editEnabled`
  - `요청 연결 해제`: 아이콘 `Unlink`, 힌트 `선택 행`, `disabled: !editEnabled || 선택 행 중 연결된 행 없음`
- **대상 행 결정** `linkTargetRows()`
  - 선택 범위의 행(`requestDeleteSelectedRows`와 같은 방식)이다.
  - **선택이 한 칸이고 그 칸이 `styleNo` 열이면**, `filtered` 안에서 `styleNo.trim()`이 같은(비어 있지 않은) 행 전체로 넓힌다.
- **연결 실행**
  - 메뉴를 누르면 대상 행을 state로 잡고 피커를 link 모드로 연다. `initialReqId`는 대상 행들의 `requestLink.reqId` 중 가장 많은 값이다.
  - `onConfirmLink(style, pairs, fillEmpty)`는 다섯 단계로 처리한다.
    1. `ensureRequestLineIds(requests)`를 부른다. `changed`면 `saveRequests(next)`를 한 번 하고, `next`에서 같은 `reqId` 스타일을 다시 찾는다.
    2. `pushUndoSnapshot(records)`
    3. `const { next, linked } = applyRequestLinks(records, freshStyle, pairs, fillEmpty)`
    4. `await writeDevelopmentRecords(next, false, "edit")`(`AuditKind`에 "edit"가 없으면 기존 편집이 쓰는 값)
    5. `notify(`${linked}행을 FABRIC REQUEST에 연결했습니다.`)`
  - `blockedLineIds`는 `records` 중 대상 행이 아닌 행의 `requestLink.lineId`로 부모가 계산해 피커에 넘긴다(필요하면 prop 추가).
- **해제 실행**: 확인창 `window.confirm(`선택한 ${n}행의 FABRIC REQUEST 연결을 해제할까요? 입력한 값은 그대로 둡니다.`)`를 띄운다. 확인하면 스냅샷, `removeRequestLinks`, `writeDevelopmentRecords(next, false, "edit")`, 알림 `${removed}행 연결을 해제했습니다.` 순으로 처리한다.

### 4. FABRIC REQUEST `focus` 파라미터
- `useSearchParams`로 `focus`(reqId)를 읽는다. 값이 있고 `requests`에 그 스타일이 있으면 네 단계로 처리한다.
  1. 그 스타일이 현재 필터에 가려지면 `stage = "전체"`, `chart = "전체"`, `urgentOnly = false`로 바꾼다.
  2. 두 번 rAF 뒤 `tr[data-req-id="{reqId}"]`의 `garmentNo` 셀을 찾아 `setRange`로 선택하고 `scrollIntoView({ block: "center", inline: "nearest" })`한다.
  3. 행 머리 셀에 1.2초 강조(`animate` 없이 `outline 2px var(--primary)`를 state로 켰다 끄기)를 준다.
  4. `setSearchParams`로 `focus`를 지운다(`replace: true`). 새로고침해도 다시 튀지 않게 한다.
- 스타일이 없으면 알림 `연결된 요청 스타일을 찾을 수 없습니다.`를 띄우고 파라미터를 지운다.

## CLAUDE.md
- "## DD MASTER" 절에 세 줄을 더한다.
  1. Style No. 칸 `REQ`는 `tech.requestLink`를 요청에서 찾은 표시다. 누르면 `/request?focus=reqId`로 간다. 못 찾으면 `REQ?`다.
  2. 우클릭 `FABRIC REQUEST 연결…`은 선택 행(Style No. 한 칸이면 같은 스타일 전체)을 요청 옵션과 짝 표로 연결한다. 기본은 연결만 하고 값은 덮지 않는다. 빈 칸 채우기에서도 styleNo·owner는 제외다.
  3. 다른 행에 연결된 옵션은 막는다. 연결·해제는 스냅샷 → write 한 번이라 Ctrl+Z로 되돌린다.
- "## FABRIC REQUEST" 절에 `focus` 파라미터 한 줄을 더한다.

## 하지 말 것
- 요청(`requests`) 쪽에 DD 상태나 연결을 저장하지 않는다. `ensureRequestLineIds` 저장만 허용한다.
- 연결할 때 `styleNo`·`owner`를 바꾸지 않는다. `fillEmpty`가 꺼져 있으면 어떤 값도 바꾸지 않는다.
- R142 import 모드 동작, 작지 첨부, 중복 검사를 바꾸지 않는다.
- 행마다 따로 저장하지 않는다(`saveDevelopmentRecord` 반복 금지). 한 번의 `writeDevelopmentRecords`다.
- R135~R143(커밋 a5415cc) 코드를 되돌리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `request-link.ts`, `RequestPickerDialog.tsx`, `DevelopmentMasterSheet.tsx`, `FabricRequest.tsx`, `CLAUDE.md`, 이 문서만 보인다.
