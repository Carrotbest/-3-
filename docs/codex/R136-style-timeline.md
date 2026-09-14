# R136 팀 전체 스타일별 타임라인

상태: 미착수

## 요구 (사용자 결정 2026-09-14)
- DEVELOPMENT 개요 화면(`/development`)에 팀 전체 **스타일 단위** 타임라인 섹션을 풀폭으로 둔다.
- 같은 부품을 하위 화면(EU·SEASON·CORE·PROJECT) "타임라인" 탭에도 넣어 옵션 단위로 흩어진 막대를 대체한다.
- 사용자가 화면을 보고 다듬는다. 이번에는 동작하는 1차본이 목표다.

## 현재 구조
- `src/routes/Development.tsx`
  - 1348행 `Development()`: `sub`가 없으면 `DevelopmentOverview`, `workspace`면 DD MASTER, 나머지는 `DevelopmentList`.
  - `DevelopmentOverview` 708~896행. 섹션 순서: 공정별 현황(783), 개발 카테고리(799), 담당자별 현황(836~889), `CompletedSampleLibrary`(891), 다이얼로그들(893~895). `records` prop, `today`, `setSelectedRecord`가 있다.
  - `DevelopmentList` 1528~1533행 타임라인 탭: `sampleLeadTimeline(visibleRows, today)` + `LeadTimeGantt`. DD 행(옵션) 하나가 막대 하나다. 1418행 `const timeline = useMemo(...)`.
- `src/components/charts/LeadTimeGantt.tsx`: 기존 간트. 상태 색(`energyClass`), `dueLabel`, TODAY 표시 방식을 참고한다.
- `src/data/derive.ts`
  - 702행 `sampleLeadTimeline`: 시작 = `requestDate ?? receivedDate ?? (dueDate - 14일) ?? 오늘`, 끝 = 완료면 `receivedDate ?? dueDate`, 아니면 `dueDate`, 없으면 시작+14일.
  - 692~699행 `localDay`, `startOfLocalDay`, `addLocalDays`(비공개).
  - 323행 `isScheduleOpen`: `receivedDate`가 있으면 끝난 것, HOLD·보류·DROP·REJECT는 일정에서 뺀다.
- `src/data/format.ts`: `toDate`, `daysLeft`, `fmtDateFull`. `src/data/schema.ts`: `ownerDisplayName`.

## 판정 규칙 (이 규칙을 바꾸지 말 것)
- **완료 판정은 `receivedDate`다.** HOME 스케줄(`isScheduleOpen`)과 같은 기준이다. FL#이나 Status로 판정하지 않는다. FL#은 등록 번호일 뿐이라 실물이 안 온 건이 완료로 보이게 된다.
- **Status가 HOLD·보류·DROP·REJECT인 옵션은 뺀다.** 사람이 멈춘 건이다.
- **묶음 키는 `styleNo.trim()`이다.** 빈 Style No.는 뺀다. FL#으로 묶지 않는다(주간 보고와 같은 규칙).
- 옵션 상태: 완료(`receivedDate` 있음) → `done`. 아니면 `daysLeft(dueDate, today)`가 null이면 `progress`, 0보다 작으면 `late`, 3 이하면 `due`, 나머지는 `progress`.
- 스타일 상태는 옵션 중 가장 나쁜 값이다. 순서는 `late > due > progress > done`이고, 모든 옵션이 `done`일 때만 `done`이다.
- 옵션 기간은 `sampleLeadTimeline`과 같은 시작·끝 규칙이다. 단 "완료 여부"는 위 `receivedDate` 기준이다. 스타일 기간은 옵션 시작의 최솟값부터 옵션 끝의 최댓값까지다.

## 파일별 조치
| 파일 | 조치 |
|---|---|
| `src/data/derive.ts` | `sampleLeadTimeline` 바로 아래에 `export interface StyleTimelineOption { record: DevRecord; start: string; end: string; state: "progress" \| "due" \| "late" \| "done" }`, `export interface StyleTimelineRow { styleNo: string; owner: string; category: string; buyer: string; start: string; end: string; state: ...; options: StyleTimelineOption[]; doneCount: number }`, `export function styleTimeline(records: readonly DevRecord[], today = new Date()): StyleTimelineRow[]`를 더한다. `owner`, `category`, `buyer`는 옵션 중 가장 많이 나온 비어 있지 않은 값이고, 같으면 먼저 나온 값이다. 정렬은 `ownerDisplayName(owner)` ko-KR, 그다음 `start`, `styleNo` numeric 순이다. 옵션은 `start`, `opt` 순이다. `sampleLeadTimeline`은 고치지 않는다. |
| `src/components/charts/StyleTimeline.tsx` (신규) | 아래 "부품" 명세. |
| `src/routes/Development.tsx` | (1) `DevelopmentOverview`: 889행 담당자별 현황 `SectionCard` 뒤, 891행 `CompletedSampleLibrary` 앞에 `<SectionCard title="스타일 타임라인" subtitle="팀 전체 개발 스타일의 접수부터 완료·납기까지 기간입니다. 완료는 Received date 기준입니다." contentClassName="p-0"><StyleTimeline records={records} today={today} onSelect={setSelectedRecord} /></SectionCard>`를 넣는다. (2) `DevelopmentList` 1528~1533행: `LeadTimeGantt`를 `<StyleTimeline records={visibleRows} today={today} onSelect={setSelectedRecord} hideOwnerCategoryFilters />`로 바꾸고 제목을 `스타일 타임라인`으로 한다. 기존 `toolbar` 줄은 유지한다. 1418행 `timeline` useMemo와 `sampleLeadTimeline`, `LeadTimeGantt` import가 더 안 쓰이면 지운다. **파일 `LeadTimeGantt.tsx`와 함수 `sampleLeadTimeline`은 지우지 않는다.** |
| `CLAUDE.md` | "## 데이터 소스 규칙" 표에 행 하나를 더한다: `\| DEVELOPMENT 스타일 타임라인 \| DD \| Style No. 묶음, **완료=Received date**, HOLD·DROP·REJECT 제외, 스타일 상태=옵션 중 최악 \|` |

