# R367 — TS 목록 기간 필터

상태: **미착수.** 설계 확정, 시공 전.

TROUBLE SHOOTING(`/ts`) 화면의 TS 목록에 접수일 기준 기간 필터를 더한다. 연도 버튼, 최근 N개월 버튼, 직접 날짜 지정 셋을 한 줄에 둔다. 기간은 목록과 엑셀 내보내기 둘 다에 걸린다.

2026-10-29 박향근 확정 사항이다.
- 기간 구분은 **연도별 + 최근 개월 + 특정일 직접 지정** 셋 다 둔다.
- 적용 범위는 **목록과 엑셀 둘 다**. 상단 상태 카드와 추이 차트는 전체 기준을 유지한다.

## 고치는 파일

| 파일 | 조치 |
|---|---|
| `src/routes/TS.tsx` | 기간 타입·헬퍼 추가, 상태 3개 추가, `filteredRows` 게이트 추가, `exportTechnicalServices` 시그니처 변경, 툴바에 기간 줄 추가 |

다른 파일은 건드리지 않는다. 새 파일도 만들지 않는다.

---

## 1. 기간 타입과 헬퍼

`src/routes/TS.tsx` 29행 `const TS_STATES: TsState[] = ["처리중", "완료"]` **바로 아래**에 넣는다.

```ts
// 기간 프리셋 id. 연도는 "y2026" 꼴로 데이터에서 만들어 붙인다.
const PERIOD_ALL = "all"
const MONTH_PRESETS = [
  { id: "m1", label: "최근 1개월", months: 1 },
  { id: "m3", label: "최근 3개월", months: 3 },
  { id: "m6", label: "최근 6개월", months: 6 },
] as const

/** 날짜를 YYYYMMDD 정수로 만든다. 시간대 경계 문제를 피하려고 시각을 쓰지 않는다. */
function dayKeyOf(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

/** input[type=date] 값(YYYY-MM-DD)을 dayKey로. 형식이 아니면 null. */
function dayKeyOfInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return Number(value.replace(/-/g, ""))
}

/**
 * 지금 걸린 기간을 dayKey 구간으로 돌려준다. 거를 필요가 없으면 null.
 * 직접 지정(from·to) 중 하나라도 값이 있으면 그쪽이 프리셋을 이긴다.
 */
function tsPeriodRange(preset: string, from: string, to: string): { start: number; end: number } | null {
  const fromKey = dayKeyOfInput(from)
  const toKey = dayKeyOfInput(to)
  if (from.trim() || to.trim()) {
    if (fromKey === null && toKey === null) return null
    return { start: fromKey ?? 0, end: toKey ?? 99999999 }
  }
  if (preset === PERIOD_ALL) return null
  const month = MONTH_PRESETS.find((item) => item.id === preset)
  if (month) {
    const today = new Date()
    // new Date(y, m - N, d)는 월말 넘침을 자동 보정한다(5/31의 3개월 전은 3/3).
    const start = new Date(today.getFullYear(), today.getMonth() - month.months, today.getDate())
    return { start: dayKeyOf(start), end: dayKeyOf(today) }
  }
  const year = Number(preset.replace(/^y/, ""))
  if (!Number.isFinite(year) || year <= 0) return null
  return { start: year * 10000 + 101, end: year * 10000 + 1231 }
}

/** 엑셀 파일명에 붙일 기간 조각. 한글과 공백을 쓰지 않는다. */
function tsPeriodSlug(preset: string, from: string, to: string): string {
  const fromKey = dayKeyOfInput(from)
  const toKey = dayKeyOfInput(to)
  if (from.trim() || to.trim()) {
    if (fromKey !== null && toKey !== null) return `${fromKey}-${toKey}`
    if (fromKey !== null) return `FROM${fromKey}`
    if (toKey !== null) return `TO${toKey}`
    return "ALL"
  }
  if (preset === PERIOD_ALL) return "ALL"
  const month = MONTH_PRESETS.find((item) => item.id === preset)
  if (month) return `M${month.months}`
  const year = Number(preset.replace(/^y/, ""))
  return Number.isFinite(year) && year > 0 ? `Y${year}` : "ALL"
}
```

**왜 `dayKey` 정수인가.** `toDate("2026-08-20")`은 UTC 자정으로 파싱된다. `Date` 객체끼리 `getTime()`으로 비교하면 경계일이 시간대에 따라 들어갔다 빠졌다 한다. 연·월·일만 뽑아 정수로 비교하면 그 문제가 없다. `toDate`는 그대로 쓴다. 정렬이 쓰는 해석과 같아야 한다.

---

## 2. 엑셀 내보내기 시그니처

### 2-1. `exportTechnicalServices` (197행)

현재:

```ts
function exportTechnicalServices(rows: readonly TsRecord[]): string {
```

이렇게 바꾼다:

