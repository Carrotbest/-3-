# R388 — DEVELOPMENT REQUEST에 「개발」 밴드 추가

상태: **미착수.** 설계는 2026-11-06 박향근 확정. 아래 그대로 시공한다.

## 무엇을 하는가

`/request`(DEVELOPMENT REQUEST) 표의 밴드를 넷에서 다섯으로 늘린다.
의뢰 밴드와 옵션 밴드 사이에 **「개발」 밴드**를 넣고 열 넷을 담는다.

| 열 | 필드 | 출처 |
|---|---|---|
| URGENT | `urgent` | **의뢰 밴드에서 옮겨 온다.** 새로 만들지 않는다 |
| 개발요청 | `devPlan` | **기존 `devPlan`의 이름만 바꾼다.** 새 필드를 만들지 말 것 |
| Key point | `keyPoint` | 신규 |
| 3팀 의견 | `teamOpinion` | 신규 |

밴드 순서: 기본 → ORIGINAL → 분석 → 의뢰 → **개발** → 옵션.
의뢰 밴드에 남는 열: 의뢰자, 개발 담당, 결과.

## 하지 말 것

- **`devPlan`의 필드명·열 id를 바꾸지 마라.** 저장된 열 너비(`fabric.request.colWidths`)와 숨김 상태(`fabric.request.hiddenCols`)가 전부 id로 돈다. 바꾸면 사용자 설정이 통째로 버려진다. 바꾸는 것은 화면 label과 엑셀 head 글자뿐이다.
- **`aliases: ["개발"]`을 빼지 마라.** 팀이 이미 받아 쓰는 옛 양식 파일의 열 이름이다. 여기에 `"개발 POINT"`를 **더한다**.
- 새 필드를 `undefined`로 저장하지 마라. Firestore가 `undefined` 값 키를 거부한다(R340). 생성 지점에서 늘 `""`를 넣는다. `{ ...style, keyPoint: undefined }` 같은 코드를 쓰지 말 것.
- `URGENT`를 복제하지 마라. 의뢰 밴드에서 **잘라내 옮기는** 것이다.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. **한글 문구를 영어로 바꾸지 마라.** 아래에 적힌 한글 글자는 한 글자도 바꾸지 말고 그대로 넣는다.

---

## 파일별 조치

### 1. `src/data/schema.ts`

`RequestStyle`의 `devPlan: string` 바로 아래에 두 필드를 더한다. 지금 코드:

```ts
  /** 엑셀 Q열 "개발" */
  devPlan: string
```

이렇게 바꾼다:

```ts
  /** 엑셀 Q열. 화면 이름은 "개발요청"이다(R388). 필드명은 저장된 열 설정 때문에 그대로 둔다. */
  devPlan: string
  /** 개발에서 반드시 맞춰야 할 점(R388). 옛 데이터에는 없다. */
  keyPoint?: string
  /** 3팀 의견(R388). 보드 작성이 끝난 뒤 웹에서 적는 칸이다. 옛 데이터에는 없다. */
  teamOpinion?: string
```

### 2. `src/index.css`

`:root` 블록의 `--chart-5: hsl(27 87% 67%);` 바로 아래 한 줄을 더한다.

```css
  --req-band-development: hsl(265 45% 48%);
```

**`.dark` 블록에는 더하지 마라.** 밴드 칩은 두 모드 모두 흰 글자라 한 값으로 쓴다(흰 글자 대비 7.2:1).

### 3. `src/routes/FabricRequest.tsx`

#### 3-1. `COLUMN_GROUPS` (78행 근처)

지금 코드:

```ts
  { key: "request", label: "의뢰", color: "var(--chart-3)", columns: [
    { id: "urgent", label: "URGENT", width: 64, scope: "style", align: "center" },
    { id: "requester", label: "의뢰자", width: 90, scope: "style" },
    { id: "devPlan", label: "개발 POINT", width: 200, scope: "style" },
    { id: "developer", label: "개발 담당", width: 90, scope: "style" },
    { id: "result", label: "결과", width: 76, scope: "style", align: "center" },
  ] },
```

이렇게 바꾼다(그룹 하나가 둘이 된다. 옵션 그룹 앞에 놓는다):

```ts
  { key: "request", label: "의뢰", color: "var(--chart-3)", columns: [
    { id: "requester", label: "의뢰자", width: 90, scope: "style" },
    { id: "developer", label: "개발 담당", width: 90, scope: "style" },
    { id: "result", label: "결과", width: 76, scope: "style", align: "center" },
  ] },
  // R388. URGENT와 개발 POINT(devPlan)를 의뢰 밴드에서 옮겨 왔다. 필드명은 그대로다.
  { key: "development", label: "개발", color: "var(--req-band-development)", columns: [
    { id: "urgent", label: "URGENT", width: 64, scope: "style", align: "center" },
    { id: "devPlan", label: "개발요청", width: 200, scope: "style" },
    { id: "keyPoint", label: "Key point", width: 180, scope: "style" },
    { id: "teamOpinion", label: "3팀 의견", width: 200, scope: "style" },
  ] },
```

