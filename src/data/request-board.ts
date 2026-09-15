import type { RequestArchive, RequestBoard, RequestBoardEvent, RequestBoardKind, RequestOption, RequestResult, RequestStyle } from "./schema"
import type { ProcessStage } from "./request-process-stage"

export interface BoardActor { email: string; name: string }

export const UNSORTED_BOARD_NAME = "미분류"
export const ALL_BOARDS = "__all"
export const ARCHIVE_VIEW = "__archive"

export function nextBoardSeq(requests: readonly RequestStyle[], boardId: string): number {
  return requests.reduce((max, request) => request.boardId === boardId ? Math.max(max, request.seq) : max, 0) + 1
}

export function boardKindColor(kind: RequestBoardKind): string {
  if (kind === "시즌 개발") return "var(--chart-1)"
  if (kind === "바이어 미팅") return "var(--chart-3)"
  if (kind === "소재 시리즈") return "var(--chart-2)"
  return "var(--muted-foreground)"
}

export function resultOf(style: RequestStyle): RequestResult {
  return style.result ?? "진행중"
}

export function unresolvedStyles(styles: readonly RequestStyle[]): RequestStyle[] {
  return styles.filter((style) => resultOf(style) === "진행중")
}

export function closeBoard(boards: readonly RequestBoard[], boardId: string, actor: BoardActor, memo: string, now = new Date().toISOString()): RequestBoard[] {
  return boards.map((board) => board.boardId === boardId ? { ...board, status: "종결", closedAt: now, closedBy: actor.email, closedByName: actor.name, updatedAt: now, history: [...board.history, boardEvent(actor, "close", { to: memo.trim() || undefined }, now)] } : board)
}

export function reopenBoard(boards: readonly RequestBoard[], boardId: string, actor: BoardActor, now = new Date().toISOString()): RequestBoard[] {
  const order = boards.filter((board) => board.status === "진행").reduce((max, board) => Math.max(max, board.order), 0) + 1
  return boards.map((board) => board.boardId === boardId ? { ...board, status: "진행", closedAt: undefined, closedBy: undefined, closedByName: undefined, order, updatedAt: now, history: [...board.history, boardEvent(actor, "reopen", {}, now)] } : board)
}

export function buildBoardArchive(board: RequestBoard, styles: readonly RequestStyle[], stageOf: (option: RequestOption) => ProcessStage, flNoOf: (option: RequestOption) => string | undefined): RequestArchive {
  const copiedStyles = JSON.parse(JSON.stringify(styles)) as RequestStyle[]
  return {
    archiveId: `${board.boardId}@${board.closedAt}`,
    boardId: board.boardId,
    board: JSON.parse(JSON.stringify(board)) as RequestBoard,
    styles: copiedStyles,
    stages: copiedStyles.flatMap((style) => style.options.map((option) => {
      const stage = stageOf(option)
      return { reqId: style.reqId, optId: option.optId, lineId: option.lineId, linked: stage.linked, label: stage.halted ?? stage.label, stepKey: stage.linked && !stage.halted ? stage.steps[stage.currentIndex]?.key : undefined, halted: stage.halted, currentIndex: stage.currentIndex, total: stage.steps.length, flNo: flNoOf(option) }
    })),
    closedAt: board.closedAt ?? "",
    closedBy: board.closedBy ?? "",
    closedByName: board.closedByName ?? "",
  }
}

