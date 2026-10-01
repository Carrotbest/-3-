# R270 원가계산서 자료실과 FL# 진입

상태: **미착수.** R267(계산 코어), R268(저장·팝업), R269(원사 자동 채움)는 완료다.

지금은 계산서가 `costSheets` 컬렉션에 쌓이는데 **꺼내 볼 화면이 없다.**
DD MASTER 에서 그 행을 우클릭해야만 자기 계산서를 볼 수 있다.
사업부가 FL# 을 들고 오면 DD 에서 그 행을 찾아 들어가야 한다. 그 창구를 만든다.

원사 시세표는 **R271** 이다. 이번 범위가 아니다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/routes/CostSheets.tsx` | 신규. 자료실 화면 |
| `src/data/cost-export.ts` | 신규. 엑셀 내보내기 |
| `src/routes/route-config.ts` | 라우트와 사이드바 등록 |
| `src/App.tsx` | 라우트 연결 |
| `src/data/screen-permissions.ts` | `costSheet` 권한 키 |
| `src/routes/DevelopmentMasterSheet.tsx` | FL# 클릭으로 팝업 열기 |

이 여섯 개 외에는 수정하지 마라.
`src/data/cost-sheets.ts`, `src/data/fabric-cost.ts`, `src/data/yarn-blend.ts`,
`src/components/dd/CostSheetDialog.tsx` 의 **로직을 고치지 마라.** 필요하면 export 만 더한다.

---

## 1. FL# 클릭 진입

### 1-1. 무엇을

국내 건이고 FL# 이 완료 형식이면 **FL 번호를 눌러 원가계산서 팝업을 연다.**
우클릭 `사전 원가계산…` 은 **그대로 둔다. 지우지 마라.**
FL# 이 아직 없는 행은 클릭할 것이 없는데, 사전 원가계산은 완료 전에 하는 일이라
그 경로가 사라지면 기능 이름과 어긋난다.

판정은 둘 다 만족해야 한다.

```
isCompletedFlNo(record.flNo)                       // src/data/dd-workflow.ts, /^FL\d{8}$/
Co 가 "국내" 또는 "생산"                            // record.tech?.development?.co || record.devType
```

`DevelopmentMasterSheet.tsx` 에 이미 `costTargetRows()` 가 쓰는 같은 판정이 있다.
모듈 수준 헬퍼 하나로 뽑아 양쪽이 같이 쓰게 하라. 판정을 두 벌 만들지 마라.

### 1-2. 어디에

`flNo` 는 `result` 그룹 열이라 `MasterCell`(1004행 근처)을 거친다.
`styleNo` 의 `REQ` 칩처럼 sticky 블록에서 특수 처리되는 열이 아니다.

`MasterCell` 의 actions 인터페이스(**942행** `contextMenu` 옆)에 콜백을 하나 더한다.

```ts
  openCostSheet: (rowId: string) => void
