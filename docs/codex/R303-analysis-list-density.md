# R303 — FABRIC ANALYSIS 목록: 완료 행 회색 처리와 잠금, 탭 건수 배지, 행 밀도

상태: 미착수

## 배경

2026-10-07 박향근 요청 넷이다.

1. **완료 건은 행을 회색으로** 보인다.
2. **완료 건은 전체 탭에서 수정 불가.** 내용 수정은 완료 탭에서만 한다.
3. **탭마다 동그라미 숫자 배지**로 몇 건인지 보인다.
4. **글자를 줄여 행을 슬림하게** 만든다.

2번의 범위는 **완료 건 하나다.** 전체 탭의 작성·의뢰 행은 지금처럼 고칠 수 있다. 전체 탭을 통째로 읽기 전용으로 만들지 마라.

**워킹트리에 커밋 안 된 R300·R301·R302 변경이 여러 파일에 있다.** `git reset`, `git checkout`, `git stash`, `git restore` 로 되돌리지 마라.

## 파일

`src/routes/FabricAnalysis.tsx` 하나다. 다른 파일을 고치지 마라. 특히 `src/components/ui/table.tsx` 는 전 화면이 공유하므로 건드리지 마라.

---

## 1. 완료 건 수정 잠금

### 1-1. 판정 값 추가

`const deletableSelected = ...` 줄 바로 아래에 넣는다.

```tsx
  // 완료 건은 완료 탭에서만 고친다(2026-10-07 박향근 지시). 전체 목록에서는 보기만 한다.
  // 삭제는 여기서 가리지 않는다. 권한만 보는 것이 R301에서 정한 규칙이다.
  const detailCanEdit = canEdit && !(detail?.state === "완료" && activeState !== "완료")
```

### 1-2. 상세 팝업에 넘기기

215행 근처의 `<AnalysisDetailDialog ... />` 에서 `canEdit={canEdit}` 하나만 바꾼다.

```tsx
    <AnalysisDetailDialog record={detail} canEdit={canEdit} ...
```
교체:
```tsx
    <AnalysisDetailDialog record={detail} canEdit={detailCanEdit} ...
```
같은 줄의 다른 prop 은 건드리지 마라.

`AnalysisDetailDialog` 는 `canEdit` 이 거짓이면 `의뢰 정보 수정`, 결과 저장, `완료 되돌리기` 를 통째로 안 그린다. 그 쪽 파일은 고칠 필요가 없다.

## 2. 완료 행 회색 처리

208행 `<TableRow key={item.id} className={...}>` 의 템플릿 문자열 끝에 한 칸을 더한다.

현재:
```tsx
className={`cursor-pointer border-[var(--border)]/50 font-normal transition-colors duration-150 hover:bg-teal-500/[0.06] dark:hover:bg-teal-400/10 ${selected.has(item.id) ? "bg-teal-500/10" : ""} ${item.requestType === "Urgent" ? "shadow-[inset_2px_0_0_#f43f5e]" : ""}`}
```
교체:
```tsx
className={`cursor-pointer border-[var(--border)]/50 font-normal transition-colors duration-150 hover:bg-teal-500/[0.06] dark:hover:bg-teal-400/10 ${selected.has(item.id) ? "bg-teal-500/10" : ""} ${item.requestType === "Urgent" ? "shadow-[inset_2px_0_0_#f43f5e]" : ""} ${item.state === "완료" ? "text-[var(--muted-foreground)]" : ""}`}
```

**배경색을 더하지 마라.** 선택(`bg-teal-500/10`)과 호버가 같은 `bg-*` 유틸이라 어느 쪽이 이길지 Tailwind 생성 순서에 달린다. 글자색만 죽이면 선택과 호버가 그대로 산다.

**`opacity` 를 쓰지 마라.** 상태 칩까지 흐려져 왜 회색인지 알 수 없게 된다. 초록 `완료` 칩은 선명하게 남아야 한다.

## 3. 탭 건수 배지

### 3-1. 건수 계산

`const weekly = useMemo(...)` 줄 근처, `metrics` 선언 **앞**에 넣는다.

```tsx
  // 탭 배지는 전체 건수를 센다. 검색과 Urgent 필터에 따라 숫자가 흔들리면 어디에 몇 건인지 알 수 없다.
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL]: rows.length }
    for (const state of ANALYSIS_STATES) counts[state] = rows.filter((item) => item.state === state).length
    return counts
  }, [rows])
```

`filtered` 가 아니라 `rows` 를 쓴다. 바꾸지 마라.

### 3-2. 배지 그리기

