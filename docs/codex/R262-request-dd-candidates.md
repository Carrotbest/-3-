# R262 요청 Link 칸에서 DD 후보를 골라 연결

상태: 미착수. 추론 강도 **medium**(팝업 1개 신규, 스코어 함수 1개 추가, 요청 화면 수정). R259와 R260이 먼저 들어가 있어야 한다.

DEVELOPMENT REQUEST 표의 `Link` 열은 지금 보기 전용이다. `미연결` 칩을 **더블클릭하면** 그 옵션에 이을 DD 행 후보를 점수순으로 띄우고, 하나 골라 바로 연결한다. R260의 반대 방향이다.

## 지금 상태 (확인한 사실)

`src/routes/FabricRequest.tsx` 697행 `renderDdLink`가 `requestDdStatus`의 결과를 칩으로 그린다. 미연결이면 글자만 있는 `<span>`이다.

```tsx
if (status.tone === "none") return <span className={`${chip} ${DD_TONE_CLASS.none}`}>미연결</span>
```

셀 자체의 `onDoubleClick`(1451행)은 `if (!editable) return`으로 시작하는데 `ddLink`는 계산 열이라 편집 대상이 아니다. 그래서 칩이 더블클릭을 직접 받아도 셀 편집과 부딪히지 않는다.

연결 저장은 DD 쪽 `applyRequestLinks`를 그대로 쓴다. 연결 정보는 DD 행 `tech.requestLink`에만 저장한다. 요청 쪽에는 아무것도 쓰지 않는다.

## 하지 말 것

- 요청 데이터에 연결 정보를 쓰지 마라. `RequestOption.ddLink` 필드는 미사용이다. 되살리지 마라.
- 요청 저장을 `saveRequests`로 직접 하지 마라. 이 화면의 모든 요청 저장은 `commitRequests` 하나를 지난다(전체 탭 차단과 보드 이력이 거기 있다). 이번 작업에서 요청을 저장할 일은 `lineId`가 없는 옛 옵션에 `lineId`를 만들어 줄 때뿐이다.
- `requestDdStatus`, `ddRecordsByLineId`, `requestProcessStage`를 고치지 마라.
- DD 행을 새로 만들지 마라. 후보에 없으면 DD MASTER에서 접수하는 것이 순서다.
- `src/routes/DevelopmentMasterSheet.tsx`는 이번에 열지 마라.
- `DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라.

## A. `src/data/request-link-match.ts`에 반대 방향 점수 추가

파일 **끝에** 붙인다. 기존 함수와 상수는 고치지 마라. 내부 도우미(`norm`, `tokens`, `jaccard`, `sameDigits`, `normalizeStyleKey`)를 그대로 쓴다.

```ts
export interface RowMatch {
  record: DevRecord
  score: number
  reasons: string[]
  /** 이 행이 이미 다른 요청 옵션에 연결돼 있는가. 고르면 그 연결이 이 옵션으로 옮겨간다. */
  linkedElsewhere: boolean
}

/**
 * DD 행 하나가 요청 옵션 하나와 얼마나 맞는지. `scoreStyleForRows`의 반대 방향이고 배점 규칙은 같다.
 * 요청 화면 Link 칸에서 DD 후보를 고를 때 쓴다.
 */
