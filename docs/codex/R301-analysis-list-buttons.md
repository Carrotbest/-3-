# R301 — FABRIC ANALYSIS 목록 버튼 정리, 취소 상태 폐기

상태: 미착수

## 배경

2026-10-07 박향근 요청 셋이다.

1. 어느 탭에서건 체크박스로 삭제할 수 있어야 한다. 권한은 **관리자(소유자)와 만든 사람**만이다.
2. 체크박스를 누르면 버튼 묶음이 새 줄로 생겨 화면이 흔들린다. 묶음을 **위로 올리고 자리를 늘 차지하게** 한다.
3. **취소 상태를 완전히 폐기한다**(2026-10-07 박향근 확정). 탭, 상태값, "의뢰 취소" 버튼을 모두 없애고 **남아 있는 취소 건은 지운다.** 취소 대신 삭제를 쓴다.

**워킹트리에 아직 커밋 안 된 R300 변경이 있다**(`index.html`, `src/index.css`, `src/components/dashboard/TodayBriefing.tsx`, `src/routes/Calendar.tsx`). `git reset`, `git checkout`, `git stash`, `git restore` 로 건드리지 마라.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `ANALYSIS_STATES`에서 취소 제거, 옛값 상수 추가 |
| `src/data/fabric-analysis.ts` | 삭제 권한 판정 `canDeleteAnalysis` 추가 |
| `src/data/analysis-print.ts` | 취소 제외 조건 제거 |
| `src/components/analysis/AnalysisDetailDialog.tsx` | 상태 색 맵에서 취소 제거, "의뢰 취소" 버튼 제거 |
| `src/routes/FabricAnalysis.tsx` | 상태 색 맵 정리, 삭제 권한·범위 변경, 버튼 묶음 위치 고정, 옛 취소 건 정리 |

---

## 1. `src/data/schema.ts`

284행:
```ts
export const ANALYSIS_STATES = ["작성", "의뢰", "완료", "취소"] as const
```
교체:
```ts
export const ANALYSIS_STATES = ["작성", "의뢰", "완료"] as const
/** 폐기한 옛 상태값(R301). 남아 있는 데이터를 걸러내는 데만 쓴다. 상태 목록에 되돌리지 말 것. */
export const LEGACY_ANALYSIS_CANCELLED = "취소"
```

탭은 `[ALL, ...ANALYSIS_STATES]`로 만들어지므로 이 한 줄로 취소 탭이 사라진다. 탭 쪽에 따로 필터를 넣지 마라.

## 2. `src/data/fabric-analysis.ts`

파일 끝에 추가한다. `AnalysisRequest`는 1행에서 이미 import 하고 있다.

```ts
/**
 * 분석 의뢰 삭제는 관리자(소유자)와 만든 사람만 한다.
 * `createdBy`는 만들 때 넣은 의뢰자 메일이다(`blankAnalysisRequest`).
 * 옛 데이터에는 비어 있을 수 있어 빈 값은 소유자만 지운다.
 */
export function canDeleteAnalysis(item: AnalysisRequest, viewer: { isOwner: boolean; email: string }): boolean {
  if (viewer.isOwner) return true
  const email = viewer.email.trim().toLowerCase()
  const creator = (item.createdBy ?? "").trim().toLowerCase()
  return Boolean(email) && email === creator
}
```

## 3. `src/data/analysis-print.ts`

16~19행:
```ts
/** 취소 건은 종이로 내보내지 않는다. */
export function isAnalysisPrintable(item: AnalysisRequest): boolean {
  return item.state !== "취소"
}
```
교체:
```ts
/** 취소 상태를 폐기해(R301) 제외할 건이 없어졌다. 호출부를 그대로 두려고 함수는 남긴다. */
export function isAnalysisPrintable(_item: AnalysisRequest): boolean {
  return true
}
```
빌드가 미사용 매개변수로 막히면 이름을 `item`으로 되돌리고 본문은 `return true` 그대로 둔다.

## 4. `src/components/analysis/AnalysisDetailDialog.tsx`

### 4-1. 상태 색 맵 (25행)

```ts
  취소: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
```
이 한 줄을 지운다. `Record<AnalysisState, string>` 이라 남겨 두면 타입 오류가 난다.

### 4-2. "의뢰 취소" 버튼 (178행)

178행은 한 줄짜리 `DialogFooter` 다. 그 안에서 아래 조각만 **통째로 지운다.** 다른 버튼은 건드리지 마라.

```tsx
{record.state === "작성" || record.state === "의뢰" ? <Button type="button" variant="outline" disabled={working || completionPending} className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10" onClick={() => { if (confirm("이 의뢰를 취소할까요?")) save({ state: "취소" }) }}>의뢰 취소</Button> : null}
```

지운 뒤 `출력`, `완료 메일`, `의뢰 정보 수정`, 결과 저장, `완료 처리`, `완료 되돌리기`, `닫기` 일곱이 남아야 한다.

## 5. `src/routes/FabricAnalysis.tsx`

### 5-1. import (1행)

