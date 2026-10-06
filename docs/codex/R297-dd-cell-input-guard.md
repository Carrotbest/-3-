# R297 — DD MASTER 날짜·FL# 타자 차단, Color 자리표시자 금지, 거부 안내

상태: 미착수. 설계 확정(2026-10-06 박향근). R296(경고 규칙) 다음이다.

날짜 칸과 FL# 칸에 형식 아닌 값이 들어가 집계가 어긋난다. 글자 단위로 막고, 거부되면 왜 거부됐는지 보여 준다. Color 칸은 자유 입력을 유지하되 `TBD` 같은 자리표시자만 막는다.

## 지금 상태

- 그리드 편집, 붙여넣기, 아래로 채우기는 `isAcceptableCellValue`(681행)가 이미 막고 있다. 그리드는 `commitCell`(2790행)에서 토스트로 알린다.
- **64열 수정 모달(`EditorField`, 857행)과 접수 옵션 그리드(`IntakeCell`, 490행)는 거부 메시지가 없다.** `set` 이 글자마다 `updateRecordCell` 을 부르고, 그 안에서 형식 검사가 미완성 값을 거부한다. 거부되면 레코드가 그대로 돌아오니 화면 값도 그대로다.
- **그 결과 두 화면에서는 날짜와 FL#을 손으로 칠 수 없다.** `DateInput`(833행)의 동기화 effect 가 `value !== normalizeDateInput(raw)` 로 매 렌더 되맞추기 때문에, 부모가 `"2026-1"` 을 거부하는 순간 방금 친 글자가 지워진다. 달력 아이콘으로만 날짜가 들어간다. FL#은 `FL` + 숫자 8자리가 완성되기 전까지 전부 거부라 한 글자도 안 찍힌다.

이 지시서는 그 세 가지를 한 번에 고친다. 치는 동안에는 막지 않고, 칸을 떠날 때 한 번 검사한다. 허용 글자가 아닌 입력은 애초에 안 찍힌다.

## 틀렸던 접근, 다시 하지 말 것

- **글자마다 부모 상태에 쓰면 안 된다.** 지금 구조가 그래서 미완성 입력이 불가능하다. 편집기가 자기 지역 상태를 들고 있어야 한다.
- **`isAcceptableCellValue` 를 느슨하게 풀어서 미완성 값을 통과시키지 말 것.** 그러면 `FL2610` 같은 반쪽 값이 저장되고 RDDA 집계가 깨진다. 검사는 그대로 두고 입력기를 고친다.
- `DateInput` 의 effect 를 `[value]` 하나만 보게 바꾸되, **`raw` 를 의존성에서 빼는 것으로 끝내지 마라.** 저장값이 외부에서 바뀌었을 때는 다시 맞춰야 한다. 아래 코드대로 `useRef` 로 직전 `value` 를 기억한다.

## 하지 말 것

- `src/data/dd-workflow.ts`, `src/data/derive.ts`, `src/data/format.ts` 를 건드리지 마라. `isDateValue`, `normalizeDateInput`, `isCompletedFlNo` 는 그대로 쓴다.
- `updateRecordCell` 의 `switch` 와 `TECH_PATHS` 를 건드리지 마라.
- 붙여넣기·채우기 쪽 `notify` 문구(2496행, 2548행 근처 "형식이 맞지 않는 N칸은 건너뛰었습니다")는 그대로 둔다.
- `DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라. tailwind-merge 가 기본 `fixed` 를 지워 팝업이 문서 흐름으로 떨어진다.
- ref 콜백 안에서 setState 하지 마라. 무한 렌더로 화면이 백지가 된다.
- 새 동기화 키나 새 뷰 설정 키를 만들지 마라.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/routes/DevelopmentMasterSheet.tsx` | 전량. 아래 7개 항목 |

다른 파일은 열지 않는다.

## 1. 상수와 헬퍼 추가

`allowedFor`(670행) 바로 아래, `isAcceptableCellValue` 위에 넣는다.

