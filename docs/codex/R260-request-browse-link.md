# R260 DD 행에서 요청 폴더를 뒤져 직접 연결

상태: 미착수. 추론 강도 **medium**(팝업 1개 신규, DD 라우트 수정). R259가 먼저 들어가 있어야 한다.

R259는 점수로 후보를 **추천**한다. 이번에는 사람이 **직접 찾아 들어가** 연결한다. DD MASTER 옵션 행 하나를 고르고, DEVELOPMENT REQUEST를 보드 → 스타일 → 옵션 폴더로 펼쳐 내려가 옵션 하나를 골라 잇는다.

요청 데이터가 이미 3단 폴더 구조다. 새 구조를 만들지 않는다.

| 단 | 무엇 | 출처 |
|---|---|---|
| 1 | 보드 | `RequestBoard`(`requestBoards`). `status`가 진행·종결 |
| 2 | 스타일 | `RequestStyle`. `boardId`로 보드에 속한다. 표기는 Garment No. · #seq · Brand |
| 3 | 옵션 | `RequestOption`. 연결 키는 `lineId` |

`boardId`가 없는 이관 전 스타일은 `보드 없음(이관 전)` 폴더에 모은다.

## 하지 말 것

- 연결 쓰기를 새로 만들지 마라. 기존 `confirmRequestLink(style, pairs, fillEmpty)`에 짝 하나만 넘긴다. 스냅샷·되돌리기·알림이 그 함수 안에 있다.
- `defaultLinkPairs`, `applyRequestLinks`, `ensureRequestLineIds`를 고치지 마라.
- 연결 키는 `RequestOption.lineId`다. `optId`는 화면에서 옵션을 가리키는 데만 쓴다(짝 배열이 `optId`를 받고 `applyRequestLinks`가 `lineId`로 바꿔 저장한다).
- 기존 `RequestPickerDialog`와 `RequestLinkHelperDialog`를 고치지 마라. 새 팝업을 따로 만든다. 세 경로는 목적이 다르다(도우미=일괄, 피커=스타일 단위 짝, 이번 것=한 행 직접 찾기).
- `DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라(tailwind-merge가 `fixed`를 지워 팝업이 떨어진다).
- `src/routes/FabricRequest.tsx`는 열지 마라.

## A. 신규 파일 `src/components/dd/RequestBrowseDialog.tsx`

통째로 새로 만든다.

```tsx
import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { linkedLineIds } from "@/data/request-link"
import { MATCH_MIN_SCORE, scoreStyleForRows } from "@/data/request-link-match"
import type { DevRecord, RequestBoard, RequestOption, RequestStyle } from "@/data/schema"

interface RequestBrowseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 연결 대상 DD 행 하나. */
  row: DevRecord | null
  requests: readonly RequestStyle[]
  boards: readonly RequestBoard[]
  records: readonly DevRecord[]
  onConfirm: (style: RequestStyle, option: RequestOption, fillEmpty: boolean) => void
}

/** boardId가 없는 이관 전 스타일을 담는 가짜 폴더 키. */
const NO_BOARD = "__noboard__"
type FolderStatus = "진행" | "이관" | "종결"
const STATUS_RANK: Record<FolderStatus, number> = { 진행: 0, 이관: 1, 종결: 2 }

interface FolderStyle { style: RequestStyle; score: number; reasons: string[]; free: number }
interface FolderNode { key: string; name: string; note: string; status: FolderStatus; order: number; styles: FolderStyle[] }

const text = (value: unknown): string => String(value ?? "").trim()
const hay = (...values: unknown[]): string => values.map((value) => text(value).toLocaleLowerCase("ko-KR")).join(" ")

