# R259 요청 연결 후보를 점수로 추천한다

상태: 미착수. 추론 강도 **medium**(모듈 1개 신규, 4개 수정. 연결 키 계약은 그대로다).

DD MASTER와 DEVELOPMENT REQUEST를 잇는 것이 지금 어렵다. 후보를 찾는 일이 사람 몫이다. 후보 찾기를 점수로 대신한다.

## 지금 왜 어려운가 (확인한 사실)

`src/data/request-link.ts`의 `buildLinkHelperGroups`는 후보를 **Garment No. 완전 일치 하나로만** 찾는다.

```ts
const key = normalizeStyleKey(style.garmentNo)   // 공백 제거 + 대문자
...
const candidates = requestsByKey.get(styleKey) ?? []
if (!candidates.length) return { ...base, status: "none", reason: "같은 Garment No. 요청 없음" }
```

표기가 조금만 달라도(`HMP26-0413` 대 `HMP260413`) 후보 없음으로 떨어진다. 그러면 사람이 `RequestPickerDialog`에서 Garment No.를 검색해 직접 찾아야 한다. 그 목록의 정렬도 `exact → updatedAt`이라 검색어를 안 넣으면 최근 수정 순으로만 쌓인다.

연결 자체의 뼈대는 멀쩡하다. **짝 규칙 `defaultLinkPairs`, 연결 쓰기 `applyRequestLinks`, 연결 키 `tech.requestLink { reqId, lineId }`는 건드리지 않는다.** 이번 작업은 후보를 고르는 단계만 바꾼다.

## 무엇을 만드는가

1. 점수 매칭 모듈. Style No. 표기 차이, Buyer, 담당, Yarn Detail, 조직, Color, 중량을 합쳐 0~100점을 낸다.
2. 도우미에 **추천** 탭. 완전 일치 후보가 없어도 점수 1등을 보여 주고 바로 확인으로 넘긴다.
3. 연결 팝업 후보 목록을 점수순으로 세우고, 확실한 1등은 **열 때 미리 선택**한다. 이유를 배지로 적는다.

## 하지 말 것

- `defaultLinkPairs`, `applyRequestLinks`, `removeRequestLinks`, `ensureRequestLineIds`를 고치지 마라.
- `optId`를 연결 키로 쓰지 마라. 연결 키는 `RequestOption.lineId` 하나다.
- 자동 연결(`linkHelperAuto`)의 판정 기준을 넓히지 마라. **`auto`는 지금처럼 완전 일치 + 옵션 수 일치일 때만이다.** 점수 추천은 사람이 확인하고 누른다. 점수로 자동 연결하면 틀린 짝이 조용히 저장된다.
- `src/routes/FabricRequest.tsx`는 이번에 열지 마라. 요청 화면에서 DD를 잇는 반대 방향은 R260이다.
- 연결 도우미의 `HELPER_EXCLUDED_STATUS`(DROP·REJECT 제외)를 풀지 마라.

## A. 신규 파일 `src/data/request-link-match.ts`

통째로 새로 만든다. `normalizeStyleKey`를 `request-link.ts`에서 **이 파일로 옮긴다**(그 파일이 이 파일을 불러 쓰므로 반대로 두면 순환 참조가 된다).

