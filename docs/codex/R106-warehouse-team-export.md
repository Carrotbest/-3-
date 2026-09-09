# R106 — 창고팀(정산관리팀) 보고 자료 내보내기

상태: 미착수.

## 배경

지하 창고팀은 매일·매주 팀장에게 보고하는 엑셀 파일 두 개를 쓴다. 그 팀은 계속 엑셀로 일한다.
우리 웹앱을 쓰라고 강요하지 않고, **3팀 몫만 그쪽 양식대로 뽑아 주는 것**이 이번 목표다.
붙여넣기만 하면 되도록 열과 블록 구조를 원본과 똑같이 만든다.

원본 파일 두 개는 바탕화면에 있다. **열지 마라.** 필요한 구조는 아래에 전부 적었다.
실데이터가 들어 있으므로 저장소에 복사하지도 마라.

## 하지 말 것

- 원본 엑셀 파일을 열거나 저장소로 복사하지 마라.
- **전사 부서별 집계 시트를 만들지 마라.** 원본 `9월 1주차` 시트는 전 부서 합계라
  3팀 데이터만으로는 만들 수 없다. 만들면 틀린 숫자가 된다.
- 원본의 `데이터`, `디자인부` 시트에 해당하는 것을 만들지 마라. 다른 부서 자료다.
- Rack 위치 필드를 만들지 마라. 다음 과제다.
- `src/data/fabric-ledger.ts`의 상태 판정과 채번을 건드리지 마라.
- `src/routes/DevelopmentMasterSheet.tsx`, `src/routes/FabricRequest.tsx`를 건드리지 마라.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/routes/Warehouse.tsx` | 폐기 사유 1개 추가, 도구줄 버튼, 내보내기 팝업 |
| `src/data/warehouse-export.ts` | 신규. 집계·엑셀 전부 |

---

## 1. 폐기 사유 추가

`src/routes/Warehouse.tsx` 33행과 133행이다. 현재 코드:

```ts
type DisposalReason = "용량 초과" | "품질 불량"
```
```ts
const DISPOSAL_REASONS: DisposalReason[] = ["용량 초과", "품질 불량"]
```

실제 폐기는 세 갈래인데 지금 사유가 둘뿐이라 "개발 중단"에 해당하는 값이 없다.
DROP·REJECT·HOLD로 개발이 끝나 그대로 버리는 건이 여기 해당한다. 다음처럼 한 개만 더한다.

```ts
type DisposalReason = "용량 초과" | "품질 불량" | "개발 중단"
```
```ts
const DISPOSAL_REASONS: DisposalReason[] = ["용량 초과", "품질 불량", "개발 중단"]
```

순서를 바꾸지 마라. 기존 값의 문자열도 바꾸지 마라. 이미 기록된 이벤트가 그 값을 갖고 있다.

## 2. `src/data/warehouse-export.ts` (신규)

### 2-1. 집계

```ts
export interface WarehouseDayRows {
  /** yyyy-mm-dd */
  date: string
  /** 입고 현황 — RECEIVE 또는 CONFIRM 이벤트 */
  inbound: { storageNo: string; date: string }[]
  /** RND 출고 완료 현황 — EXHAUST(소진)와 DISPOSE(폐기)를 합친다 */
  outboundDone: { storageNo: string; date: string }[]
}

export interface WarehouseListRow {
  /** "M/D" 형식 텍스트. 원본이 텍스트다. */
  requestDate: string
  requester: string
  division: string
  qty: number | ""
  storageNo: string
  fabric: string
  width: number | ""
  weight: number | ""
}

export interface WarehouseExportData {
  from: string
  to: string
  days: WarehouseDayRows[]
  list: WarehouseListRow[]
  totals: { inbound: number; outboundDone: number; listCount: number }
}

