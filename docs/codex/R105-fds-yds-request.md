# R105 — FDS/YDS 요청 취합 (엑셀 내보내기 + 아웃룩 표 복사)

상태: 미착수.

## 배경

Global Dyeing(GD, 호치민)에 단가(FDS)와 원단(YDS)을 주 2회 취합해 메일로 요청한다.
지금은 손으로 표를 만든다. DD MASTER에서 대상 행을 뽑아 **양식 엑셀**과 **아웃룩에 붙일 표** 두 가지로 내보낸다.

양식 파일은 `C:\Users\hkpark\Desktop\FDS YDS 요청 양식.xlsx`이다. 헤더 7행, 데이터 8행부터, C열~L열 10칸이다.
읽지 않아도 된다. 아래에 필요한 것을 다 적었다.

## 열 매핑 (확정)

| # | 양식 열 | DD 필드 |
|---|---|---|
| 1 | 담당 | `record.owner` |
| 2 | HMP | `record.styleNo` |
| 3 | STYLE | `record.tech?.development?.developmentNo || record.gdNo || record.saNo` |
| 4 | ARRANGE | `record.tech?.arrangeNo` |
| 5 | BODY | 아래 "BODY 규칙" 참조 |
| 6 | FABRICATION | `record.tech?.yarnDetail` |
| 7 | REQUEST | `record.requestDate` |
| 8 | FDS | `record.tech?.sampleDates?.fds` |
| 9 | YDS | `record.tech?.sampleDates?.yds` |
| 10 | REMARK | `record.note` |

## BODY 규칙

작지상 스타일의 옵션 순서다. 보통 DD의 옵션 순과 같지만 **GD가 작지 접수 순서를 바꾸는 경우가 있어 손으로 고칠 수 있어야 한다.**

- 기본값은 `record.opt`에서 만든다. `B` + 2자리. `opt`가 `"3"`이면 `"B03"`.
- 사람이 고치면 `record.tech.bodyNo`에 그 값을 저장하고, 이후에는 저장값이 이긴다.
- `opt`는 담당+Style 그룹 안에서 매번 다시 계산되는 값이다. 그래서 저장값이 있으면 절대 덮지 않는다.

## 추출 조건 (확정)

1. `Co === "GD"` — `record.tech?.development?.co || record.devType`
2. Status가 `DROP`, `HOLD`, `REJECT`가 **아닌** 행 — `record.devStatus || record.stage`
3. FDS 또는 YDS 중 **하나라도 비어 있는** 행
4. Style No.가 있는 행만

정렬은 담당 → Style No. → BODY 순이다.

## 하지 말 것

- DD MASTER의 64열에 BODY 열을 새로 만들지 마라. 열 구성과 내보내기 계약이 바뀐다.
  BODY 수정은 이번에 만드는 요청 팝업 안에서만 한다.
- `recalculateDevelopmentRecords`와 `opt` 계산을 건드리지 마라.
- 메일을 보내는 기능을 만들지 마라. 복사와 엑셀까지다.
- `src/data/dd-export.ts`의 기존 DD 내보내기를 고치지 마라. 새 모듈을 만든다.
- `src/routes/FabricRequest.tsx`, `src/routes/Warehouse.tsx`를 건드리지 마라.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `DevTechnical`에 `bodyNo?: string` 추가 |
| `src/data/fds-yds-request.ts` | 신규. 추출·엑셀·클립보드 전부 |
| `src/routes/DevelopmentMasterSheet.tsx` | 도구줄 버튼 + 요청 팝업 |

---

## 1. `src/data/schema.ts`

`DevTechnical`의 `sampleDates?: { fds?: string; yds?: string }` 줄 **바로 아래**에 넣는다.

```ts
  /**
   * FDS/YDS 요청서의 BODY 값. 비어 있으면 `opt`에서 만든다(B01, B02...).
   * GD가 작지 접수 순서를 바꾼 경우에만 사람이 채운다. 채워지면 `opt`보다 우선한다.
   */
  bodyNo?: string
```

## 2. `src/data/fds-yds-request.ts` (신규)

### 2-1. 행 타입과 열 정의

