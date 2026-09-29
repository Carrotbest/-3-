# R253 새 분석 의뢰 팝업을 한 건당 두 줄 카드로

상태: 미착수. 화면 레이아웃만 바꾼다. 데이터 계약, 저장 로직, 엑셀 파서는 건드리지 않는다.

## 왜 고치는가

`AnalysisRequestDialog`의 일괄 입력 표가 19열 고정폭이다. 합계가 약 1,787px인데 팝업 최대폭이 1,680px이고 안쪽 여백을 빼면 약 1,630px이다. 그래서 오른쪽 끝에 가까운 Request item(185px)이 초기 화면에서 잘린다. 사용자가 가장 중요하게 보는 칸인데 매번 가로 스크롤을 해야 한다.

세로 병합 없이 두 줄로 나누기만 하면 세로만 길어진다. 열을 실제로 줄여야 한다.

## 근거 수치

현재 `<colgroup>` 폭 합계(19열): 9+14+105+95+80+130+90+95+105+100+110+145+165+60+105+185+70+60+64 = **1,787px**

바꾼 뒤 목표

| 줄 | 넣을 것 | 합계 |
|---|---|---|
| 첫 줄 | 번호 28, 사진 44, AN No. 110, Source 130, Source code 150, Brand 120, Season/Year 110, Gender/Age 110, Construction 160, Contents 180, Weight 70, Objective 110, Urgent 70, 삭제 40 | 약 1,432px |
| 둘째 줄 | Request item 약 1,050, Comment 약 450 | 약 1,500px |

둘 다 1,630px 안에 들어간다. 가로 스크롤이 사라진다. Request item이 185px에서 약 1,050px이 된다.

## 무엇을 바꾸는가

### 1. 공통 줄을 만든다

팝업 상단, 빠른 입력 버튼 줄 아래에 공통 입력 줄을 둔다. 항목은 넷이다.

- Department (기본값 `DEFAULT_DEPARTMENT`)
- Requester (기본값 props `requester`)
- Customer (기본값 `DEFAULT_CUSTOMER`)
- Objective (기본값 빈 값)

새 state를 하나 둔다.

```ts
const [common, setCommon] = useState({ department: DEFAULT_DEPARTMENT, requester, customer: DEFAULT_CUSTOMER, objective: "" })
```

`open`이 true로 바뀔 때 기존 초기화 흐름과 같은 자리에서 이 값도 초기화한다.

**공통 값을 바꿀 때 카드에 반영하는 규칙.** 지금 카드 값이 바뀌기 전 공통 값과 같은 카드에만 넣는다. 개별로 고쳤거나 엑셀에서 다른 값이 들어온 카드는 건드리지 않는다.

```ts
const setCommonField = (field: "department" | "requester" | "customer" | "objective", value: string) => {
  const previous = common[field]
  setCommon((current) => ({ ...current, [field]: value }))
  setRows((current) => current.map((row) => row.form[field] === previous
    ? { ...row, form: { ...row.form, [field]: value } }
    : row))
}
```

새 줄을 추가할 때(`appendRow`)와 엑셀에서 값이 비어 들어올 때는 공통 값을 채운다. `importedBatchRow`에서 `row.department || DEFAULT_DEPARTMENT` 로 되어 있는 곳을 `row.department || common.department` 로 바꾼다. Customer, Objective도 같다. Objective는 지금 `row.objective || "Reference"` 인데 `row.objective || common.objective` 로 바꾼다.

### 2. 표를 카드 목록으로 바꾼다

`batchTable` 안의 `<table>` 전체를 카드 목록으로 바꾼다. `<colgroup>`, `<thead>`, `<tbody>`, `<tr>`, `<td>`를 전부 없앤다. 바깥 스크롤 컨테이너(`min-h-0 flex-1 overflow-auto`)는 남기되 `rounded` 테두리는 없애고 카드 사이 간격 8px을 준다.

카드 하나의 구조는 이렇다.

```
<div (카드) className="rounded-[var(--radius)] border border-[var(--border)]/60 bg-[var(--card)] p-2.5">
  <div (첫 줄) className="flex flex-wrap items-center gap-2">
     번호, 사진, AN No., Source*, Source code, Brand, Season/Year, Gender/Age,
     Construction, Contents, Weight, Objective, Urgent, 삭제
  </div>
  <div (둘째 줄) className="mt-2 flex gap-2">
     Request item 블록 (flex-1), Comment (w-[450px] 고정)
  </div>
</div>
```

각 입력칸은 기존 컴포넌트와 기존 핸들러를 그대로 쓴다. `Input`, `select`, `Checkbox`, `BatchImageCell`, `setBatchField`, `batchInputClass`, `batchSelectClass`, `removeRow`, `displayNumbers`, `selectItems` 전부 유지한다. 폭은 각 칸에 인라인 `style={{ width: 130 }}` 같은 식이 아니라 Tailwind 고정폭 클래스(`w-[130px]` 등)로 준다. `batchInputClass`의 `rounded-none`은 카드 안에서는 어색하니 `rounded-sm`으로 바꾼다.