```ts
function exportTechnicalServices(rows: readonly TsRecord[], periodSlug: string): string {
```

### 2-2. 파일명 (223행)

현재:

```ts
  const fileName = `Technical_Services_export_${localDate().replace(/-/g, "")}.xlsx`
```

이렇게 바꾼다:

```ts
  const fileName = `Technical_Services_export_${periodSlug}_${localDate().replace(/-/g, "")}.xlsx`
```

함수 본문의 나머지(컬럼 매핑, 시트 생성)는 손대지 않는다.

---

## 3. 상태 추가

`const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null)`(426행) **바로 아래**에 넣는다.

```ts
  // 기간 필터. 프리셋과 직접 지정을 따로 들고, 직접 지정에 값이 있으면 그쪽이 이긴다.
  // 되맞추는 useEffect를 두지 않는다(R297).
  const [period, setPeriod] = useState<string>(PERIOD_ALL)
  const [periodFrom, setPeriodFrom] = useState("")
  const [periodTo, setPeriodTo] = useState("")
```

그 아래, `counts` useMemo(428행) **앞**에 연도 목록을 넣는다.

```ts
  // 데이터에 실제로 있는 연도만 버튼으로 세운다. 최신 연도가 왼쪽이다.
  const yearOptions = useMemo(() => {
    const set = new Set<number>()
    rows.forEach((row) => {
      const date = toDate(row.receivedAt)
      if (date) set.add(date.getFullYear())
    })
    return [...set].sort((left, right) => right - left)
  }, [rows])
  const periodCustom = Boolean(periodFrom.trim() || periodTo.trim())
```

---

## 4. `filteredRows` 게이트

433~448행이 현재 이렇다.

```ts
  const filteredRows = useMemo(() => {
    const query = search.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    const matched = rows.filter((row) => {
      if (activeState && row.state !== activeState) return false
      if (!query) return true
      return [row.subject, row.from, tsRequester(row).dept, row.advisor, row.inquiry]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query))
    })
    // 최근 접수일이 맨 위다. 세 탭이 이 배열 하나를 쓴다(R366).
    return matched.sort((left, right) => {
      const gap = tsReceivedTime(right) - tsReceivedTime(left)
      if (gap !== 0) return gap
      // 같은 날이면 번호가 큰 쪽이 위다.
      return right.id.localeCompare(left.id, "en")
    })
  }, [activeState, rows, search])
```

이렇게 바꾼다. **정렬부는 한 글자도 건드리지 않는다.**

```ts
  const filteredRows = useMemo(() => {
    const query = search.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    const range = tsPeriodRange(period, periodFrom, periodTo)
    const matched = rows.filter((row) => {
      if (range) {
        const date = toDate(row.receivedAt)
        // 접수일을 못 읽는 행은 어느 기간에도 속하지 않는다. 기간을 걸면 빠진다.
        if (!date) return false
        const key = dayKeyOf(date)
        if (key < range.start || key > range.end) return false
      }
      if (activeState && row.state !== activeState) return false
      if (!query) return true
      return [row.subject, row.from, tsRequester(row).dept, row.advisor, row.inquiry]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query))
    })
    // 최근 접수일이 맨 위다. 세 탭이 이 배열 하나를 쓴다(R366).
    return matched.sort((left, right) => {
      const gap = tsReceivedTime(right) - tsReceivedTime(left)
      if (gap !== 0) return gap
      // 같은 날이면 번호가 큰 쪽이 위다.
      return right.id.localeCompare(left.id, "en")
    })
  }, [activeState, period, periodFrom, periodTo, rows, search])
```

의존성 배열에 `period`, `periodFrom`, `periodTo` 셋을 더한 것을 빠뜨리지 마라.

---

## 5. 엑셀 호출부

541~552행 `const exportRows = () => {` 안의 한 줄이다.

현재:

```ts
      const fileName = exportTechnicalServices(rows)
```

이렇게 바꾼다:

```ts
      const fileName = exportTechnicalServices(filteredRows, tsPeriodSlug(period, periodFrom, periodTo))
```

**`filteredRows`로 바꾼다.** 기간뿐 아니라 상태 탭과 검색어까지 지금 화면에 보이는 그대로 나간다. 박향근이 2026-10-29에 그렇게 정했다.

604행 버튼의 `disabled`도 바꾼다.

현재:

```tsx
            <Button type="button" disabled={exporting || rows.length === 0} onClick={exportRows}>
```

이렇게:

```tsx
            <Button type="button" disabled={exporting || filteredRows.length === 0} onClick={exportRows}>
```

---

## 6. 툴바에 기간 줄

705~715행이 현재 이렇다.

```tsx
          toolbar={(
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={activeState ?? ALL} onValueChange={(value) => setActiveState(value === ALL ? null : value as TsState)}>
                <TabsList aria-label="TS 상태 필터">
                  {[ALL, ...TS_STATES].map((state) => <TabsTrigger key={state} value={state}>{state}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <Input className="lg:max-w-sm" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Subject · 요청자 · 담당 · 의뢰 내용 검색" aria-label="TS 목록 검색" />
            </div>
          )}
```