```ts
export interface FdsYdsRow {
  /** DD 행 식별자. `${_src.sheet}::${_src.row}` — BODY 수정 저장에 쓴다. */
  key: string
  owner: string
  hmp: string
  style: string
  arrange: string
  body: string
  fabrication: string
  request: string
  fds: string
  yds: string
  remark: string
}
```

열 정의는 양식과 화면과 엑셀이 한 곳을 보게 한다.

```ts
export const FDS_YDS_COLUMNS: readonly { key: keyof Omit<FdsYdsRow, "key">; head: string; width: number }[] = [
  { key: "owner", head: "담당", width: 10 },
  { key: "hmp", head: "HMP", width: 14 },
  { key: "style", head: "STYLE", width: 12 },
  { key: "arrange", head: "ARRANGE", width: 18 },
  { key: "body", head: "BODY", width: 8 },
  { key: "fabrication", head: "FABRICATION", width: 60 },
  { key: "request", head: "REQUEST", width: 12 },
  { key: "fds", head: "FDS", width: 12 },
  { key: "yds", head: "YDS", width: 12 },
  { key: "remark", head: "REMARK", width: 20 },
]
```

### 2-2. BODY 기본값

```ts
/** 저장값이 있으면 그것, 없으면 opt에서 만든다. opt가 없으면 빈 칸이다. */
export function bodyLabel(record: DevRecord): string {
  const stored = record.tech?.bodyNo?.trim()
  if (stored) return stored
  const opt = Number(String(record.opt ?? "").trim())
  return Number.isFinite(opt) && opt > 0 ? `B${String(opt).padStart(2, "0")}` : ""
}
```

### 2-3. 추출

```ts
const EXCLUDED_STATUS = new Set(["DROP", "HOLD", "REJECT"])

/** 추출 조건은 지시서 "추출 조건"과 같다. 조건을 바꾸려면 여기 한 곳만 고친다. */
export function collectFdsYdsRows(records: readonly DevRecord[]): FdsYdsRow[]
```

- `co = String(record.tech?.development?.co || record.devType || "").trim().toUpperCase()` 가 `"GD"` 인 행만
- `status = String(record.devStatus || record.stage || "").trim().toUpperCase()` 가 `EXCLUDED_STATUS`에 없는 행만
- `fds`와 `yds`를 각각 `String(...).trim()` 했을 때 **둘 중 하나라도 빈** 행만
- `record.styleNo.trim()`이 있는 행만
- 날짜 3칸(`request`, `fds`, `yds`)은 `fmtDate`(`src/data/format.ts`)로 문자열로 만든다. 빈 값은 빈 문자열이다.
- 정렬은 `owner` → `hmp` → `body`, 전부 `localeCompare(..., "ko-KR", { numeric: true })`

### 2-4. 엑셀

```ts
export async function buildFdsYdsWorkbook(rows: readonly FdsYdsRow[]): Promise<Blob>
export function fdsYdsFileName(date?: Date): string
```

- `src/data/dd-export.ts`의 `buildDdWorkbook`과 같은 방식으로 `exceljs`를 동적 import한다.
  CJS라 `default` 위치가 달라지므로 그 파일의 처리 방식을 그대로 따른다.
- 시트 이름 `REQUEST`.
- **양식 배치를 그대로 재현한다.** 헤더는 **7행**, 열은 **C열부터 L열까지**(3번 열~12번 열), 데이터는 **8행**부터다.
- 헤더 칸: 굵게, 가운데 정렬, 배경 `FFD6E4F0`, 얇은 테두리.
- 데이터 칸: 세로 위 정렬, `wrapText` 켬, 가는 테두리.
- 열 너비는 `FDS_YDS_COLUMNS`의 `width`를 C열부터 순서대로 적용한다.
- 파일명은 `FDS_YDS_요청_MMDD.xlsx`.

### 2-5. 클립보드

```ts
/** 아웃룩 본문에 붙이면 표로 들어간다. 실패하면 탭 구분 텍스트로 떨어진다. */
export async function copyFdsYdsTable(rows: readonly FdsYdsRow[]): Promise<"html" | "text">
```

