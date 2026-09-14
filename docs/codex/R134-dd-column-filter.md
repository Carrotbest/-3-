# R134 DD MASTER 열 머리 엑셀식 필터·정렬 메뉴

상태: 미착수

## 요구
DD MASTER 열 머리에 엑셀 자동 필터와 같은 ▼ 메뉴를 단다. 메뉴 구성은 오름차순 정렬, 내림차순 정렬, 이 열 필터 해제, 검색, 값 체크 목록(모두 선택 포함), 확인과 취소다.
색 기준 정렬·필터와 텍스트 조건 필터는 이번 범위가 아니다.

## 현재 구조 (`src/routes/DevelopmentMasterSheet.tsx`)
- 1080행 `const [sortBy, setSortBy] = useState<{ col: string; dir: "asc" | "desc" } | null>(null)`
- 1190행 `compareColumnRows(left, right, column)`: 빈 칸은 맨 뒤, `column.number`, `column.date`, 문자열 순으로 비교한다.
- 1209행 `ordered` useMemo: `scoped`에 담당, 완료 제외, Status, 검색을 걸고 `sortBy`로 정렬한다.
- 1595행 `toggleColumnSort`: 머리 클릭으로 오름차순, 내림차순, 해제 순서로 돈다. **이 동작은 유지한다.**
- 2402행 `정렬 해제` 버튼, 2417행 `초기화` 버튼(검색·담당·Status 리셋).
- 2449행 열 머리 `<th onClick={() => toggleColumnSort(column.id)}>` 안에 라벨, `sortIcon`, 너비 조절 손잡이가 있다.
- 3행 `import { Popover } from "radix-ui"`가 이미 있다.
- 열 값은 `column.value(record, ledgerByRecord.get(recordIdentity(record)) ?? null)`로 읽는다.

## 설계
### 상태
- 1080행 아래: `const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})`. 키는 열 id, 값은 **보여 줄 값 키 목록**이다. 키가 없으면 필터가 없는 것이다.
- 값 키는 `String(value ?? "").trim()`이다. 빈 문자열이 "(빈 칸)"이다.
- 저장하지 않는다(localStorage 금지). CLAUDE.md "보기 설정" 절의 규칙대로 검색·필터·정렬은 남기지 않는다.

### 필터 적용
- 1211~1219행 필터 본문을 컴포넌트 안 함수 `passesBaseFilters(record: DevRecord, exceptColumnId?: string): boolean`으로 뽑는다. 기존 조건(담당, 완료 제외, Status, 검색)을 그대로 옮기고 끝에 열 필터를 AND로 더한다. `exceptColumnId` 열의 필터는 건너뛴다.
- `ordered`는 `scoped.filter((record) => passesBaseFilters(record))`로 바꾸고 useMemo 의존성에 `columnFilters`를 더한다. 정렬 부분은 그대로 둔다.

### 값 목록
- 메뉴가 **열릴 때만** 계산한다. 64열 전부를 미리 계산하지 않는다.
- 원본은 `scoped.filter((record) => passesBaseFilters(record, column.id))`다. 엑셀처럼 다른 열 필터가 걸린 상태의 값만 나온다.
- 중복을 제거하고 `compareColumnRows`와 같은 규칙(숫자, 날짜, 문자열 ko-KR numeric)으로 정렬한다. "(빈 칸)"은 맨 끝이다.
- 표시 라벨: `column.date`면 `fmtDate`(`@/data/format`), 아니면 키 그대로.

