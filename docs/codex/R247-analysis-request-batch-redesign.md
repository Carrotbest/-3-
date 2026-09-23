# R247 FABRIC ANALYSIS 새 분석 의뢰 — 다건 표 개편 + RDDA 엑셀 파싱

상태: 미착수. R244(`docs/codex/R244-analysis-batch-and-redesign.md`) 위에 얹는다. R244는 이미 구현되어 있다(코드로 확인함: `AnalysisRequestDialog.tsx`, `src/data/analysis-import.ts`가 R244 명세대로 동작 중). 이번 건은 그 위에 화면 구조를 바꾸고 엑셀 열 매핑을 새 파일에 맞춘다.

## 배경

1팀에서 미팅 결과 "새 분석 의뢰"도 창고 신규 입고처럼 **한 번에 여러 줄을 입력**하고 싶다고 했다. 지금은 한 번에 한 건만 입력하는 폼 + (엑셀을 올리면 별도의 읽기 전용 미리보기 표로 갈아끼워지는) 구조다. 이걸 `Fabric1IntakeDialog.tsx`와 같은 **가로로 긴 표, 줄 단위 입력/추가/삭제** 구조로 바꾸고, 새로 받은 파일(`RDDA 다운로드 리캡.xlsx`)의 열 이름에 맞춰 엑셀 업로드가 자동으로 값을 채우게 한다.

## 새 파일 구조 (실제로 열어서 확인, RDDA 다운로드 리캡.xlsx)

시트 `Page 1`. 헤더:

```
Image | Type | Number | Season/Year | Brand | Fabric Contents | Fabric Construction | Weight (g/m2) | Meeting | Pickup | Order | Barcode
```

실측 특징(중요, 아래 두 가지는 기존 `parseAnalysisWorkbook`이 그대로는 못 견디는 구조다):

1. **레코드 하나가 3행짜리 병합 블록이다.** 첫 행에 값이 있고 나머지 2행은 완전히 빈 행이다(RDDA 라이브러리에서 그대로 복사해 붙인 형태). 기존 파서는 "값도 없고 이미지도 없는 행"만 건너뛰므로 이 자체는 이미 잘 처리된다.
2. **표 중간에 헤더가 한 번 더 나온다.** RDDA가 페이지 단위로 이어붙여서 41행짜리 시트 중 35행(1-index)에 `Image | Type | Number | ...` 헤더 행이 그대로 다시 나온다. 지금 파서는 처음 1~10행에서만 헤더를 찾고, 그 뒤로는 아무 행이나 값이 있으면 데이터로 읽는다. 그래서 **이 반복된 헤더 행이 내용물 없는 가짜 레코드로 잘못 들어간다.** 고쳐야 한다: 데이터 행을 훑는 루프에서, 그 행이 헤더 판정 기준(별칭이 3개 이상 일치)을 다시 만족하면 데이터로 넣지 말고 건너뛴다. 헤더 탐색에 쓰는 매칭 함수를 데이터 루프에서도 재사용하면 된다.
3. **레코드마다 사진이 2장 들어 있다.** 하나는 A열(Image, 0번 열)에 3행 높이로 걸쳐 있는 원단 사진, 다른 하나는 M열(Barcode, 12번 열 부근) 쪽에 작게 들어간 바코드 그림이다. `worksheet.getImages()`로 둘 다 잡힌다. **지금 파서처럼 "행 번호만 보고" 이미지를 매칭하면 바코드 그림이 빈 필러 행에 잘못 붙어서 그 빈 행이 "사진 있는 행"으로 오판되어 가짜 레코드가 생긴다.** 고쳐야 한다: 이미지를 행으로만 찾지 말고 **열도 같이 확인**해서, 헤더에서 찾은 "사진(Image)" 열 번호와 같은 열(`range.tl.nativeCol`, 0부터)에 앵커된 이미지만 원단 사진으로 쓴다. 다른 열(바코드)에 앵커된 이미지는 무시한다.
4. `Meeting`, `Pickup`, `Order`, `Barcode` 열은 쓰지 않는다(대응하는 의뢰 필드가 없다). `ANALYSIS_IMPORT_COLUMNS`에 별칭을 추가하지 않으면 자동으로 무시된다. 새로 별칭을 만들지 마라.

## 열 매핑 추가 (`src/data/analysis-import.ts`의 `ANALYSIS_IMPORT_COLUMNS`)

R244 문서가 이미 "1팀 양식이 오면 이 표만 고친다"고 적어 둔 자리다. 기존 별칭은 그대로 두고 아래를 **추가**한다:

| 필드 | 추가할 별칭 |
|---|---|
| `source` | `Type` |
| `sourceCode` | `Number` |
| `contents` | `Fabric Contents` |
| `construction` | `Fabric Construction` |
| `weight` | `Weight (g/m2)` |

`normalizeHeader`는 이미 공백·괄호·`*`를 지우고 소문자로 비교하므로 `"Weight (g/m2)"`를 그대로 배열에 넣으면 실제 셀 텍스트 `"Weight (g/m2)"`와 같은 규칙으로 정규화되어 맞는다. 슬래시(`/`)는 안 지워지므로 그대로 둔다.

기존 alias 중 `photo: ["RDDA", "Photo", "Image", "사진"]`는 이미 `"Image"`를 포함하므로 손댈 필요 없다.

## Season/Year 값 변환 (웹 입력 규칙에 맞추기)

RDDA 파일의 `Season/Year` 값은 `"Spring 27"`, `"Fall 27"` 형식이다. 웹의 `DD_SEASON_OPTIONS`(`src/data/dd-workflow.ts` 26행)는 `"SS'26"`, `"FW'26"` 형식이다. `analysis-import.ts`에 변환 함수를 추가한다:

```ts
const SEASON_PREFIX: Record<string, string> = { spring: "SS", summer: "SS", fall: "FW", autumn: "FW", winter: "FW", holiday: "FW" }

function convertRddaSeasonToWeb(raw: string): string {
  const m = raw.trim().match(/^(Spring|Summer|Fall|Autumn|Winter|Holiday)\s+'?(\d{2,4})$/i)
  if (!m) return raw.trim()
  const prefix = SEASON_PREFIX[m[1].toLowerCase()]
  const yy = m[2].slice(-2)
  return prefix ? `${prefix}'${yy}` : raw.trim()
}
```

파싱한 `season` 값에 이 함수를 거친 뒤, 그 결과가 `DD_SEASON_OPTIONS`에 없으면 지금처럼 경고를 붙이되 **변환된 값**을 그대로 쓴다(원문 `"Spring 27"`로 되돌리지 않는다).

## 기본값 규칙 변경

- `objective`: 엑셀에 대응 열이 없다(이 파일에는 Objective 정보 자체가 없다). 파싱 결과 `objective`가 빈 값이면 **`"Reference"`로 채운다**(`ANALYSIS_OBJECTIVES`의 값 중 하나, `fabric-analysis.ts` 4행). 이건 가져오기 전용 규칙이 아니라 **가져온 행을 만들 때 기본값**으로 넣는다(엑셀에 Objective 열이 있는 다른 양식이 나중에 오면 그 값이 우선이어야 하므로, "엑셀 값이 있으면 그 값, 없으면 Reference" 순서로 처리한다).
- `department`, `customer`는 지금처럼 `DEFAULT_DEPARTMENT`/`DEFAULT_CUSTOMER`로 비어있을 때 채운다(이미 그렇게 되어 있다. 손대지 않는다).
- `gender`: 이 파일에 대응 열이 없다. 빈 칸으로 둔다(기존 동작 그대로, 손대지 않는다).
- `source`는 **이제 필수 입력이다**(아래 검증 규칙 참고). 엑셀의 `Type` 값을 가져오되 수정 가능해야 한다(자유 입력 유지, `ANALYSIS_SOURCES` 목록에 없는 값이어도 막지 않는다 — 지금 `field()` 헬퍼가 `datalist`로 추천만 하는 방식을 그대로 쓴다).

## 필수값 검증 변경

`AnalysisRequestDialog.tsx`의 `error` 계산(지금 `!form.requester.trim() || !form.description.trim()`)에 **`!form.source.trim()`**을 추가해 Source도 필수로 만든다. 안내 문구도 "Requester, Source, Request item은 필수입니다."로 바꾼다.

## 필수 표시(`*`) 빨간색 처리

지금 `field()`/`selectField()` 헬퍼는 라벨 문자열을 그대로 `<Label>{label}</Label>`로 렌더링해서 `"AN No. *"`처럼 넘겨도 `*`가 그냥 검은 글자다. `Fabric1IntakeDialog.tsx` 368행이 이미 쓰는 방식(`label.endsWith(" *") ? <>{label.slice(0, -2)} <span className="text-[var(--destructive)]">*</span></> : label`)과 같은 처리를 `field()`/`selectField()`에도 적용해서 라벨 끝의 `" *"`를 빨간 별표로 분리 렌더링한다. `Source` 라벨을 `"Source *"`로 바꾼다(필수가 됐으므로).

## Request item 빠른 버튼 색 구분

지금 `ANALYSIS_ITEMS.map((item) => <Button ... variant="outline">{item}</Button>)`는 6개 버튼이 전부 같은 회색 outline이다. 각 항목에 옅은 색을 하나씩 고정으로 준다(다크모드 대응 포함, 기존 프로젝트에서 쓰는 pastel 톤 예: teal/amber/sky/violet/rose/lime 계열 `bg-*-50 dark:bg-*-950/30 text-*-700 dark:text-*-300 border-*-200 dark:border-*-800` 형태). 6개 항목 각각 다른 색이면 된다. 정확한 색상값 선택은 맡긴다.

## 화면 구조 개편: 단일 폼 → 가로로 긴 다건 표

**새 의뢰 작성(`record == null`)일 때만** 표 구조로 바꾼다. **기존 레코드 수정(`record` prop이 있을 때, "의뢰 정보 수정" 흐름)은 지금의 단일 폼 레이아웃을 그대로 유지한다** — 한 건만 고치는 화면이라 표로 바꿀 이유가 없다.

`Fabric1IntakeDialog.tsx`를 구조 참고 모델로 그대로 따른다(팝업 폭 `w-[min(96vw,1680px)]`, 가로 스크롤 표, 줄마다 복제·삭제 버튼, 맨 아래 "줄 추가" + 건수 표시, 우측 하단 저장 버튼).

### 표 컬럼(왼쪽부터)

`#`, 사진, AN No.(자동, 읽기전용 표시), Department, Requester, Customer, Objective, `Source *`, Source code, Season/Year, Gender/Age, Brand, Construction, Contents, Weight, `Request item *`, Comment, Request type, (복제/삭제 버튼 열)

