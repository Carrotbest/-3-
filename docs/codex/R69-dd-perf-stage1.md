# R69 — DD MASTER 반응 속도 개선 1단계 (선택 이동 리렌더 제거 · 저장 지연)

상태: **미착수**. Codex가 구현한다.
선행 R65~R68은 워킹트리에 반영돼 있고 `npm run build` 통과 상태다. 미커밋. 그 위에 얹는다.

대상: `src/routes/DevelopmentMasterSheet.tsx`, `src/store/useAppStore.ts`.

**이번 작업은 기능 추가가 아니라 체감 속도 개선이다. 화면 동작과 결과는 지금과 완전히 같아야 한다.**

---

## 배경

DD MASTER는 엑셀 현황을 그대로 옮긴 화면이라 조작 반응이 엑셀만큼 즉각적이어야 한다.
현재는 두 가지 구조 때문에 느리다.

1. **셀 선택이 한 칸 움직일 때마다 표 전체가 다시 그려진다.**
   `range` 상태가 최상위 컴포넌트에 있어서, 방향키 한 번에 약 86행 × 39열(전체 64열이면 더 많음)의 모든 셀이 리렌더된다.
2. **셀 하나를 고칠 때마다 전체 레코드를 다시 계산하고 통째로 저장한다.**
   `commitRecords` → `writeDevelopmentRecords` → `recalculateDevelopmentRecords`(전 레코드 재계산) → `setAppState` → `saveCache("records", 전체배열)`.
   `saveCache`는 IndexedDB와 Firestore로 나가므로 타이핑마다 네트워크 왕복이 생긴다.

---

## 1. 행 단위 메모이제이션으로 선택 이동 리렌더 제거 (핵심)

### 목표
방향키·Shift+방향키·Tab·Enter로 선택이 움직일 때 **선택 상태가 실제로 바뀐 행만** 리렌더되게 한다.
한 칸 이동이면 이전 행과 새 행, 많아야 두세 행만 다시 그려져야 한다.

### 방법
- 현재 `filtered.map((record) => ...)` 안에 인라인으로 있는 행 렌더링을 **별도 컴포넌트 `GridRow`로 분리**하고 `React.memo`로 감싼다.
- `GridRow`에 넘기는 props는 **얕은 비교로 안정적이어야 한다.** 이게 이 작업의 전부다.
  - 인라인 화살표 함수(`onClick={() => ...}`)를 그대로 넘기면 매 렌더마다 새 함수라 memo가 무력화된다.
    부모에서 `useCallback`으로 고정하고, 행·열 식별자는 핸들러 인자나 `data-*` 속성으로 넘긴다.
  - 매 렌더마다 새로 만들어지는 객체(예: `{ inRange, isActive, top, ... }`)를 props로 넘기지 말 것.
    **행 하나의 선택 상태를 원시값 몇 개로 압축**해서 넘기는 편이 안전하다.
    예: `selLeft: number | null`, `selRight: number | null`, `selTop: boolean`, `selBottom: boolean`, `activeCol: string | null`.
    선택과 무관한 행은 이 값들이 전부 `null`/`false`라 props가 바뀌지 않아 리렌더되지 않는다.
  - `optionsById`, `colWidths`, `displayedColumns` 같은 참조는 이미 memo화돼 있는지 확인하고, 아니면 `useMemo`로 고정한다.
- 셀 내부 `GridCell`도 이미 컴포넌트이므로 필요하면 `React.memo`를 추가한다. 단 행 memo가 먼저다.

### 주의
- 선택 표시(초록 1.5px 테두리, 반투명 초록 8% 채움, 활성 셀 비움, 우하단 채우기 핸들)의 **결과 모양이 지금과 픽셀 단위로 같아야 한다.**
- 고정 열(담당·Status·Style No.)과 행 머리글도 같은 규칙으로 계속 강조돼야 한다.
- 행 머리글 다중 선택, 테두리 드래그 이동, 채우기 핸들 드래그가 그대로 동작해야 한다.

## 2. 전역 리스너 재등록 제거

- 현재 키보드·마우스 전역 `useEffect`가 **의존성 배열 없이** 매 렌더마다 리스너를 떼고 다시 단다.
- 최신 상태를 읽어야 해서 그렇게 둔 것이므로, **핸들러 본문을 `useRef`에 담아 두고 리스너는 한 번만 등록**하는 방식으로 바꾼다.
  ```
  const handlerRef = useRef(onKey)
  handlerRef.current = onKey            // 매 렌더 최신으로 교체(리렌더 유발 없음)
  useEffect(() => {
    const listener = (e: KeyboardEvent) => handlerRef.current(e)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])                                 // 등록은 1회
  ```
