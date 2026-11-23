# R441 — DEVELOPMENT REQUEST 부서별 편집 범위

2026-11-23 박향근 지시. 화면별 편집 권한 정리의 둘째 묶음이다.

> development request : 통합원단부1팀과 3팀 누구나 새로운 보드를 만들고 작성할 수 있다. 하지만 DD master와의 공정 연결이나 옵션의 remark등은 1팀만 편집 권한을 가지게 한다. 의뢰 분류의 결과 항목 또한 1팀만 수정 권한을 가지게 한다.
>
> (추가 확정) development request에서 2팀은 읽기로 내린다. 보드 종결은 관리자만 한다.

손대는 파일은 넷이다.

- `src/data/departments.ts`
- `src/data/request-board.ts`
- `src/routes/FabricRequest.tsx`
- `src/components/request/ProcessStageDialog.tsx` (prop 하나 추가만)

**다른 파일은 고치지 말 것.**

---

## 1. 2팀을 읽기로 내린다

`src/data/departments.ts`의 `fabric2` 항목이다.

**지금**

```ts
  {
    id: "fabric2", label: "통합원단부 2팀", short: "2팀", hint: "요청 편집, 출고 요청, HOME 블러, 나머지 읽기",
    access: preset("read", { fabricRequest: "edit", excelBackup: "none", warehouseFabric1: "none", warehouseOutbound: "edit" }),
  },
```

**바꿀 것**

`fabricRequest: "edit"` 오버라이드를 **지운다.** 기준값이 `"read"`라 저절로 읽기가 된다. `hint` 문구도 고친다.

```ts
  {
    // 의뢰 작성은 1팀과 3팀만 한다(2026-11-23 박향근 확정). 2팀은 읽기다.
    id: "fabric2", label: "통합원단부 2팀", short: "2팀", hint: "출고 요청, HOME 블러, 나머지 읽기",
    access: preset("read", { excelBackup: "none", warehouseFabric1: "none", warehouseOutbound: "edit" }),
  },
```

**다른 부서는 손대지 말 것.** 특히 `fabric1`과 `fabric3`의 `fabricRequest`는 그대로 편집이다.

이 값은 **새로 가입하는 사람의 기본값**이다. 이미 승인된 계정의 저장된 권한은 바뀌지 않는다. 현재 2팀 소속 계정은 없다.

---

## 2. 보드 종결은 관리자만 한다

`src/data/request-board.ts`의 `canManageBoard`다.

**지금**

```ts
export function canManageBoard(
  board: RequestBoard,
  email: string | null | undefined,
  isOwner: boolean,
): boolean {
  return isOwner || board.createdBy === email
}
```

**바꿀 것**

```ts
/**
 * 보드 종결과 보관함 다시 열기 권한(2026-11-23 박향근 확정). 관리자만이다.
 * 종결은 진행중인 스타일의 결과를 전부 정리해야 열리는데 결과 열이 1팀 전용이 되었고,
 * 3팀이 만든 보드를 3팀이 종결하지 못하는 상태가 생긴다. 그래서 종결을 관리자 하나로 모은다.
 * 인자 `board`와 `email`은 호출부를 그대로 두려고 남긴다.
 */
export function canManageBoard(
  _board: RequestBoard,
  _email: string | null | undefined,
  isOwner: boolean,
): boolean {
  return isOwner
}
```

**호출부는 고치지 말 것.** `FabricRequest.tsx`의 세 군데(2186, 2261, 2262행)가 인자를 그대로 넘긴다. 미사용 인자 경고가 나면 위처럼 밑줄 접두사로 막는다.

`canDeleteBoard`는 이미 관리자 전용이다. 손대지 말 것.

---

## 3. Remark와 결과 열은 1팀만 고친다

### 판정 함수를 새로 만든다

`src/data/request-board.ts` 맨 아래에 더한다. (새 파일을 만들지 말 것.)