```ts
import type { DevRecord, RequestStyle } from "./schema"

/** Style No.와 Garment No. 비교용 키. 공백을 없애고 대문자로 맞춘다. */
export const normalizeStyleKey = (value: string): string =>
  value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "")

const norm = (value: unknown): string => String(value ?? "").trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ")

/** Yarn Detail 같은 자유 서술을 비교용 토큰으로 쪼갠다. 한 글자는 버린다. */
function tokens(value: unknown): Set<string> {
  return new Set(String(value ?? "").toLocaleUpperCase("en-US").split(/[^A-Z0-9']+/).filter((token) => token.length >= 2))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let hit = 0
  a.forEach((token) => { if (b.has(token)) hit += 1 })
  return hit / (a.size + b.size - hit)
}

/** 숫자만 남겨 비교한다. HMP26-0413 과 HMP260413 은 같은 번호다. */
function sameDigits(left: string, right: string): boolean {
  const a = left.replace(/\D/g, "")
  const b = right.replace(/\D/g, "")
  return a.length >= 6 && a === b
}

export interface StyleMatch {
  style: RequestStyle
  /** 0~100. 큰 것이 먼저 온다. */
  score: number
  /** 점수 근거. 화면 배지 문구로 그대로 쓴다. */
  reasons: string[]
  total: number
  unlinked: number
  /** Style No.와 Garment No.가 완전히 같은가. 자동 연결 판정은 이것만 본다. */
  exact: boolean
}

/** 이 점수 아래는 추천으로 올리지 않는다. 한 칸 우연히 맞은 스타일을 권하면 도우미를 못 믿는다. */
export const MATCH_MIN_SCORE = 20
/** 이 위는 열 때 미리 골라 둘 만큼 확실한 후보로 본다. */
export const MATCH_STRONG_SCORE = 40

/**
 * 요청 스타일 하나가 DD 행 묶음과 얼마나 맞는지 점수를 낸다.
 * `styleNo`는 DD 쪽 Style No.다. 행이 없을 때도(불러오기 팝업) 번호만으로 점수가 난다.
 * 점수 배분은 번호 > 사람·Buyer > 사양 순이다. 번호가 맞으면 거의 확실하고, 사양만 맞는 건 흔하다.
 */
export function scoreStyleForRows(
  style: RequestStyle,
  styleNo: string,
  rows: readonly DevRecord[],
  blockedLineIds: ReadonlySet<string>,
): StyleMatch {
  const reasons: string[] = []
  let score = 0
  const head = rows[0]
  const styleKey = normalizeStyleKey(styleNo || head?.styleNo || "")
  const garmentKey = normalizeStyleKey(style.garmentNo)
  const exact = Boolean(styleKey) && styleKey === garmentKey
  if (exact) { score += 50; reasons.push("Style No. 일치") }
  else if (styleKey && garmentKey && sameDigits(styleKey, garmentKey)) { score += 34; reasons.push("번호 일치(표기 다름)") }
  else if (styleKey.length >= 5 && garmentKey.length >= 5 && (styleKey.includes(garmentKey) || garmentKey.includes(styleKey))) { score += 26; reasons.push("Style No. 부분 일치") }

  if (norm(head?.buyer) && norm(head?.buyer) === norm(style.brand)) { score += 12; reasons.push("Buyer 일치") }
  if (norm(head?.owner) && norm(head?.owner) === norm(style.developer)) { score += 10; reasons.push("개발 담당 일치") }
  if (norm(head?.planner) && norm(head?.planner) === norm(style.requester)) { score += 6; reasons.push("의뢰 담당 일치") }

  let bestYarn = 0
  let colorHit = false
  let consHit = false
  let weightHit = false
  rows.forEach((row) => style.options.forEach((option) => {
    bestYarn = Math.max(bestYarn, jaccard(tokens(row.tech?.yarnDetail), tokens(option.yarnDetail)))
    if (norm(row.color) && norm(row.color) === norm(option.color)) colorHit = true
    if (norm(row.construction) && norm(row.construction) === norm(option.construction)) consHit = true
    if (row.weight !== "" && option.weight !== "" && option.weight != null
      && Math.abs(Number(row.weight) - Number(option.weight)) <= 10) weightHit = true
  }))
  if (bestYarn >= 0.3) { score += Math.round(bestYarn * 24); reasons.push(`Yarn Detail ${Math.round(bestYarn * 100)}%`) }
  if (consHit) { score += 8; reasons.push("조직 일치") }
  if (colorHit) { score += 8; reasons.push("Color 일치") }
  if (weightHit) { score += 5; reasons.push("중량 근접") }

  const unlinked = style.options.filter((option) => !option.lineId || !blockedLineIds.has(option.lineId)).length
  if (rows.length > 0 && unlinked === rows.length) { score += 6; reasons.push("옵션 수 일치") }
  if (!unlinked) { score -= 25; reasons.push("남은 옵션 없음") }

  return { style, score: Math.max(0, Math.min(100, score)), reasons, total: style.options.length, unlinked, exact }
}

/** 점수 하한을 넘는 후보만 점수순으로 준다. 도우미 추천 탭과 연결 팝업이 같이 쓴다. */
export function suggestStylesForRows(
  requests: readonly RequestStyle[],
  styleNo: string,
  rows: readonly DevRecord[],
  blockedLineIds: ReadonlySet<string>,
  limit = 5,
): StyleMatch[] {
  return requests
    .map((style) => scoreStyleForRows(style, styleNo, rows, blockedLineIds))
    .filter((match) => match.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score || Date.parse(b.style.updatedAt) - Date.parse(a.style.updatedAt))
    .slice(0, limit)
}
```