```ts
/** Color 칸에 넣으면 안 되는 자리표시자. 칸이 채워져 있으면 빈칸과 구분이 안 돼 지적을 못 한다(2026-10-06 박향근 확정). */
const COLOR_PLACEHOLDERS = new Set(["TBD", "TBA", "미정", "확인중", "N/A", "NA", "-", "?"])
/** 마침표와 공백을 걷고 대문자로 맞춰 본다. `T.B.D`, `tba`, `n/a` 가 모두 걸린다. */
const isColorPlaceholder = (raw: string): boolean => COLOR_PLACEHOLDERS.has(raw.replace(/[.\s]/g, "").toUpperCase())

/** 날짜 칸 타자 제한. 숫자와 구분자만 남긴다. "확인중", "미정" 같은 메모가 애초에 안 찍힌다. */
const sanitizeDateTyping = (raw: string): string => raw.replace(/[^0-9/-]/g, "")
/** FL# 칸 타자 제한. F, L, 숫자만 받고 10자에서 멈춘다. 소문자는 대문자로 바꾼다. */
const sanitizeFlTyping = (raw: string): string => raw.toUpperCase().replace(/[^FL0-9]/g, "").slice(0, 10)

const DATE_TYPING_HINT = "날짜만 받습니다. 2026-10-06, 10/06, 1006 형식으로 적어 주세요. 메모는 Remark 칸에 적습니다."
const FL_TYPING_HINT = "FL 과 숫자 8자리만 넣을 수 있습니다. 미등록 사유는 Style History 칸에 적어 주세요."
const COLOR_TYPING_HINT = "Color 는 비워 두세요. TBD, TBA, 미정 같은 자리표시자는 빈칸과 구분이 안 됩니다."
```

`isAcceptableCellValue` 함수가 끝나는 `}` 바로 아래에 넣는다.

```ts
/** 이 값이 왜 거부되는가. 그리드 토스트와 모달·접수 그리드의 안내가 같은 문구를 쓴다. */
function cellRejectMessage(column: MasterColumn, raw: string): string {
  if (column.id === "flNo") return FL_TYPING_HINT
  if (column.id === "color") return COLOR_TYPING_HINT
  if (column.date) return `${column.label} 열은 ${DATE_TYPING_HINT}`
  return `${column.label} 열에 넣을 수 없는 값입니다: ${raw.trim()}`
}
```

## 2. `isAcceptableCellValue` — Color 규칙 한 줄

684행이 다음이다.

```ts
  if (column.id === "flNo") return isCompletedFlNo(value)
```

그 바로 아래에 한 줄을 끼운다. 다른 줄은 손대지 않는다.

```ts
  if (column.id === "color") return !isColorPlaceholder(value)
```

함수 머리말 주석(673~680행)에 한 줄을 더한다.

```
 * `color` 는 자유 입력이지만 `TBD`·`TBA` 같은 자리표시자만 막는다. 빈칸으로 보여야 지적을 할 수 있다.
```

## 3. `DateInput` — 동기화 effect 교체, 타자 제한, 안내

833행부터 `const change = ...` 블록까지, 다음 현재 코드를 찾는다.

```ts
function DateInput({ value, disabled, invalid, onChange, compact = false }: { value: string; disabled?: boolean; invalid?: boolean; onChange: (raw: string) => void; compact?: boolean }) {
  // 저장된 YYYY-MM-DD를 그대로 초기화해야 과거 연도가 Enter만으로 올해로 바뀌지 않는다.
  const [raw, setRaw] = useState(value)
  useEffect(() => {
    if (value !== normalizeDateInput(raw)) setRaw(value)
  }, [value, raw])
  const change = (next: string) => {
    setRaw(next)
    onChange(next)
  }
```

다음으로 교체한다.

