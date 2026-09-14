# R140 FABRIC REQUEST 컴팩트 행 높이와 DD MASTER·WAREHOUSE 톤앤매너

상태: 미착수. R139(스타일 병합 블럭) 위에서 표현만 바꾼다. 데이터·편집·저장 로직은 그대로 둔다.

## 요구 (사용자)
- 옵션 행 높이를 컴팩트하게 한다.
- 화면이 전반적으로 낡아 보인다. DD MASTER, WAREHOUSE와 톤앤매너를 맞춘다.

## 기준 화면에서 확인한 스타일
- **WAREHOUSE** (`src/routes/Warehouse.tsx`)
  - 1221~1241행: 상단 줄에 `Tabs`(`TabsList className="flex w-full justify-start gap-1 overflow-x-auto"`)가 있다. 탭마다 색 점, 라벨, `Badge` 건수가 붙는다. 오른쪽에 `Button size="sm" variant="outline"`들이 있다.
  - 1243행: 본문은 카드 하나다. `flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-t-4 border-[var(--border)] bg-[var(--card)]`에 상단 강조색이 붙는다.
  - 1244행: 카드 안 툴바는 `flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--border)] p-2`다.
- **DD MASTER** (`src/routes/DevelopmentMasterSheet.tsx`)
  - 툴바 컨트롤: `h-7 text-[11px]` 입력·Select, 토글 버튼 `h-7 shrink-0 px-2 text-[11px]`(`aria-pressed`, 켜지면 `variant="default"`).
  - 열 그룹 칩: `rounded-full border px-1.5 py-0.5 text-[11px] font-normal`, 켜지면 `border-transparent text-white` + 그룹색 배경.
  - 그룹 밴드 머리: `border-b border-r px-2 text-center text-[11px] font-semibold`, 글자색은 그룹색, 배경은 `color-mix(in srgb, 그룹색 12%, var(--card))`.
  - 열 머리: `h-8 border-b border-r px-2 text-xs font-normal text-[var(--muted-foreground)] bg-[var(--muted)]`.
  - 본문 셀: `h-8 border-b border-r border-[var(--border)] px-2 text-xs font-normal`, 행 `group bg-[var(--card)] hover:bg-[var(--accent)]`.
  - 행 머리: `bg-[var(--muted)] text-center text-[10px] tabular-nums text-[var(--muted-foreground)]`.
  - thead: `sticky top-0 z-30 bg-[var(--card)] shadow-sm`.

## 현재 코드 (`src/routes/FabricRequest.tsx`)
- 82행 `ACTION_WIDTH = 104`.
- 85~87행 `STYLE_ROW_HEIGHT = 112`, `OPTION_ROW_HEIGHT = 40`, `ADD_ROW_HEIGHT = 28`.
- 282행 사진 자리 빈 상태 버튼.
- 844~903행 `renderDataCell`. 옵션 셀은 `border-dashed`와 회색 배경, 스타일 셀은 `border-b-2 border-b-[var(--foreground)]/15`, 내용은 `whitespace-pre-wrap px-1.5 py-1` 스크롤이다.
- 907~960행 툴바 `Card`: 단계 Tabs, 정렬 Select `h-8`, 차트 Select `h-8`, URGENT `Checkbox`, 건수, 오른쪽 양식·업로드·신규 버튼.
- 962~988행 밴드 칩 줄(따로 떨어져 있다), 너비 초기화.
- 990~1000행 알림, 1002~1009행 빈 상태 `Card`, 1011행 표를 감싼 `Card`.
- 1016~1091행 헤더. 모든 머리가 `font-bold text-[var(--foreground)]`, 그룹 밴드 배경 20%, 열 머리 `top-8`.
- 1094~1165행 본문 블럭(R139). 행 머리 `border-l-2 border-l-[var(--primary)]`, 블럭 경계 `border-b-2`, 추가 줄은 점선 버튼이다.

## 파일별 조치 (`src/routes/FabricRequest.tsx` 하나, 그리고 CLAUDE.md)

### 1. 상수
- `STYLE_ROW_HEIGHT = 84`
- `OPTION_ROW_HEIGHT = 28`
- `ADD_ROW_HEIGHT = 24`
- `ACTION_WIDTH = 72`
- 블럭 높이 계산식(R139)은 그대로 둔다. 상수만 바뀐다.

