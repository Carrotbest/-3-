# R151 창고 폐기 라운드 (3팀 검토 단계)

상태: 미착수. 창고팀 작업 목록과 폐기 반영은 R152에서 한다.

## 배경(실제 업무 흐름)

창고 공간이 모자라면 창고팀(정산관리팀)이 기간과 상관없이 폐기 요청을 보낸다. 요청은 목록이 아니라 **R&D No. 범위**다(예: 2026-05 `5670~7513`, 2026-07 `5839~7647`). 확보할 칸의 2~3배수를 잡는다.

1. 3팀이 범위 안 창고보관 원단으로 목록을 만든다. FL 미기입과 FL 중복은 뺀다(2026-07: 147건 중 144건).
2. 3팀이 RDDA(사내 별도 웹 플랫폼)의 특정 폴더에 대상 아이템을 모으면 통합원단부 1팀이 그 폴더를 보고 보관과 폐기를 1차로 판단한다. **1팀은 이 웹에서 아무 작업도 하지 않는다.** 결과를 3팀이 받아 웹에 입력한다.
3. 3팀이 자체 보관 여부와 RDDA 미팅, 픽업 수를 점검한다. **RDDA와 데이터 연결이 없어 3팀이 수동 입력한다.**
4. RDDA 라이브러리 swatch 재고가 10pcs 미만인 원단을 체크한다. **수량은 기록하지 않고 미만 여부만 체크한다.**
5. 최종 판정은 keeping, 폐기, 컷팅(1yd 컷팅 후 폐기) 셋이다. 2026-07 실적: 전달받은 147, keeping 77, 컷팅 17, 최종 폐기 70(컷팅 포함).
6. 창고팀에 전달하면 창고팀이 웹에서 목록을 보고 컷팅과 폐기를 한다(R152).

**keeping은 다음 라운드에서 리셋된다.** 다음 요청 범위에 다시 들어오면 후보로 다시 나오고 매번 다시 검토한다. 자동 제외하지 마라.

## 확인한 좌표

- `src/routes/Warehouse.tsx`
  - 145행 `TAB_ORDER`
  - 262~271행 `warehouseSequenceStart`(끝부분), `warehouseOrderKey(item, start)`: `number >= start ? number - start : number - start + STORAGE_NO_MAX`. R&D No.는 7999 다음 낮은 번호로 되감긴다.
  - 같은 파일에 `storageNumberOf`, `STORAGE_NO_MAX`가 있다.
  - 417~418행 `rackView` 상태, 567~570행 `sequenceStart`(창고보관 전체 번호로 계산)
  - 980행 `storedItems`, 983행 `openRackSlot`
  - 1374~1376행 `배치도` 토글 버튼(탭 줄 오른쪽), 1383행 `{rackView ? <RackMap .../> : <표 카드>}`
  - `changeTab`이 `setRackView(false)`를 부른다
- `src/data/fabric-ledger.ts` 18~59행 `FabricLedgerItem`(key, storageNo, flNo, styleNo, buyer, rackNo, status, intakeAt 등)
- `src/data/dd-workflow.ts` `isCompletedFlNo(flNo)`
- `src/data/cache.ts` 7행 `CACHE_KEYS`, `src/data/firestore-sync.ts` `MERGE_IDS`, `src/store/useAppStore.ts` `AppState`, 초기값, `saveRequestArchive`(logAction 없는 저장 예시)
- `tools/backup/weekly_backup.py` `KEYS`, `LABELS`
- `src/data/auth.ts` `currentUserCanWrite()`, `useAuthStore`(user, isOwner)
- `src/data/request-template.ts` exceljs 불러오기 방식(`await import("exceljs")`, default 처리), `src/data/dd-export.ts` `downloadBlob`

## 1. 번호 도우미 이동 (동작 변경 없음)

`storageNumberOf`, `warehouseSequenceStart`, `warehouseOrderKey`, `STORAGE_NO_MAX`가 `Warehouse.tsx` 안에만 있으면 `src/data/fabric-ledger.ts`로 옮겨 export 하고 `Warehouse.tsx`는 import 해서 쓴다. 이미 다른 파일에 있으면 그 자리에서 export만 한다. 로직을 바꾸지 마라.

## 2. 데이터 (`src/data/schema.ts`)