190행 `TabsTrigger` 의 className 맨 앞에 `group ` 을 더하고, `{state}` 뒤에 배지를 붙인다.

현재:
```tsx
<TabsTrigger key={state} value={state} className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none dark:data-[state=active]:border-teal-400 dark:data-[state=active]:text-teal-300">{state}</TabsTrigger>
```
교체:
```tsx
<TabsTrigger key={state} value={state} className="group rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none dark:data-[state=active]:border-teal-400 dark:data-[state=active]:text-teal-300">{state}<span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--muted-foreground)] group-data-[state=active]:bg-teal-600/15 group-data-[state=active]:text-teal-700 dark:group-data-[state=active]:text-teal-300">{tabCounts[state] ?? 0}</span></TabsTrigger>
```

`group` 을 빼지 마라. 활성 탭 색이 배지에 안 먹는다. `data-[state=active]` 는 `TabsTrigger` 에 붙는 속성이라 자식이 직접 볼 수 없다.

## 4. 행 밀도

### 4-1. 표 글자와 세로 여백 (205행)

현재:
```tsx
<Table className="min-w-[1700px] text-[13px]">
```
교체:
```tsx
<Table className="min-w-[1700px] text-xs [&_td]:py-1">
```

`text-[13px]` → `text-xs`(12px), 셀 세로 여백 `py-1.5`(6px) → `py-1`(4px)다.
`[&_td]:py-1` 은 `src/components/ui/table.tsx` 의 기본값보다 선택자가 길어 이긴다. **`table.tsx` 를 고쳐서 해결하지 마라.** 다른 화면 표가 전부 같이 좁아진다.

### 4-2. 사진 칸 (44행 `ImageThumb`)

행 높이를 실제로 정하는 것은 글자가 아니라 사진이다. `size-9`(36px) 둘을 `size-7`(28px)로, 아이콘 `size-3.5` 를 `size-3` 으로 줄인다.

현재:
```tsx
  return url ? <img src={url} alt={`${label} 사진`} className="size-9 rounded-md object-cover ring-1 ring-[var(--border)]/60" /> : <span className="flex size-9 items-center justify-center rounded-md bg-[var(--muted)]/50 text-[var(--muted-foreground)]"><ImageOff className="size-3.5" /></span>
```
교체:
```tsx
  return url ? <img src={url} alt={`${label} 사진`} className="size-7 rounded-md object-cover ring-1 ring-[var(--border)]/60" /> : <span className="flex size-7 items-center justify-center rounded-md bg-[var(--muted)]/50 text-[var(--muted-foreground)]"><ImageOff className="size-3" /></span>
```

행 높이가 48px 에서 36px 로 내려간다.

### 4-3. 손대지 않을 것

- 머리글 `TableHead` 의 `text-[11px]` 과 `h-9` 는 그대로 둔다. 머리글은 이미 작다.
- 상태 칩과 `Urgent` 칩의 `text-[11px]` 도 그대로 둔다. 본문보다 작아야 칩으로 보인다.
- 열 `min-w-[1700px]` 과 `max-w-56`·`max-w-64` 자르기도 그대로 둔다.

---

## 하지 말 것

- `src/components/ui/table.tsx` 를 고치지 마라. 전 화면 공유다.
- 전체 탭을 통째로 읽기 전용으로 만들지 마라. 잠그는 것은 완료 건 하나다.
- 삭제 버튼과 `deletableSelected` 판정을 건드리지 마라. R301에서 권한만 보도록 정했다.
- 완료 행에 배경색이나 `opacity` 를 주지 마라.
- 탭 배지 숫자에 검색·Urgent 필터를 적용하지 마라.
- `AnalysisDetailDialog.tsx` 를 고치지 마라. `canEdit` 하나로 이미 갈린다.
- 워킹트리의 R300·R301·R302 변경을 git 명령으로 되돌리지 마라.
- `firestore.rules`, `public/data` 아래 JSON, `legacy/`, `backup/` 을 열지 마라.

## 성공 기준

- `npm run build` 통과(`tsc --noEmit` 포함). 실패하면 고치고 다시 돌려라.
- `git status --short` 에 이번에 새로 바뀐 파일이 `src/routes/FabricAnalysis.tsx` 하나다. R300·R301·R302로 바뀐 파일들은 그대로 남아 있어야 한다.
- `grep -c "size-9" src/routes/FabricAnalysis.tsx` 결과가 0이다.
- `grep -c "text-\[13px\]" src/routes/FabricAnalysis.tsx` 결과가 0이다.
- `grep -c "detailCanEdit" src/routes/FabricAnalysis.tsx` 결과가 2다(선언 1, 사용 1).
