# R442 — FABRIC ANALYSIS 의뢰와 분석 갈라 놓기

2026-11-23 박향근 지시. 화면별 편집 권한 정리의 셋째 묶음이다.

> fabric analysis : 주로 통원부1팀이 작성해서 의뢰하면 통원부3팀에서 분석후 완료한다.
>
> (추가 확정) 3팀은 분석 의뢰를 만들 필요 없다.

지금은 권한 키 `fabricAnalysis` 하나뿐이라 편집 권한만 있으면 의뢰 칸도 분석 결과 칸도 다 열린다. 그걸 부서로 가른다.

손대는 파일은 셋이다.

- `src/data/fabric-analysis.ts` (판정 함수 추가)
- `src/routes/FabricAnalysis.tsx`
- `src/components/analysis/AnalysisDetailDialog.tsx`

`AnalysisRequestDialog.tsx`는 **열리는 길만 막으므로 고치지 않는다.**

---

## 1. 판정 함수 둘

`src/data/fabric-analysis.ts` 맨 아래에 더한다. 그 파일에 이미 `canDeleteAnalysis`가 있다. 그 옆이다.

```ts
/**
 * 의뢰 쪽을 고칠 수 있는가(2026-11-23 박향근 지시). 1팀과 관리자다.
 * 의뢰 만들기, 의뢰 칸 수정, 의뢰 사진, 「의뢰 확정」과 「작성으로 되돌리기」가 여기에 든다.
 * 3팀은 분석 의뢰를 만들지 않는다.
 */
export function canEditAnalysisRequest(department: string | null | undefined, isOwner: boolean): boolean {
  return isOwner || department === "fabric1"
}

/**
 * 분석 결과 쪽을 고칠 수 있는가. 3팀과 관리자다.
 * 결과 칸, 분석 사진, 「완료 처리」와 「의뢰로 되돌리기」, 「개발 의뢰로 넘기기」가 여기에 든다.
 */
export function canEditAnalysisResult(department: string | null | undefined, isOwner: boolean): boolean {
  return isOwner || department === "fabric3"
}
```

**둘 다 화면 권한(`fabricAnalysis`)과 AND로 묶어 쓴다.** 부서만 보고 열지 말 것. 읽기 권한자가 부서만 맞다고 고치게 되면 안 된다.

---

## 2. 목록 화면

`src/routes/FabricAnalysis.tsx`.

56~58행 근처에 이미 이런 값들이 있다.

```ts
  const canEdit = access === "edit"
  const isOwner = useAuthStore((state) => state.isOwner)
  const user = useAuthStore((state) => state.user)
```

여기에 둘을 더한다.

```ts
  const department = useAuthStore((state) => state.department)
  // 의뢰는 1팀, 분석 결과는 3팀이다. 화면 편집 권한과 함께 본다.
  const canRequest = canEdit && canEditAnalysisRequest(department, isOwner)
  const canAnalyze = canEdit && canEditAnalysisResult(department, isOwner)
```

그리고 버튼마다 조건을 갈아 끼운다. **`canEdit`을 그대로 둘 자리와 바꿀 자리를 섞지 말 것.**

| 자리 | 버튼 | 지금 | 바꿀 것 |
|---|---|---|---|
| 347 | 의뢰 확정 | `canEdit` | `canRequest` |
| 349 | 완료 처리 | `canEdit` | `canAnalyze` |
| 350 | 작성으로 되돌리기 | `canEdit` | `canRequest` |
| 352 | 개발 의뢰로 넘기기 | `canEdit` | `canAnalyze` |
| 354 | 의뢰로 되돌리기 | `canEdit` | `canAnalyze` |
| 355 | 삭제 | `canEdit` | **그대로 `canEdit`** |
| 358 | 새 분석 의뢰 | `canEdit && activeState === "작성"` | `canRequest && activeState === "작성"` |
| 382 | 표 안 「의뢰」 버튼 | `canEdit` | `canRequest` |
| 382 | 표 안 「완료」 버튼 | `canEdit` | `canAnalyze` |
| 382 | 표 안 「메일」 버튼 | 조건 없음 | **그대로** |

삭제는 이미 `canDeleteAnalysis`(만든 사람과 관리자)가 따로 거른다(R301). **그 규칙을 부서로 바꾸지 말 것.** 1팀이 잘못 만든 건을 1팀이 지우는 길이다.

### 151행의 `detailCanEdit`

```ts
  const detailCanEdit = canEdit && !previewOnly
```

이것을 둘로 가른다.

```ts
  const detailCanEditRequest = canRequest && !previewOnly
  const detailCanEditResult = canAnalyze && !previewOnly
```

387행의 `AnalysisDetailDialog`에 `canEdit={detailCanEdit}` 대신 둘을 넘긴다.

