# R266 권한 표를 읽을 수 있게 고친다

상태: 미착수. 추론 강도 **low**(R263 패널의 보이는 부분만 고친다. 저장 로직은 한 줄도 건드리지 않는다).

R263 표가 화면에서 읽히지 않는다. 사용자 확인 사항이다.

- 열 이름이 세로로 서 있어 읽기 어렵다.
- 토글 글자가 한 글자(`없`·`읽`·`편`)로 줄어 무엇인지 구분이 안 된다.

원인은 하나다. 화면 하나에 **16열을 다 세우려다** 열 폭이 62px로 눌렸다. 열을 줄이고 글자를 되살린다.

## 고치는 방향

1. **묶음 탭.** 한 번에 한 묶음만 세운다(업무 7열 · 분석·자료 7열 · 기능 2열). 표 위 탭으로 고른다.
2. **열 이름은 가로로.** 열 폭 124px, 두 줄까지 접어 쓴다. 세로쓰기(`writing-mode`)를 없앤다.
3. **토글은 온전한 낱말로.** `없음` `읽기` `편집`, HOME은 `없음` `블러` `공개`, 기능 열은 `차단` `허용`.

표 너비는 왼쪽 고정 490px + 7열 868px = 약 1358px이라 대부분의 화면에서 가로 스크롤 없이 들어간다.

## 하지 말 것

- `applyAccess`, `setCell`, `setRow`, `setColumn`, `setGroupLevel`, `resetToDepartment`, `chooseDepartment`, `approve`, `reject`를 고치지 마라. 저장 동작은 그대로다.
- 일괄 적용의 확인 창을 빼지 마라.
- `PendingApprovalDialog`는 고치지 마라.
- 부서 묶음(접고 펴기)과 `거부됨도 보기`는 그대로 둔다.

## A. 상수

### A-1. 열 목록

지금

```ts
/** 표에 세우는 열. setting 은 소유자 전용이라 뺀다. */
const COLUMN_KEYS: ScreenPermissionKey[] = ACCESS_GROUPS.flatMap((group) => group.keys)
```

바꾼 뒤

```ts
/**
 * 한 번에 한 묶음만 세운다(R266). 16열을 한 화면에 넣으면 열 폭이 눌려 이름도 토글도 못 읽는다.
 * setting 은 소유자 전용이라 어느 묶음에도 없다.
 */
const TAB_LABELS: string[] = ACCESS_GROUPS.map((group) => group.label)
const keysOfTab = (label: string): ScreenPermissionKey[] => ACCESS_GROUPS.find((group) => group.label === label)?.keys ?? []
/** 전 화면 일괄이 다루는 범위. 탭과 무관하게 모든 열이다. */
const ALL_COLUMN_KEYS: ScreenPermissionKey[] = ACCESS_GROUPS.flatMap((group) => group.keys)
```

`bulkAccess` 안의 `COLUMN_KEYS.map(...)` 을 `ALL_COLUMN_KEYS.map(...)` 으로 바꾼다. 그 함수의 나머지는 그대로다.

### A-2. 크기

지금

```ts
const NAME_W = 214
const DEPT_W = 148
const BULK_W = 92
const HEAD_GROUP_H = 26
const HEAD_LABEL_H = 118
```

바꾼 뒤

```ts
const NAME_W = 214
const DEPT_W = 148
const BULK_W = 128
/** 열 폭. 낱말 토글 세 개(각 34px 이상)가 들어가는 최소치다. */
const COLUMN_W = 124
/** 열 이름 줄 높이. 두 줄까지 접어 쓴다. */
const HEAD_LABEL_H = 46
```

`HEAD_GROUP_H`는 쓰지 않으므로 지운다(묶음 머리 줄이 탭으로 바뀐다).

## B. 토글 글자 되살리기

### B-1. `LevelCell`

버튼 줄을 바꾼다.

```tsx
      return <button key={level} type="button" role="radio" aria-checked={selected} aria-label={text} title={text} disabled={disabled} onClick={() => onChange(level)}
        className={cn("min-w-[34px] rounded-[4px] px-1.5 py-[3px] text-[11px] font-semibold leading-none transition-colors disabled:cursor-wait",
          selected ? LEVEL_TONE[level] : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>{text}</button>
```

### B-2. `BulkCell`

```tsx
      return <button key={level} type="button" disabled={disabled} aria-label={`${label} ${text}`} title={`${label} ${text}`} onClick={() => onPick(level)}
        className="min-w-[34px] rounded-[4px] px-1.5 py-[3px] text-[11px] font-semibold leading-none text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)] hover:text-[var(--foreground)] disabled:cursor-wait">{text}</button>
```

### B-3. `RowBulk`

```tsx
    {(["none", "read", "edit"] as ScreenAccess[]).map((level) => <button key={level} type="button" disabled={disabled} title={`${label} 전 화면 ${ACCESS_LABELS[level]}`} onClick={() => onPick(level)}
      className="rounded-[5px] border border-[var(--border)] px-2 py-[3px] text-[10px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-wait">{ACCESS_LABELS[level]}</button>)}
```

## C. 탭 상태

`const [pendingOpen, setPendingOpen] = useState(false)` 다음 줄에 더한다.

