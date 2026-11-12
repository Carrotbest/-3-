# R422 옵션 보충 업로드와 CO·Dyeing 매핑 교정

상태: 미착수.

두 파트다. 파트 A는 의뢰에서 DD로 넘길 때 값이 새거나 잘못 들어가는 것을 막는다. 파트 B는 EU market 같은 대량 시즌 개발에서 옵션 사양을 엑셀로 채우는 길을 만든다.

2026-11-12 박향근 확정: 매칭 키는 **Garment No.**다. 의뢰 옵션 하나가 여러 줄로 쪼개지는 **1대N은 허용하지 않는다.** 옵션 전용 업로드에 **삭제는 두지 않는다.**

---

## 이미 조사한 사실. 다시 조사하지 마라

저장소를 다시 뒤지지 마라. 아래는 클로드가 코드를 열어 확인했고 코덱스 아스트라 자문으로 교차 검증한 것이다.

1. **`requests`는 병합 키다.** `firestore-sync.ts`의 `MERGE_IDS`에 `reqId`로 들어 있다. 다만 `sync-merge.ts`의 `mergeKeyed`는 스타일 **객체 전체**를 내 것이냐 원격 것이냐로 고른다. 같은 스타일을 둘이 동시에 고치면 한쪽이 통째로 진다. 그래서 파트 B에 적용 직전 충돌 검사가 필요하다.

2. **`isGdRecord`(`dd-workflow.ts:68`)는 `tech.development.co`를 먼저 보고 비었을 때만 `devType`을 본다.** 개발처 표현이 둘이다. 한쪽만 채우면 판정이 갈린다.

3. **`devType`의 타입은 `"GD" | "국내"` 둘뿐이다**(`schema.ts:119`). `생산`을 넣을 자리가 없다.

4. **`requestToIntakeRecords`(`request-link.ts:235` 부근)와 `applyRequestLinks`의 `filled`(`request-link.ts:245` 부근)가 `option.co`를 아예 버린다.** R389에서 CO를 옵션 단위로 받기 시작했는데 이 두 경로가 안 읽는다.

5. **같은 두 경로가 `option.dyeingMethod`를 `record.dyeing`에 그대로 넣는다.** REQUEST의 Dyeing은 자유 입력(`FabricRequest.tsx:606`의 `Input`)이고 DD의 Dyeing Side는 `DD_DYEING_OPTIONS` 여섯으로 닫혀 있다(R281). 이 경로는 `isAcceptableCellValue`를 지나지 않아 목록 밖 값이 그대로 저장된다.

6. **`parseRequestWorkbook`(`request-template.ts:376`)은 `optional`도 `derivable`도 아닌 열이 2행에 없으면 예외를 던진다.** 옵션만 담은 파일은 이 파서로 읽을 수 없다. 열을 빈 칸으로 끼워 넣으면 `mergeRequestStyles`가 분석에서 들어온 기본 정보를 빈 값으로 덮는다. **그래서 파트 B는 기존 파서를 고치지 않고 별도 경로를 만든다.**

7. **기존 업로드는 파일에서 빠진 옵션의 DD 연결을 자동으로 풀지 않는다**(`FabricRequest.tsx:1954` 부근). 경고만 한다. 새 경로도 같다. `dropDdLinks`를 부르지 마라.

8. **`ensureRequestLineIds`(`request-link.ts:198`)가 lineId 없는 옵션에 `crypto.randomUUID()`를 채운다.** 파트 B의 내려받기는 이 함수를 먼저 돌려 모든 옵션에 lineId가 있게 만든 뒤 파일을 쓴다.

9. **`saveRequests`(`useAppStore.ts:233`)는 `void saveCache`라 원격 저장 완료를 기다리지 않는다.** 대량 적용 뒤 저장이 끝났다고 단정하지 마라.

10. **컴포넌트 안의 모든 요청 저장은 `commitRequests` 하나를 지난다.** 전체 탭과 보관함에서 저장을 막고 보드 이력을 남기는 자리다. `saveRequests`를 직접 부르지 마라.

---

## 뒤집지 말 것 (이미 정해진 사양)