## B. `src/data/request-link.ts`

### B-1. `normalizeStyleKey` 정의를 지우고 새 모듈에서 받는다

5~6행

```ts
export const normalizeStyleKey = (value: string): string =>
  value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "")
```

를 지우고, 4행 `import type { DevRecord, RequestOption, RequestStyle } from "@/data/schema"` 다음에 넣는다.

```ts
import {
  MATCH_MIN_SCORE, normalizeStyleKey, scoreStyleForRows, suggestStylesForRows, type StyleMatch,
} from "@/data/request-link-match"

// 기존 import 경로를 지키려고 여기서 다시 내보낸다. 정의는 request-link-match.ts 에 있다.
export { normalizeStyleKey }
export type { StyleMatch }
```

`MATCH_MIN_SCORE`는 아래 B-4에서 쓴다.

### B-2. `RequestCandidate`를 `StyleMatch`로 통일

기존 `export interface RequestCandidate { style; total; unlinked; exact }` 블록을 지우고 아래 한 줄로 바꾼다.

```ts
/** 연결 팝업 후보. 점수와 근거까지 들어 있다. */
export type RequestCandidate = StyleMatch
```

### B-3. `requestCandidates`를 점수순으로

함수 전체를 아래로 바꾼다. 인자 여섯 번째만 늘었고 기존 호출은 그대로 돈다.

```ts
export function requestCandidates(
  requests: readonly RequestStyle[],
  records: readonly DevRecord[],
  styleNo: string,
  query: string,
  includeLinked: boolean,
  opts: { rows?: readonly DevRecord[]; blockedLineIds?: ReadonlySet<string> } = {},
): RequestCandidate[] {
  // 연결 팝업은 지금 연결을 바꾸는 행의 lineId 를 빼고 넘긴다. 없으면 전체 연결 목록을 막힌 것으로 본다.
  const blocked = opts.blockedLineIds ?? linkedLineIds(records)
  const rows = opts.rows ?? []
  const needle = query.trim().toLocaleLowerCase("ko-KR")
  return requests
    .filter((style) => !needle || [style.garmentNo, style.brand, style.chart, style.developer]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(needle)))
    .map((style) => scoreStyleForRows(style, styleNo, rows, blocked))
    .filter((candidate) => includeLinked || candidate.unlinked > 0)
    .sort((a, b) => b.score - a.score
      || Number(b.exact) - Number(a.exact)
      || Date.parse(b.style.updatedAt) - Date.parse(a.style.updatedAt))
}
```

### B-4. 도우미에 추천 상태를 더한다

`HelperStatus` 선언을 바꾼다.

```ts
export type HelperStatus = "auto" | "review" | "suggest" | "none"
```

`HelperGroup`의 `candidates` 다음에 필드를 더한다.

```ts
  /** normalizeStyleKey(garmentNo)가 같은 요청 스타일 */
  candidates: RequestStyle[]
  /** 같은 Garment No. 후보가 없을 때 점수로 고른 추천. status가 "suggest"인 그룹만 채운다. */
  suggestions: StyleMatch[]
  status: HelperStatus
  reason: string
```

`buildLinkHelperGroups` 안에서 `rank`와 반환부를 바꾼다. 지금

```ts
  const rank: Record<HelperStatus, number> = { auto: 0, review: 1, none: 2 }
  return [...rowsByKey].map(([styleKey, rows]): HelperGroup => {
    const sortedRows = [...rows].sort((a, b) => numericOrder(a.opt) - numericOrder(b.opt))
    const candidates = requestsByKey.get(styleKey) ?? []
    const base = { styleKey, styleNo: sortedRows[0].styleNo.trim(), rows: sortedRows, candidates }
    if (!candidates.length) return { ...base, status: "none", reason: "같은 Garment No. 요청 없음" }
```

