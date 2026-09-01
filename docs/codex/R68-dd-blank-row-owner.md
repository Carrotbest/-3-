# R68 — DD MASTER 빈 행 추가 수정 (담당 귀속 · Status 표기 · # of Opt)

상태: **미착수**. Codex가 구현한다.
선행 R65·R66·R67은 워킹트리에 반영돼 있고 `npm run build` 통과 상태다. 미커밋. 그 위에 얹는다.

대상: `src/routes/DevelopmentMasterSheet.tsx`, `src/data/dd-workflow.ts`.

---

## 문제

사용자 보고: **담당 탭에서 행 추가를 하면 그 탭에 안 보이고 전체 탭에서만 보인다.**
이 기능은 원래 각 담당이 자기 샘플을 추가할 때 쓰는 것이다. 지금은 반대로 동작한다.

확인된 원인 3가지:

### 1) 새 행에 담당(owner)이 비어 있다
- `createEmptyGridRecord()`(`DevelopmentMasterSheet.tsx`)가 `createBlankDevRecord()`를 그대로 쓰고 `owner`는 `""`이다.
- `ordered` 계산에서 `if (owner !== ALL && record.owner !== owner) return false` 로 걸러지므로, 담당 필터가 켜진 상태에서 만든 빈 행은 그 탭에서 사라진다.

### 2) Status 칸에 "원사"가 보인다
- 빈 행은 `devStatus: ""`, `stage: ""`인데 화면에는 "원사"(= `DD_STATUS_OPTIONS` 첫 값)가 나온다.
- `StatusChip`이 값이 목록에 없으면 `""`를 Select에 넘기는데, 그 상태에서 첫 항목이 보이는 것으로 추정된다.

### 3) `# of Opt`가 5, 6, 7 … 16 처럼 매겨진다
- `recalculateDevelopmentRecords`(`dd-workflow.ts`)가 `owner::styleNo`로 묶어 순번을 준다.
- 빈 행은 owner·styleNo가 모두 비어 있어 **전부 한 그룹**이 되고, 기존 빈 행까지 합쳐 계속 번호가 올라간다.

---

## 요구사항

### A. 행 추가 시 현재 담당을 물려준다 (핵심)

- 빈 행을 만들 때 **현재 담당 필터에 선택된 담당**을 `owner`에 넣는다.
  - 담당이 선택돼 있으면(`owner !== ALL`) 그 값을 쓴다 → 그 담당 탭에 바로 보인다.
  - 전체 탭(`owner === ALL`)이면 지금처럼 빈 담당으로 둔다.
- 적용 대상은 빈 행을 만드는 **모든 경로**다.
  - 하단 빈 영역 우클릭 → `행 1개 추가` / `행 5개 추가` (`appendBlankRows`)
  - 셀 우클릭 → 위/아래 행 삽입 (`insertBlankRows`)
- 추가 직후 그 행이 화면에 보여야 한다. 담당 탭에서 추가했는데 목록에서 사라지면 안 된다.
- 추가 후 스크롤을 새 행 위치로 옮겨 눈에 보이게 한다.

### B. `insertBlankRows`도 빈 행 헬퍼를 쓰게 통일

- 현재 `insertBlankRows`는 `createBlankDevRecord()`를 쓰고 있어 `stage`·`devStatus`·`requestDate`·`opt` 기본값이 들어간다.
- `appendBlankRows`와 같이 `createEmptyGridRecord()`를 쓰도록 맞춘다. 두 경로의 결과가 같아야 한다.

### C. Status 칸을 비워 보이게

- `devStatus`·`stage`가 모두 비면 Status 칩에 **"미지정"**(또는 `—`)이 보여야 한다. `DD_STATUS_OPTIONS`의 첫 값("원사")이 보이면 안 된다.
- `ddStatusStyle("")`은 이미 `label: "미지정"`을 돌려주므로, `StatusChip` 쪽에서 빈 값일 때 placeholder가 제대로 나오도록 고친다.
- 사용자가 드롭다운에서 값을 고르면 지금처럼 즉시 저장되는 동작은 유지한다.

### D. `# of Opt`는 Style No.가 있을 때만 매긴다

- `recalculateDevelopmentRecords`에서 **`styleNo`가 비어 있는 레코드는 그룹 순번 계산에서 제외**한다.
- 그런 레코드는 `opt`와 `optionProgress`를 빈 문자열로 둔다.
- Style No.를 입력하면 그때부터 정상적으로 순번이 매겨져야 한다.
- 이 함수는 다른 화면도 함께 쓰므로, **styleNo가 있는 기존 레코드의 계산 결과는 지금과 완전히 동일해야 한다.** 회귀 없도록 주의할 것.

---

## 지켜야 할 것

- R65·R66·R67 기능 회귀 금지: 클립보드 4종, 복사한 행 삽입, 키보드 조작, undo/redo 50단계, 열 정렬 3단 토글, 채우기 핸들, Ctrl+D/Ctrl+Enter/Ctrl+H, 초록 선택 테두리·반투명 채움, 표 밖 클릭 해제, 행 머리글 드래그 다중 선택, 테두리 드래그 이동(셀 값 이동 / 행 재배치), 하단 빈 영역 우클릭 메뉴, 담당 필터별 부분 재배치가 다른 담당 자리를 보존하는 로직.
- 빈 행 추가·삽입은 전부 되돌리기(Ctrl+Z) 대상으로 유지한다.
- 편집 시 순서 고정 규칙(`commitRecords` → `rankOf`) 유지.
- 검증: `npm run build`(= `tsc --noEmit && vite build`) 통과.
- 커밋 금지. 실데이터·단가·협력사명을 로그·주석에 넣지 말 것(공개 저장소).
- 주석은 한국어로 **왜** 를 적는다. 기존 스타일(세미콜론 없음, 2칸 들여쓰기, 한 줄 JSX 선호)을 따른다.

## 확인 시나리오

1. 담당 탭(예: 변재휘)을 고른다.
2. 표 하단 빈 영역에서 우클릭 → `행 5개 추가`.
3. **그 담당 탭에 빈 행 5개가 바로 보여야 한다.** 담당 칸에는 변재휘가 들어가 있다.
4. Status 칸은 "원사"가 아니라 미지정으로 비어 보인다.
5. `# of Opt` 칸도 비어 있다. Style No.를 입력하면 그때 순번이 생긴다.
6. Ctrl+Z 로 5개 행이 사라진다.
7. 전체 탭으로 돌아가도 그 5개 행이 보인다(담당이 변재휘로 찍힌 채).
8. 셀 우클릭 → 위/아래 행 삽입도 같은 결과여야 한다.
