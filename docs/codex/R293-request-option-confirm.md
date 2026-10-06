# R293 — DEVELOPMENT REQUEST 옵션 추가·삭제에 확인 절차

추론 강도: **low**. 파일 1개(`src/routes/FabricRequest.tsx`). 함수 세 개에 확인창을 넣고 주석 한 곳을 고친다.

## 상태

미착수.

## 왜

옵션 추가와 삭제가 누르는 즉시 실행된다. "옵션 추가" 줄 버튼은 행에 마우스를 올리면 나타나고 표 안에 있어 잘못 누르기 쉽다. 삭제는 지금 **내용이 적힌 줄만** 되묻고 빈 줄은 바로 지운다. 2026-10-06에 박향근이 두 동작 모두 실행 전에 확인과 취소를 한 번 거치게 하라고 지시했다.

확인창은 이 파일이 이미 쓰는 `window.confirm`으로 한다. 스타일 삭제(`remove`, 849행)와 옵션 삭제가 같은 방식이라 모양을 맞춘다. **새 Dialog 컴포넌트를 만들지 말 것.**

## 적용 대상

같은 동작에 들어가는 길이 두 개씩이다. 한쪽만 막으면 다른 길로 그대로 즉시 실행되므로 네 곳을 모두 건다.

| 동작 | 길 | 함수 |
|---|---|---|
| 옵션 추가 | 표 안 "옵션 추가" 줄 버튼 | `addOption` |
| 옵션 추가 | 우클릭 메뉴 "옵션 위에 삽입", "옵션 아래에 삽입" | `changeOptions("above" \| "below")` |
| 옵션 삭제 | Opt 칸 휴지통 버튼 | `removeOption` |
| 옵션 삭제 | 우클릭 메뉴 "옵션 삭제" | `changeOptions("delete")` |

스타일 추가(표 아래 빈 곳 우클릭)와 스타일 삭제는 이번 범위가 아니다. 스타일 삭제는 이미 확인창이 있다.

## 1. `addOption` (857~861행)

현재 코드:

```ts
  /** 스타일 맨 아래에 옵션 라인을 한 줄 붙인다. 편집 팝업을 열지 않고 표에서 바로 만든다. */
  const addOption = (style: RequestStyle) => {
    saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, [...style.options, blankOption(style.reqId, style.options.length + 1)]), updatedAt: new Date().toISOString() } : item))
    setRowMenu(null)
  }
```

이렇게 바꾼다.

```ts
  /**
   * 스타일 맨 아래에 옵션 라인을 한 줄 붙인다. 편집 팝업을 열지 않고 표에서 바로 만든다.
   * 버튼이 표 안에 있어 잘못 누르기 쉬워 확인을 한 번 받는다(R293).
   */
  const addOption = (style: RequestStyle) => {
    if (!window.confirm(`${style.garmentNo || "이 의뢰"}에 옵션 ${style.options.length + 1}번을 추가할까요?`)) { setRowMenu(null); return }
    saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, [...style.options, blankOption(style.reqId, style.options.length + 1)]), updatedAt: new Date().toISOString() } : item))
    setRowMenu(null)
  }
```

취소해도 `setRowMenu(null)`은 부른다. 우클릭 메뉴를 거쳐 들어온 경우 메뉴가 열린 채 남으면 안 된다.

## 2. `removeOption` (863~875행)

현재 코드:

```ts
  /**
   * 옵션 라인 한 줄을 지운다.
   *
   * 지운 뒤 `renumber`로 번호를 1부터 다시 매긴다. `optId`가 번호를 따라가므로
   * 인덱스로 지우면 뒤 옵션의 식별자가 밀린다. 반드시 `optId`로 찾아 지운다.
   * 내용이 하나라도 적힌 줄만 되묻는다. 빈 줄까지 확인창을 띄우면 성가시다.
   */
  const removeOption = (style: RequestStyle, option: RequestOption) => {
    const filled = [option.yarnDetail, option.construction, option.weight, option.color, option.dyeingMethod].some((value) => text(value).trim())
    if (filled && !window.confirm(`옵션 ${option.no}번을 삭제할까요?`)) return
    saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, style.options.filter((item) => item.optId !== option.optId)), updatedAt: new Date().toISOString() } : item))
    setRowMenu(null)
  }
```

이렇게 바꾼다. 빈 줄도 되묻고, 내용이 적힌 줄에는 경고 문장을 한 줄 더 붙인다.