/** 받침이 있으면 "으로", 없거나 ㄹ 받침이거나 한글이 아니면 "로". */
const withRo = (word: string): string => {
  const code = word.trim().charCodeAt(word.trim().length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}로`
  const final = code % 28
  return final === 0 || final === 8 ? `${word}로` : `${word}으로`
}

export function actionText(event: RequestBoardEvent, styleName: (reqId: string) => string): string {
  const found = styleName(event.target ?? "")
  // 이력의 from, to에는 옮긴 보드 이름이나 결과 값이 들어 있다. 스타일 이름 대신 쓰면 안 된다.
  // 옮기지 않은 추가와 빼기만 garmentNo를 to, from에 담아 두므로 그때만 이름으로 쓴다.
  const addName = found || (!event.from ? event.to : "") || "스타일"
  const removeName = found || (!event.to ? event.from : "") || "스타일"
  if (event.action === "create") return "보드를 만듦"
  if (event.action === "close") return `보드 종결${event.to ? `, 메모 ${event.to}` : ""}`
  if (event.action === "reopen") return "보드 다시 엶"
  if (event.action === "add") return `${addName} 추가${event.from ? ` (${event.from}에서 옮겨 옴)` : ""}`
  if (event.action === "remove") return `${removeName} 뺌${event.to ? ` (${withRo(event.to)} 옮김)` : ""}`
  if (event.action === "result") return `${found || "스타일"} 결과 ${event.from ?? ""}에서 ${withRo(event.to ?? "")}`
  const names: Record<string, string> = { name: "이름", kind: "종류", team: "소팀", note: "메모", createdBy: "담당 이메일", createdByName: "담당 이름" }
  return `${names[event.target ?? ""] ?? event.target ?? "정보"} 수정: ${event.from ?? ""}에서 ${withRo(event.to ?? "")}`
}

export function legacyBoardId(chart: string): string {
  return `legacy:${chart.trim() || UNSORTED_BOARD_NAME}`
}

export function boardEvent(
  actor: BoardActor,
  action: RequestBoardEvent["action"],
  fields: Partial<Pick<RequestBoardEvent, "target" | "from" | "to">> = {},
  now = new Date().toISOString(),
): RequestBoardEvent {
  return { at: now, by: actor.email, name: actor.name, action, ...fields }
}

export function migrateChartsToBoards(
  requests: readonly RequestStyle[],
  boards: readonly RequestBoard[],
  actor: BoardActor,
  now = new Date().toISOString(),
): { requests: RequestStyle[]; boards: RequestBoard[]; changed: boolean } {
  const targets = requests.filter((request) => !request.boardId)
  if (targets.length === 0) return { requests: requests as RequestStyle[], boards: boards as RequestBoard[], changed: false }

  const boardIds = new Set(boards.map((board) => board.boardId))
  const groups = new Map<string, { name: string; createdAt: string[] }>()
  targets.forEach((request) => {
    const name = request.chart.trim() || UNSORTED_BOARD_NAME
    const boardId = legacyBoardId(request.chart)
    if (boardIds.has(boardId)) return
    const group = groups.get(boardId) ?? { name, createdAt: [] }
    if (request.createdAt) group.createdAt.push(request.createdAt)
    groups.set(boardId, group)
  })

  let order = boards.reduce((max, board) => Math.max(max, board.order), 0)
  const createdBoards = [...groups.entries()]
    .sort(([, left], [, right]) => left.name.localeCompare(right.name, "ko-KR", { numeric: true }))
    .map(([boardId, group]): RequestBoard => ({
      boardId,
      name: group.name,
      kind: group.name === UNSORTED_BOARD_NAME ? "기타" : "시즌 개발",
      team: "",
      note: "",
      status: "진행",
      order: ++order,
      createdAt: group.createdAt.sort()[0] ?? now,
      createdBy: "이관",
      createdByName: "이관",
      updatedAt: now,
      history: [boardEvent(actor, "create", { to: group.name }, now)],
    }))

  return {
    requests: requests.map((request) => request.boardId ? request : { ...request, boardId: legacyBoardId(request.chart) }),
    boards: createdBoards.length ? [...boards, ...createdBoards] : boards as RequestBoard[],
    changed: true,
  }
}

export function canManageBoard(
  board: RequestBoard,
  email: string | null | undefined,
  isOwner: boolean,
): boolean {
  return isOwner || board.createdBy === email
}

export function canDeleteBoard(
  board: RequestBoard,
  requests: readonly RequestStyle[],
  isOwner: boolean,
): boolean {
  return isOwner && !requests.some((request) => request.boardId === board.boardId)
}

export function appendRequestHistory(
  before: readonly RequestStyle[], after: readonly RequestStyle[], boards: readonly RequestBoard[], actor: BoardActor,
  now = new Date().toISOString(),
): { boards: RequestBoard[]; changed: boolean } {
  const beforeById = new Map(before.map((style) => [style.reqId, style]))
  const afterById = new Map(after.map((style) => [style.reqId, style]))
  const events = new Map<string, RequestBoardEvent[]>()
  const names = new Map(boards.map((board) => [board.boardId, board.name]))
  const add = (boardId: string | undefined, event: RequestBoardEvent) => {
    if (!boardId || !names.has(boardId)) return
    events.set(boardId, [...(events.get(boardId) ?? []), event])
  }
  new Set([...beforeById.keys(), ...afterById.keys()]).forEach((reqId) => {
    const oldStyle = beforeById.get(reqId), newStyle = afterById.get(reqId)
    if (!oldStyle && newStyle) add(newStyle.boardId, boardEvent(actor, "add", { target: reqId, to: newStyle.garmentNo }, now))
    else if (oldStyle && !newStyle) add(oldStyle.boardId, boardEvent(actor, "remove", { target: reqId, from: oldStyle.garmentNo }, now))
    else if (oldStyle && newStyle) {
      if (oldStyle.boardId !== newStyle.boardId) {
        add(oldStyle.boardId, boardEvent(actor, "remove", { target: reqId, to: names.get(newStyle.boardId ?? "") ?? "" }, now))
        add(newStyle.boardId, boardEvent(actor, "add", { target: reqId, from: names.get(oldStyle.boardId ?? "") ?? "" }, now))
      }
      if (resultOf(oldStyle) !== resultOf(newStyle)) add(newStyle.boardId, boardEvent(actor, "result", { target: reqId, from: resultOf(oldStyle), to: resultOf(newStyle) }, now))
    }
  })
  if (!events.size) return { boards: boards as RequestBoard[], changed: false }
  return { boards: boards.map((board) => events.has(board.boardId) ? { ...board, updatedAt: now, history: [...board.history, ...events.get(board.boardId)!] } : board), changed: true }
}
