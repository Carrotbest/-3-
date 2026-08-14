# R40 — DD MASTER 그리드 UX: 날짜 캘린더 팝오버 · 셀 십자 하이라이트 · Status DROP · 담당열 가운데 · 업로드 버튼 이동

대상: 주로 `src/routes/DevelopmentMasterSheet.tsx`, 일부 `src/routes/Development.tsx`(업로드 버튼 이동). 기존 라우팅·데이터 로직 유지.

의존성 참고: `radix-ui`(1.6.7) 설치됨 → Radix **Popover** 사용 가능(포털 렌더·앵커 위치·바깥클릭/Esc 처리 내장). 날짜 라이브러리는 없으므로 소형 월 캘린더는 직접 그린다.

---

## Task 1 — 날짜 입력을 "소형 캘린더 팝오버"로 (모든 날짜 입력부)
현재 날짜 편집은 네이티브 `<input type="date">`다: 인라인(`InlineEditor`의 `column.date`, ~376행)와 에디터 모달(`DateInput` → `EditorField`의 `column.date`, ~324/341행). **"날짜가 입력되는 모든 부분"**을 셀/필드 위치에 뜨는 **소형 커스텀 캘린더 팝오버**로 바꾼다.

### 신규 컴포넌트 `DatePickerPopover`
- Radix `Popover`(`radix-ui`에서 import)로 구현. `Popover.Portal`로 렌더해 **그리드 `overflow-auto`에 잘리지 않게** 한다. `Popover.Content`는 앵커(트리거) 기준 하단 정렬, `sideOffset` 소량, z-index는 팝업보다 위.
- 내용: **소형 월 그리드**(일~토 또는 월~일 헤더 7열, 해당 월 날짜 버튼), 상단에 ‹ 이전달 / 현재 YYYY.MM / › 다음달, 하단에 "오늘"·"지우기(비우기)" 작은 버튼.
- 선택 시 `onChange("YYYY-MM-DD")` 호출 후 팝오버 닫힘. "지우기"는 빈 문자열 커밋. 현재 값이 있으면 그 달을 초기 표시하고 해당 날짜를 강조.
- 날짜 파싱/포맷은 기존 유틸(`toDate`, `fmtDate`/`dateText` 등) 재사용, **하루 밀림 방지**(로컬 기준 YYYY-MM-DD 생성). Tailwind 토큰(`--card`,`--border`,`--foreground`,`--muted`,`--ring`)로 스타일, 컴팩트(셀 28px 내외, text-xs).
- 접근성: 트리거 `aria-label`, 날짜 버튼 `aria-label`(YYYY-MM-DD), Esc 닫힘(Radix 기본).

### 적용
- **인라인 그리드 날짜 셀**: `InlineEditor`의 `column.date` 분기를 `<input type=date>` 대신, 셀이 편집상태가 되면 `DatePickerPopover`를 **기본 open**으로 띄운다(더블클릭 → editCell 설정 → 팝오버 자동 오픈). 선택/취소 시 `onCommit`/`onCancel`. 트리거 앵커는 해당 셀.
- **에디터 모달 날짜 필드**: `DateInput`을 `DatePickerPopover` 기반으로 교체(달력 아이콘 버튼 클릭 시 팝오버, 값 표시는 `YYYY-MM-DD` 텍스트/인풋). 기존 `showPicker` 네이티브 호출은 제거.
- 두 곳이 동일 컴포넌트를 공유하도록 한다.

> 핵심: 네이티브 데이트피커 제거, 어느 화면에서든 **셀/필드 위치에 작은 달력**이 떠서 클릭으로 날짜 선택.

---

## Task 2 — 엑셀식 "십자(행+열) 포커스" 하이라이트
셀을 **클릭(단일)** 하면 그 셀이 속한 **행 전체 + 열 전체**를 은은히 강조하고, 선택 셀엔 더 진한 링/보더를 줘 시인성을 높인다(엑셀 선택 느낌). 더블클릭은 기존대로 편집.

- 상태 신설: `const [selected, setSelected] = useState<{ row: string; col: string } | null>(null)` (편집용 `editCell`과 별개).
- 셀 클릭 시 `setSelected({ row: rowId, col: column.id })`. (담당 칸의 ⤢ 편집버튼 클릭은 `stopPropagation` 유지해 선택과 충돌 방지.)
- 렌더 시 각 셀에 대해: `rowSel = selected?.row===rowId`, `colSel = selected?.col===column.id`, `cellSel = rowSel && colSel`.
  - `rowSel || colSel` → 은은한 배경 틴트(예: `bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]`).
  - `cellSel` → 안쪽 링(예: `ring-2 ring-inset ring-[var(--ring)]`) 또는 진한 보더로 셀 특정.
  - **고정(sticky) PINNED 셀**은 현재 `bg-inherit`라 틴트가 안 보일 수 있으니, 하이라이트 시 명시적 배경을 적용(스티키 셀도 행/열 하이라이트가 보이도록).
  - 헤더(열 헤더)와 선택 열/행 교차 부분도 살짝 강조하면 좋음(선택 열 헤더 틴트 — 선택 사항).
