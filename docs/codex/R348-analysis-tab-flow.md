# R348 — FABRIC ANALYSIS 목록 탭별 동작 정리

상태: **미착수.** 2026-10-21 박향근 지시. 설계 확정까지 끝났고 구현만 남았다.

고치는 파일은 둘이다.

| 파일 | 조치 |
|---|---|
| `src/routes/FabricAnalysis.tsx` | 탭별 버튼 분리, 확정·완료를 2단계로, 되돌리기 추가, 전체 탭 읽기 전용 |
| `src/index.css` | 전체 탭 미리보기 틀 `.an-preview` 추가 |

다른 파일은 건드리지 않는다. `analysis-mail.ts`, `fabric-analysis.ts`, `schema.ts`는 그대로 쓴다. 새 필드도 새 함수도 필요 없다.

---

## 1. 지금 무엇이 잘못됐나

`FabricAnalysis.tsx` 209~217행의 버튼 묶음이 **탭과 무관하게 하나**다. 체크가 하나라도 있으면 여섯 버튼이 전부 뜨고 선택한 행의 상태에 따라 `disabled`만 갈린다. 그래서 의뢰 탭과 완료 탭에서 `의뢰 확정`이 회색으로 살아 있다. 탭마다 보이는 행은 한 가지 상태뿐이므로 그 탭에서 쓸 수 없는 버튼은 **뜨지 않아야 한다.**

125~138행 `confirmRequests`는 상태 변경과 메일 발송을 한 번에 하고 선택까지 지운다. 139~159행 `completeRequests`도 같다. 그런데 `완료 메일` 버튼이 213행에 따로 또 있다. 같은 일을 두 곳에서 한다.

상태를 되돌리는 코드는 저장소에 없다.

전체 탭은 완료 건 편집만 막혀 있고(92행) 작성·의뢰 행은 전체 탭에서도 편집·확정·완료가 된다.

---

## 2. 탭과 버튼 표

탭을 고르면 그 상태의 행만 보인다(77행). 그러므로 **그 탭의 버튼은 선택한 행 전부에 그대로 먹는다.** 버튼은 `selected.size > 0` 이면 켜진다. 예외는 삭제뿐이고 지금처럼 `deletableSelected` 권한을 본다.

| 탭 | 체크박스 열 | 버튼 (왼쪽부터) |
|---|---|---|
| 전체 | **없음** | **없음.** `새 분석 의뢰`도 없다 |
| 작성 | 있음 | 의뢰 확정 · 삭제 · 출력 · .eml로 받기 |
| 의뢰 | 있음 | 의뢰 메일 발송 · 완료 처리 · 작성으로 되돌리기 · 삭제 · 출력 · .eml로 받기 |
| 완료 | 있음 | 완료 메일 발송 · 의뢰로 되돌리기 · 삭제 · 출력 · .eml로 받기 |

`새 분석 의뢰` 버튼(218행)은 **작성 탭에서만** 보인다(`canEdit && activeState === "작성"`). 검색 칸은 네 탭 모두 그대로 둔다.

`draftSelected` / `requestedSelected` / `finishedSelected` 변수는 지우지 말고 그대로 둔다. 버튼을 탭으로 고르더라도 넘기는 인자는 계속 이 걸러낸 배열을 쓴다. 동기화로 들어온 행의 상태가 탭과 어긋날 수 있다.

---

## 3. 의뢰 확정과 완료 처리를 두 단계로

**지금**: 상태 변경 + 선택 해제 + 메일 발송이 한 번에 일어난다.
**바꿀 것**: 상태 변경 + **탭 이동** + **옮긴 행을 선택 상태로 유지**까지만 한다. 메일은 다음 탭의 메일 버튼으로 사람이 따로 누른다.

### 3.1 선택을 탭 너머로 넘기는 장치

73행에 탭을 옮기면 선택을 푸는 효과가 있다.

```tsx
useEffect(() => { setSelected(new Set()) }, [activeState])
```

이 규칙(2026-10-21 지시)은 **그대로 둔다.** 사람이 탭을 누른 경우에는 계속 풀려야 한다. 확정·완료·되돌리기가 옮기는 경우에만 예외를 둔다. ref 하나로 넘긴다.