```tsx
import { useEffect, useMemo, useState } from "react"
```
교체:
```tsx
import { useEffect, useMemo, useRef, useState } from "react"
```

20행:
```tsx
import { analysisLeadDays, analysisTodayValue, analysisWeeklySeries } from "@/data/fabric-analysis"
```
교체:
```tsx
import { analysisLeadDays, analysisTodayValue, analysisWeeklySeries, canDeleteAnalysis } from "@/data/fabric-analysis"
```

24행의 schema import 에 `LEGACY_ANALYSIS_CANCELLED` 를 더한다. 현재:
```tsx
import { ANALYSIS_STATES, type AnalysisRequest, type AnalysisState } from "@/data/schema"
```
교체:
```tsx
import { ANALYSIS_STATES, LEGACY_ANALYSIS_CANCELLED, type AnalysisRequest, type AnalysisState } from "@/data/schema"
```

### 5-2. 상태 색 맵 (28~34행)

`stateClass` 의 `취소:` 줄과 `stateDot` 의 `, 취소: "bg-slate-300"` 을 지운다. 결과:
```tsx
const stateClass: Record<AnalysisState, string> = {
  작성: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  의뢰: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  완료: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
}
const stateDot: Record<AnalysisState, string> = { 작성: "bg-slate-400", 의뢰: "bg-amber-500", 완료: "bg-emerald-500" }
```

### 5-3. 소유자 읽기 (51행 `const canEdit = access === "edit"` 아래에 추가)

```tsx
  const isOwner = useAuthStore((state) => state.isOwner)
```

### 5-4. 삭제 대상 계산 (78행 `printableSelected` 선언 근처, `finishedSelected` 아래에 추가)

```tsx
  // 삭제는 상태를 가리지 않는다. 가르는 것은 권한뿐이다(R301).
  const viewerForDelete = { isOwner, email: user?.email ?? "" }
  const deletableSelected = selectedRows.filter((item) => canDeleteAnalysis(item, viewerForDelete))
```

### 5-5. 삭제 동작 교체 (147~155행 `deleteDrafts`)

현재:
```tsx
  const deleteDrafts = () => {
    if (!draftSelected.length || !confirm(`작성 중인 의뢰 ${draftSelected.length}건을 삭제할까요?`)) return
    const targets = [...draftSelected]
```
이 함수 전체를 아래로 교체한다. 이름도 `deleteSelected` 로 바꾼다.

```tsx
  const deleteSelected = () => {
    if (!deletableSelected.length) return
    const question = deletableSelected.length === selectedRows.length
      ? `선택한 ${deletableSelected.length}건을 삭제할까요? 되돌릴 수 없습니다.`
      : `선택한 ${selectedRows.length}건 가운데 삭제 권한이 있는 ${deletableSelected.length}건만 지웁니다. 계속할까요?`
    if (!confirm(question)) return
    const targets = [...deletableSelected]
    const ids = new Set(targets.map((item) => item.id))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.filter((item) => !ids.has(item.id)))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
    void Promise.allSettled(targets.flatMap((item) => [deleteRequestImage(`analysis-${item.id}`), ...(item.resultImages ?? []).map((image) => deleteRequestImage(`analysis-${item.id}-r${image.key}`))]))
  }
```

**사진 지우는 `Promise.allSettled` 줄을 빼지 마라.** 빼면 Storage 에 쓰레기 파일이 남는다.

### 5-6. 옛 취소 건 정리

`deleteSelected` 아래에 넣는다. 취소 탭이 사라져 사람이 고를 수 없으므로 화면이 한 번 치운다.

```tsx
  // 취소 상태를 폐기하면서(R301) 남은 옛 건을 치운다. 탭이 없어 사람이 고를 수 없다.
  // 첫 스냅샷 전에 지우면 동기화가 되살릴 수 있어 몇 번 더 시도하되, 무한 반복은 막는다.
  const cleanupTries = useRef(0)
  useEffect(() => {
    if (!canEdit || cleanupTries.current >= 3) return
    const stale = rows.filter((item) => (item.state as string) === LEGACY_ANALYSIS_CANCELLED)
    if (!stale.length) return
    cleanupTries.current += 1
    const ids = new Set(stale.map((item) => item.id))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.filter((item) => !ids.has(item.id)))
    void Promise.allSettled(stale.flatMap((item) => [deleteRequestImage(`analysis-${item.id}`), ...(item.resultImages ?? []).map((image) => deleteRequestImage(`analysis-${item.id}-r${image.key}`))]))
    showNotice(`폐기된 취소 상태 ${stale.length}건을 정리했습니다.`)
  }, [rows, canEdit])
```

`cleanupTries` 상한 3을 없애지 마라. 저장이 막히는 상황에서 지우기와 되살리기가 끝없이 돈다.

### 5-7. 버튼 묶음을 위로 올리고 자리 고정

169행 `CardHeader` 안의 구조를 바꾼다. 현재 순서는 제목, 탭 줄, Urgent 안내, **선택 묶음(조건부)**, 안내 문구다. 선택 묶음이 조건부라 체크할 때마다 줄이 생겨 아래가 통째로 밀린다.

