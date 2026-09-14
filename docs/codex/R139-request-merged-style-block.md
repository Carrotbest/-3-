# R139 FABRIC REQUEST 스타일 병합 블럭 (옵션을 스타일 안에서 쪼개기)

상태: 미착수

## 요구 (사용자)
- 옵션 목록이 스타일과 떨어진 별도 행처럼 보이면 안 된다. 개발 옵션은 **하나의 병합된 스타일 안에서 쪼개지는 fabrication**이다.
- 엑셀 병합 셀처럼 보여야 한다. 스타일 칸(사진, Garment No., ORIGINAL, 분석, 의뢰)은 세로로 병합한다. 옵션 칸(Opt, Yarn Detail, Color, Dyeing, Remark)만 옵션 수만큼 줄로 나눈다.

## 현재 구조 (`src/routes/FabricRequest.tsx`)
- 85~86행 `STYLE_ROW_HEIGHT = 112`, `OPTION_ROW_HEIGHT = 40`.
- 50~78행 열 정의. `scope: "style"`은 image, garmentNo, ORIGINAL 4열, 분석 4열, 의뢰 4열이다. `scope: "option"`은 optNo, yarnDetail, color, dyeingMethod, remark다.
- 623~629행 `lines`: 스타일마다 `{kind:"style"}` 한 줄 뒤에 옵션마다 `{kind:"option"}` 줄을 평평하게 붙인다.
- 1040~1122행 본문 렌더. 줄마다 `TableRow` 하나다.
  - 1056행 행 머리 번호 `rowIndex + 1`은 스타일과 옵션을 통틀어 센다.
  - 1061행 `inScope`: 스타일 줄은 style 열만, 옵션 줄은 option 열만 편집한다. 나머지 칸은 빈 칸으로 그려져 스크린샷처럼 빈 격자가 생긴다.
  - 1068행 고정 열(`FIXED_COLUMNS`)은 `sticky z-10`, 옵션 줄은 옅은 배경이다.
  - 1099~1119행 액션 칸. 스타일 줄은 수정·옵션 추가·스타일 삭제, 옵션 줄은 옵션 삭제다.
- 셀 헬퍼 `editKindOf(columnId)`, `rawValue(line, columnId)`, `commitCell(line, columnId, next)`, `cellValue(line, column)`는 `Line`을 받는다. 우클릭 메뉴 `setRowMenu({ x, y, line })`도 `Line`을 받는다.
- 밴드 칩으로 옵션 밴드를 접을 수 있다(`visibleColumns`).

## 설계
### 블럭 단위 렌더
- `lines` 대신 스타일 단위 블럭으로 그린다. `visible.map((style, styleIndex) => ...)`.
- 옵션 열이 하나라도 보이면(`visibleColumns.some(c => c.scope === "option")`) 블럭 줄 수는 `n = Math.max(1, style.options.length) + 1`이다. 마지막 1줄은 "옵션 추가" 줄이다. 옵션 열이 모두 접혀 있으면 `n = 1`이고 옵션 줄과 추가 줄을 그리지 않는다.
- 높이 규칙:
  - `ADD_ROW_HEIGHT = 28`
  - `optionRowHeight = Math.max(OPTION_ROW_HEIGHT, Math.floor((STYLE_ROW_HEIGHT - ADD_ROW_HEIGHT) / Math.max(1, style.options.length)))`
  - 옵션이 적어도 블럭 전체가 최소 112px이 되게 한다. 옵션이 많으면 블럭이 늘어난다.
  - 옵션 열이 모두 접혔으면 블럭 높이는 `STYLE_ROW_HEIGHT`다.
- **첫 줄(`TableRow`)**:
  - 행 머리: `rowSpan={n}`, 번호는 `styleIndex + 1`(스타일 단위), 굵게.
  - style 열 셀 전부: `rowSpan={n}`, 병합 셀이다. 편집 대상 줄은 `{ kind: "style", style }`이다. 내용 스크롤은 기존처럼 셀 안에서만 한다(`maxHeight`는 블럭 전체 높이).
  - option 열 셀: 첫 옵션(`options[0]`)의 값이다. 옵션이 0개면 빈 안내 줄(아래 참조)이다.
  - 액션 칸: `rowSpan={n}`, 스타일 수정·스타일 삭제 버튼만 둔다. 옵션 추가는 추가 줄로 옮긴다.