`ALL_COLUMNS`, `GROUP_COLUMNS`, `DEFAULT_HIDDEN`, `ALL_OPEN`은 `COLUMN_GROUPS`에서 파생되므로 손대지 않는다.

#### 3-2. `blankStyle` (214행 근처)

`devPlan: "",` 다음 줄에 둘을 더한다.

```ts
    devPlan: "",
    keyPoint: "",
    teamOpinion: "",
```

#### 3-3. `editKindOf` (622행 근처)

지금 코드:

```ts
    case "contents": case "yarnAnalysis": case "comment":
    case "devPlan": case "yarnDetail": case "remark":
      return "area"
```

이렇게 바꾼다:

```ts
    case "contents": case "yarnAnalysis": case "comment":
    case "devPlan": case "keyPoint": case "teamOpinion":
    case "yarnDetail": case "remark":
      return "area"
```

#### 3-4. 셀 렌더 switch (1909행 근처)

지금 코드:

```ts
        case "devPlan": return style.devPlan
```

이렇게 바꾼다:

```ts
        case "devPlan": return style.devPlan
        case "keyPoint": return style.keyPoint ?? ""
        case "teamOpinion": return style.teamOpinion ?? ""
```

`rawValue`와 `updateCell`은 `column.id`를 필드명으로 그대로 쓰는 일반 코드라 **손대지 않는다.** 그래서 열 id와 스키마 필드명이 같아야 한다.

#### 3-5. 신규 의뢰 창 (528~532행 근처)

지금 코드:

```tsx
          <div className="mt-3">
            {field("개발 POINT", <textarea className="h-20 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" value={value.devPlan} onChange={(event) => set("devPlan", event.target.value)} />)}
            {field("Remark", <textarea className="mt-3 h-20 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" placeholder="스타일 코멘트. 여러 줄로 적습니다" value={styleRemarkText(value)} onChange={(event) => set("remark", event.target.value)} />)}
          </div>
```

이렇게 바꾼다(개발 묶음 세 칸을 한 블록으로 묶고 안내 문구를 placeholder로 단다):

```tsx
          <div className="mt-4 rounded border border-[var(--border)] p-3">
            <p className="mb-2 text-xs font-semibold">개발</p>
            <div className="grid gap-3">
              {field("개발요청", <textarea className="h-20 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" placeholder="무엇을 개발해 달라는 요청인지 적습니다" value={value.devPlan} onChange={(event) => set("devPlan", event.target.value)} />)}
              {field("Key point", <textarea className="h-20 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" placeholder="이 개발에서 반드시 맞춰야 할 점을 적습니다" value={value.keyPoint ?? ""} onChange={(event) => set("keyPoint", event.target.value)} />)}
              {field("3팀 의견", <textarea className="h-20 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" placeholder="보드 작성이 끝난 뒤 원단 R&D팀이 적는 칸입니다. 지금 비워 둬도 됩니다" value={value.teamOpinion ?? ""} onChange={(event) => set("teamOpinion", event.target.value)} />)}
            </div>
          </div>

          <div className="mt-3">
            {field("Remark", <textarea className="h-20 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" placeholder="스타일 코멘트. 여러 줄로 적습니다" value={styleRemarkText(value)} onChange={(event) => set("remark", event.target.value)} />)}
          </div>
```

`set`은 `RequestStyle`의 키를 받는 기존 함수다. 새 키를 더로 받기 위해 시그니처를 고칠 필요가 있으면 고치되, 다른 호출처를 깨뜨리지 마라.

#### 3-6. 업로드 처리 (1866행)

지금 코드:

```ts
      const { merged, added, updated, droppedLineIds } = mergeRequestStyles(requests, incoming)
```

이렇게 바꾼다:

```ts
      const { merged, added, updated, droppedLineIds } = mergeRequestStyles(requests, incoming, parsed.missingColumns)
```

### 4. `src/data/request-template.ts`

#### 4-1. `Band` 타입과 `BAND_COLOR`

```ts
type Band = "기본" | "ORIGINAL" | "분석" | "의뢰" | "개발" | "옵션"
```

`BAND_COLOR`에 한 줄을 더한다(`"의뢰"`와 `"옵션"` 사이).

```ts
  "개발": "FF7143B1",
```

#### 4-2. `TEMPLATE_COLUMNS`

지금 코드:

```ts
  { band: "의뢰", head: "URGENT", width: 8, scope: "style", key: "urgent", screenWidth: 64 },
  { band: "의뢰", head: "의뢰자", width: 11, scope: "style", key: "requester", screenWidth: 90 },
  { band: "의뢰", head: "개발 POINT", aliases: ["개발"], width: 30, scope: "style", key: "devPlan", screenWidth: 200 },
  { band: "의뢰", head: "개발 담당", width: 11, scope: "style", key: "developer", screenWidth: 90 },
  { band: "의뢰", head: "결과", width: 9, scope: "style", key: "result", optional: true, screenWidth: 76 },
```

이렇게 바꾼다(화면 열 순서와 같아야 한다):

```ts
  { band: "의뢰", head: "의뢰자", width: 11, scope: "style", key: "requester", screenWidth: 90 },
  { band: "의뢰", head: "개발 담당", width: 11, scope: "style", key: "developer", screenWidth: 90 },
  { band: "의뢰", head: "결과", width: 9, scope: "style", key: "result", optional: true, screenWidth: 76 },
  { band: "개발", head: "URGENT", width: 8, scope: "style", key: "urgent", screenWidth: 64 },
  // 이름만 "개발요청"으로 바꿨다(R388). 옛 양식 파일을 계속 읽으려고 두 옛 이름을 alias로 남긴다.
  { band: "개발", head: "개발요청", aliases: ["개발 POINT", "개발"], width: 30, scope: "style", key: "devPlan", screenWidth: 200 },
  { band: "개발", head: "Key point", width: 26, scope: "style", key: "keyPoint", optional: true, screenWidth: 180 },
  { band: "개발", head: "3팀 의견", width: 30, scope: "style", key: "teamOpinion", optional: true, screenWidth: 200 },
```

#### 4-3. `cellOf`

`case "devPlan": return style.devPlan || null` 아래에 둘을 더한다.

```ts
    case "keyPoint": return style.keyPoint || null
    case "teamOpinion": return style.teamOpinion || null
```

#### 4-4. `RequestParseResult`에 `missingColumns`를 더한다

```ts
export interface RequestParseResult {
  styles: RequestStyle[]
  /** 사람이 고칠 수 있는 문제만 담는다. 치명적이면 throw 한다. */
  warnings: string[]
  /** 파일에 없어서 화면이 채워야 하는 열(R354). 지금은 seq와 chart 둘이다. */
  derivedColumns: string[]
  /**
   * 파일에 없던 `optional` 열(R388). 옛 양식으로 재업로드할 때 이 열의 웹 입력값을
   * 빈 값으로 덮지 않으려고 `mergeRequestStyles`에 넘긴다.
   */
  missingColumns: string[]
}
```

#### 4-5. `parseRequestWorkbook`의 헤더 탐색

지금 코드:

```ts
  const indexByKey = new Map<string, number>()
  const derived: string[] = []
  for (const column of TEMPLATE_COLUMNS) {
    const names = [column.head, ...(column.aliases ?? [])]
    const found = header.findIndex((head) => names.includes(head))
    if (found >= 0) indexByKey.set(column.key, found)
    else if (column.derivable) derived.push(column.key)
    else if (!column.optional) throw new Error(`양식이 다릅니다. 2행에 "${column.head}" 열이 없습니다. 내려받은 양식을 그대로 쓰세요.`)
  }
```

이렇게 바꾼다:

```ts
  const indexByKey = new Map<string, number>()
  const derived: string[] = []
  const missing: string[] = []
  for (const column of TEMPLATE_COLUMNS) {
    const names = [column.head, ...(column.aliases ?? [])]
    const found = header.findIndex((head) => names.includes(head))
    if (found >= 0) indexByKey.set(column.key, found)
    else if (column.derivable) derived.push(column.key)
    else if (column.optional) missing.push(column.key)
    else throw new Error(`양식이 다릅니다. 2행에 "${column.head}" 열이 없습니다. 내려받은 양식을 그대로 쓰세요.`)
  }
```

마지막 `return`도 바꾼다:

```ts
  return { styles, warnings, derivedColumns: derived, missingColumns: missing }
```

#### 4-6. 스타일 생성에 새 두 필드를 더한다

`devPlan: asText(at(row, "devPlan")),` 아래에 둘을 더한다.

```ts
        keyPoint: asText(at(row, "keyPoint")),
        teamOpinion: asText(at(row, "teamOpinion")),
```

#### 4-7. `mergeRequestStyles`에 `missingColumns`를 받는다

파일 안, `mergeRequestStyles` 바로 위에 상수 하나를 둔다.

```ts
/**
 * 파일에 그 열이 없을 때 기존 웹 입력값을 지켜야 하는 스타일 열(R388).
 * `exportOnly`(사진)는 애초에 셀에 값이 없으므로 뺀다.
 */
const PRESERVE_IF_ABSENT = new Set(
  TEMPLATE_COLUMNS.filter((column) => column.scope === "style" && column.optional && !column.exportOnly).map((column) => column.key),
)
```

