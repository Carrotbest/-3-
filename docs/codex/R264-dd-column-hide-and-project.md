# R264 DD MASTER 열 개별 숨김과 Project 열 추가

상태: 미착수. 추론 강도 **medium**(표 헤더와 열 정의를 건드린다. 저장 구조는 필드 하나만 는다).

두 가지를 한다.

1. 열을 하나씩 숨긴다. 숨김 버튼은 열 머리에 마우스를 올렸을 때만 보인다. 숨긴 열은 도구줄 `숨긴 열 N`에서 되돌린다.
2. Style No. 오른쪽에 `Project` 열을 더한다. 개발 건 별칭을 사람이 적는 칸이다.

## 열 이름을 Project 로 정한 이유

후보는 Project, 개발명, Alias(별칭), Nickname, Program, Theme 였다. `Project`로 간다. DD의 다른 열 이름이 영어고, 한 Style No. 아래 여러 옵션이 묶인 개발 건 전체를 가리키기에 뜻이 가장 가깝다. 별칭이라는 성격은 열 머리 툴팁으로 적는다. 사용자가 다른 말을 원하면 `label`과 툴팁 문구만 바꾸면 된다. **id `project`는 저장 키라 바꾸지 마라.**

## A. `src/data/schema.ts` — 필드 하나

`DevTechnical`의 `yarnDetail?: string` 바로 위에 더한다.

```ts
  /** 개발 건 별칭(Project). DD 표 Style No. 오른쪽 칸에서 사람이 적는다. 엑셀 원본에는 없는 웹 전용 값이다. */
  project?: string
  // 개발 사양
  yarnDetail?: string
```

기존 데이터에 없는 선택 필드라 이관이 필요 없다.

## B. `src/routes/DevelopmentMasterSheet.tsx`

### B-1. 열 정의 (193행 `개발 REQUEST` 그룹 첫 줄)

지금

```ts
    key: "request", label: "개발 REQUEST", color: "var(--chart-1)", columns: [
      { id: "opt", label: "# of Opt", width: 68, mono: true, align: "center", value: (row) => row.opt, render: (row) => optionSequenceText(row) },
```

바꾼 뒤. `project`를 맨 앞에 넣어 Style No. 바로 오른쪽에 세운다.

```ts
    key: "request", label: "개발 REQUEST", color: "var(--chart-1)", columns: [
      // 개발 건 별칭. 사람이 적고 같은 이름을 여러 행에 쓴다. suggest 로 이미 쓴 이름을 제안한다.
      { id: "project", label: "Project", width: 132, suggest: true, value: (row) => row.tech?.project ?? "" },
      { id: "opt", label: "# of Opt", width: 68, mono: true, align: "center", value: (row) => row.opt, render: (row) => optionSequenceText(row) },
```

### B-2. 저장 경로 (624행 `TECH_PATHS`)

`arrangeNo: ["arrangeNo"], yarnDetail: ["yarnDetail"], bodyNo: ["bodyNo"],` 가 있는 줄 끝에 더한다.

```ts
  project: ["project"],
```

`updateRecordCell`은 `TECH_PATHS`를 보므로 따로 고칠 것이 없다.

### B-3. 입력 제안 (1262행 `optionsById` 반환 객체)

반환 객체에 한 줄 더한다.

```ts
      project: sortKo(distinct((record) => record.tech?.project)),
```

### B-4. 왼쪽 정렬 (307행 `LEFT_ALIGN_IDS`)

`"styleNo", "developmentNo", ...` 목록 맨 앞에 `"project",` 를 더한다. 이름이라 가운데 정렬이 어울리지 않는다.

### B-5. 숨긴 열 상태

39행 `const OPEN_GROUPS_STORAGE_KEY = "dd-open-groups-v1"` 다음 줄에 더한다.

```ts
/** 열 하나씩 숨기기(R264). 개인 브라우저에만 남는다. 값은 열 id → 숨김 여부다. */
const HIDDEN_COLUMNS_STORAGE_KEY = "dd-hidden-cols-v1"
```

