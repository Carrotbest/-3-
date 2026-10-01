# R277 원가계산서 출력(엑셀, A4 인쇄)

상태: **미착수.** R276 까지 구현 완료, 워킹트리 미커밋, `npm run build` 통과 확인함.

팝업에서 바로 엑셀로 내려받고 A4 로 인쇄한다. 인쇄 창에서 "PDF 로 저장"을 고르면 PDF 가 된다.
**PDF 라이브러리를 새로 붙이지 마라.** FABRIC ANALYSIS 출력(R258, R265)이 같은 방식이다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/cost-sheets.ts` | `CostSheetDoc` 에 `storageNo?: string` 추가 |
| `src/data/cost-export.ts` | REMARK, Net USD/lb, FL No., R&D No., 그룹 라벨 반영 |
| `src/components/dd/CostSheetPrintSheet.tsx` | **새 파일.** A4 인쇄 본문 |
| `src/index.css` | `@media print` 블록 추가 |
| `src/components/dd/CostSheetDialog.tsx` | 푸터에 `엑셀` `인쇄` 버튼, 인쇄 본문 끼우기 |

`CostSheets.tsx`, `fabric-cost.ts`, `yarn-blend.ts`, `DevelopmentMasterSheet.tsx` 를 건드리지 마라.

---

## 1. `storageNo` 저장 (`cost-sheets.ts`)

`CostSheetDoc` 에 한 줄 더한다. **선택 필드다.** 기존 문서에 없어도 된다.

```ts
  /** 저장 시점의 창고 R&D No. 표기. 연결이 없으면 빈 문자열. */
  storageNo?: string
