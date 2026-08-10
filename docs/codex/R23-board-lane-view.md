# 작업지시 R23 — 공정 보드를 담당자 레인 + 병목 히트맵으로 재설계

작성: Claude (기획·검토) / 구현: Codex / 최종 검토: Claude
대상: `#/development/eu|season|core|project` 의 **보드 탭** (`DevelopmentList` 내 `TabsContent value="board"`)

## 배경 — 왜 바꾸나

현재 칸반의 문제를 사용자와 함께 확인했다.

1. **카드마다 5색 진행 인디케이터가 중복 정보다.** 카드가 "염색" 열에 있으면 원사·편직은 이미 끝난 것이다. 열 위치가 곧 진행도인데 색막대로 또 그려서, 42장 × 5조각 = 210개 색 조각이 화면을 덮는다.
2. **OPT가 카드를 부풀린다.** 실제 스타일 18개 → 카드 42장.
3. **급한 건이 묻힌다.** `HMP127149`는 오늘 마감인데 염색(OPT 2·4)·가공(OPT 1·3)에 흩어진 4장이 D-21짜리와 같은 무게로 보인다.

사용자가 요구한 것: **"심플하게 현황을 한눈에"**. 세 가지 안을 제시해 **B안(담당자 레인) + C안(병목 히트맵 요약 띠)** 조합으로 확정됐다.

## 맡을 파일

- `src/routes/Development.tsx` — 보드 탭 렌더 부분 교체
- `src/data/derive.ts` — 아래 헬퍼 신설
- (신규) `src/components/charts/OwnerLaneBoard.tsx` — 레인 + 히트맵 컴포넌트

## 절대 건드리지 말 것

- 목록 / 타임라인 / 완료 샘플 탭은 이번 대상이 아니다. **회귀시키지 마라.**
- HOME, `DevelopmentOverview`(`/development`)도 대상 아님.
- 상단 KPI 4카드 토글 필터(R22 요구사항 1) 동작 유지 — 레인 뷰도 `visibleRows`를 받아야 한다.
- 전역 `STAGES` 상수, `FIELDS` 17항목, 샘플대장 파서 수정 금지.
- git commit / reset / checkout 금지.
- 사용자 실제 데이터 값을 로그·문서에 남기지 마라.

## 만들 것

보드 탭 안에 **위=히트맵 요약 띠, 아래=담당자 레인** 두 블록을 세로로 쌓는다. 기존 5열 칸반 마크업은 **삭제**한다.

### 공통 데이터

- 입력은 기존 `boardRows` (= `visibleRows` 중 `stage !== "시험"`). **시험 제외 규칙 유지.**
- 공정 5단계는 기존 `BOARD_STAGES`(원사·편직·염색·가공·완료)와 `boardStagePosition()`을 그대로 재사용한다. 새로 만들지 마라.
- 담당자 행은 `MEMBERS` 순서를 기본으로 하되, `MEMBERS`에 없는 담당자가 데이터에 있으면 뒤에 덧붙인다. 건수 0인 담당자 행도 표시한다(팀 전체가 보여야 한다).
- **긴급도 등급** — 셀·점 색의 기준. 기존 `statusOf`/`daysLeft` 사용:
  - `done` → 완료(초록 `--chart-2` 계열)
  - `late` 또는 잔여 0일(오늘 마감) → 위험(`--destructive`)
  - 잔여 1~7일 → 임박(`--warning`)
  - 그 외 → 정상(`--chart-1` 계열)

### 신설 헬퍼 (`derive.ts`)

```ts
export type LaneUrgency = "normal" | "soon" | "danger" | "done"

/** 레인 셀 하나 = 같은 담당자·같은 공정에 있는 스타일 1개(OPT 묶음). */
export interface LaneStyleGroup {
  styleNo: string
  opts: string[]          // ["01","02"] 정렬
  records: DevRecord[]    // 클릭 시 상세용
  urgency: LaneUrgency
  dayOffset: number | null // 그룹 내 가장 급한 값
}

export interface LaneCell {
  stageKey: string
  groups: LaneStyleGroup[]
  count: number            // 레코드(OPT) 기준 건수 — 열 합계와 맞아야 한다
  urgency: LaneUrgency     // 그룹 중 최고 긴급도
}

export interface LaneRow {
  owner: string
  cells: LaneCell[]        // BOARD_STAGES 순서와 1:1
  total: number
}

export interface OwnerLaneBoard {
  rows: LaneRow[]
  stageTotals: number[]    // BOARD_STAGES 순서
  total: number
  /** 히트맵 농도 산출용 — 셀 count 최댓값 */
  maxCell: number
}

export function ownerLaneBoard(rows: readonly DevRecord[], today?: Date): OwnerLaneBoard
```