### 2. 페이지 구성 (WAREHOUSE와 같은 골격)
- 바깥 `div`는 `flex min-h-0 flex-1 flex-col gap-3 p-4`를 유지한다.
- **상단 줄**(`flex shrink-0 items-center gap-2`, 기존 툴바 `Card` 제거):
  - 왼쪽 단계 탭: WAREHOUSE처럼 `TabsList className="flex justify-start gap-1"`로 둔다. 탭마다 색 점(`size-2 rounded-full`)과 `Badge variant="secondary"` 건수(`h-5 min-w-5 px-1.5 tabular-nums`)를 단다. 건수는 `requests`에서 단계별로 센다. 전체는 `requests.length`, 분석·개발은 `item.stage === 값`인 수다. 점 색은 전체 `var(--primary)`, 분석 `COLUMN_GROUPS`의 분석 그룹색, 개발 `COLUMN_GROUPS`의 의뢰 그룹색이다.
  - 오른쪽(`ml-auto`): 기존 `양식 내려받기`, `업로드`(outline sm), `신규 의뢰`(default sm) 버튼을 그대로 옮긴다.
- **본문 카드**: `flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-t-4 border-[var(--border)] bg-[var(--card)]`. 상단 강조색은 단계로 정한다(`style={{ borderTopColor: 점 색 }}`).
  - **카드 안 툴바**(`flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--border)] p-2`):
    - 정렬 Select: `h-7 w-32 text-[11px]`
    - 차트 Select: `h-7 w-44 text-[11px]`
    - URGENT: `Checkbox`를 없애고 DD MASTER "완료 제외"와 같은 토글 버튼으로 바꾼다. `size="sm"`, `variant={urgentOnly ? "default" : "outline"}`, `className="h-7 shrink-0 px-2 text-[11px]"`, `aria-pressed`, 아이콘 lucide `Flame` size-3.5, 글자 `URGENT만`. 동작은 `setUrgentOnly(!urgentOnly)`로 같다.
    - 건수: `text-xs text-[var(--muted-foreground)]`로 `스타일 <strong className="text-[var(--foreground)]">N</strong> · 옵션 <strong>M</strong>`.
    - 오른쪽(`ml-auto flex items-center gap-1`): 밴드 칩(962~979행)을 여기로 옮기고 DD MASTER 칩 모양(`px-1.5 py-0.5 text-[11px] font-normal`)으로 맞춘다. 그 뒤에 너비 초기화를 `Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-[var(--muted-foreground)]"` + `RotateCcw` size-3.5로 둔다.
  - 알림(990~1000행)은 툴바 바로 아래 카드 안에 둔다. 모양은 `mx-2 mt-2 rounded-full bg-[var(--muted)] px-3 py-1 text-xs`로 하고, 오류일 때는 글자색만 `var(--destructive)`로 바꾼다.
  - 빈 상태(1002~1009행): `Card`를 없애고 카드 안 `flex flex-1 items-center justify-center p-10` 문구로 둔다.
  - 표 영역: 1011행 `Card`를 `div className="min-h-0 flex-1 overflow-auto"`로 바꾼다.

### 3. 헤더 (DD MASTER 모양)
- `TableHeader`: `sticky top-0 z-30 bg-[var(--card)] shadow-sm`.
- 1행 `#` 머리와 고정 열 머리(rowSpan 2): `bg-[var(--muted)] px-2 text-xs font-normal text-[var(--muted-foreground)]`. `#`는 `text-[10px]`다. sticky, z, left, 너비 조절 손잡이는 유지한다.
- 그룹 밴드 머리: `h-6 px-2 text-center text-[11px] font-semibold`, `style={{ color: group.color, background: `color-mix(in srgb, ${group.color} 12%, var(--card))` }}`. 접기 버튼, 그룹 너비 손잡이는 유지한다.
- 2행 열 머리: `h-8 px-2 text-xs font-normal text-[var(--muted-foreground)] bg-[var(--muted)]`. 정렬은 `column.align`을 따르고 기본은 왼쪽이다. 그룹색 7% 배경을 없앤다. **sticky 오프셋을 `top-8`에서 `top-6`으로 바꾼다**(그룹 줄이 h-6이다).
- 액션 머리: `bg-[var(--muted)]`.