```ts
/**
 * DEVELOPMENT REQUEST 안에서 1팀 전용인 동작인가(2026-11-23 박향근 지시).
 * Remark 열, 결과 열, DD 공정 연결 셋이 여기에 걸린다.
 * 보드 만들기와 나머지 칸 작성은 1팀과 3팀 모두 한다.
 */
export function canEditTeam1Only(department: string | null | undefined, isOwner: boolean): boolean {
  return isOwner || department === "fabric1"
}
```

### 셀 편집 차단

`src/routes/FabricRequest.tsx`의 `editKindOf`(682행)가 열의 편집 종류를 정하는 **하나뿐인 자리**다. 호출처가 셋이고 그 셋이 각각 표 그리기, 키보드 이동과 붙여넣기 대상 판정, 채우기와 붙여넣기 쓰기다. 여기를 막으면 셋이 함께 막힌다.

**인자를 하나 더 받게 고친다. 기본값을 주지 말 것.** 기본값을 주면 호출처 하나를 빠뜨려도 컴파일이 통과해 그 길만 뚫린다.

```ts
/** 1팀만 고치는 열(2026-11-23 박향근 지시). Remark와 결과다. */
const TEAM1_ONLY_COLUMNS = new Set(["remark", "result"])

function editKindOf(columnId: string, team1: boolean): EditKind {
  if (!team1 && TEAM1_ONLY_COLUMNS.has(columnId)) return null
  switch (columnId) {
    ...그대로...
  }
}
```

호출처 셋을 전부 고친다. 컴포넌트 안에서 쓸 값은 이렇게 만든다.

```ts
  const authUser = useAuthStore((state) => state.user)      // 이미 있다
  const isOwner = useAuthStore((state) => state.isOwner)    // 이미 있다
  const department = useAuthStore((state) => state.department)
  const team1 = canEditTeam1Only(department, isOwner)
```

| 행 | 지금 | 바꿀 것 |
|---|---|---|
| 1368 | `editKindOf(cell.col) !== null` | `editKindOf(cell.col, team1) !== null` |
| 1533 | `editKindOf(column.id) === null` | `editKindOf(column.id, team1) === null` |
| 2096 | `const kind = editKindOf(column.id)` | `const kind = editKindOf(column.id, team1)` |

1533행은 `applyCellValue`류의 쓰기 경로다. **거기를 빠뜨리면 붙여넣기와 채우기로 Remark와 결과가 들어간다.** 화면만 막고 쓰기를 열어 두지 말 것.

`editKindOf`가 컴포넌트 밖 모듈 레벨 함수인 것은 그대로 둔다. 안으로 옮기지 말 것. 렌더마다 다시 만들어진다.

### 결과 열의 안내

결과 칸을 더블클릭했는데 아무 일도 안 일어나면 왜 막혔는지 알 수 없다. `renderDataCell`의 `title` 속성에 이유를 넣는다.

2109행 근처 `title={isOption ? ... : editable ? "더블클릭해서 수정" : undefined}` 를 이렇게 바꾼다.

```tsx
        title={isOption ? String(rawValue(line, column.id) ?? "") : editable ? "더블클릭해서 수정" : !team1 && TEAM1_ONLY_COLUMNS.has(column.id) ? "Remark와 결과는 1팀만 고칠 수 있습니다." : undefined}
```

---

## 4. DD 공정 연결은 1팀만 만든다

연결을 만들고 푸는 진입점이 둘이다. 둘 다 1팀 조건을 **기존 조건에 AND로** 더한다. 기존 조건을 지우지 말 것.

### 공정 칸 더블클릭 (901행)

```tsx
      onDoubleClick={(event) => { event.stopPropagation(); setDdPick({ style, option }) }}
```

이 핸들러는 `renderDataCell` 바깥의 작은 컴포넌트 안에 있다. `team1`을 prop으로 내려받아 거짓이면 `setDdPick`을 부르지 않고 안내만 띄운다. prop 이름은 `canLink`로 한다.