```tsx
  const [activeTab, setActiveTab] = useState<string>(TAB_LABELS[0] ?? "")
```

`const nameOf = (member: ManagedUser) => ...` 앞에 더한다.

```tsx
  const columns = keysOfTab(activeTab)
```

## D. 안내줄 문구

지금 한 글자 표기로 적혀 있다. 아래로 바꾼다.

```tsx
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-[var(--muted)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
      <span><strong className="text-[var(--foreground)]">없음</strong> 메뉴에 안 보임</span>
      <span><strong className="text-sky-600">읽기</strong> 보기만. 수정은 저장되지 않음</span>
      <span><strong className="text-[var(--primary)]">편집</strong> 보기와 수정</span>
      <span><strong className="text-[var(--foreground)]">HOME 블러</strong> 흐리게만 보이고 클릭 불가</span>
      <span><strong className="text-[var(--foreground)]">기능 열</strong> 차단 · 허용</span>
      <span className="ml-auto">SETTING은 소유자 전용</span>
    </div>
```

## E. 묶음 탭 줄

위 안내줄 **다음**, 표를 감싼 `<div className="mt-3 overflow-auto ...">` **앞**에 넣는다.

```tsx
    <div className="mt-3 flex flex-wrap items-center gap-1" role="tablist" aria-label="권한 묶음">
      {TAB_LABELS.map((label) => <button key={label} type="button" role="tab" aria-selected={activeTab === label} onClick={() => setActiveTab(label)}
        className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", activeTab === label ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>
        {label} <span className="tabular-nums opacity-70">{keysOfTab(label).length}</span>
      </button>)}
      <span className="ml-2 text-[11px] text-[var(--muted-foreground)]">한 번에 한 묶음씩 봅니다. `전 화면` 칸은 묶음과 상관없이 전체에 적용됩니다.</span>
    </div>
```

## F. 표 머리 세 줄을 두 줄로

`<thead>` 안의 세 `<tr>` 을 통째로 아래 두 `<tr>` 로 바꾼다. 묶음 머리 줄(colSpan 줄)은 탭이 대신하므로 없앤다.

```tsx
          <tr style={{ height: HEAD_LABEL_H }}>
            <th className={cn("sticky left-0 top-0 z-40 px-2 text-left", headCell)} style={{ width: NAME_W, minWidth: NAME_W }}>사용자</th>
            <th className={cn("sticky top-0 z-30 px-2 text-left", headCell)} style={{ width: DEPT_W, minWidth: DEPT_W, left: NAME_W }}>부서</th>
            <th className={cn("sticky top-0 z-30 px-2 text-center", headCell)} style={{ width: BULK_W, minWidth: BULK_W, left: NAME_W + DEPT_W }}>전 화면</th>
            {columns.map((key) => <th key={key} title={LABEL_BY_KEY.get(key)} className={cn("sticky top-0 z-20 px-1.5 text-center align-middle", headCell)} style={{ width: COLUMN_W, minWidth: COLUMN_W }}>
              <span className="block whitespace-normal break-keep leading-tight">{LABEL_BY_KEY.get(key)}</span>
            </th>)}
          </tr>
          <tr>
            <th className={cn("sticky left-0 z-40 px-2 text-left text-[10px]", headCell)} style={{ top: HEAD_LABEL_H }}>전체 적용</th>
            <th className={cn("sticky z-30", headCell)} style={{ top: HEAD_LABEL_H, left: NAME_W }} />
            <th className={cn("sticky z-30 px-1 text-center", headCell)} style={{ top: HEAD_LABEL_H, left: NAME_W + DEPT_W }}>
              <RowBulk disabled={!rows.length} label="표에 보이는 전원" onPick={(level) => setGroupLevel(rows, level, "표에 보이는")} />
            </th>
            {columns.map((key) => <th key={key} className={cn("sticky z-20 px-1 py-1 text-center", headCell)} style={{ top: HEAD_LABEL_H }}>
              <BulkCell permissionKey={key} disabled={!rows.length} label={`표에 보이는 전원 ${LABEL_BY_KEY.get(key)}`} onPick={(level) => setColumn(rows, key, level, "표에 보이는")} />
            </th>)}
          </tr>
```

## G. 본문에서 열 목록 바꾸기

부서 묶음 머리 줄의 `colSpan` 을 바꾼다.

```tsx
                <td colSpan={3 + columns.length} className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] p-0">
```

사람 줄의 권한 칸 map 을 바꾼다.

```tsx
                  {columns.map((key) => <td key={key} className={bodyCell} style={{ width: COLUMN_W, minWidth: COLUMN_W }}>
                    <LevelCell permissionKey={key} value={member.access[key]} disabled={busy} owner={nameOf(member)} onChange={(level) => setCell(member, key, level)} />
                  </td>)}
```

파일 안에 `COLUMN_KEYS` 가 남아 있으면 `tsc` 가 잡는다. 전부 `columns` 또는 `ALL_COLUMN_KEYS` 로 바뀌었는지 확인해라.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/components/settings/UserApprovalPanel.tsx` | A~G |

다른 파일은 열지 않는다.

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. 화면 확인은 사용자가 한다.