**Department, Requester, Customer는 카드에서 뺀다.** 다만 그 카드 값이 공통 값과 다르면 첫 줄 끝에 작은 칩으로 보여 주고 누르면 그 칸이 펴진다. 칩 문구는 `Dept 통합원단부2팀` 처럼 접두어와 값이다. 펴진 상태는 카드별 `Set<string>`으로 들고 있으면 된다.

**Objective는 카드 첫 줄에 남긴다.** 보통은 한 묶음이 같은 값이지만 건마다 다를 수 있다고 사용자가 확인했다.

### 3. Request item 블록

둘째 줄 왼쪽을 색 블록으로 만든다.

```
className="flex-1 border-l-[3px] border-teal-600 bg-teal-50 p-2 dark:border-teal-400 dark:bg-teal-950/20"
```

안에 11px 라벨 `Request item *` 을 두고 그 아래 `<textarea rows={2}>`를 넣는다. 지금은 `Input` 한 줄인데 textarea로 바꾼다. `resize-none`, 폭 100%, 배경 투명, 테두리 없음. `onFocus`로 `setFocusedRowId(row.key)`를 그대로 호출한다. 빠른 입력 버튼과 `아래 줄에도 함께 채우기`가 이 포커스를 보고 동작하므로 반드시 유지한다.

필수 미입력이면 블록 테두리를 `border-[var(--destructive)]`로 바꾼다. 지금 `invalid` Set과 `cellKey`를 그대로 쓴다.

**한쪽만 테두리를 주는 요소에는 둥근 모서리를 주지 않는다.** `border-l`을 쓰는 이 블록은 `rounded`를 붙이지 않는다.

### 4. 접기

카드별 접힘 상태를 새 state로 둔다.

```ts
const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
```

- 카드 수가 5를 넘으면 접는다. 엑셀 업로드로 행이 늘어난 직후(`loadExcel`의 `setRows` 다음)와 `appendRow` 뒤에 판정한다. 마지막 빈 카드는 접지 않는다.
- 접힌 카드는 높이 40px 한 줄이다. 왼쪽에 펼침 화살표, 번호, AN No., `Source / Source code`, Request item 요약 칩(teal 배경, 최대 40자에서 자름)만 보인다.
- 카드 아무 데나 누르면 펴진다.
- 아래 버튼 줄에 `모두 접기`와 `모두 펴기` 토글 버튼 하나를 더한다. 접힌 카드가 하나라도 있으면 `모두 펴기`, 없으면 `모두 접기`를 보여 준다.

**저장할 때 접힌 카드에 필수 미입력이 있으면 그 카드를 자동으로 편다.** `saveBatch`에서 `nextInvalid.size`가 0이 아닐 때 `setInvalid` 직후에 해당 카드 key를 `collapsed`에서 뺀다. 이걸 빠뜨리면 사용자가 오류 문구만 보고 어디가 문제인지 못 찾는다.

### 5. 팝업 폭

`DialogContent`의 일괄 모드 클래스에서 `w-[min(96vw,1680px)]`를 `w-[min(96vw,1500px)]`로 줄인다. 표가 아니라 카드라 1,680px까지 필요 없다.

**`DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라.** tailwind-merge가 기본 `fixed`를 지워 팝업이 문서 흐름으로 떨어진다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/components/analysis/AnalysisRequestDialog.tsx` | 유일한 수정 대상. `batchTable` 변수의 JSX 교체, `common`과 `collapsed` state 추가, `setCommonField` 추가, `importedBatchRow`의 기본값 세 곳 교체, `appendRow`에서 공통 값 채우기, `saveBatch`에 접힘 해제 한 줄, `DialogContent` 폭 한 곳 |

다른 파일은 열지 않는다.

## 손대지 말 것

- `editForm`(`record`가 있을 때 쓰는 단건 수정 화면). 이번 작업과 무관하다.
- `saveBatch`의 저장 순서, 사진 업로드 루프, `blankAnalysisRequest` 호출 방식.
- `src/data/analysis-import.ts`, `src/data/fabric-analysis.ts`, `src/data/schema.ts`. 스키마에 필드를 더하지 않는다.
- `BatchField` 타입. 그대로 쓴다.
- `isBlankBatchRow`의 판정 기준. 공통 값을 쓰더라도 이 함수는 지금처럼 `DEFAULT_DEPARTMENT`와 props `requester`, `DEFAULT_CUSTOMER`를 기준으로 둔다. 공통 줄을 바꾼 뒤 빈 카드가 저장 대상으로 잡히면 안 된다는 뜻이 아니라, 이 함수를 건드리면 저장 건수 계산이 흔들리니 그대로 두라는 뜻이다.
- 빠른 입력 버튼(`QUICK_ITEM_COLORS`, `applyQuickItem`)과 `fillDownDescription` 체크박스. 위치도 지금 그대로 둔다.

## 검증

```
npm run build
git status --short
```

`npm run build`는 모든 수정을 마친 뒤 한 번만 돌린다. `tsc --noEmit`이 포함되어 있다. 오류 0이면 성공이다.

`git status --short`에 `src/components/analysis/AnalysisRequestDialog.tsx` 하나만(그리고 이 문서) 나와야 한다. 다른 파일이 바뀌었으면 되돌린다.

화면 확인은 사용자가 한다.