```ts
export const DISPOSAL_DECISIONS = ["keeping", "폐기", "컷팅"] as const
export type DisposalDecision = (typeof DISPOSAL_DECISIONS)[number]   // 컷팅 = 1yd 컷팅 후 폐기
export type DisposalRoundStatus = "검토" | "창고 전달" | "완료"
export type DisposalExclusion = "FL 미기입" | "FL 중복"

export interface DisposalItem {
  fabricKey: string
  /** 라운드를 만들 때 원장 값을 복사한다. 원장이 바뀌어도 라운드 기록은 그대로 둔다. */
  storageNo: string
  flNo: string
  styleNo: string
  buyer: string
  rackNo?: string
  /** 자동 제외 사유. 사람이 포함으로 되돌리면 included를 true로 둔다. */
  excluded?: DisposalExclusion
  included?: boolean
  /** 통합원단부 1팀 1차 판단(RDDA 폴더 검토 결과를 3팀이 입력) */
  firstPass?: "보관" | "폐기"
  /** 3팀 자체 보관 */
  teamKeep?: boolean
  /** RDDA 수동 입력 */
  meeting?: number | ""
  pickup?: number | ""
  /** RDDA 라이브러리 swatch 10pcs 미만 */
  swatchLow?: boolean
  /** 최종 판정. 비어 있으면 화면이 추천만 보여 준다(확정 아님) */
  decision?: DisposalDecision
  memo?: string
  /** R152 창고 작업 기록 */
  cutDoneAt?: string
  cutDoneBy?: string
  disposedAt?: string
  disposedBy?: string
}

export interface DisposalRoundEvent {
  at: string
  by: string
  name: string
  action: "create" | "update" | "send" | "reopen" | "complete" | "cut" | "dispose"
  target?: string
  from?: string
  to?: string
}

export interface DisposalRound {
  roundId: string
  /** 예: "26.09 폐기" */
  title: string
  status: DisposalRoundStatus
  rangeFrom: number
  rangeTo: number
  /** 창고팀 요청일 yyyy-mm-dd */
  requestedAt: string
  note: string
  createdAt: string
  createdBy: string
  createdByName: string
  updatedAt: string
  sentAt?: string
  sentBy?: string
  completedAt?: string
  items: DisposalItem[]
  history: DisposalRoundEvent[]
}
```

## 3. 저장

| 파일 | 조치 |
|---|---|
| `cache.ts` | `CACHE_KEYS` 끝에 `"disposalRounds"` |
| `firestore-sync.ts` | `MERGE_IDS`에 `disposalRounds: (item: { roundId: string }) => item.roundId` |
| `useAppStore.ts` | `AppState.disposalRounds: DisposalRound[]`, 초기값 `[]`, `saveDisposalRounds(list)`는 `setAppState` + `saveCache`만. **`logAction`을 부르지 마라**(items 배열이 통째로 변경점이 되어 문서가 커진다. 라운드 `history`에 남긴다) |
| `weekly_backup.py` | `KEYS` 끝에 `"disposalRounds"`, `LABELS`에 `"disposalRounds": "폐기 라운드"`. `SHEETS`에는 넣지 않는다 |

## 4. 라운드 도우미 (새 파일 `src/data/disposal-round.ts`)

```ts
export interface DisposalActor { email: string; name: string }
export function disposalEvent(actor, action, fields?, now?): DisposalRoundEvent

/** 범위 안 창고보관(status "WAREHOUSE") 원단으로 후보를 만든다. 되감기 순서를 따른다. */
export function buildDisposalItems(ledger: readonly FabricLedgerItem[], rangeFrom: number, rangeTo: number, sequenceStart: number): DisposalItem[]
```

- 위치는 `warehouseOrderKey`로 비교한다. `keyOf(n) = n >= start ? n - start : n - start + STORAGE_NO_MAX`. `lo = keyOf(rangeFrom)`, `hi = keyOf(rangeTo)`. `lo <= hi`면 `lo <= key <= hi`, 아니면(범위가 되감기를 가로지름) `key >= lo || key <= hi`. 결과는 key 오름차순.
- 번호가 없는 원단(`storageNumberOf` null)은 넣지 않는다.
- FL이 `isCompletedFlNo`로 유효하지 않으면 `excluded: "FL 미기입"`.
- 유효 FL을 공백 제거, 대문자로 비교해 **두 번째 이후 등장**은 `excluded: "FL 중복"`(순서상 첫 원단은 남긴다).