```tsx
/*
 * 탭을 옮기면 선택을 푼다. 안 풀면 지금 목록에 보이지도 않는 건이 선택에 남는다.
 * 예외는 확정·완료·되돌리기가 행을 다음 탭으로 옮기는 경우뿐이다(R348).
 * 그때는 옮긴 id를 여기 넣어 두고 새 탭에서 그대로 다시 고른다.
 * 사람이 탭을 누르면 이 자리가 비어 있어 선택이 풀린다.
 */
const carrySelection = useRef<string[] | null>(null)
useEffect(() => {
  const keep = carrySelection.current
  carrySelection.current = null
  setSelected(new Set(keep ?? []))
}, [activeState])
```

행을 옮기는 함수는 **ref에 넣고, 탭을 바꾸고, 선택도 직접 넣는다.** 셋 다 한다.

```tsx
const moveTo = (state: AnalysisState, ids: string[]) => {
  carrySelection.current = ids
  setUrgentOnly(false)
  setActiveState(state)
  setSelected(new Set(ids))
}
```

탭이 실제로 바뀌면 효과가 돌아 ref에서 되살리고, 이미 그 탭이면 효과가 안 돌아 `setSelected`가 그대로 선다. 어느 쪽이든 끝에는 옮긴 행이 선택돼 있다. **`setSelected` 한 줄만 쓰면 안 된다.** 탭이 바뀌는 순간 효과가 덮어 버린다.

### 3.2 `confirmRequests` 고쳐 쓰기

메일 호출(135~137행)을 **들어낸다.** `openAnalysisRequestMail` import는 3.3의 새 버튼이 계속 쓰므로 지우지 않는다.

```tsx
const confirmRequests = (targets: AnalysisRequest[]) => {
  const drafts = targets.filter((item) => item.state === "작성")
  if (!drafts.length) return
  const ids = new Set(drafts.map((item) => item.id))
  const today = analysisTodayValue()
  const now = new Date().toISOString()
  const confirmed = drafts.map((item) => ({ ...item, state: "의뢰" as const, requestedAt: today, updatedAt: now }))
  const confirmedById = new Map(confirmed.map((item) => [item.id, item]))
  saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? confirmedById.get(item.id) ?? item : item))
  // 메일은 여기서 보내지 않는다(R348). 의뢰 탭으로 옮겨 고른 채로 두고 사람이 메일 버튼을 누른다.
  moveTo("의뢰", [...ids])
  showNotice(`${confirmed.length}건을 의뢰로 옮겼습니다. 그대로 선택돼 있습니다. 의뢰 메일 발송을 누르세요.`)
}
```

### 3.3 의뢰 메일 발송 버튼 (의뢰 탭)

```tsx
const requestMail = () => {
  if (!requestedSelected.length) return
  void openAnalysisRequestMail(requestedSelected, recipients).then((result) => showNotice(result === "mailto"
    ? `본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다.${recipients.length ? "" : " 받는 사람 목록이 비어 있습니다."}`
    : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
}
```

문구는 기존 136~137행 것을 그대로 옮긴 것이다. **새로 쓰지 말 것.** 받는 사람이 비었을 때의 꼬리말까지 같아야 한다.

이 버튼은 선택을 풀지 않는다. 메일을 보낸 뒤 같은 선택으로 출력이나 .eml을 이어서 하는 일이 있다.

### 3.4 `completeRequests` 고쳐 쓰기

같은 꼴이다. 비어 있는 분석 결과를 묻는 `confirm`(142~143행)은 **그대로 둔다.** 메일 호출(156~158행)만 들어내고 끝에 `moveTo("완료", [...ids])`를 붙인다.

```tsx
  // 메일은 여기서 보내지 않는다(R348). 완료 탭으로 옮겨 고른 채로 두고 사람이 메일 버튼을 누른다.
  moveTo("완료", [...ids])
  showNotice(`${completed.length}건을 완료로 옮겼습니다. 그대로 선택돼 있습니다. 완료 메일 발송을 누르세요.`)
```

### 3.5 기존 `완료 메일` 버튼

160~165행 `finishedMail`은 그대로 쓴다. 버튼 이름만 `완료 메일` → **`완료 메일 발송`** 으로 바꿔 `의뢰 메일 발송`과 짝을 맞춘다. 완료 탭에서만 보인다.

---

## 4. 이전 단계로 되돌리기

