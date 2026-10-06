# R292 — WAREHOUSE 3팀 결과 그룹에서 자주 안 보는 열 접기

추론 강도: **low**. 파일 1개. 열 정의 배열을 둘로 나누고 기본값 한 줄을 고치는 일이다.

## 상태

미착수.

## 왜

3팀 창고 표의 `결과` 그룹이 13열이다. 그중 실제로 보는 것은 Finish Date, Due Date, Remark/Issue 셋이고 나머지 10열(수축률, 편직 사양, Loop, Greige)은 거의 안 본다. 2026-10-06에 박향근이 셋만 남기고 나머지는 숨기라고 지시했다.

**열을 지우지 않는다.** 이 화면에는 접는 그룹 장치(`collapsible` + `warehouse-open-groups-v1`)가 이미 있고 `공정`, `RDDA 성과`가 그것을 쓴다. 접힌 그룹은 표 위에 `이름 +` 칩으로 남아 한 번 눌러 펼친다. 10열을 그 장치에 올리고 기본을 접힘으로 두는 것이 이번 조치다. 값은 그대로 남고 필요할 때 사람이 펼친다.

1팀 열 목록(`TEAM1_COLUMN_GROUPS`)에는 `결과` 그룹이 없다. 1팀 표는 건드리지 않는다.

## 파일

`src/routes/Warehouse.tsx` 하나다. 다른 파일은 열지 마라.

### 1. 그룹 key 타입 (87행)

```ts
  key: "fixed" | "rdda" | "ledger" | "process" | "result"
```

→

```ts
  key: "fixed" | "rdda" | "ledger" | "process" | "result" | "resultDetail"
```

### 2. `결과` 그룹을 둘로 나눈다 (142~156행)

현재 코드:

```ts
  { key: "result", label: "결과", color: "var(--chart-4)", columns: [
    { id: "completedAt", label: "Finish Date", width: 88 },
    { id: "dueDate", label: "Due Date", width: 88 },
    { id: "note", label: "Remark/Issue", width: 200 },
    { id: "shrinkageLength", label: "Shrinkage L", width: 88 },
    { id: "shrinkageWidth", label: "Shrinkage W", width: 88 },
    { id: "knitInch", label: "Inch", width: 68 },
    { id: "knitNeedles", label: "Needles", width: 78 },
    { id: "knitGauge", label: "Gauge", width: 72 },
    { id: "loopF", label: "Loop F", width: 68 },
    { id: "loopT", label: "Loop T", width: 68 },
    { id: "loopB", label: "Loop B", width: 68 },
    { id: "greigeWidth", label: "Greige 폭", width: 80 },
    { id: "greigeWeight", label: "Greige 중량", width: 86 },
  ] },
```

이렇게 바꾼다. `id`와 `label`, `width`는 한 글자도 바꾸지 말고 자리만 옮긴다.

```ts
  { key: "result", label: "결과", color: "var(--chart-4)", columns: [
    { id: "completedAt", label: "Finish Date", width: 88 },
    { id: "dueDate", label: "Due Date", width: 88 },
    { id: "note", label: "Remark/Issue", width: 200 },
  ] },
  // 수축률, 편직 사양, Loop, Greige는 거의 보지 않는 열이라 기본 접힘으로 돌렸다(R292, 2026-10-06 박향근 지시).
  // 값은 그대로 저장되며 표 위 `결과 상세 +` 칩으로 펼친다.
  { key: "resultDetail", label: "결과 상세", color: "var(--chart-4)", collapsible: true, columns: [
    { id: "shrinkageLength", label: "Shrinkage L", width: 88 },
    { id: "shrinkageWidth", label: "Shrinkage W", width: 88 },
    { id: "knitInch", label: "Inch", width: 68 },
    { id: "knitNeedles", label: "Needles", width: 78 },
    { id: "knitGauge", label: "Gauge", width: 72 },
    { id: "loopF", label: "Loop F", width: 68 },
    { id: "loopT", label: "Loop T", width: 68 },
    { id: "loopB", label: "Loop B", width: 68 },
    { id: "greigeWidth", label: "Greige 폭", width: 80 },
    { id: "greigeWeight", label: "Greige 중량", width: 86 },
  ] },
```

### 3. 기본 펼침 값 (595행)

```ts
  const [openGroups, setOpenGroups] = useState(() => loadViewGroups(WH_OPEN_GROUPS_KEY, { process: true, rdda: true }))
```

→ `resultDetail: false`를 더한다. `loadViewGroups`는 defaults에 있는 키만 저장값으로 덮으므로, 기존 사용자의 localStorage에 이 키가 없어 모두 접힌 상태로 시작한다.

```ts
  const [openGroups, setOpenGroups] = useState(() => loadViewGroups(WH_OPEN_GROUPS_KEY, { process: true, rdda: true, resultDetail: false }))
```

## 하지 말 것

- 열을 삭제하지 마라. 셀 렌더와 편집 분기는 `id`로 돌아가므로 `id`를 지우거나 바꾸면 그 열 값이 화면에서 영구히 사라진다.
- `TEAM1_COLUMN_GROUPS`를 건드리지 마라. 1팀 표에는 `결과` 그룹이 없다.
- `WH_OPEN_GROUPS_KEY` 문자열(`warehouse-open-groups-v1`)을 바꾸지 마라. 바꾸면 팀원이 맞춰 둔 공정·RDDA 펼침 상태가 날아간다.
- `MANUAL_EDITABLE`, `FABRIC1_*_EDITABLE` 집합을 건드리지 마라. 이번 변경과 무관하다.
- 783행, 1780~1787행의 그룹 접기 렌더 코드는 그대로 둔다. `collapsible` 플래그만 보면 되므로 손댈 것이 없다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON을 열지 마라.

## 검증

```
npm run build
```

오류 0이면 성공이다.

```
git status --short
```

`src/routes/Warehouse.tsx` 한 개만 이번 작업으로 바뀌어야 한다. 다른 파일에 있던 대기 중 변경은 그대로 남아 있어야 한다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