이렇게 바꾼다. 기존 줄은 그대로 두고 바깥에 세로 묶음을 씌운 뒤 두 번째 줄을 더하는 것이다.

```tsx
          toolbar={(
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Tabs value={activeState ?? ALL} onValueChange={(value) => setActiveState(value === ALL ? null : value as TsState)}>
                  <TabsList aria-label="TS 상태 필터">
                    {[ALL, ...TS_STATES].map((state) => <TabsTrigger key={state} value={state}>{state}</TabsTrigger>)}
                  </TabsList>
                </Tabs>
                <Input className="lg:max-w-sm" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Subject · 요청자 · 담당 · 의뢰 내용 검색" aria-label="TS 목록 검색" />
              </div>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="TS 기간 필터">
                <span className="text-xs font-semibold text-[var(--muted-foreground)]">기간</span>
                {[{ id: PERIOD_ALL, label: ALL }, ...MONTH_PRESETS.map((item) => ({ id: item.id as string, label: item.label as string })), ...yearOptions.map((year) => ({ id: `y${year}`, label: String(year) }))].map((option) => {
                  const active = !periodCustom && period === option.id
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      onClick={() => { setPeriod(option.id); setPeriodFrom(""); setPeriodTo("") }}
                    >{option.label}</Button>
                  )
                })}
                <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border)]" />
                <Input
                  className="h-8 w-[9.5rem] text-xs"
                  type="date"
                  value={periodFrom}
                  max={periodTo || undefined}
                  onChange={(event) => setPeriodFrom(event.target.value)}
                  aria-label="기간 시작일"
                />
                <span aria-hidden="true" className="text-xs text-[var(--muted-foreground)]">~</span>
                <Input
                  className="h-8 w-[9.5rem] text-xs"
                  type="date"
                  value={periodTo}
                  min={periodFrom || undefined}
                  onChange={(event) => setPeriodTo(event.target.value)}
                  aria-label="기간 종료일"
                />
                {periodCustom ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setPeriod(PERIOD_ALL); setPeriodFrom(""); setPeriodTo("") }}
                  >기간 해제</Button>
                ) : null}
              </div>
            </div>
          )}
```

동작 요약.
- 프리셋 버튼을 누르면 직접 지정 칸 두 개를 비운다. 그래서 둘이 엉키지 않는다.
- 직접 지정 칸에 값이 들어가면 `periodCustom`이 참이 되고 프리셋 버튼은 전부 선택 해제로 보인다. 프리셋 상태값 자체는 그대로 둔다.
- `기간 해제`는 직접 지정이 켜져 있을 때만 보인다. 누르면 전체로 돌아간다.
- 한쪽 날짜만 채우면 열린 구간이다(이후 전부, 이전 전부).

목록 머리의 `subtitle={`현재 보기 ${filteredRows.length}건`}`는 이미 `filteredRows`를 보므로 손대지 않아도 건수가 따라온다.

---

## 하지 말 것

- **기간 선택을 localStorage나 Firestore에 저장하지 마라.** 검색·필터·정렬·탭·선택은 일부러 저장하지 않는 것이 이 앱의 규칙이다(`CLAUDE.md` 보기 설정). `view-prefs.ts`와 `CACHE_KEYS`를 건드리지 마라.
- **`useEffect`로 프리셋과 날짜 칸을 서로 되맞추지 마라.** 입력 상태를 매 렌더 부모 값으로 되맞추다 방금 친 글자가 지워진 사고가 있다(R297). 위 설계는 effect가 필요 없다.
- **`tsReceivedTime`과 정렬 비교 함수를 바꾸지 마라.** 접수일 내림차순은 R366에서 확정했다.
- **상단 상태 카드(`counts`), `TsTrendCard`, `MaterialDeckSection`을 기간에 맞춰 다시 세지 마라.** 전체 기준을 유지한다. 박향근이 그렇게 정했다.
- **`TsStageCounts`, `peopleOptions`, 등록 폼, 상세 팝업을 건드리지 마라.**
- `ToggleGroup` 같은 새 UI 컴포넌트를 만들거나 설치하지 마라. `src/components/ui/button.tsx`의 `variant`와 `size`로 충분하다.
- 표 칸 안에 `backdrop-filter`나 번짐 그림자를 넣지 마라.
- `react-day-picker` 등 새 의존성을 추가하지 마라. `input[type=date]`로 간다.

## 검증

```
npm run build
```

`tsc --noEmit`이 포함돼 있다. 통과하면 끝이다. 다른 검증은 하지 않는다.

성공 기준.
- 빌드 통과.
- `git status --short`에 `src/routes/TS.tsx` 하나만 뜬다(이 지시서 파일 제외).