```ts
function DateInput({ value, disabled, invalid, onChange, compact = false }: { value: string; disabled?: boolean; invalid?: boolean; onChange: (raw: string) => void; compact?: boolean }) {
  // 저장된 YYYY-MM-DD를 그대로 초기화해야 과거 연도가 Enter만으로 올해로 바뀌지 않는다.
  const [raw, setRaw] = useState(value)
  const [blocked, setBlocked] = useState(false)
  /**
   * **치는 동안의 중간 입력을 되돌리지 말 것.** 예전에는 `value !== normalizeDateInput(raw)` 로
   * 매 렌더 되맞췄다. 부모가 미완성 값(`2026-1`)을 형식 검사로 거부하면 `value` 는 그대로이고
   * 이 effect 가 방금 친 글자를 즉시 지웠다. 그래서 수정 모달과 접수 그리드에서는 날짜를
   * 손으로 칠 수 없고 달력 아이콘으로만 넣을 수 있었다. 저장값이 실제로 바뀐 경우에만 다시 맞춘다.
   */
  const seen = useRef(value)
  useEffect(() => {
    if (value === seen.current) return
    seen.current = value
    setRaw(value)
  }, [value])
  const change = (next: string) => {
    const clean = sanitizeDateTyping(next)
    // 숫자와 구분자가 아닌 글자를 쳤다는 뜻이다. 안내를 띄우고 그 글자는 버린다.
    setBlocked(clean !== next)
    setRaw(clean)
    onChange(clean)
  }
  /** 미완성으로 두고 칸을 떠나면 저장값으로 되돌린다. 화면 글자와 저장값이 어긋나지 않게 한다. */
  const settle = () => {
    setBlocked(false)
    if (normalizeDateInput(raw) !== value) setRaw(value)
  }
```

`useRef` 가 이 파일에 이미 import 돼 있다. 없으면 추가한다.

이어서 compact 분기(현재 `if (compact) return <div className={...}>` 한 덩어리)를 다음으로 교체한다. 행 높이 32px 안에 안내가 안 들어가므로 `InlineDateEditor` 와 같은 방식으로 아래에 띄운다.

```tsx
  // 접수 옵션 그리드용 압축형. 행 높이 32px 안에 들어가야 해서 미리보기 줄을 뺀다.
  if (compact) return <div className="relative min-w-0">
    <div className={`flex h-7 min-w-0 items-stretch rounded border border-[var(--border)] bg-[var(--background)] focus-within:ring-2 focus-within:ring-[var(--ring)] ${invalid || blocked ? "ring-1 ring-[var(--destructive)]" : ""}`}>
      <input type="text" value={raw} disabled={disabled} onChange={(event) => change(event.target.value)} onBlur={settle} className="min-w-0 flex-1 bg-transparent px-1.5 text-xs text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-40" />
      <DatePickerPopover value={raw} disabled={disabled} invalid={invalid} onChange={change} iconOnly triggerClassName="h-full w-6 shrink-0 justify-center border-l border-[var(--border)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]" />
    </div>
    {blocked ? <span className="absolute left-0 top-[calc(100%+2px)] z-[65] max-w-[280px] rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] leading-tight text-[var(--destructive)] shadow-sm">{DATE_TYPING_HINT}</span> : null}
  </div>
```

마지막으로 비압축 분기의 입력칸과 미리보기 줄을 바꾼다. 현재 두 줄이다.

```tsx
      <input type="text" value={raw} disabled={disabled} aria-invalid={invalid} onChange={(event) => change(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-40" />
```

```tsx
    <DateValuePreview raw={raw} />
```

각각 다음으로 바꾼다.

```tsx
      <input type="text" value={raw} disabled={disabled} aria-invalid={invalid || blocked} onChange={(event) => change(event.target.value)} onBlur={settle} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-40" />
```

```tsx
    {blocked ? <span className="text-[10px] leading-tight text-[var(--destructive)]">{DATE_TYPING_HINT}</span> : <DateValuePreview raw={raw} />}
```

비압축 분기를 감싼 `<div className={...focus-within...}>` 의 `invalid ? ...` 조건도 `invalid || blocked ? ...` 로 바꾼다.

## 4. `InlineDateEditor` — 타자 제한, 안내

`const [raw, setRaw] = useState(initialValue)` 아래에 한 줄을 더한다.

```ts
  const [blocked, setBlocked] = useState(false)
```

입력칸의 `onChange` 를 바꾼다. 현재는 다음이다.

```tsx
onChange={(event) => setRaw(event.target.value)}
```

다음으로 바꾼다.

```tsx
onChange={(event) => { const clean = sanitizeDateTyping(event.target.value); setBlocked(clean !== event.target.value); setRaw(clean) }}
```

마지막 줄 `<DateValuePreview raw={raw} className="absolute left-1 top-[calc(100%+2px)] z-[65] whitespace-nowrap rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 shadow-sm" />` 를 다음으로 바꾼다.