- 성능: 단순 조건부 className으로 처리(행 수가 많아도 CSS 조건만). 기존 hover 배경과 공존.
- 선택은 유지(다른 셀 클릭 시 이동), Esc로 선택 해제(선택 사항).

---

## Task 3 — Status에 DROP 노출 확인/보강
`DD_STATUS_OPTIONS`에 이미 `DROP`(및 REJECT)이 있고 색 스타일(`DD_STATUS_STYLE.DROP`)도 있음. 인라인 `StatusChip` 드롭다운(`DD_STATUS_OPTIONS` 순회, ~362행)에도 이미 노출됨.
- **확인**: 인라인 Status 칩 드롭다운에서 DROP 선택 가능해야 함(이미 그러함 — 회귀만 방지).
- **보강(선택)**: 필터 Status Select(`statusOptions`는 데이터 distinct 기반이라 데이터에 DROP이 없으면 목록에 안 뜸)를 `DD_STATUS_OPTIONS`와 **합집합**으로 만들어, 데이터에 없어도 DROP/REJECT 등 정규 상태를 필터에서 고를 수 있게 한다.

---

## Task 4 — 고정 핵심 "담당(owner)" 열 가운데 정렬
- 열 헤더 `담당`(PINNED_COLUMNS의 owner, ~638행 th)와 데이터 셀(~658행)을 **가운데 정렬**.
- 셀에는 ⤢ 전체수정 아이콘 버튼이 있으므로, **텍스트는 중앙**에 두고 아이콘은 깨지지 않게: 셀을 `relative`로 두고 값은 `justify-center`/`text-center`, ⤢ 버튼은 `absolute right-1`(hover 시 노출) 배치. 아이콘 기능/`openEditor` 유지.

---

## Task 5 — DD/샘플대장 업로드 버튼을 필터행 우측으로 이동(빈 줄 제거)
`Development.tsx`의 `DevelopmentMasterPage`(~1060행)의 `PageHeader`는 **업로드 버튼만** 렌더하는 빈 여백 큰 줄이다(제목/부제는 컴포넌트가 무시하고 Topbar가 이미 표시). 이 줄을 제거하고 버튼을 시트 필터행으로 내린다.
- `DevelopmentMasterPage`에서 `<PageHeader ... />` **제거**(그리고 남은 `<section>`의 상단 여백 `pt-4`는 `pt-2` 정도로 축소 가능).
- `DevelopmentMasterSheet` 필터행(~616~624행) **오른쪽 끝**에 두 개의 `DataUpload`(DD 업로드 / 샘플대장 업로드) 추가. import 필요: `DataUpload`, `ingestDevelopment`, `ingestSamples`(overview와 동일 kind `development-dd`/`development-samples`, `compact`).
- 배치: 필터행 우측에 `[행수 + 상태 범례]` 다음(왼쪽으로 조금 당김) → **맨 우측에 업로드 버튼 2개**. 즉 `ml-auto`를 업로드 버튼 그룹에 주고, 행수·범례는 그 왼쪽에 둔다. 좁은 폭에서는 wrap 허용.

---

## 검증 · 금지사항
- `npm run build`(`tsc --noEmit && vite build`) **무오류**, 콘솔 에러 0(하드 리로드 후 확인).
- 기능 회귀 금지: 인라인 편집(모든 컬럼 타입)·저장, 신규 작지 접수, 프리셋, 그룹 토글, 필터·초기화, 행수/범례, 전체수정 모달, 업로드 동작.
- **날짜 팝오버가 그리드 `overflow-auto`에 잘리지 않을 것**(포털 확인). 십자 하이라이트가 sticky 고정열에서도 보일 것.
- 전역 토큰·다른 라우트·store·derive·컬럼 정의 로직 변경 금지(위 명시분 외).
- git 커밋·푸시 금지. 실데이터/캐시 로그 금지.
- 결과 요약을 `.codex-runs/R40-last.txt`에 남기고 변경 파일·캘린더 팝오버 구현 방식·십자 하이라이트 접근·잔여 이슈를 기록.