아래로 바꾼다. `candidates.length > 1` 이후 줄은 그대로 둔다.

```ts
  const rank: Record<HelperStatus, number> = { auto: 0, review: 1, suggest: 2, none: 3 }
  return [...rowsByKey].map(([styleKey, rows]): HelperGroup => {
    const sortedRows = [...rows].sort((a, b) => numericOrder(a.opt) - numericOrder(b.opt))
    const candidates = requestsByKey.get(styleKey) ?? []
    const base = { styleKey, styleNo: sortedRows[0].styleNo.trim(), rows: sortedRows, candidates, suggestions: [] as StyleMatch[] }
    if (!candidates.length) {
      // Garment No. 표기가 다르거나 사양만 닮은 건은 점수로 끌어올린다. 자동 연결은 하지 않는다.
      const suggestions = suggestStylesForRows(requests, sortedRows[0].styleNo, sortedRows, linked, 3)
      return suggestions.length
        ? { ...base, suggestions, status: "suggest", reason: `추천 ${suggestions.length}건 · 최고 ${suggestions[0].score}점` }
        : { ...base, status: "none", reason: "같은 Garment No. 요청 없음" }
    }
```

`MATCH_MIN_SCORE`를 직접 쓰지 않으면 import 에서 빼라(`tsc`가 잡는다). `suggestStylesForRows`가 이미 그 값으로 거른다.

## C. `src/components/dd/RequestPickerDialog.tsx`

### C-1. import

8행을 바꾼다.

```ts
import { defaultLinkPairs, linkedLineIds, requestCandidates, type LinkPair } from "@/data/request-link"
import { MATCH_MIN_SCORE, MATCH_STRONG_SCORE } from "@/data/request-link-match"
```

### C-2. 후보 계산에 행과 막힌 옵션을 넘긴다

`const candidates = useMemo(...)` 줄을 바꾼다.

```tsx
  const candidates = useMemo(
    () => requestCandidates(requests, records, styleNo, query, includeLinked, mode === "link" ? { rows: linkRows, blockedLineIds } : {}),
    [blockedLineIds, includeLinked, linkRows, mode, query, records, requests, styleNo],
  )
```

### C-3. 확실한 1등을 미리 고른다

`const selected = ...` 줄 다음, 첫 `useEffect` 앞에 넣는다.

```tsx
  // 검색어 없이 열었을 때만, 확실한 1등 후보를 미리 골라 둔다. 사람이 고른 뒤에는 건드리지 않는다.
  useEffect(() => {
    if (!open || selectedReqId || query.trim()) return
    const top = candidates[0]
    if (top && top.score >= MATCH_STRONG_SCORE) setSelectedReqId(top.style.reqId)
  }, [candidates, open, query, selectedReqId])
```

### C-4. 후보 줄에 점수와 근거를 적는다

후보 목록의 `candidates.map(...)` 블록을 아래로 바꾼다.

```tsx
            {candidates.map(({ style, total, unlinked, exact, score, reasons }) => <button key={style.reqId} type="button" className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left ${selected?.reqId === style.reqId ? "bg-[var(--accent)]" : "hover:bg-[var(--muted)]"}`} onClick={() => setSelectedReqId(style.reqId)}>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><strong className="truncate text-sm">{style.garmentNo || "Garment No. 미기재"}</strong>{exact ? <Badge className="shrink-0">같은 Style No.</Badge> : score >= MATCH_STRONG_SCORE ? <Badge className="shrink-0">추천 {score}</Badge> : score >= MATCH_MIN_SCORE ? <Badge variant="outline" className="shrink-0 tabular-nums">{score}점</Badge> : null}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{style.chart} · #{style.seq} · {style.brand} · 개발 {style.developer}</span>{reasons.length ? <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{reasons.slice(0, 3).join(" · ")}</span> : null}</span>
              <span className="shrink-0 text-xs text-[var(--muted-foreground)]">미연결 {unlinked}/{total}</span>
            </button>)}
