# R246 1팀 신규 입고 팝업 엑셀 업로드

상태: 미착수.

## 배경

1팀 신규 입고 팝업(`src/components/warehouse/Fabric1IntakeDialog.tsx`)은 지금 표에 직접 타이핑하거나 탭 구분 텍스트를 붙여넣는 방식만 있다. 편집 권한이 있는 모든 사용자가 RDDA에서 받은 `FOLDER ITEM LIST` 엑셀(`FOLDER_ITEM_LIST_FABRIC.xls`)을 그대로 업로드해서 표를 자동으로 채우고 싶어한다. R&D No.(창고 번호)는 지금처럼 자동 채번을 유지한다(이 팝업은 이미 그렇게 동작한다. 손대지 않는다).

## 파일 구조 (실제로 열어서 확인)

파일 예시: `FOLDER_ITEM_LIST_FABRIC.xls`, 시트 `Page 1`. 1행은 제목(`FOLDER ITEM LIST - TEST`), **2행이 헤더**, 3행부터 데이터.

헤더(2행, 그대로 옮김):

```
No. | Ref. No | Fabric Source | Supplier | Org. Fabric No(R&D CODE) | Construction | Content | Width(INCH) | Weight(G/M2) | Price($/YD) | Price($/LB) | Finish | Special Yarn | Yarn Detail | Comment | Remark | Fabric CO | Brand | Brand Protection
```

실제 헤더 셀 문자열에는 줄바꿈이 섞여 있다(`"Width\n(INCH)"`, `"Weight\n(G/M2)"`). 비교할 때 공백류(개행 포함)를 하나로 접어서 비교한다.

## 열 매핑

사용자가 직접 준 매핑(웹 필드 ← 엑셀 열):

| 웹 필드(`Fabric1IntakeInput`) | 엑셀 열 | 비고 |
|---|---|---|
| `flNo` | Ref. No | |
| `construction` | Construction | |
| `fields.content` | Content | |
| `fields.actualWeight` | Weight(G/M2) | |
| `fields.supplier` | Supplier | Mill |
| `storageNo` | — | 채우지 않는다. 팝업의 기존 자동 채번 로직(`displayNumbers`/`autoNumbers`)이 그대로 빈 칸에 번호를 붙인다 |
| `owner` | — | 채우지 않는다. 팝업이 이미 `defaultOwner`(로그인 사용자)로 기본값을 넣는다. 이 동작을 유지한다 |
| `color` | — | 수기 입력. 비워 둔다 |
| `season` | — | 수기 입력. 비워 둔다 |
| `buyer`(Brand 칸) | — | 수기 입력. 비워 둔다. 파일에도 `Brand`, `Brand Protection`, `Fabric CO` 열이 있지만 **쓰지 않는다**(사용자가 명시적으로 수기입력이라고 함) |
| `note` | — | 수기 입력. 비워 둔다 |

나머지 열(No., Fabric Source, Org. Fabric No(R&D CODE), Width, Price×2, Finish, Special Yarn, Yarn Detail, Comment, Remark, Fabric CO, Brand, Brand Protection)은 어디에도 옮기지 않는다.

## 구현

### 1. 파서 `src/data/fabric1-intake-excel.ts` (새 파일)

- `xlsx`(SheetJS)로 읽는다. `zaji.ts`/`xlsx-parsers.ts`와 같은 이미 쓰는 방식(정적 import 그대로 써도 된다. 이 프로젝트는 `xlsx`를 이미 번들에 포함해 쓰고 있다).
- 1~5행 안에서 위 표의 5개 필드(Ref. No, Construction, Content, Weight(G/M2), Supplier) 중 3개 이상이 맞는 행을 헤더로 본다(제목 행 때문에 1행 고정이 아니다. 실제로는 2행이었지만 다른 버전 파일이 올 수 있으니 스캔한다).
- 헤더를 못 찾으면 `{ rows: [], warning: "헤더를 찾지 못했습니다." }` 형태로 반환한다.
- 각 데이터 행에서 5개 값을 뽑아 `{ flNo, construction, content, actualWeight, supplier }` 객체 배열로 반환한다. 5개 다 빈 칸인 행(완전 공백 행)은 건너뛴다.
- export: `parseFabric1IntakeExcel(file: File): Promise<{ rows: Fabric1IntakeExcelRow[]; warning?: string }>`
- `Fabric1IntakeExcelRow = { flNo: string; construction: string; content: string; actualWeight: string; supplier: string }`

