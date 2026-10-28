/**
 * 분석 완료 건을 의뢰 스타일로 가져오는 확인 팝업(R352).
 *
 * 분석 화면이 `/request?fromAnalysis=<id들>`로 보내면 이 팝업이 뜬다.
 * 실제 저장은 `FabricRequest.tsx`의 `commitRequests`가 한다. 여기는 보여 주고 묻기만 한다.
 */
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AnalysisRequest } from "@/data/schema"

interface Props {
  targets: AnalysisRequest[]
  /** 고를 수 있는 진행 중 보드. 이름순이 아니라 화면 탭 순서 그대로 받는다. */
  boards: readonly { boardId: string; name: string }[]
  /** 지금 고른 보드. 아직 안 골랐으면 null이다. */
  boardId: string | null
  /** 보드를 고를 수 없는 사유(권한 없음 등). 없으면 가져올 수 있다. */
  blockedReason: string | null
  /** 새 보드 버튼을 보일지. 보드 편집 권한이 있을 때만 참이다. */
  canCreateBoard: boolean
  busy: boolean
  onSelectBoard: (boardId: string) => void
  onCreateBoard: () => void
  onConfirm: () => void
  onClose: () => void
}

export function AnalysisImportDialog({ targets, boards, boardId, blockedReason, canCreateBoard, busy, onSelectBoard, onCreateBoard, onConfirm, onClose }: Props) {
  const withPhoto = targets.filter((item) => item.imagePath).length
  return <Dialog open={targets.length > 0} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>분석 건을 개발 의뢰로 가져오기</DialogTitle>
        <DialogDescription>
          {blockedReason
            ? blockedReason
            : boardId
              ? <>고른 보드에 스타일 {targets.length}건을 만듭니다. 옵션은 빈 줄 하나로 시작하며 개발 사양은 직접 적습니다.</>
              : <>받을 보드를 고르면 스타일 {targets.length}건을 만듭니다.</>}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="mb-3 flex items-end gap-2">
          <label className="grid flex-1 gap-1 text-xs">받을 보드
            <Select value={boardId ?? ""} onValueChange={onSelectBoard}>
              <SelectTrigger><SelectValue placeholder="보드를 고르세요" /></SelectTrigger>
              <SelectContent>{boards.map((board) => <SelectItem key={board.boardId} value={board.boardId}>{board.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {canCreateBoard ? <Button type="button" variant="outline" onClick={onCreateBoard}>새 보드</Button> : null}
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--border)]/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--muted)]/60 text-[11px] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">AN No.</th>
                <th className="px-3 py-2 text-left font-medium">Source code</th>
                <th className="px-3 py-2 text-left font-medium">Brand</th>
                <th className="px-3 py-2 text-left font-medium">Construction</th>
                <th className="px-3 py-2 text-left font-medium">사진</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((item) => <tr key={item.id} className="border-t border-[var(--border)]/40">
                <td className="px-3 py-1.5 font-medium tabular-nums">{item.anNo}</td>
                <td className="px-3 py-1.5">{item.sourceCode || "-"}</td>
                <td className="px-3 py-1.5">{item.brand || "-"}</td>
                <td className="px-3 py-1.5">{item.constructionRnd || item.construction || "-"}</td>
                <td className="px-3 py-1.5 text-[var(--muted-foreground)]">{item.imagePath ? "있음" : "-"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {withPhoto > 0 && !blockedReason
          ? <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">사진 {withPhoto}건은 분석 사진을 그대로 씁니다. 의뢰 화면에서 따로 올리면 그 사진으로 바뀝니다.</p>
          : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>취소</Button>
        <Button type="button" disabled={busy || Boolean(blockedReason) || !boardId} onClick={onConfirm}>
          {busy ? "가져오는 중…" : `${targets.length}건 가져오기`}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