```ts
export const isActiveItem = (item: DisposalItem): boolean => !item.excluded || item.included === true
export function suggestDecision(item: DisposalItem): DisposalDecision | undefined
// firstPass "보관" 또는 teamKeep이면 "keeping", 아니면 swatchLow면 "컷팅", 아니면 firstPass "폐기"면 "폐기", 아니면 undefined
export const effectiveDecision = (item: DisposalItem): DisposalDecision | undefined => item.decision ?? suggestDecision(item)

export interface DisposalSummary { received: number; excluded: number; keeping: number; cut: number; dispose: number; finalDispose: number; undecided: number }
export function disposalSummary(round: DisposalRound): DisposalSummary
// received = items 수, excluded = 활성 아닌 수, 활성 기준으로 keeping/cut(컷팅)/dispose(폐기)/undecided(effectiveDecision 없음), finalDispose = cut + dispose

export type DisposalMarkTarget = "1팀 보관" | "1팀 폐기" | "3팀 보관" | "swatch 10 미만"
export function applyListMarks(round: DisposalRound, text: string, target: DisposalMarkTarget): { round: DisposalRound; matched: number; unmatched: string[] }
// 줄, 쉼표, 탭, 공백으로 나눈 토큰마다 숫자면 R&D No.(앞자리 0 무시)로, FL로 시작하면 FL#(공백 제거, 대문자)로 items를 찾는다. 찾으면 target에 맞게 firstPass/teamKeep/swatchLow를 켠다. 못 찾은 토큰은 unmatched

export function lastRoundDecision(rounds: readonly DisposalRound[], fabricKey: string, exceptRoundId: string): DisposalDecision | undefined
// status "완료" 또는 "창고 전달" 라운드 중 가장 최근 createdAt에서 그 원단의 effectiveDecision. 참고 표시용이다(자동 제외에 쓰지 않음)

export async function buildDisposalWorkbook(round: DisposalRound, kind: "rdda" | "final"): Promise<Blob>
```

- `rdda`: 시트 `RDDA 목록`, 활성 원단만, 열 `R&D No.`, `FL#`, `Style No.`, `Buyer`, `Rack No.`. 1팀 공유 폴더를 만들 때 쓴다.
- `final`: 시트 `폐기 리스트`, 3팀이 창고팀에 보내던 엑셀과 같은 틀. 2행 머리 `R&D Number ({활성 수})`, `FL# ({활성 수})`, `keeping({keeping 수})`, `폐기 원단({finalDispose 수})`, `cutting({cut 수})`, 그리고 `Rack No.`. 3행부터 활성 원단 한 줄씩: R&D No.(숫자), FL#, keeping이면 `o`, 폐기나 컷팅이면 폐기 원단 칸에 FL#, 컷팅이면 cutting 칸 `o`, Rack No.
- 머리 굵게, 테두리 hair, 열 너비 12~16.
- 파일명: `폐기라운드_${title 공백을 _로}_${rdda면 "RDDA목록" 아니면 "최종"}.xlsx`

## 5. 화면

### Warehouse.tsx

- 상태 `const [disposalView, setDisposalView] = useState(false)`. `배치도` 버튼(1374행) 옆에 `폐기 라운드` 버튼(lucide `ClipboardList`, `aria-pressed`). 켜면 `setRackView(false)`, 배치도를 켜면 `setDisposalView(false)`. `changeTab`에서도 끈다.
- 진행 중 라운드(status가 "완료" 아님)가 있으면 버튼에 건수 배지.
- 1383행 분기를 `disposalView ? <DisposalRoundPanel .../> : rackView ? <RackMap .../> : <표 카드>`로.
- 전달 props: `ledger`(전체), `sequenceStart`, `rounds = useAppStore((s) => s.disposalRounds)`, `actor`(auth user email, displayName 또는 email 앞부분), `canWrite = currentUserCanWrite()`, `isOwner`, `onSave = saveDisposalRounds`.

### 새 파일 `src/components/warehouse/DisposalRoundPanel.tsx`

표 카드와 같은 테두리 카드(상단 4px `var(--destructive)` 계열 대신 `var(--warning)`). 좌우 2단(좁으면 위아래).

**왼쪽 라운드 목록(너비 260px)**
- `새 라운드` 버튼(`canWrite`일 때)
- 목록: 진행 중(검토, 창고 전달)을 위에, 완료를 아래(최근 createdAt 순). 항목: 제목, 상태 배지(검토 `var(--chart-1)`, 창고 전달 `var(--warning)`, 완료 muted), 범위 `5839~7647`, 요청일 M/D, 요약 `최종 폐기 n / keeping n / 미정 n`

**새 라운드 창(Dialog)**
- 제목(기본값 오늘 기준 `YY.MM 폐기`), 창고팀 요청일(date, 기본 오늘), 범위 시작, 범위 끝(숫자), 메모
- 입력하는 동안 `buildDisposalItems` 미리보기: `후보 n건, 자동 제외 n건(FL 미기입 n, FL 중복 n)`. 후보 0건이면 만들기 비활성
- 만들기: `roundId = crypto.randomUUID()`, status "검토", history `[create {to: "범위 from~to, 후보 n건"}]`, 저장 후 선택