`canEdit`일 때만 보인다. 둘 다 `confirm`으로 한 번 묻는다.

### 4.1 의뢰 → 작성

`requestedAt`만 비운다. 다른 칸은 손대지 않는다.

```tsx
const revertToDraft = (targets: AnalysisRequest[]) => {
  const requested = targets.filter((item) => item.state === "의뢰")
  if (!requested.length) return
  if (!confirm(`선택한 ${requested.length}건을 작성으로 되돌립니다. 의뢰일이 지워집니다. 계속할까요?`)) return
  const ids = new Set(requested.map((item) => item.id))
  const now = new Date().toISOString()
  const reverted = requested.map((item) => ({ ...item, state: "작성" as const, requestedAt: "", updatedAt: now }))
  const byId = new Map(reverted.map((item) => [item.id, item]))
  saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? byId.get(item.id) ?? item : item))
  moveTo("작성", [...ids])
  showNotice(`${reverted.length}건을 작성으로 되돌렸습니다.`)
}
```

### 4.2 완료 → 의뢰

**분석 결과를 전부 비운다**(2026-10-21 박향근 결정). 완료 직전이 아니라 의뢰 직후 상태로 돌린다.

비우는 칸: `finishedAt`, `inCharge`, `yarnDescription`, `constructionRnd`, `commentRnd`. `weightRnd`는 `number | ""` 이므로 `""`로 둔다.

**`resultImages`는 남긴다.** 사진을 지우면 Firebase Storage에서 실제 파일이 날아가 되돌릴 수 없다. 상태를 되돌리는 일이 올린 파일까지 없애서는 안 된다. 사진은 상세 팝업에서 사람이 따로 지운다. `confirm` 문구에 그 사실을 적는다. **`deleteRequestImage`를 여기서 부르지 말 것.**

```tsx
const revertToRequested = (targets: AnalysisRequest[]) => {
  const finished = targets.filter((item) => item.state === "완료")
  if (!finished.length) return
  if (!confirm(`선택한 ${finished.length}건을 의뢰로 되돌립니다. 완료일과 In charge, 분석 결과 네 칸이 모두 지워집니다. 분석 사진은 남습니다. 되돌릴 수 없습니다. 계속할까요?`)) return
  const ids = new Set(finished.map((item) => item.id))
  const now = new Date().toISOString()
  // 결과를 전부 비운다(2026-10-21 박향근 결정). 사진은 남긴다. 지우면 Storage 파일이 날아간다.
  const reverted = finished.map((item) => ({
    ...item, state: "의뢰" as const,
    finishedAt: "", inCharge: "", yarnDescription: "", constructionRnd: "", weightRnd: "" as const, commentRnd: "",
    updatedAt: now,
  }))
  const byId = new Map(reverted.map((item) => [item.id, item]))
  saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? byId.get(item.id) ?? item : item))
  moveTo("의뢰", [...ids])
  showNotice(`${reverted.length}건을 의뢰로 되돌렸습니다. 분석 결과를 비웠습니다.`)
}
```

타입이 맞지 않으면 `weightRnd: "" as AnalysisRequest["weightRnd"]`로 적는다. `as any`를 쓰지 말 것.

---

## 5. 전체 탭을 읽기 전용으로

`const previewOnly = activeState === ALL` 하나로 가른다.

- **체크박스 열을 그리지 않는다.** 225행 `TableHead`와 228행 `TableCell` 둘 다. `colgroup`(223행)의 첫 `40`도 같이 뺀다. 빈 목록 `colSpan`(230행)은 17이 아니라 **16**이 된다. 세 군데를 같이 고치지 않으면 열이 어긋난다.
- **행 끝 액션 열**(229행 마지막 `TableCell`)은 내용을 비운다. 열 자체는 남긴다. 의뢰·완료·메일 버튼이 전체 탭에서 뜨지 않는다.
- **선택 묶음 바**(209~217행)를 그리지 않는다. 빈 `div`로 자리만 남기지 말고 통째로 뺀다.
- **`새 분석 의뢰`** 는 작성 탭에서만(2절).
- **상세 팝업을 읽기 전용으로.** 92행을 바꾼다.

```tsx
// 전체 탭은 보기 전용이다(2026-10-21 박향근 지시). 탭마다 한 상태만 보이므로
// 완료 건을 완료 탭 밖에서 고치는 길은 이것으로 함께 막힌다.
const detailCanEdit = canEdit && !previewOnly
```