- 동작은 지금과 동일해야 한다.

## 3. 저장 지연 (debounce)

### 목표
편집은 화면에 즉시 반영하되, 디스크·서버 저장은 모아서 한 번에 보낸다.

### 방법 (`src/store/useAppStore.ts`)
- `writeDevelopmentRecords`를 **상태 갱신(즉시)** 과 **영속화(지연)** 로 분리한다.
  - `setAppState({ records: next })`는 지금처럼 즉시.
  - `saveCache("records", ...)`는 **마지막 편집 후 500ms 동안 추가 편집이 없을 때** 한 번만 호출한다(trailing debounce).
  - 지연 중에 편집이 더 들어오면 타이머를 다시 늘리고, **저장할 때는 항상 그 시점의 최신 `records`** 를 쓴다. 중간 스냅샷을 쌓아 두지 말 것.
- `saveDevelopmentRecord`(StatusChip 등에서 호출)도 같은 지연 경로를 타게 한다.
- **되돌리기·다시 실행도 동일하게 처리한다.**

### 데이터 유실 방지 (가장 중요)
과거 TS 실시간공유에서 데이터가 사라진 사고가 있었다. 다음을 반드시 지킬 것.
- `beforeunload`와 `visibilitychange`(hidden) 시점에 **대기 중인 저장을 즉시 flush** 한다.
- 라우트 이동·컴포넌트 언마운트 시에도 flush 한다.
- flush를 강제하는 `flushDevelopmentRecords()` 같은 함수를 export 해서 위 지점들에서 부른다.
- 저장이 실패해도 화면 상태는 유지하고, 실패를 사용자에게 알린다.
- **Firestore 문서 구조는 이번에 건드리지 않는다.** 행 단위 분할 저장은 3단계 과제로 별도다.

### 저장 상태 표시
- 스토어에 `recordsSaveState: "idle" | "pending" | "saving" | "saved" | "error"` 를 둔다.
- DD MASTER 툴바(되돌리기 버튼 근처)에 작게 표시한다.
  - `pending`/`saving` → `저장 중`
  - `saved` → `저장됨` (2초 후 사라져도 좋다)
  - `error` → `저장 실패` (눈에 띄게)
- 편집을 막지 말 것. 표시만 한다.

---

## 4. 하지 말 것

- 행 가상화(virtualization) 도입 금지. 현재 행 수에서는 효과가 없고 고정 헤더·고정 열·범위 선택을 깨뜨린다. 3단계 이후 과제다.
- Firestore 저장 구조 변경 금지.
- 되돌리기를 변경분(diff) 방식으로 바꾸는 작업 금지. 2단계 과제다.
- 기능 추가·UI 변경 금지. 저장 상태 표시만 예외다.

## 5. 지켜야 할 것 (회귀 금지)

R65~R68로 들어간 것 전부가 그대로 동작해야 한다.
행 삭제, 행 드래그 순서 이동(담당 탭에서만), 대분류 열 폭 조정, 신규 리본, 네임카드 필터,
범위 선택(드래그·Shift+클릭·Shift+Space), 초록 테두리·반투명 채움·활성 셀 비움,
표 밖 클릭 해제, 행 머리글 드래그 다중 선택, 테두리 드래그 이동(값 이동/행 재배치),
클립보드 4종과 복사한 행 삽입, 키보드 조작 전체(방향키·Shift·Tab·Enter·F2·즉시 타이핑),
Ctrl+D / Ctrl+Enter / Ctrl+H, 채우기 핸들, 열 머리글 3단 정렬,
undo/redo 50단계, 하단 빈 영역 우클릭 행 추가와 담당 귀속, 편집 시 순서 고정 규칙.

- 검증: `npm run build`(= `tsc --noEmit && vite build`) 통과.
- 커밋 금지. 실데이터·단가·협력사명을 로그·주석에 넣지 말 것(공개 저장소).
- 주석은 한국어로 **왜** 를 적는다. 기존 스타일(세미콜론 없음, 2칸 들여쓰기, 한 줄 JSX 선호)을 따른다.

## 6. 권장 순서

2절(리스너) → 1절(행 memo) → 3절(저장 지연).
2절이 가장 쉽고 1절의 노이즈를 줄여 준다. 각 절이 끝날 때마다 `npx tsc --noEmit`으로 확인한다.

## 7. 보고할 것

- 행 memo 적용 후, 방향키 한 번에 리렌더되는 행 수가 몇 개인지(가능하면 측정 근거와 함께).
- 저장 지연 적용 후, 연속 타이핑 시 `saveCache` 호출 횟수가 어떻게 줄었는지.
- 회귀 확인을 위해 사용자가 화면에서 봐야 할 항목 목록.