- **둘째 줄부터 옵션 줄**: option 열 셀만 그린다(style 열과 행 머리, 액션은 첫 줄 rowSpan이 차지). 편집 대상 줄은 `{ kind: "option", style, option }`이다.
- **옵션 0개일 때**: 첫 줄 option 열 자리에 `colSpan={보이는 option 열 수}` 셀 하나, 가운데 옅은 글씨 "옵션 없음".
- **추가 줄(블럭 마지막)**: option 열 자리에 `colSpan={보이는 option 열 수}` 셀 하나, 높이 `ADD_ROW_HEIGHT`. 안에 점선 테두리 버튼 `+ 옵션 추가`(ghost, text-xs)를 두고 누르면 `addOption(style)`을 부른다.
- **옵션 삭제**: 옵션 줄의 Opt 셀 오른쪽에 호버 시에만 보이는 작은 휴지통 버튼(`opacity-0 group-hover/opt:opacity-100`, `aria-label="옵션 {no} 삭제"`)을 두고 `removeOption(style, option)`을 부른다. 옵션 줄 `TableRow`에 `group/opt` 클래스를 단다. 우클릭 메뉴의 옵션 삭제는 그대로 둔다.

### 편집·우클릭
- `cellKey`는 `${줄 키}:${column.id}`를 유지한다. 줄 키는 style 셀이 `s:${reqId}`, option 셀이 `o:${optId}`다. 기존 `editCell` 비교가 그대로 동작해야 한다.
- 셀 헬퍼(`editKindOf`, `rawValue`, `commitCell`, `cellValue`)는 시그니처를 바꾸지 않는다. 셀마다 알맞은 `Line` 객체를 만들어 넘긴다.
- 우클릭: style 셀과 행 머리는 style 줄, option 셀은 option 줄로 `setRowMenu`를 연다(`TableRow`가 아니라 `TableCell`에 `onContextMenu`를 단다).

### 모양
- 블럭 경계: 블럭 마지막 줄(추가 줄) 아래 테두리를 `border-b-2 border-b-[var(--foreground)]/15`로 한다. 블럭 안 옵션 줄 사이는 `border-b border-dashed`로 구분한다.
- 스타일 병합 셀 배경은 `var(--card)`, 옵션 칸 배경은 옅게 `color-mix(in srgb, var(--muted) 25%, transparent)`, 추가 줄은 더 옅게 한다.
- 기존 스타일 줄 왼쪽 강조선(`border-l-2 border-l-[var(--primary)]`)은 행 머리 셀 왼쪽에 둔다.
- 고정 열(`FIXED_COLUMNS`)의 `sticky` 유지. rowSpan 셀에도 `sticky`와 `left`를 그대로 준다.

## 하지 말 것
- 데이터 모델(`RequestStyle`, `options`), 저장(`saveRequests`), `renumber`, `addOption`, `removeOption` 로직을 바꾸지 않는다.
- `src/data/request-template.ts`의 `TEMPLATE_COLUMNS`, 업로드·양식 내려받기를 바꾸지 않는다. 양식 열 순서가 바뀌면 기존 파일이 깨진다(CLAUDE.md).
- 사진 업로드, 열 너비 조절, 밴드 접기 저장 키를 바꾸지 않는다.
- 헤더(`TableHeader`) 구조를 바꾸지 않는다. 단 액션 머리 칸의 내용이 달라지면 그 칸만 맞춘다.
- R138 등 다른 미커밋 변경을 되돌리지 않는다.

## CLAUDE.md
"## FABRIC REQUEST" 절 41행 "행 높이 고정(스타일 112px, 옵션 40px)" 문장을 다음 내용으로 바꾼다. 스타일은 병합 블럭이다. style 열과 행 머리, 액션은 rowSpan으로 세로 병합하고, 옵션 칸만 옵션 수만큼 줄로 나눈다. 블럭은 최소 112px, 옵션 줄은 최소 40px이고 마지막에 28px "옵션 추가" 줄이 붙는다. 행 번호는 스타일 단위다. 옵션을 스타일과 분리된 행처럼 그리지 말 것.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `FabricRequest.tsx`, `CLAUDE.md`, 이 문서만 더해진다.