시그니처를 바꾼다:

```ts
export function mergeRequestStyles(
  existing: readonly RequestStyle[],
  incoming: readonly RequestStyle[],
  missingColumns: readonly string[] = [],
): RequestMergeResult {
```

갱신 분기에서 `next` 객체를 만든 **뒤**, `merged[merged.indexOf(previous)] = next` **앞**에 다음을 넣는다.

```ts
    // 옛 양식(그 열이 없는 파일)으로 재업로드해도 웹에서 적은 값을 빈 값으로 덮지 않는다(R388).
    for (const key of missingColumns) {
      if (!PRESERVE_IF_ABSENT.has(key)) continue
      ;(next as unknown as Record<string, unknown>)[key] = (previous as unknown as Record<string, unknown>)[key]
    }
```

`result`와 `stage`는 지금처럼 무조건 물려받는 코드를 그대로 둔다. 중복이어도 문제 없다.

#### 4-8. 「작성 안내」 시트

`lines` 배열의 마지막 항목

```ts
    "8. 사진과 결과 칸은 보기 전용입니다. 이 파일에서 고쳐도 웹에 올라가지 않습니다.",
```

을 아래 네 줄로 바꾼다.

```ts
    "8. 사진 칸은 보기 전용입니다. 이 파일에서 고쳐도 웹에 올라가지 않습니다.",
    "9. 개발 묶음은 URGENT / 개발요청 / Key point / 3팀 의견 네 칸입니다.",
    "   개발요청에는 무엇을 개발해 달라는 요청인지, Key point에는 반드시 맞춰야 할 점을 적습니다.",
    "   3팀 의견은 보드 작성이 끝난 뒤 원단 R&D팀이 적는 칸입니다. 비워 두고 올려도 됩니다.",
    "   이 열이 없는 옛 양식으로 올리면 웹에 적힌 Key point와 3팀 의견은 지워지지 않고 그대로 남습니다.",
```

(`결과` 칸 설명은 8번에서 뺐다. 결과는 양식에 있고 신규 건은 읽히므로 "보기 전용"이 정확하지 않다.)

### 5. `src/data/analysis-to-request.ts`

`buildRequestStyleFromAnalysis`의 반환 객체에서 지금 코드:

```ts
    developer: "",
    devPlan: "",
```

이렇게 바꾼다:

```ts
    developer: "",
    // 개발요청과 Key point는 비워 넘긴다(2026-11-06 박향근 확정). 분석값과 개발 목표는 다르다.
    devPlan: "",
    keyPoint: "",
    // 3팀 의견은 보드 작성이 끝난 뒤 웹에서 적는 칸이다.
    teamOpinion: "",
```

함수 위 주석(32행 근처)에 한 줄을 더한다.

```
 * 개발 묶음 세 칸(`devPlan`, `keyPoint`, `teamOpinion`)도 비운다(R388). 사람이 적는다.
```

### 6. `src/components/request/AnalysisImportDialog.tsx`

#### 6-1. `DialogDescription`의 옵션 줄 수 정정

지금 코드(39행 근처):

```tsx
              ? <>고른 보드에 스타일 {targets.length}건을 만듭니다. 옵션은 빈 줄 하나로 시작하며 개발 사양은 직접 적습니다.</>
```

`buildRequestStyleFromAnalysis`는 옵션을 **네 줄** 만든다(R370). 문구가 틀렸다. 이렇게 바꾼다:

```tsx
              ? <>고른 보드에 스타일 {targets.length}건을 만듭니다. 옵션은 빈 줄 네 개로 시작하며 개발 사양은 직접 적습니다.</>
```

#### 6-2. 안내 한 줄 추가

지금 코드(75~77행):

```tsx
        {withPhoto > 0 && !blockedReason
          ? <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">사진 {withPhoto}건은 분석 사진을 그대로 씁니다. 의뢰 화면에서 따로 올리면 그 사진으로 바뀝니다.</p>
          : null}
```

바로 아래에 더한다:

```tsx
        {!blockedReason
          ? <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">개발요청과 Key point는 비워 옵니다. 가져온 뒤 개발 묶음에서 적어 주십시오. 3팀 의견은 보드 작성이 끝난 뒤 적는 칸입니다.</p>
          : null}
```

---

## 검증

```
npm run build
```

`tsc --noEmit`을 포함한다. 한 번만 돌린다. 통과하면 끝이다.

끝난 뒤 `git status --short`로 위 여섯 파일만 바뀌었는지 본다. 그 밖의 파일이 바뀌었으면 보고한다.

## 보고

수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적는다. 바꾼 코드를 다시 붙이지 마라.
