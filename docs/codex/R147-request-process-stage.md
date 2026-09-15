# R147 FABRIC REQUEST 공정 단계 열과 Link 열 분리

상태: 미착수

## 목적

FABRIC REQUEST 옵션 줄 끝의 "DD 상태" 열(`ddStatus`) 하나를 두 열로 나눈다.

1. **공정** 열(`ddStage`): 연결된 DD 행의 현재 공정 단계를 한 단어로 보인다. 단계별 색(빨강에서 초록까지 자동 그라데이션)과 채움 효과를 준다. 누르면 전체 공정을 위에서 아래로 내려오는 팝업을 띄우고 현재 위치를 강조한다.
2. **Link** 열(`ddLink`): 연결 여부만 보인다. 누르면 지금처럼 DD MASTER `?focus=rowId`로 넘어간다(기존 기능 유지).

**모든 단계 이름과 상태 문구는 한글이다.** 사용자가 영어 표기(HOLD, DROP, REJECT)를 한글로 바꿔 달라고 했다. 예외는 팀 용어인 약어 YDS, FDS, FL뿐이다.

## 확인한 사실(좌표)

- 현재 열 정의: `src/routes/FabricRequest.tsx` 89행 `{ id: "ddStatus", label: "DD 상태", width: 170, scope: "option" }`
- 현재 칩 렌더: 같은 파일 657~679행 `DD_TONE_CLASS`, `renderDdStatus(option)`. 클릭 시 `navigate(\`/development/workspace?focus=${rowId}\`)`, FL#은 `/fabric/:key`, 겹친 연결은 `+n`
- 복사 값: 같은 파일 1088행 근처 `rawValue`의 `if (columnId === "ddStatus")`
- 셀 렌더 분기: 같은 파일 1320행 근처 `if (column.id === "ddStatus") return renderDdStatus(option)`
- 행 머리 `DD n/m` 집계: 같은 파일 1624행 근처 `requestDdStatus(ddByLine, option)`. **그대로 둔다.**
- 연결 계산: `src/data/request-link.ts` 268행 `requestDdStatus(byLine, option, today)`. 대표 행 선택 규칙(유효 FL# 우선, 다음 Received date, 다음 첫 행)을 공정 단계도 **같은 대표 행**으로 쓴다.
- DD 필드
  - 접수일 `record.requestDate`
  - 공정일 `record.tech?.processDates?.{yarn, knitting, dyeing, finishing}`(미래 날짜가 먼저 들어오는 경우가 있다. 오늘 이후면 예정이다)
  - 원단 수취 `record.receivedDate`
  - YDS, FDS `record.tech?.sampleDates?.{yds, fds}`
  - FL 완료 `isCompletedFlNo(record.flNo)` (`src/data/dd-workflow.ts`)
  - GD 여부 `isGdRecord(record)` (`src/data/dd-workflow.ts`, DD MASTER가 이미 import해서 씀)
  - 날짜 해석은 `request-link.ts`가 쓰는 것과 같은 `toDate`를 import 한다.
- 순서 근거: FDS/YDS 요청은 "Received date가 있는 건"만 따라간다(원단 수취 뒤에 YDS, FDS). FL 등록은 FDS 뒤다. 국내(GD 아님)는 YDS 공정이 없다(창고 입고대기 판정 규칙).

## 단계 모델 (새 파일 `src/data/request-process-stage.ts`)

```ts
export type ProcessStepKey = "intake" | "yarn" | "knitting" | "dyeing" | "finishing" | "received" | "yds" | "fds" | "fl"
export interface ProcessStep {
  key: ProcessStepKey
  label: string            // 한 단어 한글(약어 예외)
  date?: string            // 표시용 M/D. 없으면 undefined
  state: "done" | "current" | "planned" | "todo"
  color: string            // CSS 색. 단계 위치로 계산
}
export interface ProcessStage {
  linked: boolean
  steps: ProcessStep[]      // 미연결이면 GD 기준 전체 단계를 todo로
  currentIndex: number      // 미연결이면 -1
  label: string             // 칩 문구
  color: string             // 현재 단계 색. 미연결은 "var(--muted-foreground)"
  halted?: "보류" | "드롭" | "반려"
  record?: DevRecord
}
export function requestProcessStage(byLine: Map<string, DevRecord[]>, option: RequestOption, today = new Date()): ProcessStage
```

단계와 라벨(위에서 아래 순서):

| key | label | 도달 판정 |
|---|---|---|
| intake | 접수 | DD 행이 있으면 항상 도달 |
| yarn | 원사 | `processDates.yarn` 날짜가 오늘 이하 |
| knitting | 편직 | `processDates.knitting` 오늘 이하 |
| dyeing | 염색 | `processDates.dyeing` 오늘 이하 |
| finishing | 가공 | `processDates.finishing` 오늘 이하 |
| received | 수취 | `receivedDate` 날짜가 있음 |
| yds | YDS | `sampleDates.yds` 날짜가 있음. **GD 행만 이 단계를 둔다** |
| fds | FDS | `sampleDates.fds` 날짜가 있음 |
| fl | FL완료 | `isCompletedFlNo(flNo)` |

- GD는 9단계, 국내는 `yds`를 뺀 8단계다. 색과 채움 비율은 **그 행의 단계 수**로 나눈다.
- **도달은 단조롭게 본다.** 뒤 단계가 도달했으면 앞 단계는 날짜가 비어도 done이다(예: FL#만 있고 공정일이 빈 옛 행은 전부 done, 현재 FL완료).
- `currentIndex` = 도달한 단계 중 가장 뒤 인덱스. 0 이상이면 그 단계 state는 `current`, 앞은 `done`.
- 현재 뒤 단계에 오늘 이후 날짜가 있으면 `planned`(팝업에 "예정 M/D"), 나머지는 `todo`.
- 칩 `label`은 현재 단계 label 그대로다.
- Status 정지: `devStatus`를 공백 제거, 대문자로 비교해 `HOLD` 또는 `보류`면 `halted: "보류"`, `DROP`이면 `"드롭"`, `REJECT`면 `"반려"`. 이때 칩 label은 halted 값이고, steps와 currentIndex는 멈춘 위치를 그대로 계산한다.
- 미연결(`byLine`에 행 없음): `linked: false`, `label: "대기"`, `currentIndex: -1`.

### 색 계산

- 인덱스 i, 단계 수 n일 때 `hue = Math.round(4 + (132 - 4) * i / (n - 1))`, 색은 `hsl(${hue} 72% 44%)`. 0이 빨강, 끝이 초록이다. 사이는 주황, 노랑 계열로 자연히 이어진다.
- halted면 칩 색은 `보류`는 `var(--warning)`, `드롭`과 `반려`는 `var(--muted-foreground)`.

## 공정 칩 (새 파일 `src/components/request/ProcessStageChip.tsx`)

- props: `stage: ProcessStage`, `onOpen: () => void`
- 칸을 꽉 채우는 가로 막대 버튼(높이 20px, rounded-full, overflow-hidden, relative).
  - 바탕: `var(--muted)`
  - 채움 층: 너비 `(currentIndex + 1) / steps.length * 100%`, 배경 `color-mix(in srgb, ${color} 34%, transparent)`, 오른쪽 끝 2px 실선 `color`. 마운트 때 너비 0에서 목표까지 700ms `cubic-bezier(0.22,1,0.36,1)`로 차오른다(`@keyframes` 또는 transform scaleX, origin-left). `motion-reduce`면 애니메이션 없음.
  - 글자: 가운데, 10~11px, font-medium, `var(--foreground)`. 앞에 지름 6px 점을 `color`로.
  - halted면 채움 층 색을 halted 색으로, 드롭과 반려는 글자에 line-through.
  - 미연결이면 채움 없이 muted 글자 "대기", 버튼 비활성(누를 수 없음).
- `title`에 "공정 {label} · {i+1}/{n}"을 넣지 말고 "공정 {label}, {i+1}단계 중 {n}" 대신 **"{i+1}/{n}단계 {label}"** 로 적는다(가운뎃점 금지 규칙).
- `onMouseDown`, `onDoubleClick`에서 `stopPropagation` 하고 `onClick`에서 `stopPropagation` 후 `onOpen()`. 셀 선택과 편집으로 번지지 않게 한다(기존 `renderDdStatus`와 같은 방식).

## 공정 팝업 (새 파일 `src/components/request/ProcessStageDialog.tsx`)

- props: `open`, `onOpenChange`, `stage: ProcessStage | null`, `title: string`(Garment No. + " Opt " + 옵션 번호), `onOpenDd: () => void`
- `@/components/ui/dialog`의 `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter`를 쓴다. 폭 `max-w-sm`.
- 머리: 제목, 설명에 "현재 {label}, {i+1}/{n}단계". halted면 제목 옆에 halted 배지.
- 본문: 단계를 위에서 아래로 세로 나열한다.
  - 각 줄: 왼쪽 원형 노드(지름 22px), 오른쪽 단계 이름과 날짜.
    - done: 노드 배경 단계 색, 흰 `Check` 아이콘(lucide), 이름 기본색, 날짜 muted.
    - current: 노드 배경 단계 색 + 바깥 링 `box-shadow 0 0 0 4px color-mix(단계색 25%)`, 노드 뒤에 같은 색 `animate-ping` 원(motion-reduce면 끔). 줄 전체를 `color-mix(단계색 10%, transparent)` 배경 카드로 강조하고 이름 font-semibold, 오른쪽에 "현재" 작은 배지.
    - planned: 노드 테두리 점선 단계색, 이름 muted, 날짜 "예정 M/D".
    - todo: 노드 테두리 `var(--border)`, 이름 muted.
  - 줄과 줄 사이: 노드 중심 아래로 세로 연결선(높이 14px, 2px). 연결선 아래 끝에 lucide `ChevronDown`(12px). 다음 단계가 done이나 current면 선과 화살표를 다음 단계 색으로, 아니면 `var(--border)`.
  - 줄이 차례로 나타나는 짧은 등장 효과(줄마다 40ms 지연, opacity와 translateY 4px). motion-reduce면 끔.
- 발: "DD MASTER에서 열기" 버튼(`onOpenDd`), "닫기".
- 미연결 stage로는 열리지 않는다(칩이 비활성).

## FabricRequest.tsx 조치

| 위치 | 조치 |
|---|---|
| 89행 열 정의 | `ddStatus` 한 줄을 `{ id: "ddStage", label: "공정", width: 96, scope: "option", align: "center" }`, `{ id: "ddLink", label: "Link", width: 150, scope: "option" }` 두 줄로 바꾼다. 위 주석(보기 전용, 요청 데이터와 엑셀 양식에 없음)은 두 열에 맞게 고친다 |
| 657~679행 | `renderDdStatus`를 `renderDdLink(option)`로 바꾼다. 연결됐으면 칩 문구는 `"연결"`(FL 완료면 톤 `done`, 아니면 `progress`, halted면 `hold` 또는 `drop` 톤), 미연결은 `"미연결"`. 칩 클릭은 기존과 같이 DD MASTER focus, FL# 버튼과 `+n`은 그대로 둔다 |
| 같은 곳에 추가 | `const [stageTarget, setStageTarget] = useState<{ stage: ProcessStage; title: string; rowId?: string } | null>(null)`와 `renderDdStage(line)` : `requestProcessStage(ddByLine, option)`로 `ProcessStageChip`을 그리고 `onOpen`에서 stageTarget을 채운다. title은 `${style.garmentNo || "스타일"} Opt ${option.no}` |
| rawValue 1088행 근처 | `ddStage`면 halted 또는 현재 label, 미연결은 ""; `ddLink`면 기존 규칙(`[연결 문구, flNo]`를 공백으로 잇기), 미연결은 "" |
| 셀 렌더 1320행 근처 | `ddStage`면 `renderDdStage`, `ddLink`면 `renderDdLink` |
| 컴포넌트 끝 JSX | `ProcessStageDialog`를 한 번 렌더한다. `onOpenDd`는 `stageTarget.rowId`로 `/development/workspace?focus=`로 이동하고 팝업을 닫는다. rowId는 `requestDdStatus(ddByLine, option).rowId`를 쓴다 |
| 1624행 근처 `DD n/m` | 바꾸지 않는다 |

`editKindOf`는 두 열 모두 `null`이어야 한다(보기 전용). 지금 `ddStatus`가 편집 목록에 없으니 새 id도 넣지 않는다.

## 하지 말 것

- `requestDdStatus`의 대표 행 선택과 판정 순서를 바꾸지 마라. 행 머리 `DD n/m`과 DD MASTER 이동이 그 함수를 쓴다.
- 요청 데이터(`RequestOption`)나 엑셀 양식(`request-template.ts`)에 공정 값을 저장하거나 열을 더하지 마라. 매번 DD 행에서 계산하는 보기 전용 열이다.
- 화면 문구에 `→ · — ⇒ ↔` 문자를 쓰지 마라(문서 표기 규칙). 흐름 표시는 아이콘(`ChevronDown`)으로만 한다.
- 행이나 셀에 transform을 걸지 마라(sticky 깨짐). 애니메이션은 칩과 팝업 안쪽 요소에만.
- `ref` 콜백 안에서 setState 하지 마라(무한 렌더 전례 R119).

## 검증

- `npm run build`가 `✓ built`로 끝나면 된다. 화면 확인은 클로드가 사용자에게 요청한다.