export function collectWarehouseExport(
  events: readonly FabricLedgerEvent[],
  ledger: readonly FabricLedgerItem[],
  from: string,
  to: string,
): WarehouseExportData
```

규칙은 이렇다.

- 기간 판정은 `event.occurredAt`의 **날짜 부분만** 쓴다. `from <= 날짜 <= to` 이고 양 끝을 포함한다.
- `days`는 기간 안의 **모든 날짜**를 만든다. 데이터가 없는 날도 빈 시트로 낸다. 원본이 그렇다.
- 입고 = `action`이 `"RECEIVE"` 또는 `"CONFIRM"`
- 출고 완료 = `action`이 `"EXHAUST"` 또는 `"DISPOSE"` — **둘을 한 목록으로 합친다.**
  소진과 폐기를 나누지 마라. 창고팀 양식은 한 칸이다.
- `list` = `action`이 `"OUTBOUND"`. 기간 전체를 한 목록으로 만든다(날짜별로 나누지 않는다).
- 각 목록은 `occurredAt` 오름차순, 같은 날짜면 `storageNo` 오름차순(`localeCompare`, `numeric: true`).
- `WarehouseListRow`의 값
  - `requestDate` — `occurredAt`을 `"M/D"` 텍스트로. 앞자리 0을 붙이지 않는다(`8/31`, `9/2`).
  - `requester` — `event.to` (출고 등록의 수령자)
  - `division` — `event.division`. 비어 있으면 빈 문자열 그대로 둔다.
  - `qty` — `event.qty`
  - `storageNo` — `event.storageNo`. 숫자로 읽히면 숫자로, 아니면 문자열로 넣는다.
  - `fabric` — `ledger`에서 `storageNo`가 같은 항목의 `record?.tech?.yarnDetail`
  - `width` / `weight` — 같은 항목의 `record?.tech?.actual?.width` / `.weight`. 없으면 빈 값.

### 2-2. 엑셀

```ts
export async function buildWarehouseWorkbook(data: WarehouseExportData): Promise<Blob>
export function warehouseExportFileName(from: string, to: string): string
```

`exceljs`를 동적 import한다. CJS라 `default` 위치가 달라지므로
`src/data/dd-export.ts`의 `buildDdWorkbook`이 하는 방식을 그대로 따른다.

**시트 구성.** 순서를 지킨다.

1. `요약` — 기간 전체를 합친 것. 아래 "입출고 시트 배치"와 같은 골격이다.
2. `MM.DD` — 기간 안의 날짜마다 하나씩. 시트 이름은 `09.02` 처럼 두 자리씩이다.
3. `LIST` — 기간 전체 출고 요청.

**입출고 시트 배치.** `요약`과 일자별 시트가 같다. **A열은 비운다. B·C·D 열만 쓴다.**

| 행 | B | C | D |
|---|---|---|---|
| 3 | `부서명` | `입고` | `RND 출고 완료건` |
| 4 | `R&D` | 입고 건수(숫자) | 출고완료 건수(숫자) |
| 7 | `입고 현황` | | |
| 8 | `부서명` | `R&D No.` | `입고일자` |
| 9~ | `R&D` | R&D No. | 날짜 |

- 건수가 0이면 4행의 숫자 칸은 비운다(0을 쓰지 마라). 원본이 그렇다.
- 입고가 0건이면 9행에 `R&D`만 쓰고 C·D는 비운다. 원본이 그렇다.
- 입고 목록의 마지막 행 다음 **한 줄을 비우고** 출고 완료 블록을 시작한다.

| 행 | B | C | D |
|---|---|---|---|
| (입고 마지막 + 2) | `RND 출고 완료 현황` | | |
| (+1) | `부서명` | `R&D No.` | `폐기일자` |
| (+2)~ | `R&D` | R&D No. | 날짜 |

- 출고 완료가 0건이면 마지막 블록도 `R&D`만 쓰고 C·D를 비운다.
- **날짜 칸은 문자열이 아니라 날짜 값으로 넣는다.** `cell.value = new Date(...)`,
  `cell.numFmt = "yyyy-mm-dd"`. 원본이 엑셀 날짜 일련번호다. 문자열로 넣으면 창고팀 파일에서 계산이 깨진다.
- `R&D No.` 칸은 숫자로 읽히면 숫자로 넣는다.

**LIST 시트 배치.** **A열은 비운다. B열부터 K열까지 10칸이다.**

2행이 헤더다. 3행부터 데이터다.

| 열 | 헤더 | 값 |
|---|---|---|
| B | `요청일` | `requestDate` — **텍스트** `8/31`. 날짜 값으로 넣지 마라. 원본이 텍스트다. |
| C | `전산출고 요청` | `"Fabric R&D"` 고정 |
| D | `요청자` | `requester` |
| E | `사용바이어` | `division` (빈칸 허용) |
| F | `용도` | `"DEVELOP SAMPLE"` 고정 |
| G | `출고량(yd)` | `qty` 숫자 |
| H | `Style No.` | **`storageNo`를 넣는다.** 헤더 이름이 Style No.지만 원본에 들어 있는 값은 R&D No.다. 실제 Style No.를 넣으면 창고팀 파일이 어긋난다. |
| I | `Fabric & Yarn` | `fabric` |
| J | `폭` | `width` |
| K | `중량(G/M2)` | `weight` |

- 헤더는 굵게, 가운데 정렬, 배경 `FFD6E4F0`, 얇은 테두리.
- 데이터 칸은 얇은 테두리, 세로 가운데 정렬.
- 열 너비는 B부터 순서대로 `10, 14, 10, 14, 16, 11, 11, 40, 8, 12`.

파일명은 `warehouseExportFileName`이 만든다. `창고팀_자료_MMDD_MMDD.xlsx` 형식이고
`from`과 `to`의 월일을 쓴다.

## 3. `src/routes/Warehouse.tsx` — 버튼과 팝업

### 3-1. 버튼

탭 줄 우측에 버튼 하나를 둔다. 다른 버튼을 늘리지 마라.

```tsx
<Button type="button" size="sm" variant="outline" onClick={() => setExportOpen(true)}>
  <FileDown className="size-4" />창고팀 자료