## 부품 `StyleTimeline`
Props: `{ records: readonly DevRecord[]; today: Date; onSelect: (record: DevRecord) => void; hideOwnerCategoryFilters?: boolean }`

1. **필터 줄**(부품 안, 상단 `border-b p-4`, 저장하지 않음):
   - 담당, 카테고리 Select. `hideOwnerCategoryFilters`면 숨긴다. 옵션은 행 값에서 만든다. 담당 표시는 `ownerDisplayName`.
   - 상태 칩 4개(진행·임박·지연·완료). 기본은 완료를 뺀 세 개가 켜진 상태다. 칩은 `aria-pressed` 토글이다.
   - 기간 칩 `3개월`(기본)·`6개월`·`전체`. 스타일 기간이 `[오늘 - N개월, +∞)`와 겹치는 행만 보인다.
   - 오른쪽에 요약 문구: `스타일 {n} · 옵션 {m} · 지연 {x} · 임박 {y}`(필터 적용 후).
2. **축**: 보이는 행의 최소 시작부터 최대 끝까지다. 단 기간 칩이 3개월·6개월이면 축 시작은 `max(최소 시작, 오늘 - N개월)`이다. 매월 1일마다 세로 옅은 선과 `M월` 라벨을 둔다. TODAY 표시는 `LeadTimeGantt`와 같은 방식이다. 축 밖으로 나가는 막대는 잘라서 그린다(`left` 0 미만은 0, 너비는 남은 폭까지).
3. **행 배치**: 그리드 `grid-cols-[14rem_minmax(0,1fr)]`, 최소 폭 `min-w-[64rem]`, 바깥 `overflow-x-auto`.
   - 담당이 바뀔 때마다 담당 머리 줄(`ownerDisplayName`, 스타일 수)을 둔다.
   - 스타일 줄 왼쪽 칸: 펼침 버튼(`ChevronRight`/`ChevronDown`, `aria-expanded`), Style No.(굵게), 아래 작은 글씨 `카테고리 · Buyer · 옵션 {완료}/{전체}`.
   - 스타일 막대: 상태 색 테두리와 옅은 배경이다. 색 규칙은 `LeadTimeGantt`의 테두리 규칙과 같다. 안에 완료 비율(`doneCount/options.length`) 채움이 있다. **흐르는 애니메이션은 쓰지 않는다**(행이 많다). 막대를 누르면 펼침이 토글된다. `title`에 기간과 `dueLabel` 같은 문구를 단다.
   - 펼치면 옵션 줄이 스타일 줄 아래에 들여쓰기로 붙는다. 왼쪽 칸은 `OPT {opt} · {stage}`다. 막대를 누르면 `onSelect(record)`를 부른다.
   - 펼침 상태는 `Set<string>` 로컬 state이고 저장하지 않는다.
4. **세로 길이**: 행 영역을 `max-h-[70vh] overflow-y-auto`로 감싼다. 머리(필터·축)는 스크롤 영역 밖에 둔다. **SectionCard가 뷰포트보다 길어지면 `Reveal` 임계값 때문에 영영 안 보인다**(CLAUDE.md 주의). 높이 제한으로 막는다.
5. 빈 결과: `LeadTimeGantt`의 빈 상태와 같은 모양, 문구는 "조건에 맞는 스타일이 없습니다."
6. 계산은 `useMemo(() => styleTimeline(records, today), [records, today])` 한 번, 필터는 그 결과에 건다.

## 하지 말 것
- 판정 규칙(완료=receivedDate, 제외 Status, Style No. 묶음)을 바꾸지 않는다.
- `isInProgress`, `statusOf`, `sampleLeadTimeline`, `isScheduleOpen`을 고치지 않는다. 다른 화면 숫자가 바뀐다.
- 파일을 지우지 않는다.
- 필터·펼침 상태를 localStorage에 저장하지 않는다.
- DD MASTER(`DevelopmentMasterSheet.tsx`), HOME, CALENDAR는 건드리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 `derive.ts`, `Development.tsx`, `StyleTimeline.tsx`(신규), `CLAUDE.md`, 이 문서만 더해진다. R135 미커밋 변경(`tools/backup/`, `.gitignore`, `docs/codex/R135*`)은 그대로 있어야 한다.