export function scoreRowForOption(record: DevRecord, style: RequestStyle, option: RequestOption): RowMatch {
  const reasons: string[] = []
  let score = 0
  const styleKey = normalizeStyleKey(record.styleNo)
  const garmentKey = normalizeStyleKey(style.garmentNo)
  let numberHit = true
  if (styleKey && styleKey === garmentKey) { score += 50; reasons.push("Style No. 일치") }
  else if (styleKey && garmentKey && sameDigits(styleKey, garmentKey)) { score += 34; reasons.push("번호 일치(표기 다름)") }
  else if (styleKey.length >= 5 && garmentKey.length >= 5 && (styleKey.includes(garmentKey) || garmentKey.includes(styleKey))) { score += 26; reasons.push("Style No. 부분 일치") }
  else numberHit = false

  if (norm(record.buyer) && norm(record.buyer) === norm(style.brand)) { score += 12; reasons.push("Buyer 일치") }
  if (norm(record.owner) && norm(record.owner) === norm(style.developer)) { score += 10; reasons.push("개발 담당 일치") }
  if (norm(record.planner) && norm(record.planner) === norm(style.requester)) { score += 6; reasons.push("의뢰 담당 일치") }

  const yarn = jaccard(tokens(record.tech?.yarnDetail), tokens(option.yarnDetail))
  if (yarn >= 0.3) { score += Math.round(yarn * 24); reasons.push(`Yarn Detail ${Math.round(yarn * 100)}%`) }
  if (norm(record.construction) && norm(record.construction) === norm(option.construction)) { score += 8; reasons.push("조직 일치") }
  if (norm(record.color) && norm(record.color) === norm(option.color)) { score += 8; reasons.push("Color 일치") }
  if (record.weight !== "" && option.weight !== "" && option.weight != null
    && Math.abs(Number(record.weight) - Number(option.weight)) <= 10) { score += 5; reasons.push("중량 근접") }
  if (Number(record.opt) === option.no) { score += 4; reasons.push("옵션 번호 일치") }

  const status = String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase()
  if (status === "DROP" || status === "REJECT") { score -= 15; reasons.push(status) }
  const linkedElsewhere = Boolean(record.tech?.requestLink && record.tech.requestLink.lineId !== option.lineId)
  if (linkedElsewhere) { score -= 25; reasons.push("다른 요청에 연결됨") }

  // 번호가 하나도 안 맞는 건은 자동 선택 문턱 아래로 묶는다. 같은 사양이 여러 스타일에 되풀이된다.
  const capped = Math.max(0, Math.min(100, score))
  return { record, score: numberHit ? capped : Math.min(capped, MATCH_STRONG_SCORE - 1), reasons, linkedElsewhere }
}
```

파일 첫 줄 타입 import에 `RequestOption`을 더한다.

```ts
import type { DevRecord, RequestOption, RequestStyle } from "./schema"
```

## B. 신규 파일 `src/components/request/DdCandidateDialog.tsx`

통째로 새로 만든다.

```tsx
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MATCH_MIN_SCORE, scoreRowForOption } from "@/data/request-link-match"
import type { DevRecord, RequestOption, RequestStyle } from "@/data/schema"

interface DdCandidateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  style: RequestStyle | null
  option: RequestOption | null
  records: readonly DevRecord[]
  /** DD MASTER 편집 권한. 없으면 후보만 보고 연결은 못 한다. */
  canLink: boolean
  onConfirm: (record: DevRecord, fillEmpty: boolean) => void
}