- **Opt 번호를 매칭 키로 쓰지 마라.** 중간 옵션이 지워지면 번호가 당겨져 같은 번호가 다른 옵션을 뜻한다. 키는 `lineId`다. Opt 번호는 사람이 읽는 값이고 새 옵션을 뒤에 붙일 때의 순서로만 쓴다.
- **옵션을 지우거나 재정렬하지 마라.** 파일에 없는 옵션은 그대로 둔다.
- **빈 셀은 지우라는 뜻이 아니라 그대로 두라는 뜻이다.** 값이 적힌 칸만 바꾼다. 삭제 기능은 이번에 만들지 않는다.
- **목록이 정해진 열에서 해석 못 한 값은 그 칸만 건너뛰고 경고한다.** 빈칸으로 덮어 기존 값을 지우지 마라. `TBD` 같은 자리표시자를 만들지 마라.
- **한 옵션이 여러 줄로 쪼개지는 것은 막는다.** 파일 안에 같은 `lineId`가 두 번 나오면 그 스타일을 통째로 적용 대상에서 뺀다.
- **매칭은 활성 보드 안으로 한정한다.** Garment No.가 보드 안에서 정확히 하나일 때만 적용한다. 선행 0을 잃는 숫자 변환이나 하이픈 제거를 하지 마라. 비교는 `trim()` 뒤 `toLocaleUpperCase("en-US")`까지다.
- **미리보기 없이 저장하지 마라.** 올리자마자 반영하는 길을 만들지 마라.
- **Firestore는 값이 `undefined`인 키를 거부한다**(R340). `requests`는 `state` 청크라 `JSON.stringify`가 걸러 주지만 습관을 깨지 마라. 키를 아예 빼라.
- 커밋, 푸시, `firebase deploy` 모두 하지 마라.

---

## 파트 A. CO와 Dyeing 매핑 교정

### A-1. `src/data/dd-workflow.ts` — Dyeing Side 정규화 함수를 더한다

`DD_DYEING_OPTIONS`(56행) 바로 아래에 `matchCompany`(44~55행 부근)와 같은 꼴로 만든다.

```ts
const dyeingKey = (value: string): string => value.trim().toLocaleUpperCase("en-US").replace(/[\s\-_]+/g, "")
const DYEING_BY_KEY = new Map<string, (typeof DD_DYEING_OPTIONS)[number]>(DD_DYEING_OPTIONS.map((name) => [dyeingKey(name), name]))
// 2026-10-01 확정(R281)에서 SD 는 CSD 로 들어간다. 작지 파서도 같은 약속이다.
DYEING_BY_KEY.set("SD", "CSD")

/**
 * 사람이 친 염색 방식을 DD Dyeing Side 목록 표기로 맞춘다.
 * 빈 값은 빈 문자열, 목록 밖은 null 이다. matchCompany 와 같은 약속이다.
 */
export function matchDyeingSide(value: string | undefined): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  return DYEING_BY_KEY.get(dyeingKey(raw)) ?? null
}
```

**`zaji.ts`의 `matchDyeing`을 지우거나 이 함수로 바꾸지 마라.** 그쪽은 Color 칸까지 함께 읽는 작지 전용 판정이고 범용 검증기가 아니다.

### A-2. `src/data/request-link.ts` — 개발처와 염색을 함께 옮긴다

`dd-workflow`에서 `matchCompany`와 `matchDyeingSide`를 import 한다. 이미 그 파일에서 가져오는 것이 있으면 거기에 붙인다.

같은 파일 안에 도우미를 하나 둔다. 두 호출처가 같은 규칙을 쓰게 하려는 것이다.

```ts
/** 의뢰 옵션의 CO 를 DD 의 두 표현으로 옮긴다. 해석 못 한 값과 빈 값은 아무것도 넣지 않는다. */
function companyFieldsOf(co: string | undefined): { co?: string; devType?: "GD" | "국내" } {
  const matched = matchCompany(co ?? "")
  if (!matched) return {}
  if (matched === "GD" || matched === "국내") return { co: matched, devType: matched }
  // 생산은 devType 에 넣을 자리가 없다. tech.development.co 에만 둔다.
  return { co: matched }
}
```