```

## D. `src/components/dd/RequestLinkHelperDialog.tsx`

### D-1. 탭 목록

`TABS` 배열을 바꾼다.

```ts
const TABS: { key: HelperStatus; label: string }[] = [
  { key: "auto", label: "자동" },
  { key: "review", label: "확인 필요" },
  { key: "suggest", label: "추천" },
  { key: "none", label: "후보 없음" },
]
```

### D-2. 머리말 숫자

`DialogDescription` 안을 바꾼다.

```tsx
          자동 {autoGroups.length} · 확인 필요 {byStatus("review").length} · 추천 {byStatus("suggest").length} · 후보 없음 {byStatus("none").length} · 미연결 DD 행 {totalRows}
```

### D-3. 표 머리

`{tab === "review" ? <th className={headCell}>사유</th> : null}` 다음 줄에 더한다.

```tsx
                {tab === "suggest" ? <th className={headCell}>추천 근거</th> : null}
```

### D-4. 표 본문

`shown.map((group) => {` 안의 `const style = group.candidates[0]` 다음 줄에 더한다.

```tsx
                const top = group.suggestions[0]
```

`요청` 칸(지금 `{tab === "none" ? ... : <td className={bodyCell}>{group.candidates.length === 1 && style ? ... : ...}</td>}`)을 아래로 바꾼다.

```tsx
                  {tab === "none"
                    ? <td className={bodyCell}>{ownerDisplayName(group.rows[0]?.owner ?? "") || "미지정"}</td>
                    : tab === "suggest"
                      ? <td className={bodyCell}>{top ? `${top.style.garmentNo || "Garment No. 미기재"} · ${top.style.chart || "차트 미기재"} #${top.style.seq}` : "-"}</td>
                      : <td className={bodyCell}>{group.candidates.length === 1 && style ? `${style.chart || "차트 미기재"} · #${style.seq} · ${style.brand || "Brand 미기재"}` : `${group.candidates.length}개 후보`}</td>}
```

`{tab === "review" ? <td className={bodyCell}>{group.reason}</td> : null}` 다음 줄에 더한다.

```tsx
                  {tab === "suggest" ? <td className={bodyCell}>{top ? `${top.score}점 · ${top.reasons.slice(0, 3).join(" · ")}` : "-"}</td> : null}
```

버튼 문구를 바꾼다.

```tsx
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={!editEnabled} title={editEnabled ? undefined : disabledMessage} onClick={() => onReview(group)}>{tab === "review" ? "짝 확인…" : tab === "suggest" ? "추천 확인…" : "직접 연결…"}</Button>
```

## E. `src/routes/DevelopmentMasterSheet.tsx`

`reviewLinkHelperGroup` 안의 한 줄만 바꾼다.

지금

```ts
    setRequestPickerInitialReqId(group.candidates.length === 1 ? group.candidates[0].reqId : undefined)
```

바꾼 뒤

```ts
    // 후보가 하나면 그것, 완전 일치 후보가 없으면 점수 1등 추천을 미리 골라 둔다.
    setRequestPickerInitialReqId(group.candidates.length === 1
      ? group.candidates[0].reqId
      : group.candidates.length === 0 ? group.suggestions[0]?.style.reqId : undefined)
```

이 파일에서 다른 줄은 손대지 마라.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/data/request-link-match.ts` | 신규 (A) |
| `src/data/request-link.ts` | B-1~B-4 |
| `src/components/dd/RequestPickerDialog.tsx` | C-1~C-4 |
| `src/components/dd/RequestLinkHelperDialog.tsx` | D-1~D-4 |
| `src/routes/DevelopmentMasterSheet.tsx` | E, 한 줄 |

다른 파일은 열지 않는다.

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. `git status --short`에 위 다섯 파일과 이 문서만 나와야 한다.

화면 확인은 사용자가 한다. DD MASTER `요청 연결 도우미`에 **추천** 탭이 생기고, 거기 `추천 확인…`을 누르면 연결 팝업이 점수 1등 스타일을 이미 고른 상태로 열린다.