</Button>
```

`FileDown` 아이콘을 `lucide-react` import에 더한다.

### 3-2. 팝업

`src/components/ui/dialog.tsx`를 쓴다. **`bg-background`를 쓰지 마라.** 팝업이 투명해진다.

- 기간 프리셋 칩 다섯: `어제`, `오늘`, `이번 주`, `지난 주`, `직접 지정`.
  **기본값은 `지난 주`다.** 주간 보고가 주 용도다.
  주는 월요일 시작이다. `직접 지정`이면 `<input type="date">` 두 개를 보인다.
- 고른 프리셋과 직접 지정 날짜는 `localStorage` 키 `warehouse-export-range`에 저장하고
  다음에 열 때 되살린다. 저장·복원은 `src/data/view-prefs.ts`의 `saveViewPref`를 쓴다.
  읽기는 그 파일에 있는 함수로 안 되면 `JSON.parse`를 `try/catch`로 감싸 직접 한다.
- 미리보기 한 줄: `입고 N건 · 출고완료 N건 · 출고요청 N건`
- 기간 안의 날짜 수가 **31일을 넘으면** 내려받기 버튼을 막고
  `기간이 너무 깁니다. 31일 이내로 좁혀 주세요.`를 보인다. 시트가 과하게 늘어난다.
- 버튼 둘: `엑셀 내려받기`, `닫기`. 표 복사는 이번에 만들지 않는다. 시트가 여러 장이라 의미가 없다.
- 내려받기는 `buildWarehouseWorkbook` + `downloadBlob`(`@/data/dd-export`) + `warehouseExportFileName`.
  진행 중에는 버튼을 비활성으로 두고, 실패하면 팝업 안에 한 줄로 알린다.

집계 입력은 이 화면이 이미 들고 있는 `fabricEvents`와 `ledger`를 쓴다.
**화면의 탭·검색·필터와 무관하게 전체를 대상으로 한다.** 보고 자료는 화면 필터를 따르지 않는다.

## 검증

```
npm run build
git status --short
```

성공 기준.

1. `npm run build` 통과.
2. `git status --short`에 `src/routes/Warehouse.tsx`, `src/data/warehouse-export.ts`,
   그리고 이 지시서만 새로 뜬다.
3. `src/data/fabric-ledger.ts`가 수정 목록에 없다.
4. `src/routes/Warehouse.tsx`에 `bg-background` 문자열이 없다.

화면 확인은 사용자가 한다.
