# R307 — DD MASTER 전체 보기에서 소유자만 편집 허용 (삭제는 계속 잠금)

> **철회됨 (2026-10-07).** 구현해서 빌드까지 통과했지만 같은 날 박향근이 되돌리라고 했다.
> 전체 미리보기는 소유자를 포함해 누구에게나 읽기 전용으로 둔다. 요청 연결은 담당 탭에서 한다.
> 코드는 R310에서 원래대로 돌렸고 `DevelopmentMasterSheet.tsx`는 이 작업 전과 같다.
> **이 지시서대로 다시 구현하지 말 것.** 아래 내용은 기록으로만 남긴다.

상태: 철회.

대상 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다. 다른 파일은 열지 않는다.

## 왜

지금 `editEnabled = owner !== ALL` 한 줄(1543행)이 전체 보기 화면 전체를 보기 전용으로 만든다.
셀 편집, 붙여넣기, 채우기, 행 삽입, 행 삭제, 찾아 바꾸기, 요청 연결 도우미가 모두 이 한 줄에
걸려 있다(63곳). 소유자도 예외가 아니라 담당을 고르기 전에는 아무것도 못 한다.

2026-10-07 박향근 결정. **소유자는 전체 보기에서도 편집한다. 단 행 삭제는 지금처럼 잠근다.**

삭제를 함께 열지 않는 이유는 1544행 주석에 이미 적혀 있다. 전체 보기는 담당 필터가 없어 어떤
행이든 한 번에 잡히는 자리이고, 창고보관 중인 원단의 DD 행을 지우면 `resolveEntryKey`가 짝 없는
오버라이드와 이력을 버려서 창고 화면에서 그 원단이 통째로 사라진다. 2026-10-01에 한 번 열었다가
되돌린 길이다. **그 주석을 지우지 마라.**

## 틀렸던 가설

사용자는 처음에 "연결 도우미가 안 눌리는 것이 내가 그 행의 개발 담당이 아니기 때문"이라고 보았다.
아니다. 코드는 누가 담당인지 보지 않는다. 담당 드롭다운이 `ALL`이면 그걸로 끝이다.
**행별 담당자와 로그인 사용자를 비교하는 코드를 만들지 마라.** 그런 규칙은 이 화면에 없다.

## 지금 코드

**21행** — 이미 들여온다. 새 import는 없다.
```ts
import { useAuthStore } from "@/data/auth"
```

**40행**
```ts
const EDIT_DISABLED_MESSAGE = "담당을 선택한 뒤 수정할 수 있습니다. 담당 칸이 비었거나 명단 밖인 행은 담당 드롭다운에서 그 값을 고르십시오."
```

**1216행** — `useAuthStore` 사용 예. 같은 모양으로 쓴다.
```ts
  const canBackup = useAuthStore((state) => state.isOwner || state.screenPermissions.excelBackup)
```

**1541~1543행**
```ts
  // 전체 보기에서는 행 이동을 막고, 담당을 고른 상태에서만 그 담당의 행을 재배치한다.
  const dragEnabled = owner !== ALL && sortBy === null
  const editEnabled = owner !== ALL
```

**2508~2512행**
```ts
  const requestDeleteSelectedRows = () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const rows = selectedRows()
    if (rows.length) setConfirmDelete(rows)
  }
```

**2985~2986행**
```ts
  const confirmDeleteRecord = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
```

**3082행**
```tsx
        {!editEnabled ? <span role="status" className="shrink-0 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]">읽기 전용 · 담당을 선택하면 수정할 수 있습니다</span> : null}
```

**3208행** — 옵션 삭제 버튼. 긴 한 줄이다.
```tsx
                          <button type="button" title={editEnabled ? "이 옵션 삭제" : EDIT_DISABLED_MESSAGE} aria-label="이 옵션 삭제" disabled={!editEnabled} onClick={(event) => { event.stopPropagation(); setConfirmDelete([record]) }} ...
```

**3255행** — 우클릭 메뉴 항목
```tsx
            { key: "delete-row", label: "행 삭제", hint: "선택 행 전체", icon: <Trash2 className="size-3.5" />, run: requestDeleteSelectedRows, disabled: !editEnabled },
```

**3512행** — 삭제 확인 대화상자의 삭제 버튼
```tsx
            <Button type="button" size="sm" variant="destructive" disabled={!editEnabled} title={!editEnabled ? EDIT_DISABLED_MESSAGE : undefined} onClick={() => void confirmDeleteRecord()}><Trash2 className="size-4" />삭제</Button>
```

## 할 일

### 1. 삭제 거부 문구

40행 `EDIT_DISABLED_MESSAGE` 바로 아래에 더한다.

```ts
const DELETE_DISABLED_MESSAGE = "전체 보기에서는 행을 지울 수 없습니다. 담당을 고른 뒤 지우십시오."
```

### 2. 소유자 판정과 삭제 플래그

1541~1543행을 이렇게 바꾼다. **주석 두 개를 그대로 살려서 쓴다.**

```ts
  // 전체 보기에서는 행 이동을 막고, 담당을 고른 상태에서만 그 담당의 행을 재배치한다.
  const dragEnabled = owner !== ALL && sortBy === null
  // 소유자는 전체 보기에서도 편집한다(2026-10-07 박향근 결정). 팀원은 지금까지와 같다.
  const editEnabled = owner !== ALL || isOwner
  // 삭제만은 전체 보기에서 계속 막는다. 아래 주석의 사고 경로가 그대로 살아 있다.
  const deleteEnabled = owner !== ALL
```