```tsx
    {blocked
      ? <span className="absolute left-1 top-[calc(100%+2px)] z-[65] max-w-[280px] rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] leading-tight text-[var(--destructive)] shadow-sm">{DATE_TYPING_HINT}</span>
      : <DateValuePreview raw={raw} className="absolute left-1 top-[calc(100%+2px)] z-[65] whitespace-nowrap rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 shadow-sm" />}
```

`onKeyDown={editorKeyHandler(onCommit, onCancel)}` 과 `onBlur` 는 그대로 둔다. 손대면 선택이 두 칸씩 건너뛴다.

## 5. `InlineFlNoEditor` 신규, `InlineEditor` 에 연결

`InlineDateEditor` 함수가 끝난 바로 아래에 넣는다.

```tsx
/**
 * FL# 인라인 편집기. 타자는 F, L, 숫자만 받고 10자에서 멈춘다.
 * 치는 동안에는 지역 상태만 들고 있고, 저장은 `commitCell` 이 형식을 보고 결정한다.
 * 글자마다 부모에 쓰면 `FL2610` 같은 미완성 값이 거부돼 한 글자도 안 찍힌다.
 */
function InlineFlNoEditor({ initialValue, onCommit, onCancel }: { initialValue: string; onCommit: (raw: string, move?: CellMove, fillRange?: boolean) => void; onCancel: () => void }) {
  const [raw, setRaw] = useState(() => sanitizeFlTyping(initialValue))
  const incomplete = Boolean(raw.trim()) && !isCompletedFlNo(raw)
  return <div className="relative flex h-8 min-w-0 bg-[var(--card)] ring-2 ring-inset ring-[var(--ring)]">
    <input autoFocus type="text" value={raw} onChange={(event) => setRaw(sanitizeFlTyping(event.target.value))} onBlur={(event) => onCommit(event.currentTarget.value)} onKeyDown={editorKeyHandler(onCommit, onCancel)} className="h-8 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1.5 font-mono text-xs text-[var(--foreground)] outline-none" />
    {incomplete ? <span className="absolute left-1 top-[calc(100%+2px)] z-[65] max-w-[280px] rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] leading-tight text-[var(--destructive)] shadow-sm">{FL_TYPING_HINT}</span> : null}
  </div>
}
```

`InlineEditor` 안에서 날짜 분기 다음 줄에 연결한다. 현재는 다음이다.

```tsx
  if (column.date) return <InlineDateEditor initialValue={initialValue} onCommit={onCommit} onCancel={onCancel} />
```

그 바로 아래에 한 줄을 끼운다. `if (initial !== undefined)` 분기보다 **위**여야 한다. 아니면 한 글자 치고 들어간 경우에 일반 입력칸이 뜬다.

```tsx
  if (column.id === "flNo") return <InlineFlNoEditor initialValue={initialValue} onCommit={onCommit} onCancel={onCancel} />
```

## 6. `GuardedTextInput` 신규 — 모달과 접수 그리드의 FL#, Color

`DateInput` 함수가 끝난 바로 아래, `EditorField` 위에 넣는다.

```tsx
/**
 * 형식이 정해진 글자 칸(FL#·Color)의 입력기. 수정 모달과 접수 옵션 그리드가 함께 쓴다.
 * **치는 동안에는 부모에 쓰지 않는다.** 예전에는 글자마다 `updateRecordCell` 을 불러
 * 미완성 값이 형식 검사에 거부되면서 방금 친 글자가 그대로 사라졌다. 이유도 안 보였다.
 * 칸을 떠날 때 한 번 저장하고, 거부되면 저장값으로 되돌리고 안내를 띄운다.
 */
function GuardedTextInput({ column, value, disabled, className, floatingHint = false, onCommit }: { column: MasterColumn; value: string; disabled?: boolean; className?: string; floatingHint?: boolean; onCommit: (raw: string) => void }) {
  const [raw, setRaw] = useState(value)
  const [hint, setHint] = useState<string | null>(null)
  // 저장값이 외부에서 바뀐 경우에만 다시 맞춘다. DateInput 과 같은 규칙이다.
  const seen = useRef(value)
  useEffect(() => {
    if (value === seen.current) return
    seen.current = value
    setRaw(value)
    setHint(null)
  }, [value])
  const settle = () => {
    const next = raw.trim()
    if (next === value.trim()) { setHint(null); setRaw(value); return }
    if (!isAcceptableCellValue(column, next)) { setHint(cellRejectMessage(column, next)); setRaw(value); return }
    setHint(null)
    onCommit(next)
  }
  return <div className={`grid min-w-0 gap-1 ${floatingHint ? "relative" : ""}`}>
    <Input type="text" value={raw} disabled={disabled} aria-invalid={Boolean(hint)}
      onChange={(event) => { setHint(null); setRaw(column.id === "flNo" ? sanitizeFlTyping(event.target.value) : event.target.value) }}
      onBlur={settle}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() } }}
      className={className} />
    {hint ? <span className={floatingHint
      ? "absolute left-0 top-[calc(100%+2px)] z-[65] max-w-[280px] rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] leading-tight text-[var(--destructive)] shadow-sm"
      : "text-[10px] leading-tight text-[var(--destructive)]"}>{hint}</span> : null}
  </div>
}
```