const identity = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`
const text = (value: unknown): string => String(value ?? "").trim()
/** 검색어 없이 열었을 때 보여 줄 최대 후보 수. 검색하면 전체에서 다시 찾는다. */
const LIMIT = 60

export function DdCandidateDialog({ open, onOpenChange, style, option, records, canLink, onConfirm }: DdCandidateDialogProps) {
  const [query, setQuery] = useState("")
  const [unlinkedOnly, setUnlinkedOnly] = useState(true)
  const [fillEmpty, setFillEmpty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setUnlinkedOnly(true)
    setFillEmpty(false)
    setSelectedId(null)
  }, [open])

  const matches = useMemo(() => {
    if (!style || !option) return []
    const needle = query.trim().toLocaleLowerCase("ko-KR")
    return records
      .filter((record) => !needle || [record.styleNo, record.color, record.dyeing, record.owner, record.buyer, record.flNo, record.tech?.yarnDetail]
        .some((value) => text(value).toLocaleLowerCase("ko-KR").includes(needle)))
      .map((record) => scoreRowForOption(record, style, option))
      .filter((match) => !unlinkedOnly || !match.linkedElsewhere)
      // 검색어가 없으면 점수가 붙은 후보만 보인다. DD 행 전체를 쏟아 놓으면 고를 수가 없다.
      .filter((match) => Boolean(needle) || match.score >= MATCH_MIN_SCORE)
      .sort((a, b) => b.score - a.score || text(a.record.styleNo).localeCompare(text(b.record.styleNo), "en", { numeric: true }))
      .slice(0, LIMIT)
  }, [option, query, records, style, unlinkedOnly])

  const selected = matches.find((match) => identity(match.record) === selectedId)

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[92vw] max-w-3xl">
      <DialogHeader>
        <DialogTitle>DD 후보에서 연결</DialogTitle>
        <DialogDescription>
          {style && option
            ? `${style.garmentNo || "Garment No. 미기재"} · Opt ${option.no} · ${option.color || "색 미기재"} · ${option.yarnDetail || "Yarn Detail 미기재"}`
            : "연결할 옵션이 없습니다."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 min-w-0 flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Style No. · Color · Yarn Detail · 담당 · FL# 검색" />
          <Button type="button" size="sm" variant={unlinkedOnly ? "default" : "outline"} onClick={() => setUnlinkedOnly((value) => !value)}>미연결 행만</Button>
        </div>
        <p className="text-[11px] text-[var(--muted-foreground)]">검색어가 없으면 {MATCH_MIN_SCORE}점 이상 후보만 보입니다. 찾는 행이 없으면 검색하세요.</p>
        <div className="max-h-[52vh] space-y-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] p-1">
          {matches.map(({ record, score, reasons, linkedElsewhere }) => {
            const key = identity(record)
            return <button key={key} type="button" className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left ${selectedId === key ? "border-[var(--primary)] bg-[var(--accent)]" : "border-transparent hover:bg-[var(--muted)]/60"}`} onClick={() => setSelectedId(key)}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <strong className="font-mono text-[13px]">{record.styleNo || "Style No. 미기재"}</strong>
                  <span className="text-[11px] text-[var(--muted-foreground)]">Opt {record.opt || "-"} · {record.color || "색 미기재"} · {record.dyeing || "염색 미기재"}</span>
                  <Badge variant="outline" className="tabular-nums text-[10px]">{score}점</Badge>
                  {linkedElsewhere ? <Badge variant="outline" className="text-[10px] text-[var(--warning)]">다른 요청에 연결됨</Badge> : null}
                </span>
                <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{record.tech?.yarnDetail || "Yarn Detail 미기재"}</span>
                <span className="block truncate text-[11px] text-[var(--muted-foreground)]">담당 {record.owner || "미지정"} · {record.devStatus || "상태 미기재"}{record.flNo ? ` · ${record.flNo}` : ""}{reasons.length ? ` · ${reasons.slice(0, 3).join(" · ")}` : ""}</span>
              </span>
            </button>
          })}
          {!matches.length ? <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{query.trim() ? "검색에 맞는 DD 행이 없습니다." : "점수가 붙는 후보가 없습니다. 검색해서 찾으세요."}</p> : null}
        </div>
        <label className="flex items-start gap-2 text-xs"><Checkbox checked={fillEmpty} onCheckedChange={(checked) => setFillEmpty(checked === true)} /><span>DD 행의 비어 있는 칸만 요청 값으로 채우기(Buyer·Planner·Color·Dyeing·Remark·Yarn Detail)</span></label>
        {selected?.linkedElsewhere ? <p className="text-xs text-[var(--warning)]">이 행은 다른 요청 옵션에 연결돼 있습니다. 연결하면 그 연결이 이 옵션으로 옮겨갑니다.</p> : null}
      </DialogBody>
      <DialogFooter className="justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">{canLink ? `후보 ${matches.length}건` : "DD MASTER 편집 권한이 없어 연결할 수 없습니다."}</span>
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button type="button" size="sm" disabled={!canLink || !selected} onClick={() => { if (selected) onConfirm(selected.record, fillEmpty) }}>{selected?.linkedElsewhere ? "연결 옮기기" : "이 행에 연결"}</Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
```

## C. `src/routes/FabricRequest.tsx`

### C-1. import

19행을 바꾼다.

```tsx
import { applyRequestLinks, ddRecordsByLineId, ensureRequestLineIds, requestDdStatus, type RequestDdStatus } from "@/data/request-link"
```

`import { ProcessStageChip } from "@/components/request/ProcessStageChip"` 옆에 더한다.

```tsx
import { DdCandidateDialog } from "@/components/request/DdCandidateDialog"
```

44행 schema 타입 import 목록에 `type DevRecord`를 더한다.

46행 store import에 `writeDevelopmentRecords`를 더한다.

```tsx
import { saveRequestArchive, saveRequestBoards, saveRequests, saveRequestsAndBoards, useAppStore, writeDevelopmentRecords } from "@/store/useAppStore"
```

### C-2. 상태

751행 `const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)` 다음 줄에 더한다.

```tsx
  // Link 칸 미연결 칩을 더블클릭하면 그 옵션에 이을 DD 행 후보를 고른다(R262).
  const [ddPick, setDdPick] = useState<{ style: RequestStyle; option: RequestOption } | null>(null)