export function RequestBrowseDialog({ open, onOpenChange, row, requests, boards, records, onConfirm }: RequestBrowseDialogProps) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<{ reqId: string; optId: string } | null>(null)
  const [fillEmpty, setFillEmpty] = useState(false)

  // 다른 DD 행이 이미 쓰고 있는 옵션만 막는다. 이 행이 지금 쓰고 있는 옵션은 다시 고를 수 있어야 한다.
  const blocked = useMemo(() => {
    const all = linkedLineIds(records)
    const own = row?.tech?.requestLink?.lineId
    if (own) all.delete(own)
    return all
  }, [records, row])

  useEffect(() => {
    if (!open) return
    setQuery("")
    setFillEmpty(false)
    const link = row?.tech?.requestLink
    const current = link ? requests.find((style) => style.reqId === link.reqId) : undefined
    const currentOption = current?.options.find((option) => option.lineId === link?.lineId)
    // 이미 연결된 행이면 그 폴더와 스타일을 펼치고 그 옵션을 골라 둔다.
    setExpanded(new Set(current ? [current.boardId ?? NO_BOARD] : []))
    setExpandedStyles(new Set(current ? [current.reqId] : []))
    setSelected(current && currentOption ? { reqId: current.reqId, optId: currentOption.optId } : null)
  }, [open, requests, row])

  const folders = useMemo<FolderNode[]>(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR")
    const byBoard = new Map<string, FolderNode>()
    boards.forEach((board) => byBoard.set(board.boardId, {
      key: board.boardId, name: board.name || "이름 없는 보드",
      note: [board.kind, board.team].filter(Boolean).join(" · "),
      status: board.status === "종결" ? "종결" : "진행", order: board.order, styles: [],
    }))
    byBoard.set(NO_BOARD, { key: NO_BOARD, name: "보드 없음(이관 전)", note: "", status: "이관", order: 9999, styles: [] })
    requests.forEach((style) => {
      const optionHit = Boolean(needle) && style.options.some((option) => hay(option.yarnDetail, option.color, option.dyeingMethod, option.remark).includes(needle))
      if (needle && !optionHit && !hay(style.garmentNo, style.brand, style.chart, style.developer, style.requester).includes(needle)) return
      const match = scoreStyleForRows(style, row?.styleNo ?? "", row ? [row] : [], blocked)
      const folder = byBoard.get(style.boardId ?? NO_BOARD) ?? byBoard.get(NO_BOARD)!
      folder.styles.push({ style, score: match.score, reasons: match.reasons, free: match.unlinked })
    })
    return [...byBoard.values()]
      .filter((folder) => folder.styles.length)
      .map((folder) => ({
        ...folder,
        styles: [...folder.styles].sort((a, b) => a.style.seq - b.style.seq
          || a.style.garmentNo.localeCompare(b.style.garmentNo, "en", { numeric: true })),
      }))
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.order - b.order || a.name.localeCompare(b.name, "ko-KR"))
  }, [blocked, boards, query, requests, row])

  const top = useMemo(() => folders.flatMap((folder) => folder.styles)
    .filter((item) => item.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5), [folders])

  const searching = Boolean(query.trim())
  const folderOpen = (key: string) => searching || expanded.has(key)
  const styleOpen = (reqId: string) => searching || expandedStyles.has(reqId)
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  }
  const jumpTo = (style: RequestStyle) => {
    setExpanded((current) => new Set([...current, style.boardId ?? NO_BOARD]))
    setExpandedStyles((current) => new Set([...current, style.reqId]))
  }

  const selectedStyle = selected ? requests.find((style) => style.reqId === selected.reqId) : undefined
  const selectedOption = selectedStyle?.options.find((option) => option.optId === selected?.optId)
  const totalStyles = folders.reduce((sum, folder) => sum + folder.styles.length, 0)

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[92vw] max-w-3xl">
      <DialogHeader>
        <DialogTitle>요청 폴더에서 찾아 연결</DialogTitle>
        <DialogDescription>
          {row
            ? `${row.styleNo || "Style No. 미기재"} · Opt ${row.opt || "-"} · ${row.color || "색 미기재"} · ${row.tech?.yarnDetail || "Yarn Detail 미기재"}`
            : "연결할 DD 행이 없습니다."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-2">
        <Input className="h-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Garment No. · Brand · 차트 · 담당 · Yarn Detail · Color 검색" />
        {!searching && top.length ? <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--muted)]/40 p-2">
          <span className="text-[11px] text-[var(--muted-foreground)]">추천</span>
          {top.map((item) => <button key={item.style.reqId} type="button" className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] hover:bg-[var(--accent)]" onClick={() => jumpTo(item.style)}>
            <strong className="font-medium">{item.style.garmentNo || "Garment No. 미기재"}</strong>
            <span className="tabular-nums text-[var(--muted-foreground)]">{item.score}</span>
          </button>)}
        </div> : null}
        <div className="max-h-[56vh] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)]">
          {folders.map((folder) => <div key={folder.key} className="border-b border-[var(--border)]/60 last:border-b-0">
            <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--muted)]/50" onClick={() => setExpanded((current) => toggle(current, folder.key))}>
              {folderOpen(folder.key) ? <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" /> : <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />}
              {folderOpen(folder.key) ? <FolderOpen className="size-4 shrink-0 text-[var(--muted-foreground)]" /> : <Folder className="size-4 shrink-0 text-[var(--muted-foreground)]" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{folder.name}</span>{folder.note ? <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{folder.note}</span> : null}</span>
              {folder.status !== "진행" ? <Badge variant="outline" className="shrink-0 text-[10px]">{folder.status}</Badge> : null}
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">스타일 {folder.styles.length}</span>
            </button>
            {folderOpen(folder.key) ? <div className="pl-6">
              {folder.styles.map(({ style, score, reasons, free }) => <div key={style.reqId} className="border-t border-[var(--border)]/50">
                <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--muted)]/50" onClick={() => setExpandedStyles((current) => toggle(current, style.reqId))}>
                  {styleOpen(style.reqId) ? <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" /> : <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />}
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><strong className="truncate text-[13px] font-medium">{style.garmentNo || "Garment No. 미기재"}</strong>{score >= MATCH_MIN_SCORE ? <Badge variant="outline" className="shrink-0 tabular-nums text-[10px]">{score}점</Badge> : null}</span><span className="block truncate text-[11px] text-[var(--muted-foreground)]">#{style.seq} · {style.brand || "Brand 미기재"} · 개발 {style.developer || "미지정"}{reasons.length ? ` · ${reasons.slice(0, 2).join(" · ")}` : ""}</span></span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">빈 옵션 {free}/{style.options.length}</span>
                </button>
                {styleOpen(style.reqId) ? <ul className="pb-1 pl-8 pr-2">
                  {style.options.map((option) => {
                    const isBlocked = Boolean(option.lineId && blocked.has(option.lineId))
                    const isSelected = selected?.reqId === style.reqId && selected.optId === option.optId
                    return <li key={option.optId}>
                      <button type="button" disabled={isBlocked} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-45 ${isSelected ? "bg-[var(--accent)]" : "hover:bg-[var(--muted)]/60"}`} onClick={() => setSelected({ reqId: style.reqId, optId: option.optId })}>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[12px]">Opt {option.no} · {option.color || "색 미기재"} · {option.dyeingMethod || "염색 미기재"}</span><span className="block truncate text-[11px] text-[var(--muted-foreground)]">{option.yarnDetail || "Yarn Detail 미기재"}{option.construction ? ` · ${option.construction}` : ""}{option.weight === "" || option.weight == null ? "" : ` · ${option.weight}g`}</span></span>
                        {isBlocked ? <Badge variant="outline" className="shrink-0 text-[10px]">다른 행 연결됨</Badge> : null}
                      </button>
                    </li>
                  })}
                </ul> : null}
              </div>)}
            </div> : null}
          </div>)}
          {!folders.length ? <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{searching ? "검색에 맞는 요청이 없습니다." : "요청 스타일이 없습니다."}</p> : null}
        </div>
        <label className="flex items-start gap-2 text-xs"><Checkbox checked={fillEmpty} onCheckedChange={(checked) => setFillEmpty(checked === true)} /><span>비어 있는 칸만 요청 값으로 채우기(Buyer·Planner·Color·Dyeing·Remark·Yarn Detail)</span></label>
      </DialogBody>
      <DialogFooter className="justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">
          {selectedStyle && selectedOption
            ? `선택: ${selectedStyle.garmentNo || "Garment No. 미기재"} · Opt ${selectedOption.no}`
            : `스타일 ${totalStyles}개`}
        </span>
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button type="button" size="sm" disabled={!row || !selectedStyle || !selectedOption} onClick={() => { if (selectedStyle && selectedOption) onConfirm(selectedStyle, selectedOption, fillEmpty) }}>이 옵션에 연결</Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
```

## B. `src/routes/DevelopmentMasterSheet.tsx`

### B-1. import

`import { RequestPickerDialog } from "@/components/dd/RequestPickerDialog"`(11행) 다음 줄에 더한다.

```tsx
import { RequestBrowseDialog } from "@/components/dd/RequestBrowseDialog"
```

`lucide-react` import 목록에 `FolderTree`를 알파벳 자리에 더한다.

`RequestOption` 타입이 이 파일에 아직 없으면 `@/data/schema` 타입 import 목록에 `type RequestOption`을 더한다.

### B-2. 보드 목록과 상태

986행 `const requests = useAppStore((state) => state.requests)` 다음 줄에 더한다.

```tsx
  const requestBoards = useAppStore((state) => state.requestBoards)
```

`const blockedRequestLineIds = useMemo(...)` 앞에 상태를 더한다.

```tsx
  const [browseRow, setBrowseRow] = useState<DevRecord | null>(null)  // 요청 폴더 찾기 대상 행
```

### B-3. 여는 함수와 확정 함수

`confirmRequestLink` 함수 정의 **다음**에 두 함수를 더한다.

```tsx
  /** 폴더 찾기는 DD 행 하나를 요청 옵션 하나에 잇는다. 여러 행을 한 번에 다루는 길은 기존 피커와 도우미다. */
  const openRequestBrowse = () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const rows = selectedRows()
    if (rows.length !== 1) { notify("행 하나만 선택한 뒤 다시 누르세요."); return }
    setBrowseRow(rows[0])
  }
  const confirmRequestBrowse = async (style: RequestStyle, option: RequestOption, fillEmpty: boolean) => {
    const target = browseRow
    if (!target) return
    setBrowseRow(null)
    await confirmRequestLink(style, [{ rowId: recordIdentity(target), optId: option.optId }], fillEmpty)
  }
```

### B-4. 우클릭 메뉴 항목

2935행 `DEVELOPMENT REQUEST 연결…` 버튼 **다음**에 같은 모양으로 한 줄 더한다.

```tsx
          <button type="button" role="menuitem" disabled={!editEnabled} title={!editEnabled ? EDIT_DISABLED_MESSAGE : undefined} onClick={() => { setMenu(null); openRequestBrowse() }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"><span className="text-[var(--muted-foreground)]"><FolderTree className="size-3.5" /></span><span className="flex-1">요청 폴더에서 찾아 연결…</span><span className="text-[11px] text-[var(--muted-foreground)]">행 1개</span></button>
```

### B-5. 팝업 렌더

3140행 `<RequestPickerDialog ... mode="link" ... />` 다음 줄에 더한다.

```tsx
    <RequestBrowseDialog open={Boolean(browseRow)} onOpenChange={(open) => { if (!open) setBrowseRow(null) }} row={browseRow} requests={requests} boards={requestBoards} records={records} onConfirm={(style, option, fillEmpty) => void confirmRequestBrowse(style, option, fillEmpty)} />
```

## 동작 정리

1. DD MASTER에서 옵션 행 하나를 고른다.
2. 우클릭 → `요청 폴더에서 찾아 연결…`.
3. 보드를 펼치고 스타일을 펼쳐 옵션을 고른다. 검색을 치면 전부 펼쳐지고 맞는 것만 남는다.
4. 이미 연결된 행이면 열 때 그 폴더와 옵션이 펼쳐진 채 선택돼 있다. 옮겨 붙일 때 바로 보인다.
5. 다른 DD 행이 쓰는 옵션은 `다른 행 연결됨`으로 눌리지 않는다.
6. `이 옵션에 연결`을 누르면 기존 `confirmRequestLink`가 저장한다. Ctrl+Z로 되돌린다.

점수 배지와 상단 추천 칩은 폴더를 뒤질 때 길잡이다. 순서는 사람이 아는 순서(보드 → seq)로 두고, 점수로 목록을 다시 세우지 않는다.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/components/dd/RequestBrowseDialog.tsx` | 신규 (A) |
| `src/routes/DevelopmentMasterSheet.tsx` | B-1~B-5 |

다른 파일은 열지 않는다.

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. `git status --short`에 위 두 파일과 이 문서, 그리고 앞 작업(R258·R259)의 변경 파일이 나온다. **앞 작업 변경을 되돌리지 마라.**

화면 확인은 사용자가 한다.
