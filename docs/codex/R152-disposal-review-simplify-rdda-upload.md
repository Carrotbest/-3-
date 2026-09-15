# R152 폐기 라운드 검토 화면 단순화와 RDDA 파일 올리기

상태: 미착수. R151(폐기 라운드 3팀 검토 단계) 구현, 검증 완료 위에서 고친다. 창고팀 작업 목록과 원장 폐기 반영은 R153으로 미룬다.

## 사용자 요청(그대로 반영)

1. 1팀, 3팀 판단 구분 없이 **보관과 폐기로만** 나눈다. **기본은 모두 폐기**이고 보관을 고른다. 보관은 **초록색 채움 효과**.
2. 미팅과 픽업은 **한 칸에 `미팅/픽업`(슬래시)으로** 적는다.
3. swatch 10 미만 열 제목을 **Cutting**으로 바꾼다. **폐기일 때만 활성**, 보관이면 체크박스를 비활성으로 보인다.
4. **최종 열 삭제.** 메모는 유지.
5. 표 왼쪽 열에서 **Style No. 삭제**, 그 자리에 **Requester, Developer, Yarn Detail, Cons.** 순으로.
6. **RDDA 활용(미팅, 픽업)은 RDDA 라이브러리 엑셀을 올려 FL로 매칭해 채운다.** 라운드마다 올릴 수 있다.
7. **1팀이 고른 보관 원단 목록(RDDA 목록 양식)을 올리면 FL로 매칭해 자동으로 보관을 고른다.**

## 올릴 파일 형식(실제 파일로 확인)

### RDDA 라이브러리 목록 (`FabricLibraryList*.xlsx`)

- 시트 1개 `Sheet1`, 1행이 머리, 2행부터 데이터(확인한 파일 2,219행).
- 머리 19열: `FL NO`, `Fabric Source`, `Supplier`, `Org. Fabric No`, `Construction`, `Content`, `Width`, `Weight`, `Price`, `C/O`, `Product Status`, `In Charge`, `FA Code`, `Fabric Description`, `Creation`, `Last Update`, `Meeting Count`, `Pickup Count`, `Adopt Count`
- **쓰는 열은 `FL NO`, `Meeting Count`, `Pickup Count` 세 개뿐이다.** Price, Supplier 등 나머지는 읽지도 저장하지도 마라(단가, 협력사 민감 정보).
- 값 예: FL 번호(`FL` + 8자리), 미팅 수와 픽업 수는 0 이상의 정수

### RDDA 목록 내보내기 (보관 목록, `*.xls`)

- 옛 BIFF `.xls`(OLE 서명 `D0 CF 11 E0`). SheetJS `XLSX.read(buffer, { type: "array" })`로 읽힌다.
- 시트 `Page 1`, 1행이 머리, 확인한 파일 115행, FL은 모두 유효하고 중복 없음.
- 머리 20열: `No.`, `Ref. No`, `Fabric Source`, `Supplier`, `Org. Fabric No(R&D CODE)`, `Construction`, `Content`, `Width\n(INCH)`, `Weight\n(G/M2)`, `Price\n($/YD)`, `Price\n($/LB)`, `Finish`, `Special Yarn`, `Yarn Detail`, `Comment`, `Remark`, `Fabric CO`, `Brand`, `Hanger Number`, `Brand Protection`
- **FL#는 `Ref. No` 열이다.** 쓰는 것은 이 열뿐이다.

## 현재 코드 좌표