```

### C-3. 미연결 칩을 버튼으로

`renderDdLink`의 시그니처와 첫 분기를 바꾼다. 지금

```tsx
  const renderDdLink = (option: RequestOption): ReactNode => {
    const status = requestDdStatus(ddByLine, option)
    const chip = "whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium"
    if (status.tone === "none") return <span className={`${chip} ${DD_TONE_CLASS.none}`}>미연결</span>
```

바꾼 뒤

```tsx
  const renderDdLink = (style: RequestStyle, option: RequestOption): ReactNode => {
    const status = requestDdStatus(ddByLine, option)
    const chip = "whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium"
    if (status.tone === "none") return <button
      type="button"
      title="더블클릭하면 연결할 DD 행 후보를 보여줍니다"
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => { event.stopPropagation(); setDdPick({ style, option }) }}
      className={`${chip} ${DD_TONE_CLASS.none} hover:opacity-80`}
    >미연결</button>
```

1411행 호출부를 바꾼다.

```tsx
    if (column.id === "ddLink") return renderDdLink(line.style, option)
```

`renderDdLink` 안의 다른 줄은 그대로 둔다.

### C-4. 연결 저장

`commitRequests` 함수 정의 **다음**에 더한다.

```tsx
  /**
   * 요청 옵션 하나를 DD 행 하나에 잇는다. 연결 정보는 DD 행 tech.requestLink 에만 저장한다.
   * 되돌리기는 이 화면 스택에 없다. SETTING 작업 이력에 남고, 해제는 DD MASTER 우클릭에서 한다.
   */
  const linkDdRecord = async (record: DevRecord, fillEmpty: boolean) => {
    const target = ddPick
    if (!target) return
    if (!currentUserCanEditKey("records")) { setNotice({ kind: "error", text: "DD MASTER 편집 권한이 필요합니다." }); return }
    let styles = requests
    // lineId 가 없는 옛 옵션이면 먼저 만들어 저장한다. 요청 저장은 commitRequests 하나를 지난다.
    if (!target.style.options.find((option) => option.optId === target.option.optId)?.lineId) {
      const prepared = ensureRequestLineIds(requests)
      if (prepared.changed && !commitRequests(prepared.next)) return
      styles = prepared.next
    }
    const style = styles.find((item) => item.reqId === target.style.reqId)
    const option = style?.options.find((item) => item.optId === target.option.optId)
    if (!style || !option?.lineId) { setNotice({ kind: "error", text: "옵션을 찾지 못했습니다. 새로 고친 뒤 다시 시도하세요." }); return }
    const before = useAppStore.getState().records
    const { next, linked } = applyRequestLinks(before, style, [{ rowId: `${record._src.sheet}::${record._src.row}`, optId: option.optId }], fillEmpty)
    if (!linked) { setNotice({ kind: "error", text: "연결하지 못했습니다." }); return }
    await writeDevelopmentRecords(next, false, "edit")
    setDdPick(null)
    setNotice({ kind: "ok", text: `${record.styleNo || "DD 행"} Opt ${record.opt || "-"} 에 연결했습니다.` })
  }
```

### C-5. 팝업 렌더

이 화면의 다른 팝업들이 렌더되는 자리(반환 JSX 끝, `<ProcessStageDialog ... />` 같은 줄 옆)에 더한다.

```tsx
    <DdCandidateDialog
      open={Boolean(ddPick)}
      onOpenChange={(open) => { if (!open) setDdPick(null) }}
      style={ddPick?.style ?? null}
      option={ddPick?.option ?? null}
      records={ddRecords}
      canLink={currentUserCanEditKey("records")}
      onConfirm={(record, fillEmpty) => void linkDdRecord(record, fillEmpty)}
    />
```

## 동작 정리

1. 요청 표 `Link` 칸의 `미연결`을 더블클릭한다.
2. 그 옵션에 맞는 DD 행이 점수순으로 뜬다. 기본은 20점 이상, 미연결 행만이다.
3. 못 찾으면 검색한다. 검색할 때는 점수 하한을 풀고 전체에서 찾는다.
4. 고르고 `이 행에 연결`을 누르면 DD 행에 저장된다. 표의 칩이 바로 `연결`로 바뀐다.
5. 이미 다른 요청에 연결된 행을 고르면 경고가 뜨고 버튼이 `연결 옮기기`가 된다.
6. DD 편집 권한이 없으면 후보는 보이고 버튼은 잠긴다.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/data/request-link-match.ts` | A, 파일 끝에 추가 |
| `src/components/request/DdCandidateDialog.tsx` | 신규 (B) |
| `src/routes/FabricRequest.tsx` | C-1~C-5 |

다른 파일은 열지 않는다.

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. 화면 확인은 사용자가 한다.
