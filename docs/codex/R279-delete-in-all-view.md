# R279 전체 보기에서 행 삭제 열기

상태: **미착수.** R278 까지 구현 완료, `9e338c0` 로 커밋·배포 완료.

사고 후속이다. 붙여넣기 사고로 담당 칸이 `GD260915265-01` 이 된 행이 생겼는데
**어느 담당 탭에도 안 잡히고 전체 보기에서만 보인다.** 그런데 전체 보기는 편집이 전부 막혀 있어
지울 길이 없다.

```ts
const editEnabled = owner !== ALL   // 1422행
```

담당 드롭다운에서 그 값을 직접 고르면 닿기는 한다(`ownerOptions` 는 실데이터로 만든다).
하지만 그 길을 모르면 손댈 수 없는 행으로 보인다. **삭제만 전체 보기에서도 열어 막다른 길을 없앤다.**

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/routes/DevelopmentMasterSheet.tsx` | 행 삭제에서 담당 탭 조건을 뺀다. 안내 문구 보강 |

이 파일 하나만 고친다.

---

## 1. 행 삭제에서 담당 탭 조건을 뺀다

`editEnabled`(1422행) 바로 아래에 더한다. **`editEnabled` 자체는 바꾸지 마라.**

```ts
  /**
   * 행 삭제만 전체 보기에서도 연다(2026-10-01).
   * 담당 칸이 비었거나 명단 밖인 행은 어느 담당 탭에도 안 잡혀서, 전체 보기에서만 보이는데
   * 거기서 못 지우면 손댈 길이 아예 없어진다. 붙여넣기 사고로 담당이 깨진 행이 그랬다.
   * 셀 수정과 행 이동은 전체 보기에서 계속 막는다. 삭제는 확인 창을 지나고 작업 이력에
   * 남아 되돌릴 수 있다. 쓰기 권한은 ReadOnlyGuard 와 pushCache 의 currentUserCanEditKey 가 본다.
   */
  const deleteEnabled = true
```

그리고 **삭제 세 곳에서만** `editEnabled` 를 `deleteEnabled` 로 바꾼다.

1. `requestDeleteSelectedRows`(2379행 부근)

```ts
  const requestDeleteSelectedRows = () => {
    if (!deleteEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const rows = selectedRows()
    if (rows.length) setConfirmDelete(rows)
  }
```

2. 우클릭 메뉴 `delete-row` 항목(3120행 부근)의 `disabled: !editEnabled` 를 `disabled: !deleteEnabled` 로.

3. 삭제 확인 창의 `삭제` 버튼(3377행 부근) `disabled={!editEnabled}` 와 `title={!editEnabled ? … }` 를
   `deleteEnabled` 로.

`confirmDeleteRecord`(2851행) 안의 `if (!editEnabled)` 도 `deleteEnabled` 로 바꾼다.

**이 네 곳 말고 다른 `editEnabled` 를 건드리지 마라.** 셀 편집, 붙여넣기, 아래로 채우기,
행 삽입, 요청 연결, 64열 수정 모달, 접수 팝업은 전부 지금 그대로 담당 탭에서만 된다.

---

## 2. 안내 문구

`EDIT_DISABLED_MESSAGE`(39행)를 바꾼다. 담당이 깨진 행에 닿는 길을 문구에 적는다.

```ts
const EDIT_DISABLED_MESSAGE = "담당을 선택한 뒤 수정할 수 있습니다. 담당 칸이 비었거나 명단 밖인 행은 담당 드롭다운에서 그 값을 고르십시오."
```

---

## 3. 확인할 것

전체 보기에서 행 머리를 눌러 행을 선택하고 우클릭했을 때 `행 삭제` 가 **활성**이어야 한다.
선택 자체는 `editEnabled` 와 무관하므로 추가 수정이 필요 없을 것이다.
필요하면 그 경로만 확인하고, 선택이 막혀 있으면 **고치지 말고 보고해라.** 범위 밖이다.

---

## 4. 하지 말 것

- **`editEnabled` 의 정의를 바꾸지 마라.** `owner !== ALL` 그대로다.
- 삭제 네 곳 말고 다른 `editEnabled` 사용처를 `deleteEnabled` 로 바꾸지 마라.
- `dragEnabled`(행 이동)를 건드리지 마라. 전체 보기에서 계속 막는다.
- `confirmDeleteRecord` 의 삭제 방식(`recordIdentity` 로 거르기)과 `commitRecords` 호출을 바꾸지 마라.
- 삭제 확인 창을 없애거나 건너뛰지 마라.
- `ownerOptions`, `passesBaseFilters`, `isClosedRecord` 를 건드리지 마라.
- 권한 판정을 이 파일에 새로 만들지 마라. `useScreenAccess` 를 여기서 부르지 마라.
  인증이 아직 안 올라온 순간에 화면 전체가 읽기 전용으로 보인다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 5. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