```ts
  /**
   * 옵션 라인 한 줄을 지운다.
   *
   * 지운 뒤 `renumber`로 번호를 1부터 다시 매긴다. `optId`가 번호를 따라가므로
   * 인덱스로 지우면 뒤 옵션의 식별자가 밀린다. 반드시 `optId`로 찾아 지운다.
   * R293부터 빈 줄도 되묻는다. 휴지통 버튼이 Opt 칸 안에 있어 잘못 누르기 쉽다.
   */
  const removeOption = (style: RequestStyle, option: RequestOption) => {
    const filled = [option.yarnDetail, option.construction, option.weight, option.color, option.dyeingMethod].some((value) => text(value).trim())
    const warning = filled ? "\n적어 둔 값이 함께 지워집니다." : ""
    if (!window.confirm(`옵션 ${option.no}번을 삭제할까요?${warning}`)) { setRowMenu(null); return }
    saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, style.options.filter((item) => item.optId !== option.optId)), updatedAt: new Date().toISOString() } : item))
    setRowMenu(null)
  }
```

## 3. `changeOptions` (1342~1350행)

우클릭 메뉴의 삽입과 삭제다. 선택 영역이 여러 스타일, 여러 옵션에 걸칠 수 있으므로 **건수를 세어 보여 준다.**

현재 코드:

```ts
  const changeOptions = (mode: "above" | "below" | "delete") => {
    if (!rect) return
    const targets = new Map<string, Set<number>>()
    for (let r = rect.top; r <= rect.bottom; r += 1) { const slot = slots[r]; if (!slot) continue; const set = targets.get(slot.style.reqId) ?? new Set<number>(); set.add(slot.optionIndex); targets.set(slot.style.reqId, set) }
    const now = new Date().toISOString()
```

`const now = ...` 줄 바로 앞에 확인 절차를 넣는다. `targets`를 만든 뒤라야 건수를 셀 수 있다.

```ts
  const changeOptions = (mode: "above" | "below" | "delete") => {
    if (!rect) return
    const targets = new Map<string, Set<number>>()
    for (let r = rect.top; r <= rect.bottom; r += 1) { const slot = slots[r]; if (!slot) continue; const set = targets.get(slot.style.reqId) ?? new Set<number>(); set.add(slot.optionIndex); targets.set(slot.style.reqId, set) }
    // 선택 영역이 여러 스타일에 걸칠 수 있어 건수를 적어 되묻는다(R293).
    const lineCount = [...targets.values()].reduce((sum, set) => sum + set.size, 0)
    if (lineCount === 0) { setRowMenu(null); return }
    const scope = targets.size > 1 ? `스타일 ${targets.size}건의 ` : ""
    const question = mode === "delete"
      ? `${scope}옵션 ${lineCount}줄을 삭제할까요?\n적어 둔 값이 함께 지워집니다.`
      : `${scope}선택한 ${lineCount}줄 ${mode === "below" ? "아래" : "위"}에 빈 옵션을 넣을까요?`
    if (!window.confirm(question)) { setRowMenu(null); return }
    const now = new Date().toISOString()
```

나머지 줄(`const next = requests.map(...)`, `saveMutation(next); setRowMenu(null)`)은 그대로 둔다.

## 하지 말 것

- 새 확인 Dialog 컴포넌트나 공용 훅을 만들지 마라. 이 화면은 `window.confirm`으로 통일돼 있다.
- `remove`(스타일 삭제, 849행)의 기존 확인 문구를 바꾸지 마라.
- 표 아래 빈 곳 우클릭의 스타일 추가에는 확인을 넣지 마라. 이번 지시 범위가 아니다.
- `saveMutation`, `commitRequests`, `renumber`, `blankOption`의 동작을 바꾸지 마라. 확인 절차만 앞에 세운다.
- `changeOptions`의 `targets` 계산식과 `next` 생성식을 고치지 마라.
- 확인을 건너뛰는 설정이나 "다시 묻지 않기" 체크를 만들지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라. 다른 파일 10개에 검증 대기 중인 수정이 있다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 수정을 마친 뒤 한 번만 돌려라.
- `legacy/`, `legacy-vanilla/`, `backup/`, `public/data`는 읽지 마라.

## 검증

```
npm run build
```

오류 0이면 성공이다.

```
git status --short
```

이번 작업으로 바뀌는 파일은 `src/routes/FabricRequest.tsx` 하나다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