`const GROUP_COLUMNS = GROUPS.flatMap((group) => group.columns)`(303행) 다음에 기본값을 만든다.

```ts
/** 숨길 수 있는 열은 그룹 열뿐이다. 담당·Status·Style No. 는 표의 기준점이라 남긴다. */
const DEFAULT_HIDDEN: Record<string, boolean> = Object.fromEntries(GROUP_COLUMNS.map((column) => [column.id, false]))
```

`const [openGroups, setOpenGroups] = useState(...)`(1132행) 다음 줄에 상태를 더한다.

```ts
  const [hiddenColumns, setHiddenColumns] = useState(() => loadViewGroups(HIDDEN_COLUMNS_STORAGE_KEY, DEFAULT_HIDDEN))
  const [hiddenMenuOpen, setHiddenMenuOpen] = useState(false)
```

### B-6. 숨김·복원 함수

`const widthOf = (column: MasterColumn) => ...`(1336행) 앞에 넣는다.

```ts
  const hiddenColumnList = GROUP_COLUMNS.filter((column) => hiddenColumns[column.id])
  const setHidden = (next: Record<string, boolean>) => { setHiddenColumns(next); saveViewPref(HIDDEN_COLUMNS_STORAGE_KEY, next) }
  /** 열을 숨긴다. 그 열에 걸린 값 필터도 같이 푼다. 안 보이는 열이 행을 거르면 이유를 알 수 없다. */
  const hideColumn = (columnId: string) => {
    setHidden({ ...hiddenColumns, [columnId]: true })
    setColumnFilters((current) => { const copy = { ...current }; delete copy[columnId]; return copy })
  }
  const showColumn = (columnId: string) => setHidden({ ...hiddenColumns, [columnId]: false })
  const showAllColumns = () => setHidden({ ...DEFAULT_HIDDEN })
```

### B-7. 표에서 빼기 (1274행 `visibleGroups`)

지금

```ts
  const visibleGroups = GROUPS
    .filter((group) => openGroups[group.key])
    .map((group) => group.key === "detail" && !finishingOpen
      ? { ...group, columns: group.columns.filter((column) => !FINISHING_COLUMN_IDS.has(column.id)) }
      : group)
```

바꾼 뒤. 숨긴 열을 빼고, 열이 하나도 안 남은 그룹은 머리까지 뺀다(colSpan 0 방지).

```ts
  const visibleGroups = GROUPS
    .filter((group) => openGroups[group.key])
    .map((group) => group.key === "detail" && !finishingOpen
      ? { ...group, columns: group.columns.filter((column) => !FINISHING_COLUMN_IDS.has(column.id)) }
      : group)
    .map((group) => ({ ...group, columns: group.columns.filter((column) => !hiddenColumns[column.id]) }))
    .filter((group) => group.columns.length > 0)
```

`displayedColumns`, 선택 영역, 복사, 필터는 모두 이 값을 따라가므로 따로 고칠 것이 없다. **`allColumns`(검색·필터 판정용 전체 목록)는 그대로 둬라.** 숨긴 열도 검색으로는 찾혀야 한다.

### B-8. 열 머리에 숨김 버튼 (2784행)

그룹 열 머리 `<th>`다. 지금 className 이 이렇게 시작한다.