```tsx
      onDoubleClick={(event) => { event.stopPropagation(); if (!canLink) { onDenied("DD 공정 연결은 1팀만 할 수 있습니다."); return } setDdPick({ style, option }) }}
```

`onDenied`는 호출부에서 `(text) => setNotice({ kind: "error", text })`로 넘긴다.

### 공정 팝업의 연결 해제와 연결 변경 (2682행)

```tsx
        canEdit={currentUserCanEditKey("records")}
```

를

```tsx
        canEdit={currentUserCanEditKey("records") && team1}
```

로 바꾼다.

`ProcessStageDialog.tsx`는 **이미 `canEdit`으로 두 버튼을 막고 있다.** 버튼 로직은 고치지 말고 `title` 문구만 두 갈래로 나눈다.

```tsx
  // 안내 문구가 두 갈래다. DD 편집 권한이 없는 것과 1팀이 아닌 것은 다른 이야기다.
  title={!canEdit ? (denyReason ?? "DD MASTER 편집 권한이 필요합니다") : undefined}
```

`denyReason?: string` prop을 더하고 호출부에서 넘긴다.

```tsx
        denyReason={!team1 ? "DD 공정 연결은 1팀만 할 수 있습니다." : undefined}
```

### 건드리지 말 것

- **DD MASTER 쪽의 「요청 연결 해제」와 「끊어진 연결 N」.** R323에 따라 연결 생성은 REQUEST 한 곳이고 DD에는 해제만 남겼다. 그 해제는 3팀이 쓴다. 이번 지시에 없다.
- **`linkDdRecord`, `clearRequestLinksByLineId`, `applyRequestLinks`.** 저장 함수다. 권한은 화면에서 본다.
- **1대1 바꿔치기 규칙(R322).** 그대로다.

---

## 5. 건드리지 말 것 (전체)

- **결과 자동 완료(R359).** 1025행의 effect다. 옵션이 전부 끝나면 코드가 결과를 완료로 올린다. **사람이 고치는 것이 아니라 기계가 올리는 값이라 1팀 조건을 걸지 않는다.** 걸면 1팀이 화면을 열고 있을 때만 자동 완료가 돌아 결과가 들쭉날쭉해진다. `currentUserCanEditKey("requests")` 가드와 의존성 배열에서 `commitRequests`를 뺀 것도 그대로다. 둘 중 하나라도 풀면 effect가 끝없이 돈다.
- **의뢰자(`requester`) 칸.** 자유 입력이고 신규 생성 때 비어서 열린다. 로그인 이름을 넣는 코드가 없다. 그대로 둔다. 한 보드 안에 여러 담당자가 있어 수동 입력이 맞다.
- **보드 종결 창(`closeBoard`) 안의 결과 정리.** 종결이 관리자 전용이 되었으므로 그 안에서는 관리자가 결과를 정한다. `canEditTeam1Only`가 관리자를 통과시키므로 저절로 열린다. 종결 창에 따로 예외를 만들지 말 것.
- **전체 탭과 보관함의 보기 전용(`readOnly`).** 기존 규칙이다. 1팀 조건보다 먼저 걸린다.
- **엑셀 업로드와 양식.** 권한과 무관하다.
- **`request-template.ts`.** 손대지 않는다.

---

## 하지 말 것

- 커밋하지 말 것.
- `firestore.rules`를 손대지 말 것.
- 이미 승인된 사용자의 Firestore 권한 문서를 고치려 들지 말 것. 코드만이다.
- `screen-permissions.ts`에 새 권한 키를 만들지 말 것. 부서로 가른다.

## 끝나고 확인

```
npm run build
```

`tsc --noEmit`이 `editKindOf` 호출처 셋을 전부 잡아야 한다. 인자를 빠뜨린 곳이 있으면 거기서 멈춘다. 그것이 기본값을 주지 않는 이유다.