**정합성 필수**: `stageTotals` 합 = `total` = 입력 `boardRows.length`. 담당자 행 합계도 동일하게 맞아야 한다. (지금 칸반 열 배지 숫자와 같은 값이 나와야 한다.)

### 1) 상단 — 병목 히트맵 요약 띠

- `표` 형태. 행 = 담당자, 열 = 5공정, 우측 끝에 담당자 합계, 하단에 공정 합계 행.
- 셀 = 건수. **배경 농도는 `count / maxCell`** 로 단계화(0 / 약 / 중 / 강 4단계 정도).
- 셀에 위험 건이 포함되면 `--destructive` 톤, 임박이면 `--warning` 톤으로 **덮어쓴다**(농도보다 긴급도가 우선).
- 셀 클릭 → 아래 레인에서 해당 담당자·공정만 필터(선택 상태 토글). 선택 시 `aria-pressed`.
- 건수 0인 셀은 빈칸(배경 없음)으로 두어 시선을 뺏지 않게 한다.
- 하단에 한 줄 인사이트: 최다 담당자와 위험 건수를 문장으로. 예) `변재휘 21건 · 오늘 마감 4건`. **데이터에서 계산**하고 하드코딩하지 마라. 위험 건이 없으면 문구를 생략한다.

### 2) 하단 — 담당자 레인

- 그리드: 좌측 담당자명 열 + 5공정 열 + 우측 합계 열.
- 각 셀 안에 **스타일 그룹 칩**을 배치. 칩 하나 = 스타일 1개(OPT 묶음).
  - 칩 표시: 스타일 축약 + OPT 개수. 공간이 좁으니 기본은 **원형 점 + 숫자(OPT 수)**, hover/focus 시 툴팁으로 `Style No. · OPT 1·2 · 담당 · D-n`.
  - 점 색 = 그룹 긴급도(위 4등급).
- 칩 클릭 → 기존 상세 시트(`setSelectedRecord`). OPT가 여러 개면 **가장 급한 레코드**를 연다.
- 셀이 비면 아무것도 그리지 않는다(빈 칸 텍스트도 넣지 마라 — 42칸 중 다수가 비므로 노이즈가 된다).
- 범례 한 줄: 정상 / 임박 D-7 / 오늘·지연 / 완료 + `숫자 = OPT 수`.

### 톤앤매너

- 기존 토큰만 사용: `--chart-1~4`, `--warning`, `--destructive`, `--muted`, `--border`.
- **3D는 절제**한다. 이 화면의 목적은 "한눈에 파악"이라 칩마다 틸트를 걸면 다시 산만해진다. `Tilt3D`는 쓰지 말고, hover 시 미세한 확대/그림자 정도로만.
- `prefers-reduced-motion` 대응.
- 접근성: 표는 `<table>`+`<th scope>`로, 레인 셀은 `aria-label`에 `담당자 · 공정 · n건` 을 넣는다.

## 검증

- `npm run build` 통과.
- 레인/히트맵 합계가 **기존 칸반 열 배지 숫자와 동일**한지 확인(원사·편직·염색·가공·완료).
- 상단 KPI 카드(전체/진행/임박/지연) 토글 시 레인·히트맵도 함께 좁아지는지 확인.
- 목록·타임라인·완료 샘플 탭 회귀 없는지 확인.
- 콘솔 에러 없을 것.

## 완료 후 보고

- 무엇을 어떻게 구현했는지
- 합계 정합성 확인 결과(공정별 숫자)
- 삭제한 기존 칸반 마크업 범위