`matchCompany`가 빈 값에 빈 문자열을 돌려주므로 `if (!matched) return {}` 하나로 빈 값과 목록 밖을 함께 거른다.

**`requestToIntakeRecords`를 이렇게 고친다.**

- `dyeing: option.dyeingMethod`를 `dyeing: matchDyeingSide(option.dyeingMethod) || ""`로 바꾼다. 목록 밖과 빈 값 모두 빈 칸이 된다.
- 개발처는 `companyFieldsOf(option.co)` 결과가 비어 있지 않을 때만 키를 만든다.

```ts
    const company = companyFieldsOf(option.co)
    return [{
      ...record,
      // 기존 필드 그대로
      dyeing: matchDyeingSide(option.dyeingMethod) || "",
      ...(company.devType ? { devType: company.devType } : {}),
      tech: {
        ...record.tech,
        yarnDetail: option.yarnDetail,
        ...(company.co ? { development: { ...record.tech?.development, co: company.co } } : {}),
        requestLink: { reqId: style.reqId, lineId: option.lineId },
      },
    }]
```

**`applyRequestLinks`의 `filled`도 같은 규칙이되 빈 칸 채우기이므로 비어 있을 때만 넣는다.**

- `dyeing: record.dyeing || (matchDyeingSide(option.dyeingMethod) || "")`
- 개발처는 **두 표현이 모두 비었을 때만** 넣는다. 작지나 사람이 이미 정한 값을 덮지 마라.

```ts
    const company = companyFieldsOf(option.co)
    const companyEmpty = !String(record.tech?.development?.co ?? "").trim() && !String(record.devType ?? "").trim()
```

`fillEmpty && companyEmpty`일 때만 `devType`과 `tech.development.co`를 얹는다.

### A-3. 사람에게 알린다

`requestToIntakeRecords`는 순수 함수이고 호출처가 `DevelopmentMasterSheet.tsx`의 `importRequest`(3196행 부근)다. **시그니처를 바꾸지 마라.** 건수를 돌려주게 고치면 호출처가 번진다.

대신 `importRequest`에서 같은 판정을 한 번 더 돌려 건수만 센다.

```ts
    const unknownDye = options.filter((option) => matchDyeingSide(option.dyeingMethod) === null).length
    const unknownCo = options.filter((option) => matchCompany(option.co ?? "") === null).length
```

저장을 막는 것이 아니므로 `setIntakeError`가 아니라 **`setIntakeNotice`**로 안내한다. 문구는 이렇게 한다.

```
염색 방식 N칸은 DD 목록(CSD, PSD, DD, SOAP, YD, PFD) 밖이라 비워 두었습니다.
개발처 N칸은 목록(GD, 국내, 생산) 밖이라 비워 두었습니다.
```

둘 다 0이면 아무 문구도 띄우지 않는다. **새 토스트나 알림 컴포넌트를 만들지 마라.**

---

## 파트 B. 옵션 보충 업로드

### 무엇을 만드는가

사람이 쓰는 순서는 이렇다.

1. 보드에서 **옵션 양식**을 눌러 엑셀을 받는다. 그 보드의 스타일이 옵션 줄 단위로 펼쳐져 있고 현재 값이 채워져 있다.
2. 그 파일의 옵션 6열을 채운다. 팀이 쓰던 시즌 개발 엑셀을 보고 옮겨 적는 자리이고, 옮겨 적는 일은 사람이나 외부 도구가 한다. **앱이 AI를 부르지 않는다.**
3. **옵션 채우기**로 그 파일을 올린다. 바로 반영하지 않고 **무엇이 어떻게 바뀌는지 미리보기**를 띄운다.
4. 사람이 확인하고 적용한다.

### B-1. `src/data/request-option-sheet.ts` (신규) — 양식과 파서

`request-template.ts`의 내려받기와 파싱 구조를 본떠라. 다만 **`TEMPLATE_COLUMNS`를 쓰지 않는다.** 전용 열 정의를 이 파일에 따로 둔다. 두 계약을 섞지 않는 것이 이 파일의 존재 이유다.