`isOwner`는 `owner` 상태 선언(1312행 `const [owner, setOwner] = useState(ALL)`) 아래 아무 데나,
1543행보다 위에서 만든다.

```ts
  const isOwner = useAuthStore((state) => state.isOwner)
```

**`dragEnabled`는 건드리지 마라.** 행 이동은 담당별 수동 정렬이라 전체 보기에서 순서를 재배치하면
다른 담당의 순서까지 섞인다. 안전 문제가 아니라 뜻이 성립하지 않는 동작이다.

### 3. 삭제 경로 다섯 곳을 `deleteEnabled`로 바꾼다

**이 다섯 곳만 바꾼다. 나머지 `editEnabled`는 전부 그대로 둔다.**

(1) `requestDeleteSelectedRows`(2509행)
```ts
    if (!deleteEnabled) { notify(DELETE_DISABLED_MESSAGE); return }
```

(2) `confirmDeleteRecord`(2986행)
```ts
    if (!deleteEnabled) { notify(DELETE_DISABLED_MESSAGE); return }
```

(3) 옵션 삭제 버튼(3208행). `title`과 `disabled`만 바꾼다. 나머지 속성과 className은 그대로.
```tsx
title={deleteEnabled ? "이 옵션 삭제" : DELETE_DISABLED_MESSAGE} aria-label="이 옵션 삭제" disabled={!deleteEnabled}
```

(4) 우클릭 메뉴 "행 삭제"(3255행)
```tsx
            { key: "delete-row", label: "행 삭제", hint: "선택 행 전체", icon: <Trash2 className="size-3.5" />, run: requestDeleteSelectedRows, disabled: !deleteEnabled },
```

(5) 삭제 확인 대화상자 버튼(3512행)
```tsx
            <Button type="button" size="sm" variant="destructive" disabled={!deleteEnabled} title={!deleteEnabled ? DELETE_DISABLED_MESSAGE : undefined} onClick={() => void confirmDeleteRecord()}><Trash2 className="size-4" />삭제</Button>
```

### 4. 전체 보기에서 편집 중이라는 표시

소유자에게는 `editEnabled`가 참이 되면서 3082행의 "읽기 전용" 배지와 3094행의 `ReadOnlyBanner`,
3101행의 회색 배경이 모두 사라진다. 그러면 지금 담당 필터 없이 **전원의 행**을 고치고 있다는
단서가 화면에 하나도 안 남는다. 배지 자리를 그대로 쓰되 문구만 갈라 준다.

3082행을 이렇게 바꾼다.

```tsx
        {!editEnabled ? <span role="status" className="shrink-0 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]">읽기 전용 · 담당을 선택하면 수정할 수 있습니다</span>
          : owner === ALL ? <span role="status" className="shrink-0 whitespace-nowrap rounded-full border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_14%,var(--background))] px-2.5 py-1 text-[11px] text-[var(--foreground)]">전체 보기 편집 중 · 담당 구분 없이 모든 행이 바뀝니다 (삭제는 잠김)</span>
          : null}
```

3094행과 3101행은 건드리지 마라. `editEnabled`가 참이면 그 둘은 이미 알아서 빠진다.

## 하지 말 것

- **1544~1552행의 긴 주석(2026-10-01 삭제 되돌림 기록)을 지우거나 줄이지 마라.** 왜 삭제만 따로 잠갔는지가 거기 있다.
- **다른 `editEnabled` 자리를 건드리지 마라.** 3단계의 다섯 곳만이다. 특히 `commitCell`, `pasteRange`, `clearRange`, `copyRange`의 `cut`, `fillDown`, `commitFill`, `commitSelectionMove`, 행 삽입, 찾아 바꾸기, 요청 연결은 모두 "편집"이라 소유자에게 열리는 것이 이번 변경의 목적이다.
- **`dragEnabled`를 바꾸지 마라.**
- **행별 담당자와 로그인 사용자를 비교하는 코드를 만들지 마라.** 그런 규칙은 없다.
- **`firestore.rules`를 고치지 마라.** 이번 변경은 화면 단계다.
- **`src/data/auth.ts`를 고치지 마라.** `isOwner`는 이미 있다.
- `src/routes/FabricRequest.tsx`를 열지 마라. 거기에는 아직 커밋하지 않은 R305, R306 변경이 있다. **절대 되돌리지 마라.**
- `src/routes/Warehouse.tsx`, `src/components/dd/RequestLinkHelperDialog.tsx`는 열지 않는다. 연결 도우미는 `editEnabled`를 prop으로 받으므로 저절로 풀린다.
- 새 패키지를 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- `legacy/`, `legacy-vanilla/`, `backup/`은 열지 않는다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다.

그리고 세어라.
- `src/routes/DevelopmentMasterSheet.tsx`에서 `deleteEnabled`가 **6번** 나와야 한다(선언 1회, 사용 5회).
- `DELETE_DISABLED_MESSAGE`가 **5번** 나와야 한다(선언 1회, 사용 4회).
- `git status --short`에 `src/routes/DevelopmentMasterSheet.tsx`와 `src/routes/FabricRequest.tsx` 둘 다 `M`으로 있어야 한다. FabricRequest는 이전 작업 결과라 그대로 있어야 정상이다.

## 보고

수정한 파일, `npm run build` 결과, 위 세 가지 숫자, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