- HTML은 `<table>` 하나다. `border-collapse:collapse`를 **인라인 style**로 준다. 아웃룩은 `<style>` 블록을 잘 버린다.
  각 `th`/`td`에도 `border:1px solid #bfbfbf; padding:4px 6px; font-size:12px;`를 인라인으로 준다.
  `th`는 `background:#d6e4f0; font-weight:bold; text-align:center;`.
- 값은 반드시 HTML 이스케이프한다(`&`, `<`, `>`). FABRICATION에 `*`와 `/`가 섞여 들어온다.
- `ClipboardItem`이 있으면 `text/html`과 `text/plain`을 같이 넣고 `"html"`을 돌려준다.
  없거나 던지면 `navigator.clipboard.writeText(tsv)`로 떨어지고 `"text"`를 돌려준다.
  `text/plain`(과 폴백)은 탭 구분, 줄바꿈 `\n`, 첫 줄은 헤더다.
- **주의.** `ClipboardItem` 생성은 사용자 클릭 흐름 안에서 동기적으로 시작해야 한다.
  `await` 뒤에 `ClipboardItem`을 만들면 브라우저가 권한을 거절한다. Blob은 미리 만들어 두고 호출해라.

## 3. `src/routes/DevelopmentMasterSheet.tsx`

### 3-1. 버튼

도구줄에서 `applyPreset("all")`을 부르는 **전체 64열** 버튼(2084행 근처) **옆에** 버튼을 하나 더 둔다.

```tsx
<Button type="button" size="sm" variant="outline" onClick={() => setFdsYdsOpen(true)}>
  <Mail className="size-4" />FDS/YDS 요청
</Button>
```

`Mail` 아이콘을 `lucide-react` import에 더한다.

### 3-2. 요청 팝업

`src/components/ui/dialog.tsx`를 쓴다. **`bg-background`를 쓰지 마라.** 팝업이 투명해진다.

- `const [fdsYdsOpen, setFdsYdsOpen] = useState(false)`
- 열릴 때 `collectFdsYdsRows(records)`로 목록을 만든다. `records`는 이 화면이 이미 들고 있는 값을 쓴다.
  **필터·검색이 걸린 목록이 아니라 전체 records를 쓴다.** 요청은 화면 필터와 무관하다.
- 상단에 건수와 안내 한 줄: `GD 진행분 중 FDS 또는 YDS 미수취 N건`
- 표는 `FDS_YDS_COLUMNS` 순서로 그린다. 헤더는 검정 굵게 가운데 정렬.
- **BODY 칸만 입력 가능하다.** `<input>`으로 그리고, 값이 바뀌면 그 행의 DD 레코드에
  `tech.bodyNo`를 저장한다. 저장은 `saveDevelopmentRecord(record, identity)`를 쓴다.
  이 화면에 이미 있는 함수다. 행 찾기는 `FdsYdsRow.key`(`${_src.sheet}::${_src.row}`)로 한다.
- 하단 버튼 셋.
  - `표 복사` — `copyFdsYdsTable(rows)`. 결과가 `"html"`이면 `아웃룩에 붙여넣으세요`,
    `"text"`이면 `표 서식 없이 복사했습니다` 안내를 3초간 띄운다.
  - `엑셀 내려받기` — `buildFdsYdsWorkbook` + `downloadBlob`(`@/data/dd-export`) + `fdsYdsFileName()`
  - `닫기`
- 대상이 0건이면 표 대신 `요청할 건이 없습니다.`를 그린다.

## 검증

```
npm run build
git status --short
```

성공 기준.

1. `npm run build` 통과.
2. `git status --short`에 `src/data/schema.ts`, `src/data/fds-yds-request.ts`,
   `src/routes/DevelopmentMasterSheet.tsx`, 그리고 이 지시서만 새로 뜬다.
3. `src/data/dd-export.ts`와 `src/data/derive.ts`가 수정 목록에 없다.
4. `src/routes/DevelopmentMasterSheet.tsx`에 `bg-background` 문자열이 없다.

화면 확인은 사용자가 한다.