```

`contextMenu` 가 **2754행**에서 넘어가는 방식과 똑같이 연결한다.

`MasterCell` 안에서 `column.id === "flNo"` 이고 위 판정이 참이면 렌더 결과를 감싼다.
`column.render` 를 바꾸지 마라. GROUPS 는 모듈 상수라 콜백에 닿지 못한다.

### 1-3. 더블클릭 편집을 죽이지 마라

FL# 칸은 지금 더블클릭으로 인라인 편집이 된다. 클릭에 팝업을 붙이면 그게 깨진다.

**타이머로 가른다.**

```
onClick        220ms 타이머를 건다. 타이머가 살아남으면 팝업을 연다.
onDoubleClick  타이머를 지운다. 편집이 그대로 열린다.
```

타이머 id 는 `useRef` 에 담고 언마운트에서 `clearTimeout` 한다.
`onMouseDown` 은 `stopPropagation` 하지 마라. 셀 선택과 드래그가 그대로 살아야 한다.
`onDoubleClick` 도 `stopPropagation` 하지 마라. 편집이 열려야 한다.

**`ref` 콜백 안에서 `setState` 하지 마라.** 무한 렌더로 화면이 백지가 된다(R119 사고).

### 1-4. 보이게

누를 수 있는 FL# 은 마우스를 올렸을 때 점선 밑줄과 `cursor-pointer` 를 준다.
`title` 은 `원가계산서 열기` 다. 평소 글자색과 굵기는 바꾸지 마라. 표가 시끄러워진다.

이미 계산서가 있는 행(`tech.costRef`)은 `title` 에 `원가계산서 열기 · v{version}` 을 쓴다.

---

## 2. `src/data/cost-export.ts`

```ts
export async function exportCostSheetWorkbook(doc: CostSheetDoc): Promise<Blob>
export function costSheetFileName(doc: CostSheetDoc): string
```

`exceljs` 로 만든다. 이미 `dependencies` 에 있다. 새 패키지를 설치하지 마라.

**원본 `6085.xlsx` 를 그대로 복제하지 않는다.** 원본에는 병합 셀, 로고 이미지, 인쇄 설정,
민감도 라벨이 들어 있다. 그 양식 파일을 저장소에 넣지 마라. 공개 저장소다.
같은 항목과 같은 숫자가 담긴 깨끗한 시트를 새로 만든다.

시트 이름은 `원가계산서` 다. 구역 순서는 팝업과 같다.

| 구역 | 내용 |
|---|---|
| 머리 | Style No., Project, Buyer, Season, Color, 조직, FL#, 담당, 계산일, 버전 |
| 기준 | 환율, 중량 g/㎡, 폭 inch, gr/yd |
| 원사 | 표기, 해석, 투입%, 단가, 단위, 선염, $/kg 기여, 비중% |
| 혼용율 | `blend.labelText` 한 줄과 정확값 줄 |
| 공정 | 구분, 항목, 업체, 단가, 단위, loss%, $/kg 기여, 비중% |
| 결과 | Net $/kg, Net $/yd, Net 원/yd. 이익률이 0 이 아니면 이익 줄도 |

숫자 서식은 `$/kg` 과 `$/yd` 가 소수 4자리, `원/yd` 가 정수 천단위 구분이다.
`sharePct` 는 소수 1자리에 `%` 를 붙인다.

파일명은 `file-naming` 규칙을 따른다. 짧게, 언더스코어, MMDD.

```
costSheetFileName(doc)  ->  `원가_{FL# 또는 StyleNo}_{MMDD}_v{version}.xlsx`
예: 원가_FL26090012_0930_v2.xlsx
```

FL# 과 Style No. 가 둘 다 비면 `원가_{MMDD}_v{version}.xlsx` 다.

---

## 3. `src/routes/CostSheets.tsx`

`src/routes/FabricAnalysis.tsx` 를 먼저 읽고 그 화면 골격과 스타일을 따른다.
새 디자인을 만들지 마라. 라우트 이름은 **COST SHEET** 다.

### 3-1. 검색

맨 위에 검색줄 하나다. 한 칸에 무엇을 넣어도 찾게 한다.

```
FL#, Style No., Project, Buyer, 담당, 조직
```

`listCostSheets` 가 Firestore 에서 최근 것부터 상한만큼 가져오고,
**걸러내기는 클라이언트에서 한다.** Firestore 복합 인덱스를 새로 만들지 마라.

상한은 500 으로 두고, 상한에 닿으면 목록 위에 `최근 500건만 보고 있습니다` 를 적는다.

`?fl=FL26090012` 파라미터를 받으면 그 값으로 검색칸을 채우고 바로 거른다.
DD MASTER 나 다른 화면에서 링크로 보낼 수 있게 한다. 파라미터는 읽은 뒤 지운다.
DD MASTER 의 `?focus=rowId` 가 쓰는 방식과 같게 맞춘다.

### 3-2. 목록

`latestByGroup` 으로 **원단마다 최신 버전 한 줄씩** 보인다.
열은 FL#, Style No., Project, Buyer, 조직, Color, 담당, 계산일, 버전, Net 원/yd, Net $/yd 다.

`isCostSheetStale` 이 참인 줄은 계산일 옆에 `N일 경과` 배지를 `var(--warning)` 으로 단다.
도구줄에 `경과 건만` 토글을 둔다. 사업부가 묻기 전에 보이게 하는 장치다.

**목록이 길다. `SectionCard` 로 감싸지 마라.** `Reveal` 의 IntersectionObserver 임계값이 0.12 라
카드가 뷰포트보다 길면 영영 안 보인다. `Card` 를 직접 쓴다.

줄 끝에 `엑셀` 버튼을 둔다. `exportCostSheetWorkbook` 결과를 바로 내려받는다.

### 3-3. 상세

줄을 누르면 오른쪽(또는 아래)에 그 원단의 **버전 전체**를 펼친다.

- 버전 목록. 버전, 계산일, 작성자, Net 원/yd
- 두 버전을 고르면 `compareCostSheets` 결과를 표로. 항목, 이전, 이후, 차이, 증감%
- 증감은 오르면 `var(--destructive)`, 내리면 `var(--chart-2)` 다
- 버전마다 `엑셀` 버튼
- `DD 행 열기` 링크. `/development/workspace?focus={rowKey}` 로 보낸다

`compareCostSheets` 는 `src/data/cost-sheets.ts` 에 이미 있다. 새로 만들지 마라.

### 3-4. 권한

읽기는 전원, 편집은 3팀이다. 이 화면에는 편집 동작이 없으므로
**`엑셀` 버튼과 목록을 권한으로 막지 마라.** 읽기 권한이면 다 보인다.

---

## 4. 라우트와 권한 등록

### 4-1. `src/data/screen-permissions.ts`

`SCREEN_PERMISSION_OPTIONS` 에 한 줄 더한다. `fabricAnalysis` 다음 자리다.

```ts
  { key: "costSheet", label: "COST SHEET", paths: ["/cost"] },