**오른쪽 상세(선택 없으면 안내 문구)**
- 머리: 제목(검토 상태면 더블클릭 수정), 상태 배지, 범위, 요청일, 만든 사람, 메모
- 요약 칩: `전달받은 n`, `제외 n`, `keeping n`, `컷팅 n`, `최종 폐기 n`, `미정 n`(미정이 0이 아니면 강조). 숫자는 `disposalSummary`
- 버튼: `RDDA 목록 내려받기`, `목록 붙여넣기로 표시`, `최종 리스트 내려받기`. 소유자이고 status "검토"면 `라운드 삭제`(confirm)
- 필터 칩: 전체, 미정, keeping, 폐기, 컷팅, 제외. 검색(R&D No., FL#, Style No., Buyer)
- **표**(가로 스크롤 상자, 머리 sticky, 11~12px, 줄 높이 촘촘): 열
  1. R&D No.(mono) 2. Rack No. 3. FL#(mono) 4. Style No. 5. Buyer 6. 지난 결과(`lastRoundDecision`, 작은 muted 칩, 없으면 빈칸)
  7. 1팀 판단: 작은 3단 토글 `보관 / 폐기 / 없음`
  8. 3팀 보관: 체크박스
  9. 미팅, 10. 픽업: 숫자 입력(너비 56px). **입력 중에는 로컬 값만 바꾸고 blur나 Enter에서 저장한다**(키 입력마다 동기화 저장하지 마라)
  11. swatch 10 미만: 체크박스
  12. 최종: 3단 토글 `keeping / 폐기 / 컷팅`. `decision`이 비었고 추천이 있으면 그 칸을 점선 테두리로 미리 표시하고 title "추천, 누르면 확정". 이미 확정된 값을 다시 누르면 확정을 푼다(`decision` 제거)
  13. 메모: 텍스트 입력(blur 저장)
- 제외 원단 줄: 흐리게, 7~13열 대신 제외 사유 칩과 `포함` 버튼(`included: true`). 포함된 줄에는 `다시 제외` 버튼
- **키보드**: 줄을 클릭하면 선택 줄로 표시. 입력칸에 포커스가 없을 때 `K` keeping, `D` 폐기, `C` 컷팅, `Backspace`는 확정 해제, 위아래 방향키로 줄 이동. 편집 중이거나 창이 열려 있으면 무시
- 모든 편집은 status "검토"이고 `canWrite`일 때만. 아니면 보기 전용
- 저장: 바뀐 라운드만 교체한 새 배열로 `onSave`. `updatedAt` 갱신. 건별 편집은 history에 남기지 않는다. `목록 붙여넣기로 표시`와 `라운드 삭제`, 제목 수정만 history(`update`, target은 "목록 표시"/"제목", to는 `"{target} {matched}건"` 또는 새 제목)

**목록 붙여넣기 창(Dialog)**
- 대상 Select(`1팀 보관`, `1팀 폐기`, `3팀 보관`, `swatch 10 미만`), 큰 textarea(R&D No.나 FL#를 줄마다 또는 엑셀 열 복사), `표시하기`
- 결과 안내: `n건 표시, 못 찾은 값 n개: ...`(최대 10개 나열)

## 하지 말 것

- R152 범위(창고 전달, 창고팀 작업 목록, 컷팅 완료와 폐기 완료 체크, `applyFabricAction` DISPOSE 반영, 라운드 완료)를 만들지 마라.
- 원장 상태(`fabricOverrides`, `fabricEvents`)를 이 라운드 작업에서 바꾸지 마라.
- keeping 원단을 다음 라운드에서 자동 제외하지 마라(사용자 규칙: 매번 리셋, 재검토).
- swatch 수량을 저장하지 마라(미만 체크만).
- `saveDisposalRounds`에서 `logAction`을 부르지 마라.
- 번호 도우미를 옮기면서 로직을 바꾸지 마라.
- 화면 문구와 주석에 `→ · — ⇒ ↔` 문자를 쓰지 마라. 공개 저장소라 실제 협력사명, 사람 이름, 메일을 코드에 넣지 마라.
- `ref` 콜백 안에서 setState 하지 마라.

## 검증

- `npx tsc --noEmit`이 오류 없이 끝나면 된다. `npm run build`는 돌리지 마라(명령 제한 2분). 전체 빌드와 동작 확인은 클로드가 한다.