시트 이름은 `OPTIONS`다. **1행이 열 이름이고 2행부터 데이터다.** REQUEST 양식은 2행이 열 이름이라 일부러 다르게 둔다. 두 파일을 서로 올려도 1행 열 이름 검사에서 바로 걸린다.

열 순서와 이름이다.

| 열 이름 | key | 비고 |
|---|---|---|
| Garment Number | `garmentNo` | 매칭 키. 스타일 첫 줄에만 적고 아래 옵션 줄은 비운다 |
| Opt | `no` | 사람이 읽는 번호. 키가 아니다 |
| LINE ID | `lineId` | 숨긴 열. 기존 옵션의 영구 키 |
| YARN DETAIL | `yarnDetail` | |
| CONS | `construction` | `matchConstruction` 검증 |
| W'T | `weight` | 숫자만 |
| COLOR | `color` | |
| DYEING METHOD | `dyeingMethod` | 자유 입력 그대로 받는다 |
| CO | `co` | `matchCompany` 검증 |

`LINE ID` 열은 `ws.getColumn(index + 1).hidden = true`로 숨긴다. 사람이 건드릴 값이 아니다.

내보낼 함수와 타입이다.

```ts
export interface OptionSheetRow {
  garmentNo: string
  no: number
  lineId: string
  yarnDetail: string
  construction: string
  weight: number | ""
  color: string
  dyeingMethod: string
  co: string
  /** 엑셀 행 번호. 경고 문구에 쓴다. */
  excelRow: number
}

export interface OptionSheetParseResult {
  rows: OptionSheetRow[]
  warnings: string[]
}

export async function buildOptionWorkbook(styles: readonly RequestStyle[]): Promise<Blob>
export function optionSheetFileName(boardName: string): string
export function parseOptionWorkbook(workbook: XLSX.WorkBook): OptionSheetParseResult
```

`buildOptionWorkbook`은 `exceljs`를 `request-template.ts`와 같은 방식으로 지연 import 한다(`const loaded = await import("exceljs")`, `default` 양쪽 받기). 사진은 넣지 않고 밴드 머리줄도 없다. 1행 열 이름에 연한 바탕과 테두리만 준다. 스타일마다 옵션이 없으면 빈 줄 하나를 적어 사람이 거기에 쓸 수 있게 한다.

`parseOptionWorkbook` 규칙이다.

- 시트를 이름 `OPTIONS`로 찾고 없으면 첫 시트를 쓴다.
- 1행 열 이름이 하나라도 없으면 예외를 던진다. 문구는 `양식이 다릅니다. 1행에 "<열 이름>" 열이 없습니다. 옵션 양식을 받아서 쓰세요.` 다.
- `garmentNo`가 있으면 그 줄부터 그 스타일이고, 빈 줄은 직전 스타일의 다음 옵션이다.
- 옵션 6열이 전부 비고 `lineId`도 비면 그 줄은 경고 없이 건너뛴다.
- `weight`가 숫자가 아니면 빈 값으로 두고 경고한다.
- 스타일이 정해지기 전에 옵션 줄이 나오면 그 줄을 버리고 경고한다.

**여기서는 읽기만 하고 판정하지 않는다.** `construction`과 `co`의 목록 검증은 다음 함수에서 한다.

### B-2. `src/data/request-option-sheet.ts` — 적용 계획

```ts
export interface OptionFieldChange {
  key: "yarnDetail" | "construction" | "weight" | "color" | "dyeingMethod" | "co"
  before: string
  after: string
}

export interface OptionPlanLine {
  lineId: string | null
  no: number
  /** 기존 옵션에 붙는지 새 옵션으로 늘어나는지 */
  kind: "update" | "append"
  changes: OptionFieldChange[]
}

export interface OptionPlanStyle {
  reqId: string
  garmentNo: string
  /** 미리보기를 만든 시점의 값. 적용 직전에 다시 비교한다. */
  updatedAt: string
  lines: OptionPlanLine[]
}

export interface OptionPlan {
  styles: OptionPlanStyle[]
  /** 적용하지 않는 것들. 사람이 읽을 문장이다. */
  skipped: string[]
  warnings: string[]
  changedFields: number
  appendedLines: number
}

export function planOptionUpdate(
  styles: readonly RequestStyle[],
  boardId: string,
  rows: readonly OptionSheetRow[],
): OptionPlan

export function applyOptionPlan(
  styles: readonly RequestStyle[],
  plan: OptionPlan,
): { next: RequestStyle[]; conflicts: string[] }
```