### 2. 팝업에 업로드 버튼 추가 `src/components/warehouse/Fabric1IntakeDialog.tsx`

- `DialogFooter`의 "줄 추가" 버튼 옆(또는 바로 왼쪽)에 "엑셀 업로드" 버튼을 추가한다. `AnalysisRequestDialog.tsx`의 엑셀 업로드 버튼(숨긴 `<input type="file">` + ref + 버튼 클릭으로 트리거, `FileSpreadsheet` 아이콘)과 같은 패턴을 그대로 따른다.
- 클릭하면 `parseFabric1IntakeExcel`을 호출한다. 결과 행 수만큼 `makeRow`로 새 줄을 만들어 **현재 표 끝에 이어 붙인다**(기존 줄을 지우지 않는다. 지금 표가 빈 첫 줄 하나뿐이면 그 빈 줄은 그대로 두고 뒤에 이어 붙여도 되고, 첫 줄이 완전히 빈 줄이면 그 자리부터 채워도 된다 — 기존 `isBlankRow` 판정을 재사용해서 자연스럽게 처리하면 된다).
- 새로 추가되는 각 줄은 `construction`, `fields.content` 자리(`content`), `actualWeight`, `supplier`를 채우고, `owner`는 팝업의 `defaultOwner`(기존 `makeRow`/`initialRow`가 이미 하는 방식 그대로), `storageNo`는 빈 채로 둬 자동 채번이 그대로 동작하게 한다. `color`, `season`, `buyer`, `note`는 빈 칸.
- 파싱 중에는 버튼에 "읽는 중…" 표시하고 비활성화한다. 읽기 실패 시 다이얼로그 상단 `error` 자리에 메시지를 보인다(기존 `error` state 재사용).
- 파일 input의 `value`는 매 선택 후 비워서 같은 파일을 다시 선택해도 동작하게 한다(`AnalysisRequestDialog.tsx`의 `excelInput.current.value = ""` 패턴과 동일).

## 하지 말 것

- R&D No. 자동 채번 로직(`suggestNumbers`, `numberRows`, `claimStorageNumbers`)을 건드리지 마라. 이번 기능은 그 위에 줄만 더 만든다.
- `owner` 기본값 로직을 바꾸지 마라(로그인 사용자 자동 채움을 유지해야 한다).
- 파일의 Brand/Fabric CO/Brand Protection 값을 어디에도 채우지 마라(수기 입력 유지).
- 표 붙여넣기(`handlePaste`) 로직을 바꾸지 마라. 엑셀 업로드는 별도 경로다.
- `Fabric1IntakeInput`/`addFabric1Intake`(저장 로직)를 바꾸지 마라. 이번 건은 화면 입력 보조 기능이고 저장 흐름은 기존 그대로다.

## 검증

- `npm run build` 통과.
- `git status --short`가 아래 범위 안.

| 파일 | 조치 |
|---|---|
| `src/data/fabric1-intake-excel.ts` | 새 파일 |
| `src/components/warehouse/Fabric1IntakeDialog.tsx` | 엑셀 업로드 버튼 추가 |

- 실제 파일로 열어보는 확인은 박향근이 직접 한다: 1팀 창고보관 탭 → 신규 입고 → 엑셀 업로드 → `FOLDER_ITEM_LIST_FABRIC.xls` 선택 → FL No./Construction/Content/Weight/Mill이 채워진 줄이 이어 붙는지, R&D No.가 여전히 자동으로 채워지는지 확인.