```
className={`relative cursor-pointer border-b border-r border-[var(--border)] px-2 text-xs font-normal ...
```

맨 앞에 `group/col ` 을 붙인다.

```
className={`group/col relative cursor-pointer border-b border-r border-[var(--border)] px-2 text-xs font-normal ...
```

같은 `<th>` 안, 너비 손잡이 `<span aria-hidden="true" onMouseDown={(event) => startColumnResize(column, event)}` **앞에** 버튼을 넣는다.

```tsx
<button type="button" aria-label={`${column.label} 열 숨기기`} title={`${column.label} 열 숨기기`} onClick={(event) => { event.stopPropagation(); hideColumn(column.id) }} className="absolute left-0.5 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded border border-current bg-[var(--card)] text-[10px] leading-none opacity-0 transition-opacity hover:bg-[var(--muted)] group-hover/col:opacity-100">−</button>
```

평소에는 `opacity-0`이라 안 보이고 그 열 머리에 마우스를 올렸을 때만 뜬다. 글자는 빼기표(U+2212)다.

### B-9. 도구줄에 `숨긴 열 N`

2828행 그룹 칩(`{GROUPS.map((group) => <button ...)}`) **다음**에 넣는다. 같은 줄에 붙는다.

```tsx
{hiddenColumnList.length ? <span className="relative shrink-0">
  <button type="button" aria-expanded={hiddenMenuOpen} onClick={() => setHiddenMenuOpen((current) => !current)} className="flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--muted-foreground)] hover:text-[var(--foreground)]">숨긴 열 <span className="tabular-nums">{hiddenColumnList.length}</span></button>
  {hiddenMenuOpen ? <>
    <span className="fixed inset-0 z-[80]" onMouseDown={() => setHiddenMenuOpen(false)} />
    <span className="absolute left-0 top-full z-[81] mt-1 block max-h-64 w-56 overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg">
      <button type="button" onClick={() => { showAllColumns(); setHiddenMenuOpen(false) }} className="mb-1 block w-full rounded px-2 py-1 text-left text-[11px] font-medium hover:bg-[var(--muted)]">전부 다시 보이기</button>
      {hiddenColumnList.map((column) => <button key={column.id} type="button" onClick={() => showColumn(column.id)} className="block w-full truncate rounded px-2 py-1 text-left text-[11px] hover:bg-[var(--muted)]">{column.label}</button>)}
    </span>
  </> : null}
</span> : null}
```

## C. `CLAUDE.md`

`## 보기 설정` 절의 `키:` 줄에 `dd-hidden-cols-v1` 을 `dd-open-groups-v1` 다음 자리에 더한다.

`## DD MASTER` 절의 마지막 항목 아래에 두 줄 더한다.

```
- 열 머리에 마우스를 올리면 왼쪽에 숨김 버튼이 뜬다. 숨긴 열은 도구줄 `숨긴 열 N`에서 되돌린다. 고정 3열(담당·Status·Style No.)은 숨기지 않는다. 숨겨도 검색과 64열 수정 모달에서는 그대로 보인다(`allColumns`와 `GROUPS`를 쓴다).
- `Project`(`tech.project`)는 개발 건 별칭이다. Style No. 오른쪽 칸에서 사람이 적고 같은 이름을 여러 행에 쓴다. 엑셀 원본에 없는 웹 전용 값이라 `dd-export.ts` 내보내기에는 넣지 않았다.
```

## 하지 말 것

- 고정 3열(담당·Status·Style No.)에 숨김 버튼을 붙이지 마라. 2777행 `PINNED_COLUMNS.map` 쪽은 손대지 않는다.
- `allColumns`에서 숨긴 열을 빼지 마라. 검색이 안 먹는다.
- 64열 수정 모달(3228행 `GROUPS.filter(...)`)에서 숨긴 열을 빼지 마라. 숨김은 표 보기 설정일 뿐이다.
- `dd-export.ts`와 엑셀 양식에 `Project`를 넣지 마라. 양식이 밀린다. 필요하면 따로 정한다.
- 숨김 상태를 `CACHE_KEYS`에 넣지 마라. 개인 브라우저 값이다.
- `INTAKE_GRID_ORDER`(접수 팝업 열 순서)에 `project`를 넣지 마라. 접수 때 적는 값이 아니다.
- 열 순서를 그 밖에 바꾸지 마라.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | A, 필드 한 줄 |
| `src/routes/DevelopmentMasterSheet.tsx` | B-1~B-9 |
| `CLAUDE.md` | C |

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. 화면 확인은 사용자가 한다. DD MASTER에서 열 머리에 마우스를 올리면 숨김 버튼이 뜨고, 누르면 그 열만 사라지며, 도구줄 `숨긴 열 N`에서 되돌아오는지 본다. Style No. 오른쪽 `Project` 칸에 글자를 적고 새로 고쳐도 남는지 본다.