**제목 줄 오른쪽으로 옮기고 항상 그린다.** 선택이 없으면 안내 글자만 둔다.

169행의 `<CardHeader className="gap-3"><CardTitle className="text-base font-medium">분석 의뢰 목록</CardTitle>` 부분을 아래로 바꾼다.

```tsx
      <CardHeader className="gap-3"><div className="flex min-h-9 flex-wrap items-center justify-between gap-2"><CardTitle className="text-base font-medium">분석 의뢰 목록</CardTitle>
        {/* 선택 묶음은 늘 자리를 차지한다. 체크할 때마다 줄이 생기면 아래 표가 통째로 밀려 읽기 어렵다. */}
        <div className="flex flex-wrap items-center gap-2 text-sm">{selected.size ? <>
          <span className="rounded-md bg-teal-500/10 px-2 py-1">{selected.size}건 선택</span>
          {canEdit ? <Button size="sm" disabled={!draftSelected.length} className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => confirmRequests(draftSelected)}><Mail />의뢰 확정</Button> : null}
          {canEdit ? <Button size="sm" variant="outline" disabled={!requestedSelected.length} onClick={() => completeRequests(requestedSelected)}>완료 처리</Button> : null}
          <Button size="sm" variant="outline" disabled={!finishedSelected.length} onClick={finishedMail}>완료 메일</Button>
          {canEdit ? <Button size="sm" variant="outline" disabled={!deletableSelected.length} title={deletableSelected.length ? "선택한 의뢰를 지웁니다" : "만든 사람과 관리자만 지울 수 있습니다"} onClick={deleteSelected}><Trash2 />삭제</Button> : null}
          <Button size="sm" variant="outline" disabled={!printableSelected.length} title="완료 건은 분석 리포트, 그 밖에는 분석 의뢰서로 나갑니다" onClick={() => startPrint(printableSelected)}><Printer />출력</Button>
          <Button size="sm" variant="ghost" disabled={!draftSelected.length && !finishedSelected.length} onClick={downloadSelectedEml}><FileDown />.eml로 받기</Button>
        </> : <span className="text-xs text-[var(--muted-foreground)]">행을 선택하면 처리 버튼이 나타납니다.</span>}</div>
      </div>
```

그리고 **171행의 기존 선택 묶음 줄을 통째로 지운다.** `{selected.size ? <div className="flex flex-wrap items-center gap-2 rounded-md bg-teal-500/5 p-2 text-sm">` 로 시작해 `.eml로 받기</Button></div> : null}` 로 끝나는 한 줄이다.

170행 Urgent 안내와 172행 `notice` 줄은 그대로 둔다. 169행에서 원래 `CardTitle` 뒤에 이어지던 탭·검색 `<div className="flex flex-col gap-3 lg:flex-row ...">` 블록은 **새로 만든 제목 줄 `</div>` 다음에 그대로 이어 붙인다.** 탭, `새 분석 의뢰` 버튼, 검색창의 내용과 클래스를 바꾸지 마라.

버튼 목록에서 바뀐 것은 **삭제 버튼 하나뿐이다**(`draftSelected` → `deletableSelected`, `deleteDrafts` → `deleteSelected`, `title` 추가). 나머지 여섯은 조건과 클래스를 그대로 옮긴다.

---

## 하지 말 것

- 취소 상태를 어떤 형태로든 되살리지 마라. 상태 목록, 탭, "의뢰 취소" 버튼 전부 없앤다.
- 삭제 권한 판정을 `canEdit` 하나로 퉁치지 마라. 화면 편집권과 별개로 `canDeleteAnalysis`를 거쳐야 한다.
- 사진 삭제(`deleteRequestImage`) 호출을 빼지 마라.
- `cleanupTries` 상한을 없애지 마라.
- 워킹트리의 R300 변경을 git 명령으로 되돌리지 마라.
- `AnalysisRequestDialog.tsx:519`의 `취소` 버튼은 팝업 닫기 라벨이다. 건드리지 마라.
- 다른 화면의 `취소` 문자열(창고, 요청, 달력 등)은 전부 무관하다. 일괄 치환하지 마라.
- `firestore.rules`, `public/data` 아래 JSON, `legacy/`, `backup/`을 열지 마라.

## 성공 기준

- `npm run build` 통과(`tsc --noEmit` 포함). 실패하면 고치고 다시 돌려라.
- `git status --short` 에 위 5개 파일 외 새로 바뀐 파일이 없다. R300으로 이미 바뀐 네 파일은 그대로 남아 있어야 한다.
- `grep -rn '"취소"' src/data/schema.ts src/data/analysis-print.ts src/routes/FabricAnalysis.tsx src/components/analysis/` 결과가 `LEGACY_ANALYSIS_CANCELLED` 선언 한 줄뿐이다.
- `grep -n "deleteDrafts" src/routes/FabricAnalysis.tsx` 결과가 0건이다.