`planOptionUpdate` 규칙이다. **순서대로 거른다.**

1. 대상은 `style.boardId === boardId`인 스타일뿐이다.
2. 파일의 행을 Garment No.로 묶는다. 비교는 `trim()` 뒤 `toLocaleUpperCase("en-US")`다.
3. 그 키가 보드 안에서 0개면 `skipped`에 `보드에 없는 Garment No. "<값>" <N>줄`, 2개 이상이면 `보드에 같은 Garment No. "<값>" 스타일이 <N>건이라 건너뜁니다`를 넣는다.
4. 파일 쪽에서 같은 Garment No.가 두 묶음 이상 나오면 그 키를 통째로 건너뛰고 `파일에 Garment No. "<값>" 이 여러 번 나옵니다`를 넣는다.
5. 묶음 안에서 같은 `lineId`가 두 번 나오면 **그 스타일을 통째로 건너뛴다.** 문구는 `Garment No. "<값>" 에 같은 LINE ID 가 여러 줄입니다. 옵션 하나를 여러 줄로 나눌 수 없습니다.` 다. **이것이 1대N 금지다.**
6. `lineId`가 적혀 있는데 그 스타일의 옵션에 없으면 그 줄을 버리고 경고한다. **새 옵션으로 돌리지 마라.** 다른 스타일의 옵션일 수 있다.
7. `lineId`가 빈 줄은 `kind: "append"`다. 그 스타일 옵션 뒤에 차례로 붙는다.
8. 값 비교는 칸마다 한다. **파일 칸이 비면 그 칸은 변경이 아니다.** 같은 값이어도 변경이 아니다.
9. `construction`은 `matchConstruction`으로, `co`는 `matchCompany`로 맞춘다. 목록 밖(`null`)이면 그 **칸만** 버리고 `warnings`에 `<엑셀 N행> CONS "<값>" 은 목록에 없습니다` 꼴로 적는다. 줄 전체를 버리지 마라.
10. `dyeingMethod`는 REQUEST 쪽이 자유 입력이므로 그대로 받는다. DD로 넘어갈 때 파트 A가 거른다.
11. 변경이 하나도 없는 스타일은 `styles`에 넣지 않는다.

`applyOptionPlan` 규칙이다.

1. **적용 직전 충돌 검사.** `plan.styles`의 `updatedAt`과 지금 `styles` 안 같은 `reqId`의 `updatedAt`이 다르면 그 스타일을 적용하지 않고 `conflicts`에 Garment No.를 넣는다. 스타일이 사라졌어도 같은 처리다.
2. 바꾸는 것은 옵션의 그 칸뿐이다. 스타일 열을 건드리지 마라.
3. `append` 줄은 그 파일의 `blankOption`과 같은 꼴로 만들되 `lineId`는 `crypto.randomUUID()`다. `optId`는 `${reqId}#${번호}`이고 `no`는 1부터 다시 매긴다. **기존 옵션의 `lineId`는 그대로 둔다.**
4. 옵션을 지우거나 순서를 바꾸지 마라.
5. 바뀐 스타일의 `updatedAt`만 지금 시각으로 올린다.

### B-3. `src/routes/FabricRequest.tsx` — 버튼 둘과 미리보기 팝업

도구줄(2171행 부근 「양식 내려받기」와 「업로드」 옆)에 버튼을 더한다. 그 묶음이 이미 `activeBoard !== ARCHIVE_VIEW`로 감싸여 있으니 **전체 탭(`ALL_BOARDS`)에서 숨기는 조건만 더한다.**