- **카드 제목 옆에 알림.** 206행 `CardTitle` 오른쪽에 `previewOnly`일 때만 작은 알약을 붙인다. 글자는 `보기 전용 · 편집은 상태 탭에서`.

### 5.1 틀과 그라데이션

**화면 전체에 두른다**(박향근 결정). 199행 바깥 `<section>`에 `previewOnly`일 때만 `an-preview` 클래스를 더한다.

```tsx
<section className={`min-w-0 space-y-4${previewOnly ? " an-preview" : ""}`}>
```

`src/index.css` 끝의 `.an-print-deck` 블록(554행) **앞에** 넣는다. 인쇄 규칙 사이에 끼우지 말 것.

```css
/*
 * FABRIC ANALYSIS 전체 탭은 보기 전용이다(R348, 2026-10-21 박향근 지시).
 * 틀과 바깥에서 안쪽으로 옅어지는 회색이 편집이 안 되는 화면임을 알린다.
 * 덮개는 pointer-events: none 이다. 전체 탭에서도 KPI 칸과 탭 단추는 눌러야 한다.
 * 이 저장소에는 테마 토글이 없어 어두운 모드는 OS 설정만 탄다. 그래서 미디어 질의로 적는다.
 */
.an-preview { position: relative; border-radius: 0.75rem; }
.an-preview::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgb(100 116 139 / 0.3);
  background:
    linear-gradient(to right,  rgb(100 116 139 / 0.11), rgb(100 116 139 / 0) 110px),
    linear-gradient(to left,   rgb(100 116 139 / 0.11), rgb(100 116 139 / 0) 110px),
    linear-gradient(to bottom, rgb(100 116 139 / 0.11), rgb(100 116 139 / 0) 80px),
    linear-gradient(to top,    rgb(100 116 139 / 0.11), rgb(100 116 139 / 0) 80px);
}
@media (prefers-color-scheme: dark) {
  .an-preview::after {
    box-shadow: inset 0 0 0 1px rgb(148 163 184 / 0.26);
    background:
      linear-gradient(to right,  rgb(148 163 184 / 0.1), rgb(148 163 184 / 0) 110px),
      linear-gradient(to left,   rgb(148 163 184 / 0.1), rgb(148 163 184 / 0) 110px),
      linear-gradient(to bottom, rgb(148 163 184 / 0.1), rgb(148 163 184 / 0) 80px),
      linear-gradient(to top,    rgb(148 163 184 / 0.1), rgb(148 163 184 / 0) 80px);
  }
}
```

**`pointer-events: none`을 빼지 말 것.** 빼면 전체 탭에서 KPI 칸과 탭이 안 눌려 다른 탭으로 나갈 길이 막힌다.

---

## 6. 하지 말 것

- **73행 선택 해제 효과를 지우지 말 것.** 사람이 탭을 누르면 계속 풀려야 한다. 3.1의 ref로만 예외를 둔다.
- **`moveTo`에서 `setSelected`를 빼지 말 것.** 이미 그 탭에 있으면 효과가 안 돌아 선택이 비어 버린다.
- **`revertToRequested`에서 `deleteRequestImage`를 부르지 말 것.** Storage 파일이 실제로 지워진다.
- **`import`를 지우지 말 것.** `openAnalysisRequestMail`은 3.3이, `openAnalysisFinishedMail`은 3.5와 행 끝 메일 버튼이 계속 쓴다.
- **`isAnalysisPrintable`, `canDeleteAnalysis`, 삭제 로직, 취소 상태 정리 효과(179~191행)는 손대지 말 것.** 이번 건과 무관하다.
- **`analysis-mail.ts`의 문구와 표 열을 고치지 말 것.**
- **`colgroup`·헤더·`colSpan` 가운데 하나만 고치지 말 것.** 전체 탭에서 열이 통째로 밀린다.
- `AnalysisRequestDialog.tsx`, `AnalysisDetailDialog.tsx`는 열지 않는다. `detailCanEdit` 값만 바뀐다.

---

## 7. 검증

`npm run build` 한 번. `tsc --noEmit`이 안에 들어 있다. 통과하면 끝이다.

화면 확인은 클로드가 따로 돌린다. 브라우저를 열지 마라.
