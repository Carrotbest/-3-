# R283 — 원가계산 팝업 열 정렬과 이력 조회 오류

추론 강도: **medium**. 파일 2개. 표 열 정렬(시각)과 Firestore 조회 제약(동작) 두 가지다.

## 상태

R267~R279로 구현은 끝났고 2026-10-02에 박향근이 화면을 처음 띄웠다. 두 가지가 나왔다.

1. 원사 표와 공정 표의 열이 서로 어긋나 보인다.
2. 팝업 아래에 `계산서 이력을 불러오지 못했습니다.` 가 뜬다.

## 가설 아님, 확인한 원인

### 1. 열이 어긋나는 이유

두 표가 `<colgroup>`으로 폭을 주는데 **`table-layout`이 auto라 브라우저가 그 폭을 참고만 하고 내용에 맞춰 다시 나눈다.**

결정타는 액션 열이다. 둘 다 `w-[72px]`인데 원사 표는 휴지통 1개, 공정 표는 위·아래·휴지통 3개(`size-6` = 24px x 3 = 72px + 패딩)다. 공정 표 액션 열이 72px를 넘기니 브라우저가 그 열을 넓히고 그만큼 왼쪽 열을 좁힌다. 그래서 바로 위아래에 붙어 있는 두 표의 `단가`, `단위` 칸이 세로로 안 맞는다.

고치는 방법은 두 가지다. `table-fixed`로 colgroup 폭을 강제하고, **두 표의 오른쪽 네 열 폭을 똑같이 맞춘다.**

| 위치 | 원사 표 | 공정 표 | 맞춘 값 |
|---|---|---|---|
| 뒤에서 4번째 | 단가 84 | 단가 84 | **84** |
| 뒤에서 3번째 | 단위 92 | 단위 92 | **92** |
| 뒤에서 2번째 | 선염 52 | LOSS 52 | **64** |
| 맨 뒤 | 액션 72 | 액션 72 | **96** |

### 2. 이력이 안 불러와지는 이유

`src/data/cost-sheets.ts` `listCostSheets`가 `where(...) + orderBy("at","desc")` 를 함께 건다. Firestore는 이 조합에 **복합 색인**을 요구하고, 없으면 `failed-precondition`으로 던진다.

저장소에 `firestore.indexes.json`이 없고 `firebase.json`도 `firestore.rules`만 가리킨다. 색인이 올라간 적이 없다.

- `/cost` 자료실(`CostSheets.tsx:48`)은 `where` 없이 부르므로 단일 필드 색인이라 자동이고 잘 된다.
- 팝업(`CostSheetDialog.tsx:139`)만 `rowKey` 또는 `groupId` 필터를 걸어서 터진다.

**색인을 만들지 않는다.** 색인을 추가하면 수동 배포가 또 늘고 필터 조합마다 색인이 하나씩 필요하다. 게다가 **팝업은 받아온 뒤 어차피 `version` 기준으로 다시 정렬한다**(`CostSheetDialog.tsx:140`). 서버 정렬이 필요 없다.

필터가 있으면 `orderBy`를 빼고 클라이언트에서 정렬한다. 한 행의 버전 수는 많아야 수십 건이라 `limit` 100에 걸리지 않는다.

## 건드리지 말 것

- `computeFabricCost`, `yarn-blend.ts`, 계산식 일체. 회귀 기준값이 걸려 있다.
- `saveCostSheet`, `updateCostSheet`, `latestByGroup`.
- `firestore.rules`, `firebase.json`. 색인 파일을 새로 만들지 말 것.
- 팝업의 저장·엑셀·인쇄 동작과 `DialogContent` 클래스. **`DialogContent`에 `relative`, `absolute`, `static`을 넘기지 말 것**(tailwind-merge가 `fixed`를 지워 팝업이 문서 흐름으로 떨어진다).
- 열 폭 외의 레이아웃. 섹션 순서, 결과 카드, 메모칸은 그대로다.

## 작업 1. `src/data/cost-sheets.ts`

**66~75행**을 교체한다.

현재:
```ts
  const constraints = [
    ...(filter.flNo ? [where("flNo", "==", filter.flNo)] : []),
    ...(filter.styleNo ? [where("styleNo", "==", filter.styleNo)] : []),
    ...(filter.rowKey ? [where("rowKey", "==", filter.rowKey)] : []),
    ...(filter.groupId ? [where("groupId", "==", filter.groupId)] : []),
    orderBy("at", "desc"),
    fsLimit(filter.limit ?? 100),
  ]
  const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints))
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<CostSheetDoc, "id">) }))
```

교체:
```ts
  const filters = [
    ...(filter.flNo ? [where("flNo", "==", filter.flNo)] : []),
    ...(filter.styleNo ? [where("styleNo", "==", filter.styleNo)] : []),
    ...(filter.rowKey ? [where("rowKey", "==", filter.rowKey)] : []),
    ...(filter.groupId ? [where("groupId", "==", filter.groupId)] : []),
  ]
  // where 와 orderBy 를 같이 걸면 복합 색인이 필요하다. 색인은 수동 배포라 두지 않는다.
  // 필터가 있을 때는 서버 정렬을 빼고 아래에서 정렬한다. 한 건의 버전 수는 limit 에 닿지 않는다.
  const constraints = [...filters, ...(filters.length ? [] : [orderBy("at", "desc")]), fsLimit(filter.limit ?? 100)]
  const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints))
  const docs = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<CostSheetDoc, "id">) }))
  return filters.length ? docs.sort((left, right) => right.at - left.at) : docs
```