```

`saveCostSheet`, `updateCostSheet`, `listCostSheets`, `latestByGroup`, `compareCostSheets` 의
**동작을 바꾸지 마라.** `saveCostSheet` 는 `draft` 를 그대로 펴서 저장하므로 필드만 더하면 들어간다.

`CostSheetDialog` 의 `saveNew` 가 넘기는 객체에 `storageNo` 를 더한다(2-3 참고).

---

## 2. 팝업 버튼 (`CostSheetDialog.tsx`)

### 2-1. 출력에 쓸 문서 만들기

출력은 저장 전에도 돼야 한다. 지금 화면 값으로 임시 문서를 만든다.

```ts
const outputDoc = (): CostSheetDoc => ({
  id: current?.id ?? "",
  groupId: current?.groupId ?? row.tech?.costRef?.groupId ?? "",
  version: current?.version ?? 0,
  rowKey: rowKeyOf(row),
  flNo: row.flNo, styleNo: row.styleNo, project: row.tech?.project ?? "",
  buyer: row.buyer, season: row.season, construction: row.construction,
  color: row.color, owner: row.owner, storageNo,
  sheet: buildSheet(),
  ...(blend ? { blend: { labelText: blend.labelText, label: blend.label } } : {}),
  by: current?.by ?? auth.currentUser?.email ?? "",
  at: current?.at ?? Date.now(),
  note,
})
```

**`buildSheet()` 를 쓴다.** 저장과 같은 값이 나가야 한다.
`version` 이 `0` 이면 아직 저장 전이라는 뜻이다. 파일 이름과 인쇄 머리에서 그렇게 다룬다.

### 2-2. 푸터

`DialogFooter`(297행)의 `닫기` **앞**에 두 버튼을 넣는다. `variant="outline"`, `size="sm"`.

```tsx
<Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void saveExcel()}><Download className="size-4" />엑셀</Button>
<Button type="button" size="sm" variant="outline" onClick={() => setPrinting(true)}><Printer className="size-4" />인쇄</Button>
```

`Download`, `Printer` 는 `lucide-react` 에서 가져온다.

```ts
const [busy, setBusy] = useState(false)
const saveExcel = async () => {
  setBusy(true); setError("")
  try {
    const doc = outputDoc()
    downloadBlob(await exportCostSheetWorkbook(doc), costSheetFileName(doc))
  } catch { setError("엑셀을 만들지 못했습니다.") } finally { setBusy(false) }
}
```

import 는 `@/data/cost-export` 의 `costSheetFileName`, `exportCostSheetWorkbook` 과
`@/data/dd-export` 의 `downloadBlob` 이다. `CostSheets.tsx` 가 쓰는 것과 같다.

### 2-3. `saveNew` 에 `storageNo`

`saveCostSheet({ … })` 인자에 `storageNo` 한 줄을 더한다. 다른 필드는 건드리지 마라.

### 2-4. 인쇄 끼우기

```ts
const [printing, setPrinting] = useState(false)
```

`DialogContent` 안 맨 끝(푸터 뒤)에 붙인다.

```tsx
{printing ? <CostSheetPrintSheet doc={outputDoc()} onDone={() => setPrinting(false)} /> : null}
```

팝업이 닫힐 때 인쇄 상태도 내린다. `onOpenChange` 가 `false` 를 받으면 `setPrinting(false)`.

---

## 3. 인쇄 본문 (`CostSheetPrintSheet.tsx`, 새 파일)

`src/components/analysis/AnalysisPrintDeck.tsx` 의 **인쇄 호출 방식을 그대로 따른다.**
그 파일 130~150행을 보고 같은 뼈대로 만들어라. 요점은 셋이다.

- `useEffect` 안에서 한 번만 `window.print()` 를 부른다. 두 번 부르지 않게 `useRef` 로 막는다.
- `afterprint` 이벤트와 `setTimeout(…, 800)` 둘 다에 `onDone` 을 걸고, 한 번만 실행되게 막는다.
  `afterprint` 를 안 부르는 브라우저가 있다.
- `@page { size: A4 portrait; margin: 12mm; }` 를 담은 `<style>` 을 인쇄 직전에 `document.head` 에
  붙이고 끝나면 `remove()` 한다. 이미지가 없으므로 이미지 대기는 **넣지 마라.**

본문 뿌리는 `<div className="cs-print-root"><div className="cs-print-deck">…</div></div>` 다.

### 3-1. 지면 구성

A4 세로 한 장이다. 위에서 아래로 이 순서다.

| 구역 | 내용 |
|---|---|
| 머리 | 왼쪽에 `사전 원가계산서`(작게)와 **FL No.**(크게). 오른쪽에 `R&D No.`, 계산일, 버전(`v0` 이면 `임시`) |
| 기준 | Style No., Project, Buyer, Season, Color, 담당, 조직, 환율, 완성 폭, 완성 중량, gr/yd |
| 원사 | 표기, 성분, 투입%, 단가, 단위, 선염, $/kg, 비중% |
| 혼용율 | `blend.labelText` 한 줄 |
| 공정 | 그룹, 공정명, 업체, REMARK, 단가, 단위, LOSS%, $/kg, 비중% |
| 결과 | `Net USD/yd`, `Net USD/lb`, `Net USD/kg` 세 칸. 이익률이 0이 아니면 이익 포함 한 줄 |
| 메모 | `doc.note` 가 있을 때만 |

- 숫자는 소수 넷째 자리까지, 비중과 투입은 소수 한 자리다.
- 그룹 라벨은 `원사`, `편직`, `염색`, `기타` 다.
- `result.lines` 는 원사 다음에 공정이 같은 순서로 들어 있다. 공정 `index` 의 줄은
  `result.lines[input.yarns.length + index]` 다.
- **KRW 는 넣지 마라.** 화면과 같게 USD 세 가지만 쓴다.

### 3-2. 인쇄 CSS (`src/index.css`)

파일 맨 끝에 블록을 더한다. **기존 `@media print` 블록 두 개를 고치지 마라.**
RDDA 블록이 `body * { visibility: hidden }` 을 걸어 두었으므로 우리 뿌리만 다시 보이게 한다.
FABRIC ANALYSIS 블록(`.an-print-*`)이 같은 일을 하고 있으니 그 모양을 그대로 베껴라.

```css
.cs-print-deck { display: none; }