### 4. 본문 (컴팩트, DD MASTER 모양)
- 모든 `TableRow`에 `group/row` 대신 블럭 단위 호버가 필요 없다. 옵션 줄은 기존 `group/opt`를 유지하고 `hover:bg-[var(--accent)]`만 더한다.
- 행 머리(1108~1116행): `bg-[var(--muted)] text-[10px] font-medium tabular-nums text-[var(--muted-foreground)]`, 번호는 `pt-1.5`. **`border-l-2 border-l-[var(--primary)]`와 `border-b-2`를 없앤다.**
- `renderDataCell`:
  - 공통 `border-b border-r border-[var(--border)] bg-[var(--card)] p-0 align-top text-xs`.
  - 스타일 셀(블럭 병합): 아래 테두리를 블럭 경계로 `border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))]`로 한다. 두께는 1px다. 내용 div는 `px-2 py-1.5 leading-snug whitespace-pre-wrap break-words overflow-y-auto`, 스크롤은 유지한다.
  - 옵션 셀: `border-dashed`와 회색 배경을 없앤다. 내용 div는 `flex h-full items-center px-2`, 안쪽 span은 `truncate`, `title`에 전체 텍스트(`String(rawValue(line, column.id) ?? "")`)를 넣는다. 한 줄 말줄임이다. 편집기(`CellEditor`)는 그대로다.
  - Opt 번호 칸(`optNo`): 가운데에 `inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--muted)] px-1.5 text-[10px] font-medium tabular-nums text-[var(--foreground)]` 알약으로 번호를 보인다. 휴지통 버튼은 `size-5`, 아이콘 `size-3`, 호버 시에만 보이는 것을 유지한다.
  - URGENT 칸(`urgent`): 참이면 `rounded-full bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--destructive)]` 배지 `URGENT`, 거짓이면 빈 칸이다. 더블클릭 토글 동작은 그대로다.
- 옵션 없음 칸: 점선과 회색 배경을 없애고 `text-[11px] text-[var(--muted-foreground)]`만 둔다.
- 추가 줄(1155~1163행): `border-b-2`를 블럭 경계색 1px로 바꾼다. 버튼은 `h-5 w-full justify-start gap-1 px-2 text-[11px] font-normal text-[var(--muted-foreground)] hover:text-[var(--foreground)]`, ghost, 점선 테두리를 없앤다.
- 액션 칸: `bg-[var(--card)]`, 버튼은 `size-6 p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]`, 아이콘 `size-3.5`, 세로 `pt-1`.
- 사진 빈 상태 버튼(282행): 아이콘 `size-3.5`, 글자 `text-[10px]`, 점선 테두리는 유지한다. 84px 블럭에 맞게 `gap-0.5`로 한다.

## CLAUDE.md
"## FABRIC REQUEST" 절에서 R139가 적은 높이 문장을 바꾼다. 블럭은 최소 84px, 옵션 줄은 28px, 추가 줄은 24px다. 옵션 칸은 한 줄 말줄임이고 전체 텍스트는 title에 넣는다. 스타일 병합 칸은 셀 안 스크롤을 유지한다. 한 줄을 더한다. "톤앤매너는 WAREHOUSE(탭+상단 강조 카드)와 DD MASTER(헤더·칩·h-7 컨트롤)를 따른다."

## 하지 말 것
- 데이터 모델, 저장(`saveRequests`), `addOption`·`removeOption`·`commitCell`·`rawValue`·`cellValue`의 값 계산을 바꾸지 않는다. URGENT 배지는 렌더 분기만 더한다.
- 필터·정렬 동작, 로컬 저장 키(`fabric.request.colWidths`, `fabric.request.openGroups`), 너비 조절 로직을 바꾸지 않는다.
- `request-template.ts`, 업로드, 양식 내려받기를 바꾸지 않는다.
- R139 병합 구조(rowSpan, 블럭 줄 구성)를 바꾸지 않는다.
- 다른 파일을 고치지 않는다. R135~R139 미커밋 변경을 되돌리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `FabricRequest.tsx`, `CLAUDE.md`, 이 문서만 더해진다.