### 메뉴 컴포넌트 (신규 `src/components/data-table/ColumnFilterMenu.tsx`)
Props:
```ts
{
  label: string
  active: boolean                 // 이 열에 필터가 있음
  sortDir: "asc" | "desc" | null  // 이 열의 현재 정렬
  loadOptions: () => { key: string; label: string }[]
  selected: string[] | null       // null = 필터 없음(전부 선택)
  onSort: (dir: "asc" | "desc") => void
  onApply: (selected: string[] | null) => void
}
```
- 트리거: 14px 정사각 버튼. 필터가 없으면 `ChevronDown`, 있으면 `ListFilter` 아이콘을 `var(--primary)`색으로 쓴다. `aria-label={`${label} 필터`}`.
- 열리면 `loadOptions()`를 한 번 부르고, 선택 초안을 `selected ?? 전체 키`로 잡는다.
- 내용 순서: `텍스트 오름차순 정렬`, `텍스트 내림차순 정렬`(현재 방향이면 강조), 구분선, `"{label}"에서 필터 해제`(`active`가 아니면 disabled, 누르면 `onApply(null)` 후 닫기), 구분선, 검색 입력, 체크 목록, 확인·취소.
- 검색은 라벨 부분 일치(대소문자 무시)다. `(모두 선택)`은 **지금 보이는(검색된) 항목만** 켜고 끈다. 일부만 켜져 있으면 indeterminate로 보인다.
- 목록은 `max-h-64 overflow-auto`로 스크롤한다. 가상화하지 않는다.
- 확인: 초안이 비면 disabled다. 초안이 전체 키와 같으면 `onApply(null)`, 아니면 `onApply(초안)`. 그리고 닫는다.
- 취소와 바깥 클릭은 초안을 버리고 닫는다.
- 정렬 항목은 `onSort(dir)` 후 닫는다.
- 너비 `w-72`, 배경 `var(--card)`, 테두리 `var(--border)`, 그림자. 화면 폭 1790px를 넘지 않게 `align="start"`, `collisionPadding={8}`.

### 이벤트 함정 (반드시 지킬 것)
- **Radix Portal 안의 React 이벤트는 React 트리를 따라 `th`까지 버블링된다.** 막지 않으면 메뉴 안을 누를 때마다 `toggleColumnSort`가 돈다. 트리거 버튼과 `Popover.Content`의 `onClick`, `onMouseDown`에서 `event.stopPropagation()`을 부른다.
- **`Popover.Content`의 `onKeyDown`에서도 `stopPropagation()`을 부른다.** 표 단축키가 window keydown으로 돌고, Enter·Tab이 새면 선택 칸이 움직인다(CLAUDE.md 주의 항목 `editorKeyHandler`와 같은 원인).
- 너비 조절 손잡이(2449행 끝 `span`)는 그대로 둔다. 트리거는 손잡이 왼쪽에 둔다.

### DD MASTER 연결
- 2449행 `th` 내부: 라벨 span을 `flex items-center gap-1` 줄로 두고 오른쪽 끝(`ml-auto`)에 `ColumnFilterMenu`를 둔다. 필터가 걸린 열 머리는 글자색을 `var(--primary)`로 한다.
- `onSort={(dir) => setSortBy({ col: column.id, dir })}`
- `onApply={(next) => setColumnFilters((current) => { const copy = { ...current }; if (next) copy[column.id] = next; else delete copy[column.id]; return copy })}`
- 2402행 `정렬 해제` 옆에 필터가 하나라도 있으면 `필터 해제 (N)` 버튼(같은 모양, 아이콘 `FilterX`)을 둔다. 누르면 `setColumnFilters({})`.
- 2417행 `초기화` onClick에 `setColumnFilters({})`를 더한다.

## 하지 말 것
- `toggleColumnSort`, `compareColumnRows`, 정렬 규칙을 바꾸지 않는다.
- `exportExcel`(2270행 근처)을 바꾸지 않는다. 기존대로 담당 필터와 상관없이 전체를 내보낸다.
- 신규 접수 팝업의 표 머리(484~505행)는 건드리지 않는다.
- 필터·정렬 상태를 localStorage나 Firestore에 저장하지 않는다.
- R132, R133의 커밋 안 된 변경을 되돌리지 않는다.

## CLAUDE.md
"## DD MASTER" 절 끝에 한 줄 더한다: 열 머리 ▼ 메뉴(`ColumnFilterMenu`)는 엑셀식 값 필터와 정렬이다. 머리 클릭 정렬은 그대로다. 필터는 저장하지 않는다. Portal 안 이벤트가 `th`로 버블링되니 `stopPropagation`을 빼지 말 것.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `DevelopmentMasterSheet.tsx`, `ColumnFilterMenu.tsx`(신규), `CLAUDE.md`와 이 문서만 더해진다.