@media print {
  .cs-print-root, .cs-print-root * { visibility: visible !important; }
  .cs-print-root { position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important; translate: none !important; transform: none !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
  .cs-print-deck { display: block !important; background: white; color: #111827; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  /* 표, 머리, 결과 칸 스타일은 .an-print-* 의 밀도를 따라 9pt 기준으로 짠다 */
}
```

- 본문 폭은 A4 세로 여백 12mm 기준 **186mm** 다.
- 글자는 9pt, 표 머리는 7.5pt 회색 대문자다.
- 표는 가는 실선 하나만 쓴다. 격자를 촘촘히 치지 마라.
- 한 장을 넘기면 자연스럽게 다음 장으로 넘어가게 두고, 구역에는 `break-inside: avoid` 를 건다.

---

## 4. 엑셀 (`cost-export.ts`)

지금 파일을 고친다. 바꾸는 것은 다섯이다.

1. **머리.** `FL#` 과 `R&D No.` 를 맨 앞으로 올린다. 첫 줄을
   `["FL#", doc.flNo, "R&D No.", doc.storageNo ?? "", "Style No.", doc.styleNo, "Project", doc.project]` 로.
   둘째 줄에 `Buyer`, `Season`, `Color`, `조직`. 셋째 줄에 `담당`, `계산일`, `버전`.
   `계산일` 칸의 `numFmt = "yyyy-mm-dd"` 를 그 셀 좌표에 맞춰 옮겨라. 지금 `B4` 로 박혀 있다.
2. **기준 표.** 열 순서를 화면과 맞춘다. `["폭 inch", "중량 g/㎡", "gr/yd", "환율"]`.
3. **공정 표.** 머리에 `비고` 를 더하고 값은 `fee.remark ?? ""` 다.
   `["구분", "항목", "업체", "비고", "단가", "단위", "loss%", "$/kg 기여", "비중%"]`.
   `numFmt` 를 거는 열 번호가 하나씩 밀리므로 같이 고쳐라.
4. **결과 표.** `["구분", "$/yd", "$/lb", "$/kg"]` 로 바꾸고 값도 그 순서다.
   `Net` 줄은 `result.netPerYd`, `result.netPerLb`, `result.netPerKg`.
   이익 포함 줄은 `totalPerYd`, `totalPerLb`, `totalPerKg`.
   **원/yd 열은 뺀다.** `numFmt` 는 세 열 모두 `"0.0000"` 이다.
5. **그룹 라벨.** `FEE_GROUP_LABEL` 의 `yarnDye` 를 `"선염"` 에서 **`"원사"`** 로 바꾼다.
   나머지 셋은 그대로다.

`describeSpec`, 열 너비, `addTitle`, `addTableHeader` 는 그대로 둔다.

`costSheetFileName` 은 `version` 이 `0` 일 때 `v0` 대신 `임시` 를 쓰게 한다. 나머지는 그대로다.

---

## 5. 하지 말 것

- **PDF 라이브러리를 설치하거나 import 하지 마라.** 브라우저 인쇄뿐이다.
- `src/index.css` 의 기존 `@media print` 블록 두 개를 고치거나 지우지 마라. 더하기만 한다.
- `computeFabricCost` 와 `CostResult` 를 건드리지 마라.
- `netKrwPerYd` 를 지우지 마라. DD `COST` 열과 `/cost` 자료실 표가 쓴다. **엑셀과 인쇄에서만 뺀다.**
- `saveNew`, `overwrite`, `loadVersion`, `buildSheet`, `refOf` 의 동작을 바꾸지 마라. `storageNo` 한 줄만 더한다.
- `CostSheets.tsx` 를 건드리지 마라. 그쪽 엑셀 버튼은 같은 함수를 그대로 쓴다.
- 화면 표(원사, 공정, 결과)의 열과 폭을 건드리지 마라. R275, R276 에서 끝났다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- **긴 목록을 `SectionCard` 로 감싸지 마라.**
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 6. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
