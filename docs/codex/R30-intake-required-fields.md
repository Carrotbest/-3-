# R30 — 신규 작지 접수: 필수 입력 항목 별표 + 미입력 시 저장 차단

## 배경
`신규 작지 접수` 팝업(`src/routes/DevelopmentMasterSheet.tsx`)은 이미 구현돼 있다. 상태·핸들러:
- `intake: DevRecord[] | null` (옵션별 레코드 배열), `intakeOpt`, `sharedDraft = intake[0]`, `optionDraft = intake[intakeOpt]`.
- 공통(REQUEST·ORIGINAL·담당·Style)은 `changeShared`, 옵션별(DETAIL·SCHEDULE)은 `changeOption`.
- 저장 = `saveIntake()` (footer의 `작지 접수 등록` 버튼).
- 필드 렌더는 `EditorField`(라벨=`<Label>{column.label}</Label>`), 그룹은 `EditorGroup`(→ `SubCard`/`EditorField`).

작지에서 자동으로 안 들어오는 **보완 입력 항목**을 사용자가 빠뜨리고 저장하는 걸 막아야 한다.

## 필수 항목(초기값 — 쉽게 조정 가능하게 상수로)
공통 필수 6개:
```
const INTAKE_REQUIRED_IDS = new Set(["owner", "styleNo", "season", "category", "buyer", "planner"])
```
(GD#/SA# = `developmentNo`는 지금은 필수 아님. 나중에 이 Set에 넣기만 하면 되도록 둔다.)

## 구현
1. **`MasterColumn` / `EditorField` / `EditorGroup` / `SubCard`에 `requiredIds?: ReadonlySet<string>` prop을 옵션으로 추가**해 접수 팝업에서만 내려준다(수정 모달에는 넘기지 않음 → 별표 안 뜸).
   - `EditorField`: 라벨 뒤에 `{requiredIds?.has(column.id) ? <span className="text-[var(--destructive)]"> *</span> : null}`.
   - 값이 비었고 required면 입력/셀렉트 트리거에 붉은 링 추가: 예) `ring-1 ring-[var(--destructive)]` (기존 스타일 유지하며 조건부 병합).
   - `EditorGroup`은 받은 `requiredIds`를 `SubCard`·`EditorField`로 그대로 전달.

2. **접수 팝업의 공통 EditorGroup 3개(담당·Style / REQUEST / ORIGINAL)에만 `requiredIds={INTAKE_REQUIRED_IDS}` 전달.** 옵션별 그룹(DETAIL·SCHEDULE)과 수정 모달의 EditorGroup에는 전달하지 않는다.

3. **저장 차단** — `saveIntake()` 시작에서 검증:
   - `const missing = [...INTAKE_REQUIRED_IDS].filter((id) => !String(fieldValueOf(sharedDraft, id)).trim())`
     - 값 조회는 해당 컬럼의 `value(record, null)`를 재사용한다(각 id에 대응하는 MasterColumn을 `[...INTAKE_CORE, ...INTAKE_REQUEST, ...INTAKE_ORIGINAL]`에서 찾아 `column.value(sharedDraft, null)`).
   - `missing.length > 0`이면: 저장하지 말고 `intakeError` 상태(신규 `useState<string|null>`)에 누락 항목 라벨을 세팅하고 return.
   - 성공 시 `intakeError`를 null로.

4. **누락 안내 표시** — 접수 팝업 footer(또는 그 위)에 `intakeError`가 있으면 붉은 문구로 표시:
   `필수 항목을 입력하세요: 담당 · Category · Buyer …` (누락된 컬럼 `label` 조인).
   - `작지 접수 등록` 버튼은 비활성화하지 말 것(클릭하면 어디가 비었는지 알려주는 방식이 더 친절). 대신 버튼 옆/위에 안내.

5. 팝업을 닫거나(`closeIntake`) 새로 열 때(`openNew`, `onAttachFile` 성공 시) `intakeError`를 null로 초기화.

## 검증
- `신규 작지 접수` → 아무것도 안 넣고 `작지 접수 등록` → 저장 안 되고 누락 6개 안내.
- 공통 6개 채우면 저장되어 옵션 수만큼 행 등록.
- 공통 라벨에 별표(*) 표시, 옵션별(DETAIL·SCHEDULE) 라벨엔 없음.
- 전체 항목 수정(64열) 모달 라벨엔 별표가 뜨지 않음.
- `npm run build` 통과.

## 절대 금지
- 수정(64열) 모달·그리드 인라인 편집·현황판 로직 회귀 금지.
- 옵션 공통/옵션별 필드 구분(`changeShared`/`changeOption`) 변경 금지.
- 작지 파서(`src/data/zaji.ts`)·저장 로직(`saveDevelopmentRecord`) 변경 금지.
- git commit/reset/checkout 금지. 실제 데이터 값을 로그·문서에 남기지 말 것.