```

### 4-2. `src/routes/route-config.ts`

`RouteDefinition` 과 사이드바 `NavigationGroup` 에 등록한다.

```
path     /cost
title    COST SHEET
subtitle 국내 원단 원가계산서 보관과 검색
icon     Calculator   (lucide-react 에서 import)
```

사이드바 자리는 **DD MASTER 와 PROGRESS OVERVIEW 사이**다.
`ownerOnly` 를 붙이지 마라. 읽기는 전원이다.

### 4-3. `src/App.tsx`

기존 라우트가 등록된 방식 그대로 `/cost` 를 `CostSheets` 에 연결한다.
`fullBleed` 로 두지 마라. DD workspace 만 폭 제약을 푼다.

---

## 5. 하지 말 것

- 우클릭 `사전 원가계산…` 을 지우지 마라. FL# 없는 행의 유일한 진입로다.
- `column.render` 로 팝업을 열려고 하지 마라. GROUPS 는 모듈 상수라 콜백에 닿지 못한다.
  `MasterCell` 의 actions 로 넘긴다.
- FL# 칸의 `onMouseDown` 과 `onDoubleClick` 에 `stopPropagation` 을 걸지 마라.
  셀 선택과 인라인 편집이 죽는다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- **긴 목록을 `SectionCard` 로 감싸지 마라.** `Card` 를 직접 쓴다.
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- Firestore 복합 인덱스를 새로 요구하는 쿼리를 쓰지 마라. 거르기는 클라이언트에서 한다.
- `6085.xlsx` 양식 파일을 저장소에 넣지 마라. 공개 저장소다.
- 새 npm 패키지를 설치하지 마라. `exceljs` 가 이미 있다.
- `cost-sheets.ts`, `fabric-cost.ts`, `yarn-blend.ts`, `CostSheetDialog.tsx` 의 로직을 고치지 마라.
- 원사 시세표를 만들지 마라. R271 이다.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라.
- 파일을 삭제하지 마라.

## 6. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**
R268 에서 실패한 채로 보고가 올라왔다. 같은 일을 반복하지 마라.

`git status --short` 에 위 표의 여섯 파일과 이 문서만 더 보여야 한다.

화면 확인은 박향근이 한다. 보고에 아래만 적어라.

- 사이드바에 COST SHEET 가 DD MASTER 와 PROGRESS OVERVIEW 사이에 있는가
- DD MASTER 에서 국내 건의 완료 FL# 에 마우스를 올리면 점선 밑줄이 뜨는가

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
