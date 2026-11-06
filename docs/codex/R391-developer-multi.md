# R391 — 개발 담당에 두 명 이상 적는다

상태: **미착수.** 2026-11-06 박향근 확정.

## 무엇을 하는가

DEVELOPMENT REQUEST 의뢰 밴드의 **`개발 담당`(`developer`) 한 칸만** 바꾼다.

- 드롭다운을 **수기 입력**으로 바꾼다. 목록에 없는 이름도 받는다.
- 팀원 이름을 **자동완성으로 제안만** 한다(`datalist`). 고르도록 강제하지 않는다.
- 여러 명은 **슬래시(`/`)**로 구분한다. 예: `김지현/변재휘`
- 가이드는 입력칸 안내 문구(placeholder) 한 줄이다.

2026 OCT EU MARKET 차트에서 한 스타일을 두 사람이 나눠 가진 건이 34건 중 6건이었다. 지금은 한 명만 들어간다.

## 하지 말 것

- **`분석 담당`(`analyst`)은 건드리지 마라.** 드롭다운 그대로다.
- 구분자를 강제하는 검사를 넣지 마라. 못 맞춘 값을 거부하면 붙여넣기가 조용히 비게 된다. 다듬기만 한다.
- `commitCell`(1680행)은 **호출처가 없는 죽은 코드다. 손대지 마라.**
- 열 `id`와 필드명을 바꾸지 마라.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라.

---

## 파일별 조치

### 1. `src/routes/FabricRequest.tsx`

#### 1-1. 이름 다듬기 함수 (212행 `newId` 근처)

`const newId = ...` **바로 위**에 더한다.

```ts
/**
 * 개발 담당은 여러 명을 `/`로 적는다(R391). 저장할 때 조각마다 앞뒤 공백을 떼고 빈 조각을 버린다.
 * 검사해서 거부하지는 않는다. 거부하면 붙여넣기가 조용히 비어 원인을 못 찾는다.
 */
const splitMembers = (value: string): string[] => value.split("/").map((name) => name.trim()).filter(Boolean)
const normalizeMembers = (value: string): string => splitMembers(value).join("/")
```

#### 1-2. 신규 의뢰 창 (477~488행, 537행)

`memberSelect`는 이제 분석 담당만 쓴다. 타입을 좁힌다.

```ts
  const memberSelect = (label: string, key: "analyst") =>
```

537행의 `{memberSelect("개발 담당", "developer")}`를 지우고 그 자리에 아래를 넣는다. **538행 `{memberSelect("분석 담당", "analyst")}`는 그대로 둔다.**

```tsx
            {field("개발 담당", (
              <>
                <Input
                  className="h-8 text-xs"
                  list="request-developer-suggest"
                  placeholder="여러 명이면 / 로 구분"
                  value={value.developer}
                  onChange={(event) => set("developer", event.target.value)}
                />
                <datalist id="request-developer-suggest">{ownerOptions.map((name) => <option key={name} value={name} />)}</datalist>
              </>
            ))}
```

#### 1-3. `EditKind`에 `suggest`를 더한다 (634행)

```ts
type EditKind = "text" | "area" | "number" | "member" | "suggest" | "construction" | "company" | "result" | "toggle" | null
```

#### 1-4. `editKindOf` (660행)

지금 코드:

```ts
    case "analyst": case "developer":
      return "member"
```

이렇게 가른다:

```ts
    case "analyst":
      return "member"
    case "developer":
      return "suggest"
```

#### 1-5. `CellEditor` 마지막 입력칸 (파일 안 `return ( <input {...shared} ...` 자리)

지금 코드:

```tsx
  return (
    <input
      {...shared}
      type={kind === "number" ? "number" : "text"}
      onChange={(event) => setValue(event.target.value)}
      className="h-7 w-full rounded-none border border-[var(--primary)] bg-[var(--card)] px-1 text-xs outline-none"
    />
  )
```

이렇게 바꾼다. `suggest`일 때만 제안 목록과 안내 문구를 단다.

```tsx
  return (
    <>
      <input
        {...shared}
        type={kind === "number" ? "number" : "text"}
        list={kind === "suggest" ? "request-cell-suggest" : undefined}
        placeholder={kind === "suggest" ? "여러 명이면 / 로 구분" : undefined}
        onChange={(event) => setValue(event.target.value)}
        className="h-7 w-full rounded-none border border-[var(--primary)] bg-[var(--card)] px-1 text-xs outline-none"
      />
      {kind === "suggest" ? <datalist id="request-cell-suggest">{members.map((name) => <option key={name} value={name} />)}</datalist> : null}
    </>
  )
```

`members`는 이미 `CellEditorProps`로 들어오고 있다(호출처가 `members={ownerOptions}`를 넘긴다). **새 prop을 만들지 마라.**

#### 1-6. 저장할 때 다듬기 — `updateCell`의 스타일 분기

지금 코드(`origWeight` 가드 바로 아래, `nextStyle = { ...current, [column.id]: value, ... }` 바로 위):

```ts
      if (column.id === "origWeight") { const trimmed = raw.trim(); value = trimmed === "" ? "" : Number(trimmed); if (value !== "" && !Number.isFinite(value)) return { next: list, skipped: "number" } }
      nextStyle = { ...current, [column.id]: value, updatedAt: new Date().toISOString() }
```

사이에 한 줄을 끼운다.

```ts
      if (column.id === "origWeight") { const trimmed = raw.trim(); value = trimmed === "" ? "" : Number(trimmed); if (value !== "" && !Number.isFinite(value)) return { next: list, skipped: "number" } }
      if (column.id === "developer") value = normalizeMembers(raw)
      nextStyle = { ...current, [column.id]: value, updatedAt: new Date().toISOString() }
```

#### 1-7. `ownerOptions`가 `/`를 쪼개야 한다 (934~937행)

**이것을 빠뜨리면 `김지현/변재휘`가 통째로 분석 담당 드롭다운과 자동완성 목록에 뜬다.**

지금 코드:

```ts
  const ownerOptions = useMemo(() => {
    const fromData = requests.flatMap((item) => [item.analyst, item.developer]).filter(Boolean)
    return [...new Set([...MEMBERS.map((member) => member.name), ...fromData])]
  }, [requests])
```

이렇게 바꾼다:

```ts
  const ownerOptions = useMemo(() => {
    // 개발 담당은 `/`로 여러 명이 들어 있다(R391). 쪼개서 모으지 않으면 합쳐진 글자가 목록에 뜬다.
    const fromData = requests.flatMap((item) => [item.analyst, ...splitMembers(item.developer)]).filter(Boolean)
    return [...new Set([...MEMBERS.map((member) => member.name), ...fromData])]
  }, [requests])
```

### 2. `src/data/request-template.ts`

「작성 안내」 시트 `lines` 배열 마지막 줄 뒤에 한 줄을 더한다.

```ts
    "11. 개발 담당이 여러 명이면 / 로 구분해 적습니다. 예: 김지현/변재휘",
```

---

## 검증

```
npm run build
```

`tsc --noEmit`을 포함한다. 한 번만 돌린다.

끝난 뒤 `git status --short`로 위 두 파일만 **새로** 바뀌었는지 본다. 이 저장소에는 이미 커밋 안 한 변경이 여럿 있으니 되돌리지 마라.

## 보고

수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적는다. 바꾼 코드를 다시 붙이지 마라.