```tsx
      canEditRequest={detailCanEditRequest}
      canEditResult={detailCanEditResult}
```

### 283행 effect의 의존성

```ts
  }, [rows, canEdit])
```

이 effect(`cleanupTries`)가 무엇을 하는지 확인하고 `canEdit`을 그대로 둘지 정한다. **자동 정리라면 `canEdit` 그대로다.** 부서로 가르면 1팀 화면에서는 돌고 3팀 화면에서는 안 도는 식이 되어 결과가 들쭉날쭉해진다.

---

## 3. 상세 팝업

`src/components/analysis/AnalysisDetailDialog.tsx`.

`canEdit: boolean` prop 하나를 `canEditRequest: boolean`과 `canEditResult: boolean` 둘로 바꾼다. 15행 타입과 36행 구조분해를 함께 고친다.

150행의

```ts
  const controlsDisabled = !canEdit || completionPending
```

는 쓰이는 자리를 보고 가른다. 결과 입력칸에 걸려 있으면 `!canEditResult || completionPending`이다.

### 자리별로 어느 값을 쓰는가

| 자리 | 내용 | 쓸 값 |
|---|---|---|
| 160 | 의뢰 사진 변경, 삭제 | `canEditRequest` |
| 170 | 분석 사진 추가, 삭제 | `canEditResult` |
| 175 | 「의뢰 정보 수정」 버튼 | `canEditRequest` |
| 175 | 「결과 저장」 버튼 | `canEditResult` |
| 175 | 「완료 처리」 버튼 | `canEditResult` |
| 175 | 「완료 되돌리기」 버튼 | `canEditResult` |
| 175 | 「출력」, 「완료 메일」, 「닫기」 | 조건 없음, 그대로 |
| 그 밖 | 분석 결과 입력칸 전부 (Yarn description, Construction (RND), Weight (RND), Comment) | `canEditResult` |
| 그 밖 | 의뢰 쪽 값은 이 팝업에서 직접 안 고친다 | 확인만 |

**175행 한 줄 안에 버튼이 여섯 개 있다.** 바깥 `{canEdit ? <> ... </> : null}` 하나로 묶여 있으므로 그 묶음을 풀고 버튼마다 조건을 붙여야 한다. **묶음째 `canEditResult`로 바꾸면 1팀이 「의뢰 정보 수정」을 못 누른다.**

### 안내 문구

막힌 버튼은 지우지 말고 `disabled`로 두고 `title`에 이유를 적는다.

- 의뢰 쪽: `"의뢰 정보는 1팀만 고칠 수 있습니다."`
- 분석 쪽: `"분석 결과는 원단 R&D팀(3팀)만 고칠 수 있습니다."`

버튼을 아예 감추면 왜 없는지 알 수 없다. **목록 화면의 도구줄 버튼은 지금처럼 감춰도 된다**(이미 `canEdit ? ... : null` 꼴이다). 상세 팝업 안에서는 보이되 비활성이 낫다.

---

## 4. 건드리지 말 것

- **`canDeleteAnalysis`(R301).** 만든 사람과 관리자다. 부서와 무관하다.
- **인쇄(`AnalysisPrintDeck`)와 메일.** 권한을 보지 않는 자리다. R343, R344의 인쇄 구조를 손대지 말 것.
- **`ANALYSIS_STATES` 세 값과 `LEGACY_ANALYSIS_CANCELLED`.** 상태 목록을 늘리거나 줄이지 말 것.
- **Construction (RND) 필수 검사.** 비면 「완료 처리」가 막힌다(R358). 그대로다.
- **분석 사진 비압축 규칙(2026-10-21).** 2.8MB 이하 원본 그대로다. `storage.rules`의 `< 3MB`와 짝이다.
- **분석에서 개발 의뢰로 넘기는 길(R352~R362).** 버튼 권한만 `canAnalyze`로 바꾸고 `analysis-to-request.ts`는 손대지 말 것.
- **목록 탭을 옮길 때 체크 풀기(2026-10-21).** 그대로다.
- **`screen-permissions.ts`와 `departments.ts`.** 이번 묶음에서는 안 건드린다. 1팀과 3팀 둘 다 `fabricAnalysis: "edit"`가 맞다. 부서가 그 안에서 갈라 준다.

## 하지 말 것

- 커밋하지 말 것.
- `firestore.rules`를 손대지 말 것.
- 새 권한 키를 만들지 말 것.
- 실데이터를 바꾸지 말 것.

## 끝나고 확인

```
npm run build
```

그리고 **175행 버튼 묶음을 푼 뒤 여섯 버튼이 전부 제 조건을 받았는지 눈으로 한 번 더 셀 것.** 타입 검사로는 안 잡힌다.