`import` 줄은 그대로 둔다. `orderBy`는 계속 쓴다.

## 작업 2. `src/components/dd/CostSheetDialog.tsx`

### 2-1. gr/yd 읽기 전용 칸 (268행)

옆 `Input`들은 `h-8 px-2 text-xs`인데 이 칸만 `py-1.5 text-sm`이라 숫자가 더 크고 위로 뜬다.

현재:
```
<div className="h-8 rounded border border-[var(--border)] bg-[var(--muted)]/30 px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-[var(--muted-foreground)]">{money(result.grPerYd)}</div>
```
교체:
```
<div className="flex h-8 items-center justify-end rounded border border-[var(--border)] bg-[var(--muted)]/30 px-2 text-xs font-semibold tabular-nums text-[var(--muted-foreground)]">{money(result.grPerYd)}</div>
```

### 2-2. 원사 표 (275행)

현재:
```
<div className="overflow-x-auto"><table className="w-full text-xs"><colgroup><col className="w-8" /><col /><col className="w-[64px]" /><col className="w-[84px]" /><col className="w-[92px]" /><col className="w-[52px]" /><col className="w-[72px]" /></colgroup>
```
교체:
```
<div className="overflow-x-auto"><table className="w-full table-fixed text-xs"><colgroup><col className="w-8" /><col /><col className="w-[64px]" /><col className="w-[84px]" /><col className="w-[92px]" /><col className="w-[64px]" /><col className="w-[96px]" /></colgroup>
```

### 2-3. 원사 표 머리 `#` 가운데 정렬 (276행)

`<thead>` 안 첫 `<th className="px-1.5 py-1 text-left">#</th>` 를
`<th className="px-1.5 py-1 text-center">#</th>` 로 바꾼다. **같은 줄의 나머지 `<th>`는 그대로 둔다.**

### 2-4. 원사 표 번호 칸 가운데 정렬 (280행)

280행 맨 앞 `<td className="px-1.5 py-1">{index + 1}</td>` 를
`<td className="px-1.5 py-1 text-center tabular-nums">{index + 1}</td>` 로 바꾼다.

### 2-5. 원사 표 휴지통 크기 (285행)

공정 표 버튼은 `size-6`인데 원사 표만 기본 크기라 세로로 안 맞는다.

현재:
```
<Button type="button" size="icon" variant="ghost" disabled={!canEdit || input.yarns.length === 1} onClick={() => removeYarn(index)}><Trash2 className="size-3.5" /></Button>
```
교체:
```
<Button type="button" size="icon" variant="ghost" className="size-6" disabled={!canEdit || input.yarns.length === 1} onClick={() => removeYarn(index)}><Trash2 className="size-3.5" /></Button>
```

### 2-6. 공정 표 (294행)

현재:
```
<div className="overflow-x-auto"><table className="w-full text-xs"><colgroup><col className="w-8" /><col className="w-[72px]" /><col className="w-[88px]" /><col className="w-[96px]" /><col /><col className="w-[84px]" /><col className="w-[92px]" /><col className="w-[52px]" /><col className="w-[72px]" /></colgroup>
```
교체:
```
<div className="overflow-x-auto"><table className="w-full table-fixed text-xs"><colgroup><col className="w-8" /><col className="w-[72px]" /><col className="w-[88px]" /><col className="w-[96px]" /><col /><col className="w-[84px]" /><col className="w-[92px]" /><col className="w-[64px]" /><col className="w-[96px]" /></colgroup>
```

### 2-7. 공정 표 머리 `#` (294행 `<thead>` 안)

`<th className="px-1.5 py-1 text-left">#</th>` 를 `<th className="px-1.5 py-1 text-center">#</th>` 로 바꾼다. 같은 줄의 `그룹`, `공정명`, `업체`, `REMARK`, `단가`, `단위`, `LOSS %` th 는 그대로다. **`LOSS %` th 의 `border-l`을 지우지 말 것.**

### 2-8. 공정 표 번호 칸 (297행)

297행 맨 앞 `<td className="px-1.5 py-1">{seq}</td>` 를
`<td className="px-1.5 py-1 text-center tabular-nums">{seq}</td>` 로 바꾼다.

## 주의

- `table-fixed`를 넣으면 폭이 없는 `<col />`(원사 표 2번째, 공정 표 5번째)이 남는 폭을 전부 가져간다. 그 열에 폭을 주지 말 것.
- 원사 표 `<tfoot>`의 `colSpan={2}` 와 `colSpan={5}` 합이 7이고 공정 표 그룹 머리줄 `colSpan={9}`다. **열 개수를 바꾸지 않으므로 이 숫자도 그대로 둔다.**
- 선염 열은 폭만 52에서 64로 늘린다. `text-center`는 이미 있다.
- 2-3과 2-7은 서로 다른 파일 위치의 같은 문자열이다. **한 번에 전체 치환하지 말고 각 표의 `<thead>` 안에서 하나씩 바꿔라.**

## 검증

1. `npm run build` 한 번. **실패하면 고치고 다시 돌려라.** 통과할 때까지다.
2. `git status --short` 로 바뀐 파일이 `src/data/cost-sheets.ts` 와 `src/components/dd/CostSheetDialog.tsx` 둘뿐인지 확인한다.

화면 확인은 박향근이 한다.