`Input` 은 `h-9 px-3 text-sm` 을 기본으로 가지고 `cn`(tailwind-merge)으로 `className` 을 합친다. 호출부가 `h-7 px-1.5 text-xs` 를 주면 그대로 덮인다.

## 7. `EditorField` 와 `IntakeCell` 에 연결

`EditorField` 의 마지막 `return` 바로 **위**에 한 줄을 끼운다. 마지막 return 은 다음이다.

```tsx
  return <div className="grid min-w-0 gap-1">{label}<Input type={column.number ? "number" : "text"} value={value} disabled={disabled} aria-invalid={invalid} onChange={(event) => set(event.target.value)} className={`text-sm ${disabled ? "bg-[var(--muted)]" : ""} ${invalidClass}`} /></div>
```

끼울 줄.

```tsx
  if (column.id === "flNo" || column.id === "color") return <div className="grid min-w-0 gap-1">{label}<GuardedTextInput column={column} value={value} disabled={disabled} onCommit={set} className={`text-sm ${disabled ? "bg-[var(--muted)]" : ""} ${column.mono ? "font-mono" : ""} ${invalidClass}`} /></div>
```

`IntakeCell` 의 마지막 `return` 바로 **위**에도 한 줄을 끼운다. 마지막 return 은 다음이다.

```tsx
  return <input type={column.number ? "number" : "text"} value={value} disabled={disabled} onChange={(event) => set(event.target.value)} className={box} />
```

끼울 줄.

```tsx
  if (column.id === "flNo" || column.id === "color") return <GuardedTextInput column={column} value={value} disabled={disabled} className={box} floatingHint onCommit={set} />
```

## 8. `commitCell` 토스트 문구 통일

2790행 근처의 현재 코드다.

```ts
    if (!isAcceptableCellValue(column, raw, allowedFor(column, optionsById))) {
      notify(column.id === "flNo"
        ? "FL#는 FL과 숫자 8자리만 넣을 수 있습니다. DROP은 Status 칸, 메모는 비고 칸에 적어 주세요."
        : `${column.label} 열에 넣을 수 없는 값입니다: ${raw.trim()}`)
```

다음으로 교체한다. 아래 두 줄(`if (move) moveSelection(...)`, `return`)과 닫는 `}` 는 그대로 둔다.

```ts
    if (!isAcceptableCellValue(column, raw, allowedFor(column, optionsById))) {
      notify(cellRejectMessage(column, raw))
```

## 성공 기준

- `npm run build` 가 통과한다.
- `grep -n "value !== normalizeDateInput(raw)" src/routes/DevelopmentMasterSheet.tsx` 결과가 0건이다.
- `grep -c "sanitizeDateTyping" src/routes/DevelopmentMasterSheet.tsx` 결과가 4 이상이다(정의 1, `DateInput` 1, `InlineDateEditor` 1).
- `grep -n "InlineFlNoEditor\|GuardedTextInput\|cellRejectMessage\|isColorPlaceholder" src/routes/DevelopmentMasterSheet.tsx` 가 각각 정의와 사용 모두 나온다.
- `git status --short` 에 `src/routes/DevelopmentMasterSheet.tsx` 만 M 으로 나온다.

## 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset 이나 git checkout 으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라. 실패하면 고치고 다시 돌려라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- `legacy/`, `legacy-vanilla/`, `backup/` 을 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