- **AN No.**: 편집 불가, `nextAnNo`로 화면에 표시만 한다(Fabric1IntakeDialog의 `displayNumbers`/자동번호 표시와 같은 방식 — 실제 저장 시점에 앞줄부터 순서대로 확정해서 매긴다. 화면에 보이는 번호와 저장 시 번호가 다를 수 있다는 안내는 필요 없다. AN No.는 동시 사용자 경합을 막는 장치가 없어도 된다 — 저장 시 `useAppStore.getState().analysisRequests`를 다시 읽어 그 시점 기준으로 순서대로 매기면 된다, 지금 `saveImported`가 이미 그렇게 한다).
- **사진**: 작은 썸네일 칸(36~40px). 클릭하면 파일 선택, 그 칸에 이미지 파일을 드래그&드롭해도 받는다(엑셀에서 사진 자동 매칭이 안 되거나 틀렸을 때 사람이 직접 바꿔 끼우는 용도). 엑셀 업로드로 채워진 사진은 미리 여기에 들어가 있는 상태로 시작한다.
- **Objective / Season/Year / Construction**: 지금 단일 폼의 `Select`(드롭다운, R244에서 이미 구현) 대신 표 안에서는 `<select>` 또는 같은 목록을 쓰는 좁은 드롭다운으로 넣는다(칸이 좁으므로 `SelectTrigger` 풀사이즈 대신 표 셀에 맞는 높이로).
- **Request item**: 표 칸은 좁은 `<Input>`(여러 줄 textarea 대신). 대신 표 **위나 아래에 빠른 입력 버튼 6개**(색 구분, 위 항목 참고)를 한 번 두고, 버튼을 누르면 **현재 포커스된 행의 Request item 칸**에 값을 이어 붙인다(포커스 추적 필요 — 마지막으로 포커스했던 행 id를 state로 들고 있다가 그 행에 적용. 포커스된 행이 없으면 버튼을 비활성화하거나 마지막 행에 적용).
- **Comment**: 좁은 `<Input>`.

### 엑셀에서 가져온 값 옅은 색 표시

각 행 state에 `parsedFields: Set<string>`(또는 필드별 boolean)을 같이 들고 있다가, 엑셀 업로드로 채워진 칸은 만들어질 때부터 그 필드 이름을 넣어 둔다. 그 칸의 입력 배경에 옅은 강조색(예: `bg-teal-50 dark:bg-teal-950/20`, 위에서 정한 강조색 계열과 통일)을 준다. **사람이 나중에 그 칸 값을 고쳐도 표시는 그대로 유지한다**(값이 바뀌었는지 추적하지 않는다 — "이 칸은 엑셀에서 왔다"는 출처 표시이지 "원본 그대로"라는 표시가 아니다). 수기로 직접 추가한 빈 줄(엑셀을 거치지 않은 줄)은 `parsedFields`가 비어 있으므로 자연히 강조가 없다.

### 엑셀 업로드는 표에 줄을 이어 붙인다

지금처럼 "가져온 N건" 별도 미리보기 화면으로 전환하지 않는다. `parseAnalysisWorkbook` 결과(`AnalysisImportRow[]`)를 받으면, 표 끝에 그만큼 새 줄을 이어 붙인다. 각 줄은:

- `department`, `customer`, `objective`, `source`, `sourceCode`, `season`, `gender`, `brand`, `construction`, `contents`, `weight`를 `AnalysisImportRow`에서 채운다.
- `requester`는 **로그인한 사용자 이름으로 채운다**(엑셀 값이 있어도 쓰지 않는다 — 지금 `parseAnalysisWorkbook`은 애초에 requester를 파싱하지 않으므로 자연히 그렇게 된다. `requester` prop을 그대로 쓰면 된다).
- `description`(Request item)은 채우지 않는다(엑셀에 대응 열이 없다. 사람이 표에서 직접 채운다). 이 칸이 비어 있으므로 저장 시 필수값 검증에서 걸린다 — 정상 동작이다.
- `image`(File)가 있으면 사진 칸에 미리 넣는다.
- 채워진 필드 이름을 `parsedFields`에 기록한다(위 하이라이트 규칙용).
- 기존의 "가져온 엑셀 AN 번호는 쓰지 않는다" 경고(`warnedAnNo`)는 그대로 유지(이 파일엔 AN 열이 없으니 실제로는 안 뜬다).

파일 input, "엑셀 업로드" 버튼은 R246(`Fabric1IntakeDialog.tsx`에 새로 넣는 버튼)과 같은 자리 감각으로 표 아래 액션 줄에 둔다.

### 저장

표 아래에 "N건 저장" 버튼 하나로 통일한다(`저장하고 추가`, 지금의 `저장` 버튼을 없애고 하나로 합친다). 빈 줄(모든 칸이 기본값/빈값)은 저장 대상에서 제외한다(`Fabric1IntakeDialog.tsx`의 `isBlankRow` 판정 방식을 참고해 비슷한 판정 함수를 만든다). 필수값(`requester`, `source`, `description`) 중 하나라도 빈 줄이 있으면 그 줄들을 빨간 테두리로 표시하고 저장을 막는다(`invalid` Set 방식, `Fabric1IntakeDialog.tsx`와 동일한 패턴).

저장 로직은 지금의 `saveImported`를 확장하는 형태로 만든다: `useAppStore.getState().analysisRequests`를 기준으로 순서대로 `nextAnNo`를 매겨 `blankAnalysisRequest` 뼈대에 표의 값을 얹어 만들고, 한 번의 `saveAnalysisRequests`로 전부 넣은 뒤, 사진이 있는 줄만 순서대로 업로드해서 다시 저장한다(지금 `saveImported`의 사진 처리 흐름 그대로 재사용).

## 하지 말 것

- 기존 레코드 수정(`record` prop 있음) 화면 레이아웃을 표로 바꾸지 마라.
- `saveOne`(단일 폼 저장, 수정 모드에서 계속 쓴다)의 동작을 바꾸지 마라.
- `AnalysisDetailDialog.tsx`, `FabricAnalysis.tsx` 목록/그래프 화면은 건드리지 마라(이번 건은 의뢰 팝업 하나만).
- `writeBatch`, `mergeForKey`를 직접 부르지 마라. 저장은 `saveAnalysisRequests`만.
- `storage.rules`, `firestore.rules`를 고치지 마라.
- `fabricAnalysis`(옛 AX export 키), `ingestFabric`, `parseFabricAnalysis`는 건드리지 마라(R244 문서에 있던 금지 항목, 그대로 유지).
- 실명, 메일 주소, 실데이터를 코드와 문서에 넣지 마라.

## 검증

- `npm run build` 통과.
- `git status --short`가 아래 범위 안.

| 파일 | 조치 |
|---|---|
| `src/data/analysis-import.ts` | 새 별칭, 반복 헤더 행 스킵, 이미지 열 필터링, season 변환, objective 기본값 |
| `src/data/fabric-analysis.ts` | 필요하면(색상 상수 등) |
| `src/components/analysis/AnalysisRequestDialog.tsx` | 새 의뢰 작성 시 표 구조로 개편, 필수 표시 빨간색, Source 필수, Request item 버튼 색 |
| `src/components/analysis/*` | 필요하면 표 관련 하위 컴포넌트 새로 추가 |

- 실제 파일 업로드 확인은 박향근이 직접 한다: FABRIC ANALYSIS → 새 분석 의뢰 → 엑셀 업로드 → `RDDA 다운로드 리캡.xlsx` 선택 → 13건(HMP127001~127024 중 헤더 반복 제외)이 표에 채워지는지, 반복 헤더 행이 가짜 줄로 안 생기는지, 사진이 원단 사진(바코드 아님)으로 맞게 붙는지, Season이 `SS'27` 형식으로 바뀌는지 확인.