- **옵션 양식**: `downloadTemplate`과 같은 꼴이다. 먼저 `ensureRequestLineIds(requests)`를 돌리고 `changed`면 `commitRequests`로 저장한 뒤 **그 결과에서 현재 보드 스타일을 골라** `buildOptionWorkbook`에 넘긴다. 저장하지 않고 파일만 만들면 파일 안 lineId가 원장에 없는 값이 된다.
- **옵션 채우기**: 읽기 권한자(`readOnly`)에게는 띄우지 않는다. 파일 input은 기존 `uploadRef`와 **따로** 둔다. 같은 input을 돌려 쓰면 어느 쪽으로 올린 것인지 구분할 수 없다.

업로드 핸들러는 파싱과 계획까지만 하고 **저장하지 않는다.**

```ts
const [optionPlan, setOptionPlan] = useState<OptionPlan | null>(null)
```

미리보기는 `Dialog`다. `DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라. tailwind-merge가 기본 `fixed`를 지워 팝업이 화면 아래로 떨어진다.

팝업에 담을 것은 이 순서다.

1. 한 줄 요약. `스타일 N건, 칸 N개를 바꾸고 옵션 N줄을 새로 넣습니다.`
2. 스타일별 표. 왼쪽에 Garment No., 오른쪽에 그 스타일의 줄마다 `Opt N`과 바뀌는 칸을 `CONS: (빈칸) 에서 <새 값>` 꼴로 적는다. 새 줄에는 `새 옵션` 딱지를 붙인다.
3. 건너뛴 것과 경고를 접힌 목록으로 둔다. **건수를 숨기지 마라.** 머리줄에 건수를 적는다.
4. 적용과 취소. 바꿀 것이 하나도 없으면 적용을 비활성으로 둔다.

적용은 `applyOptionPlan`을 부르고 **`commitRequests(next, "upload")` 하나로 저장한다.** `conflicts`가 있으면 저장한 뒤 건수를 `setNotice`로 알린다. 문구는 `그 사이 팀원이 고친 스타일 N건은 적용하지 않았습니다. 파일을 다시 올려 주세요.` 다.

저장 뒤 안내는 반영했다고 단정하지 말고 **`화면에 반영했습니다. 서버 저장은 상단 동기화 표시로 확인하십시오.`**로 적는다. `saveRequests`가 저장 완료를 기다리지 않기 때문이다.

---

## 검증

```
npm run build
```

`tsc --noEmit`이 들어 있다. **모든 수정을 마친 뒤 한 번만 돌려라.**

끝나면 `git status --short`로 바뀐 파일이 아래와 같은지 본다. 그 밖의 파일이 바뀌었으면 보고하라.

| 파일 | 조치 |
|---|---|
| `src/data/dd-workflow.ts` | `matchDyeingSide` 추가 |
| `src/data/request-link.ts` | `companyFieldsOf` 추가, 두 경로의 CO·Dyeing 처리 |
| `src/routes/DevelopmentMasterSheet.tsx` | `importRequest`에 안내 건수 |
| `src/data/request-option-sheet.ts` | **신규** |
| `src/routes/FabricRequest.tsx` | 버튼 둘, 미리보기 팝업, 핸들러 |

워킹트리에 R420, R421 미커밋 변경(`MemoDock.tsx`, `screen-memo.ts`, `firestore.rules` 등)이 이미 있다. 그 파일들은 이번 작업과 무관하다. 건드리지 마라.

화면 동작 확인은 박향근이 한다. 개발 서버를 띄우거나 로그인하지 마라.

---

## 하지 말 것

- `request-template.ts`의 `TEMPLATE_COLUMNS`, `parseRequestWorkbook`, `mergeRequestStyles`를 고치지 마라. 파트 B는 별도 경로다.
- `zaji.ts`를 고치지 마라. 이번 범위가 아니다.
- `dropDdLinks`를 새 경로에서 부르지 마라.
- 옵션 삭제, 재정렬, 1대N 분할을 만들지 마라.
- 앱에서 AI나 외부 네트워크를 부르지 마라. 이 앱에는 서버가 없다.
- 공용 토스트나 알림 컴포넌트를 새로 만들지 마라.
- 커밋, 푸시, `firebase deploy` 금지. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `feed.json`은 2.8MB다.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고하라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