- `src/data/schema.ts` 514~568행: `DISPOSAL_DECISIONS`, `DisposalItem`(firstPass, teamKeep, meeting, pickup, swatchLow, decision, memo 등), `DisposalRound`
- `src/data/disposal-round.ts`
  - 21~51행 `buildDisposalItems`(items에 styleNo, buyer, rackNo 복사)
  - 53행 `isActiveItem`, 55~62행 `suggestDecision`, `effectiveDecision`
  - 64~86행 `DisposalSummary`(undecided 포함), `disposalSummary`
  - 88~111행 `DisposalMarkTarget`, `applyListMarks`
  - 113~122행 `lastRoundDecision`
  - 124~148행 `buildDisposalWorkbook`(rdda 열: R&D No., FL#, Style No., Buyer, Rack No. / final: effectiveDecision 기준)
- `src/components/warehouse/DisposalRoundPanel.tsx`
  - 23~25행 `filters`(전체, 미정, keeping, 폐기, 컷팅, 제외), `markTargets`
  - 44행 `localNumbers`(meeting, pickup 두 칸 로컬 입력)
  - 75~81행 `visibleItems` 필터와 검색(styleNo 포함)
  - 83~99행 `commitNumber`, `changeDecision`, `handleKeys`(K keeping, D 폐기, C 컷팅, Backspace 해제)
  - 111행 왼쪽 목록 요약(`미정` 포함), 118행 요약 칩, 119행 버튼 줄, 120행 필터와 검색 placeholder
  - 122행 표 머리 13열, 125~134행 줄 렌더(1팀 판단 Toggle, 3팀 보관 체크, 미팅, 픽업 입력, swatch 체크, 최종 Toggle, 메모)
  - 139행 목록 붙여넣기 창, 147~149행 `Toggle`
- `src/data/fabric-ledger.ts` `FabricLedgerItem`: `planner`(창고 표 라벨 Requester), `owner`(Developer), `construction`, `fields.yarnDetail`(FABRIC_FIELD_IDS에 있음)
- 엑셀 읽기 예: `src/data/request-template.ts`의 `import * as XLSX from "xlsx"`, 화면에서 `XLSX.read(await file.arrayBuffer(), { type: "array" })`

## 1. 데이터 (`schema.ts`)

`DisposalItem`에 더한다.

```ts
  /** 보관 여부. 없으면 폐기(기본). R151 옛 값은 isKept가 읽는다. */
  keep?: boolean
  /** 라운드를 만들 때 원장에서 복사한다. 옛 라운드에는 없으니 화면이 원장에서 보충한다. */
  requester?: string
  developer?: string
  yarnDetail?: string
  construction?: string
```

- `firstPass`, `teamKeep`, `decision`은 지우지 말고 주석을 `/** R151 호환용. 새 화면은 쓰지 않는다. */`로 바꾼다(이미 만든 라운드 데이터를 읽기 위해).
- `swatchLow` 주석은 "Cutting(1yd 컷팅 후 폐기). 폐기일 때만 의미가 있다."

`DisposalRound`에 더한다.

```ts
  /** 마지막으로 반영한 RDDA 라이브러리 파일 */
  rddaUsageFile?: { fileName: string; uploadedAt: string; uploadedBy: string; fileRows: number; matched: number }
  /** 마지막으로 반영한 보관 목록 파일 */
  keepListFile?: { fileName: string; uploadedAt: string; uploadedBy: string; fileFl: number; matched: number; unmatchedFl: string[] }
```

`unmatchedFl`은 앞 50개까지만 저장한다.

## 2. 도우미 (`disposal-round.ts`)

- `buildDisposalItems`: 복사 필드에 `requester: item.planner`, `developer: item.owner`, `yarnDetail: item.fields?.yarnDetail ?? ""`, `construction: item.construction`를 더한다. 범위, 되감기, 자동 제외 규칙은 그대로.
- 추가

```ts
export type DisposalVerdict = "보관" | "폐기" | "컷팅"
export const isKept = (item: DisposalItem): boolean =>
  item.keep ?? (item.firstPass === "보관" || item.teamKeep === true || item.decision === "keeping")
export const isCut = (item: DisposalItem): boolean =>
  !isKept(item) && (item.swatchLow === true || (item.keep === undefined && item.decision === "컷팅"))
export const itemVerdict = (item: DisposalItem): DisposalVerdict => isKept(item) ? "보관" : isCut(item) ? "컷팅" : "폐기"

/** "3/1", " 3 / 1 ", "3"(미팅만), "/1"(픽업만), ""(둘 다 비움). 숫자가 아니면 null */
export function parseMeetingPickup(text: string): { meeting: number | ""; pickup: number | "" } | null
export function formatMeetingPickup(item: Pick<DisposalItem, "meeting" | "pickup">): string   // 둘 다 비면 "", 아니면 `${meeting}/${pickup}`(빈 쪽은 빈 문자열)

export const normalizeFl = (value: unknown): string => String(value ?? "").replace(/\s+/g, "").toUpperCase()
```

- `suggestDecision`, `effectiveDecision`을 지우고 쓰던 곳을 `itemVerdict`, `isKept`, `isCut`로 바꾼다.
- `DisposalSummary`에서 `undecided`를 없앤다. `keeping` = 활성 중 `isKept`, `cut` = 활성 중 `isCut`, `dispose` = 활성 중 보관도 컷팅도 아닌 것, `finalDispose = cut + dispose`.
- `DisposalMarkTarget = "보관" | "Cutting"`. `applyListMarks`는 보관이면 `keep: true`, Cutting이면 `swatchLow: true`.
- `lastRoundDecision`의 반환형을 `DisposalVerdict | undefined`로, 값은 `itemVerdict`.
- `applyRddaUsage(round, byFl: Map<string, { meeting: number; pickup: number }>): { round; matched: number }`: 모든 items(제외 포함)를 `normalizeFl(item.flNo)`로 찾아 meeting, pickup을 덮어쓴다.
- `applyKeepList(round, fls: readonly string[]): { round; matched: number; unmatchedFl: string[] }`: 파일 FL과 같은 **활성** item은 `keep: true`. **파일에 없는 원단의 보관 값은 건드리지 않는다**(사람이 따로 고른 보관을 지우지 않기 위해). 라운드에 없는 파일 FL은 `unmatchedFl`.
- `buildDisposalWorkbook`
  - rdda: 열 `R&D No.`, `FL#`, `Requester`, `Developer`, `Yarn Detail`, `Cons.`, `Rack No.`
  - final: 머리 문구는 그대로(`keeping(n)`, `폐기 원단(n)`, `cutting(n)`는 창고팀에 보내던 틀이다). 줄 값은 `isKept`면 keeping `o`, 아니면 폐기 원단 칸에 FL#, `isCut`면 cutting `o`

## 3. RDDA 파일 읽기 (새 파일 `src/data/rdda-files.ts`)

```ts
import * as XLSX from "xlsx"
const headKey = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase()

/** RDDA 라이브러리 목록. FL NO, Meeting Count, Pickup Count만 읽는다. */
export function parseRddaUsage(workbook: XLSX.WorkBook): { byFl: Map<string, { meeting: number; pickup: number }>; fileRows: number }
/** RDDA 목록 내보내기(보관 목록). Ref. No 또는 FL NO 또는 FL# 열의 FL만 읽는다. */
export function parseRddaFlList(workbook: XLSX.WorkBook): { fls: string[]; fileRows: number }
```

- 첫 시트를 `sheet_to_json(sheet, { header: 1, blankrows: false, defval: null })`로 읽는다.
- 머리 줄은 앞 10줄 중 필요한 머리가 모두 있는 첫 줄이다. 비교는 `headKey`.
  - usage: `FL NO`, `MEETING COUNT`, `PICKUP COUNT`. 없으면 `throw new Error("RDDA 라이브러리 파일이 아닙니다. FL NO, Meeting Count, Pickup Count 열이 필요합니다.")`
  - list: `REF. NO` 또는 `FL NO` 또는 `FL#` 중 하나. 없으면 모든 칸에서 `/^FL\d{8}$/`(normalizeFl 뒤)에 맞는 값을 모은다. 하나도 없으면 `throw new Error("FL 번호를 찾지 못했습니다. RDDA 목록 파일을 올려 주세요.")`
- FL은 `normalizeFl` 뒤 `/^FL\d{8}$/`만 받는다. usage 숫자는 `Number()`가 유한수가 아니면 0. 같은 FL이 여러 줄이면 미팅, 픽업 각각 큰 값. list는 중복 제거.
- `fileRows`는 머리 아래 데이터 줄 수.
- **다른 열 값을 반환하거나 저장하지 마라.**

## 4. 화면 (`DisposalRoundPanel.tsx`)

### 표 열(122행 머리와 125~134행 줄)

순서: `R&D No.`, `Rack No.`, `FL#`, `Buyer`, `Requester`, `Developer`, `Yarn Detail`, `Cons.`, `지난 결과`, `판정`, `M/P`, `Cutting`, `메모`

- Requester, Developer, Yarn Detail, Cons. 값은 `item.requester ?? live?.planner`, `item.developer ?? live?.owner`, `item.yarnDetail ?? live?.fields.yarnDetail`, `item.construction ?? live?.construction`(`live`는 `ledger`를 key로 찾은 원장 행, `useMemo`로 Map). Yarn Detail은 `max-w-[220px] truncate`와 title로 전체 값.
- **판정**: 2단 토글 `보관 / 폐기`. 현재 값 `isKept(item)`. 보관을 누르면 `keep: true`, 폐기를 누르면 `keep: false`.
  - 보관 선택 버튼은 `bg-emerald-600 text-white`(다크 `dark:bg-emerald-500`), 폐기 선택 버튼은 `bg-[var(--muted)] font-medium`.
  - **보관인 줄은 초록 채움 효과**: 줄 `td`들에 `background: color-mix(in srgb, #059669 12%, transparent)`, `transition: background-color 300ms ease-out`. 판정 칸에는 왼쪽에서 오른쪽으로 차오르는 초록 막대 층(absolute inset, `origin-left`, `transform scaleX(0)` 에서 `scaleX(1)`, 400ms, `motion-reduce`면 끔)을 버튼 뒤에 둔다. 행(`tr`)에는 transform을 걸지 마라.
- **M/P**: 입력 하나(너비 64px, `inputMode="numeric"`, placeholder `0/0`). 로컬 값으로 편집하고 blur 또는 Enter에서 `parseMeetingPickup`. null이면 저장하지 않고 붉은 테두리와 title "미팅/픽업 형식으로 적어 주세요. 예: 3/1". 성공하면 meeting, pickup 저장. 표시값은 `formatMeetingPickup`.
- **Cutting**: 체크박스(`swatchLow`). `isKept(item)`면 `disabled`이고 체크 표시하지 않는다(값은 지우지 않는다), title "보관 원단은 컷팅하지 않습니다". 폐기일 때만 바꿀 수 있다.
- **메모**: 지금처럼 유지.
- 제외 줄은 `colSpan`을 판정부터 메모까지 4칸으로.
- `최종` 열과 `1팀 판단`, `3팀 보관`, `미팅`, `픽업`, `swatch 10 미만`, `Style No.` 열을 없앤다.

### 필터, 요약, 키

- 필터: `전체`, `보관`, `폐기`, `컷팅`, `제외`. 보관은 `isKept`, 컷팅은 `isCut`, 폐기는 활성 중 `itemVerdict === "폐기"`.
- 검색 대상: R&D No., FL#, Buyer, Requester, Developer, Yarn Detail, Cons. placeholder도 맞춘다.
- 요약 칩: `전달받은`, `제외`, `보관`, `컷팅`, `최종 폐기`(미정 없음). 왼쪽 목록 요약은 `최종 폐기 n / 보관 n / 컷팅 n`.
- 키: `K` 보관, `D` 폐기, `C` Cutting 토글(폐기일 때만). Backspace 해제는 없앤다.
- 목록 붙여넣기 창 대상: `보관`, `Cutting`.

### 파일 올리기 (119행 버튼 줄)

- `RDDA 활용 파일 올리기`(`.xlsx,.xls`), `보관 목록 파일 올리기`(`.xls,.xlsx`). 숨긴 `input type=file` 두 개. `editable`일 때만 활성.
- 처리: `XLSX.read(await file.arrayBuffer(), { type: "array" })` 뒤 `parseRddaUsage` 또는 `parseRddaFlList`, 이어서 `applyRddaUsage` 또는 `applyKeepList`. 라운드에 `rddaUsageFile` 또는 `keepListFile`을 적고 history에 `disposalEvent(actor, "update", { target: "RDDA 활용 파일" 또는 "보관 목록 파일", to: \`${fileName} 매칭 ${matched}건\` })`를 붙여 한 번에 저장한다. 오류는 버튼 줄 아래 붉은 글씨로.
- 버튼 줄 아래 안내 줄(값이 있을 때만)
  - `RDDA 활용 {M/D HH:mm} 반영, 매칭 {matched}/{활성+제외 items 수}건, 파일 {fileRows}행 ({fileName})`
  - `보관 목록 {M/D HH:mm} 반영, 보관 표시 {matched}건, 라운드에 없는 FL {unmatchedFl.length}개` + `보기` 토글로 FL 나열
- 두 파일 모두 **라운드마다 몇 번이든 다시 올릴 수 있다.** 다시 올리면 미팅, 픽업은 덮어쓰고 보관은 더한다(파일에 없는 보관은 유지).

## 5. 폐기 라운드를 팝업으로 (`src/routes/Warehouse.tsx`)

사용자 요청: "폐기 라운드 작업 시 화면이 창고보관 탭을 덮어 버린다. 폐기 라운드 전체를 팝업으로 띄워 작업하게 해 달라."

- 지금은 표 카드 자리 분기가 `disposalView ? <DisposalRoundPanel .../> : rackView ? <RackMap .../> : <표 카드>`다(1354행 근처). **`disposalView` 분기를 여기서 빼서** `rackView ? <RackMap .../> : <표 카드>`로 되돌린다. 표와 탭은 그대로 보인다.
- `폐기 라운드` 버튼(1345행 근처)은 `setDisposalView(true)`로 팝업을 연다. 버튼이 배치도(`setRackView`)를 끄지 않게 한다(팝업이라 서로 겹치지 않는다). 배치도 버튼의 `setDisposalView(false)`와 `changeTab`의 `setDisposalView(false)`는 지워도 된다(팝업은 탭과 무관).
- 컴포넌트 끝(다른 Dialog들 옆)에 전체 크기 Dialog를 둔다.
  ```tsx
  <Dialog open={disposalView} onOpenChange={setDisposalView}>
    <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1800px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]">
      <DialogHeader className="shrink-0 border-b px-4 py-3"><DialogTitle>폐기 라운드</DialogTitle></DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col p-3"><DisposalRoundPanel ... /></div>
    </DialogContent>
  </Dialog>
  ```
  `DialogContent`가 기본 닫기 버튼을 그리면 그대로 둔다. 기존 창고 화면 Dialog들의 className 관례(`sm:max-w-*`)를 따른다.
- `DisposalRoundPanel` 안의 `새 폐기 라운드`, `목록 붙여넣기로 표시` Dialog는 팝업 위에 겹쳐 뜬다. 겹친 창이 열려 있으면 바깥 팝업이 Esc로 닫히지 않게, 안쪽 창이 먼저 닫히는 기본 동작을 유지한다(바깥 `onOpenChange`를 따로 막지 않는다).
- 패널 루트의 `tabIndex={0}`와 `onKeyDown`(K, D, C, 방향키)은 팝업 안에서 그대로 동작해야 한다. 창고 화면 window keydown 단축키(복사, Delete로 Rack No. 지우기 등)는 이미 "포커스가 dialog 안이면 무시"한다. 그 조건을 건드리지 마라.
- 패널 카드 자체의 바깥 테두리와 상단 색 띠(`border-t-4 border-[var(--warning)]`)는 팝업 안에서도 유지해도 된다.

## 하지 말 것

- 폐기 라운드를 창고 화면 표 카드 자리에 다시 그리지 마라(팝업만).
- RDDA 파일의 Price, Supplier, Content 등 세 열(보관 목록은 한 열) 밖의 값을 읽어 반환하거나 저장하지 마라. 공개 저장소이고 단가, 협력사는 민감 정보다.
- 보관 목록을 올릴 때 파일에 없는 원단의 보관을 폐기로 되돌리지 마라.
- 원장(`fabricOverrides`, `fabricEvents`)을 바꾸지 마라. 창고 전달, 창고팀 작업, 폐기 반영은 R153이다.
- R151의 범위 선정, 되감기 순서, FL 미기입과 FL 중복 자동 제외, 포함과 다시 제외, 라운드 만들기 미리보기, 라운드 삭제는 그대로 둔다.
- `saveDisposalRounds`에 `logAction`을 더하지 마라.
- 화면 문구와 주석에 `→ · — ⇒ ↔` 문자를 쓰지 마라. 표 행(`tr`)에 transform을 걸지 마라.

## 검증

- `npx tsc --noEmit`이 오류 없이 끝나면 된다. 오류를 고쳤다면 한 번 더 돌려 통과를 확인한다. `npm run build`는 돌리지 마라(명령 제한 2분). 파일 파싱과 화면 확인은 클로드가 한다.
