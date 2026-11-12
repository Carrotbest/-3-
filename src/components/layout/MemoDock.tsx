import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Check, Pencil, Plus, Save, StickyNote, Trash2, X } from "lucide-react"
import { useLocation } from "react-router-dom"

import { useAuthStore } from "@/data/auth"
import {
  MEMO_COLORS,
  MEMO_DAYS,
  MEMO_SIZES,
  MEMO_TEXT_MAX,
  REPLY_PER_MEMO,
  REPLY_TEXT_MAX,
  addReply,
  createMemo,
  deleteMemo,
  deleteReply,
  hiddenMemoIds,
  markMemoRead,
  memoCreatedAtMillis,
  memoIsActive,
  memoLastReadAt,
  repliesOf,
  setMemoHidden,
  subscribeMemoReplies,
  subscribeScreenMemos,
  updateMemo,
  type MemoColor,
  type MemoReply,
  type MemoSize,
  type ScreenMemo,
} from "@/data/screen-memo"

function dateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function expiryKey(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

function displayName(user: { displayName: string | null; email: string | null }): string {
  return user.displayName?.trim() || user.email?.split("@")[0] || "팀원"
}

const saveErrorText = (code: string) =>
  code === "permission-denied"
    ? "저장 권한이 없습니다. Firestore 규칙 배포와 3팀 권한을 확인하세요."
    : `저장하지 못했습니다 (${code})`

interface MemoCardProps {
  memo: ScreenMemo
  replies: MemoReply[]
  viewport: { w: number; h: number }
  currentUid: string
  currentName: string
  isOwner: boolean
  hidden: boolean
  unread: boolean
  onRead: () => void
  onClose: () => void
  onHiddenChange: (hidden: boolean) => void
  onPosition: (x: number, y: number) => void
}

function MemoCard({ memo, replies, viewport, currentUid, currentName, isOwner, hidden, unread, onRead, onClose, onHiddenChange, onPosition }: MemoCardProps) {
  const own = memo.uid === currentUid
  const size = MEMO_SIZES[memo.size]
  const colors = MEMO_COLORS[memo.color]
  const [position, setPosition] = useState({ x: memo.x, y: memo.y })
  const [expanded, setExpanded] = useState(false)
  const [reply, setReply] = useState("")
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(memo.text)
  const [editColor, setEditColor] = useState<MemoColor>(memo.color)
  const [editSize, setEditSize] = useState<MemoSize>(memo.size)
  const [editExpiry, setEditExpiry] = useState(memo.expiresAt)
  const [editPinned, setEditPinned] = useState(memo.pinned)
  const [error, setError] = useState("")
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)

  useEffect(() => setPosition({ x: memo.x, y: memo.y }), [memo.x, memo.y])
  useEffect(() => {
    const newest = replies.reduce((latest, item) => Math.max(latest, memoCreatedAtMillis(item.createdAt) ?? 0), 0)
    if (newest) {
      markMemoRead(memo.id, newest)
      onRead()
    }
  }, [memo.id, onRead, replies])

  const activeSize = editing ? MEMO_SIZES[editSize] : size
  const maxLeft = Math.max(viewport.w - activeSize.w, 0)
  const maxTop = Math.max(viewport.h - activeSize.h, 0)
  const left = Math.min(Math.max(position.x, 0), 1) * maxLeft
  const top = Math.min(Math.max(position.y, 0), 1) * maxTop
  const shownReplies = (expanded ? replies : replies.slice(0, 2)).slice().reverse()

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!own || editing) return
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: position.x, y: position.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setPosition({
      x: maxLeft > 0 ? Math.min(Math.max((drag.x * maxLeft + event.clientX - drag.startX) / maxLeft, 0), 1) : 0,
      y: maxTop > 0 ? Math.min(Math.max((drag.y * maxTop + event.clientY - drag.startY) / maxTop, 0), 1) : 0,
    })
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    onPosition(position.x, position.y)
  }

  const submitReply = async () => {
    if (replies.length >= REPLY_PER_MEMO) return
    const code = await addReply(memo.id, reply, currentName)
    if (code) setError(saveErrorText(code))
    else {
      setError("")
      setReply("")
    }
  }

  const saveEdit = async () => {
    const code = await updateMemo(memo.id, {
      text: editText,
      color: editColor,
      size: editSize,
      expiresAt: editExpiry,
      pinned: editPinned,
    })
    if (code) setError(saveErrorText(code))
    else {
      setError("")
      setEditing(false)
    }
  }

  const removeMemo = async () => {
    const code = await deleteMemo(memo.id)
    if (code) setError(saveErrorText(code))
    else setError("")
  }

  const removeReply = async (id: string) => {
    const code = await deleteReply(id)
    if (code) setError(saveErrorText(code))
    else setError("")
  }

  return (
    <section
      className="fixed z-40 flex flex-col overflow-hidden rounded-sm border shadow-xl"
      style={{ left, top, width: activeSize.w, height: activeSize.h, background: colors.bg, borderColor: colors.edge, color: colors.ink }}
    >
      <div
        className={`flex shrink-0 items-center gap-1 border-b px-2 py-1 text-xs ${own && !editing ? "cursor-move touch-none" : ""}`}
        style={{ borderColor: colors.edge }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <strong className="min-w-0 flex-1 truncate">{memo.name}</strong>
        {unread ? <span className="size-2 rounded-full bg-red-600" title="새 답글" /> : null}
        <span>~{memo.expiresAt.slice(5).replace("-", "/")}</span>
        {own ? (
          <button type="button" className="rounded p-0.5 hover:bg-black/10" onPointerDown={(event) => event.stopPropagation()} onClick={() => setEditing((value) => !value)} aria-label="메모 고치기">
            <Pencil className="size-3.5" />
          </button>
        ) : null}
        {own || isOwner ? (
          <button type="button" className="rounded p-0.5 hover:bg-black/10" onPointerDown={(event) => event.stopPropagation()} onClick={() => void removeMemo()} aria-label="메모 지우기">
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
        <button type="button" className="rounded p-0.5 hover:bg-black/10" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} aria-label="메모 닫기">
          <X className="size-4" />
        </button>
      </div>

      {error ? <p className="shrink-0 px-2 py-1 text-[11px] font-medium text-red-700">{error}</p> : null}

      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2 text-xs">
          <textarea className="min-h-0 flex-1 resize-none rounded border border-black/20 bg-white/55 p-1.5 outline-none" maxLength={MEMO_TEXT_MAX} value={editText} onChange={(event) => setEditText(event.target.value)} />
          <div className="flex flex-wrap items-center gap-1">
            {(Object.keys(MEMO_COLORS) as MemoColor[]).map((color) => <button key={color} type="button" className={`size-5 rounded-full border ${editColor === color ? "ring-2 ring-black/50" : ""}`} style={{ background: MEMO_COLORS[color].bg }} onClick={() => setEditColor(color)} aria-label={`${color} 색`} />)}
            {(Object.keys(MEMO_SIZES) as MemoSize[]).map((entry) => <button key={entry} type="button" className={`rounded border border-black/20 px-1.5 py-0.5 ${editSize === entry ? "bg-black/15" : ""}`} onClick={() => setEditSize(entry)}>{entry.toUpperCase()}</button>)}
          </div>
          <div className="flex items-center gap-1">
            <input type="date" className="min-w-0 flex-1 rounded border border-black/20 bg-white/55 px-1 py-0.5" value={editExpiry} onChange={(event) => setEditExpiry(event.target.value)} />
            <label className="flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={editPinned} onChange={(event) => setEditPinned(event.target.checked)} /> 중요</label>
            <button type="button" className="rounded bg-black/15 p-1" onClick={() => void saveEdit()} aria-label="저장"><Save className="size-3.5" /></button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 py-2 text-sm leading-5 select-text">{memo.text}</div>
          <div className={`shrink-0 border-t px-2 py-1 text-[11px] ${expanded ? "max-h-24 overflow-y-auto" : ""}`} style={{ borderColor: colors.edge }}>
            {shownReplies.map((item) => (
              <div key={item.id} className="group flex gap-1 py-0.5">
                <strong className="shrink-0">{item.name}</strong>
                <span className="min-w-0 flex-1 break-words">{item.text}</span>
                {(item.uid === currentUid || isOwner) ? <button type="button" className="invisible group-hover:visible" onClick={() => void removeReply(item.id)} aria-label="답글 지우기"><X className="size-3" /></button> : null}
              </div>
            ))}
            {replies.length > 2 ? <button type="button" className="mt-0.5 underline" onClick={() => setExpanded((value) => !value)}>{expanded ? "답글 접기" : `답글 ${replies.length - 2}개 더 보기`}</button> : null}
          </div>
          <div className="flex shrink-0 gap-1 border-t px-2 py-1" style={{ borderColor: colors.edge }}>
            <input className="min-w-0 flex-1 rounded border border-black/15 bg-white/55 px-1.5 py-1 text-xs outline-none" maxLength={REPLY_TEXT_MAX} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void submitReply() }} disabled={replies.length >= REPLY_PER_MEMO} placeholder={replies.length >= REPLY_PER_MEMO ? "답글 50개 제한" : "답글"} />
            <button type="button" className="rounded bg-black/10 px-1.5 text-xs" onClick={() => void submitReply()} disabled={replies.length >= REPLY_PER_MEMO}>등록</button>
          </div>
          <label className="flex shrink-0 items-center gap-1 px-2 py-1 text-[11px]"><input type="checkbox" checked={hidden} onChange={(event) => onHiddenChange(event.target.checked)} /> 이 메모 그만 보기</label>
        </>
      )}
    </section>
  )
}

export function MemoDock() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const isOwner = useAuthStore((state) => state.isOwner)
  const department = useAuthStore((state) => state.department)
  const allowed = Boolean(user) && (isOwner || department === "fabric3")
  const enabled = allowed && location.pathname !== "/meta"
  const [memos, setMemos] = useState<ScreenMemo[]>([])
  const [replies, setReplies] = useState<MemoReply[]>([])
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [hidden, setHidden] = useState<Record<string, true>>(() => hiddenMemoIds())
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const [newText, setNewText] = useState("")
  const [newColor, setNewColor] = useState<MemoColor>("yellow")
  const [newSize, setNewSize] = useState<MemoSize>("m")
  const [newDays, setNewDays] = useState<(typeof MEMO_DAYS)[number]>(14)
  const [newPinned, setNewPinned] = useState(false)
  const [newPosition, setNewPosition] = useState(() => ({
    x: Math.max((window.innerWidth - MEMO_SIZES.m.w) / 2, 0),
    y: Math.max((window.innerHeight - MEMO_SIZES.m.h) / 2, 0),
  }))
  const [newError, setNewError] = useState("")
  const [readVersion, setReadVersion] = useState(0)
  const newDragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const suppressed = useRef(new Set<string>())
  const lastPath = useRef(location.pathname)
  const writeState = useRef(new Map<string, { at: number; timer?: number; position?: { x: number; y: number } }>())

  useEffect(() => {
    if (!enabled) return
    const stopMemo = subscribeScreenMemos(setMemos)
    const stopReply = subscribeMemoReplies(setReplies)
    return () => { stopMemo(); stopReply() }
  }, [enabled])

  useEffect(() => {
    const resize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  const today = dateKey()
  const activeMemos = useMemo(() => memos.filter((memo) => memo.path === location.pathname && memoIsActive(memo, today)), [location.pathname, memos, today])
  const repliesByMemo = useMemo(() => new Map(activeMemos.map((memo) => [memo.id, repliesOf(replies, memo.id)])), [activeMemos, replies])
  const unreadIds = useMemo(() => new Set(activeMemos.filter((memo) => (repliesByMemo.get(memo.id) ?? []).some((reply) => (memoCreatedAtMillis(reply.createdAt) ?? 0) > memoLastReadAt(memo.id))).map((memo) => memo.id)), [activeMemos, readVersion, repliesByMemo])
  const noteRead = useCallback(() => setReadVersion((value) => value + 1), [])

  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      lastPath.current = location.pathname
      suppressed.current.clear()
      const pinned = activeMemos.filter((memo) => memo.pinned && !hidden[memo.id]).map((memo) => memo.id)
      setOpenIds(new Set(pinned))
      setPanelOpen(pinned.length > 0)
      setCreating(false)
      return
    }
    const pinned = activeMemos.filter((memo) => memo.pinned && !hidden[memo.id] && !suppressed.current.has(memo.id)).map((memo) => memo.id)
    if (pinned.length) {
      setOpenIds((current) => new Set([...current, ...pinned]))
      setPanelOpen(true)
    }
  }, [activeMemos, hidden, location.pathname])

  const toggleAll = () => {
    if (panelOpen) {
      activeMemos.forEach((memo) => suppressed.current.add(memo.id))
      setOpenIds(new Set())
      setCreating(false)
      setPanelOpen(false)
    } else {
      suppressed.current.clear()
      setOpenIds(new Set(activeMemos.map((memo) => memo.id)))
      setPanelOpen(true)
    }
  }

  const closeMemo = (id: string) => {
    suppressed.current.add(id)
    setOpenIds((current) => { const next = new Set(current); next.delete(id); return next })
  }

  const changeHidden = (id: string, value: boolean) => {
    setMemoHidden(id, value)
    setHidden(hiddenMemoIds())
    if (value) closeMemo(id)
  }

  const savePosition = useCallback((id: string, x: number, y: number) => {
    const now = Date.now()
    const state = writeState.current.get(id) ?? { at: 0 }
    state.position = { x, y }
    if (state.timer) window.clearTimeout(state.timer)
    const run = () => {
      const latest = state.position
      state.timer = undefined
      state.at = Date.now()
      if (latest) void updateMemo(id, latest)
    }
    const wait = Math.max(1500 - (now - state.at), 0)
    if (wait === 0) run()
    else state.timer = window.setTimeout(run, wait)
    writeState.current.set(id, state)
  }, [])

  const clampNewPosition = (nextX: number, nextY: number, size = MEMO_SIZES[newSize]) => ({
    x: Math.min(Math.max(nextX, 0), Math.max(window.innerWidth - size.w, 0)),
    y: Math.min(Math.max(nextY, 0), Math.max(window.innerHeight - size.h, 0)),
  })

  const openNewMemo = () => {
    const size = MEMO_SIZES[newSize]
    setNewPosition({
      x: Math.max((window.innerWidth - size.w) / 2, 0),
      y: Math.max((window.innerHeight - size.h) / 2, 0),
    })
    setNewError("")
    setCreating(true)
  }

  const startNewDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    newDragRef.current = { startX: event.clientX, startY: event.clientY, x: newPosition.x, y: newPosition.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveNewDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = newDragRef.current
    if (!drag) return
    setNewPosition(clampNewPosition(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY))
  }

  const endNewDrag = () => {
    newDragRef.current = null
  }

  const changeNewSize = (size: MemoSize) => {
    setNewSize(size)
    setNewPosition((position) => clampNewPosition(position.x, position.y, MEMO_SIZES[size]))
  }

  const saveNew = async () => {
    if (!user) return
    const size = MEMO_SIZES[newSize]
    const denomX = Math.max(window.innerWidth - size.w, 1)
    const denomY = Math.max(window.innerHeight - size.h, 1)
    const code = await createMemo({
      path: location.pathname,
      text: newText,
      color: newColor,
      size: newSize,
      x: Math.min(Math.max(newPosition.x / denomX, 0), 1),
      y: Math.min(Math.max(newPosition.y / denomY, 0), 1),
      pinned: newPinned,
      expiresAt: expiryKey(newDays),
      name: displayName(user),
    })
    if (code) setNewError(saveErrorText(code))
    else {
      setNewError("")
      setNewText("")
      setNewColor("yellow")
      setNewSize("m")
      setNewDays(14)
      setNewPinned(false)
      setCreating(false)
    }
  }

  if (!enabled || !user) return null
  const currentName = displayName(user)

  return (
    <>
      {activeMemos.filter((memo) => openIds.has(memo.id)).map((memo) => (
        <MemoCard key={memo.id} memo={memo} replies={repliesByMemo.get(memo.id) ?? []} viewport={viewport} currentUid={user.uid} currentName={currentName} isOwner={isOwner} hidden={Boolean(hidden[memo.id])} unread={unreadIds.has(memo.id)} onRead={noteRead} onClose={() => closeMemo(memo.id)} onHiddenChange={(value) => changeHidden(memo.id, value)} onPosition={(x, y) => savePosition(memo.id, x, y)} />
      ))}

      {creating ? (
        <section className="fixed z-40 flex flex-col rounded-sm border p-3 shadow-xl" style={{ left: newPosition.x, top: newPosition.y, width: MEMO_SIZES[newSize].w, height: MEMO_SIZES[newSize].h, background: MEMO_COLORS[newColor].bg, borderColor: MEMO_COLORS[newColor].edge, color: MEMO_COLORS[newColor].ink }}>
          <div className="mb-2 flex cursor-move touch-none items-center" onPointerDown={startNewDrag} onPointerMove={moveNewDrag} onPointerUp={endNewDrag} onPointerCancel={endNewDrag}><strong className="flex-1 text-sm">새 메모</strong><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setCreating(false)} aria-label="닫기"><X className="size-4" /></button></div>
          {newError ? <p className="mb-1 text-[11px] font-medium text-red-700">{newError}</p> : null}
          <textarea autoFocus className="min-h-0 flex-1 resize-none rounded border border-black/20 bg-white/55 p-2 text-sm outline-none" maxLength={MEMO_TEXT_MAX} value={newText} onChange={(event) => setNewText(event.target.value)} placeholder="메모를 입력하세요" />
          <div className="mt-2 flex items-center gap-1 text-xs">
            {(Object.keys(MEMO_COLORS) as MemoColor[]).map((color) => <button key={color} type="button" className={`size-5 rounded-full border ${newColor === color ? "ring-2 ring-black/50" : ""}`} style={{ background: MEMO_COLORS[color].bg }} onClick={() => setNewColor(color)} aria-label={`${color} 색`} />)}
            {(Object.keys(MEMO_SIZES) as MemoSize[]).map((size) => <button key={size} type="button" className={`rounded border border-black/20 px-1.5 py-0.5 ${newSize === size ? "bg-black/15" : ""}`} onClick={() => changeNewSize(size)}>{size.toUpperCase()}</button>)}
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-xs">
            <select className="rounded border border-black/20 bg-white/55 px-1 py-0.5" value={newDays} onChange={(event) => setNewDays(Number(event.target.value) as (typeof MEMO_DAYS)[number])}>{MEMO_DAYS.map((days) => <option key={days} value={days}>{days}일</option>)}</select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={newPinned} onChange={(event) => setNewPinned(event.target.checked)} /> 중요</label>
            <button type="button" className="ml-auto flex items-center gap-1 rounded bg-black/15 px-2 py-1 font-medium" onClick={() => void saveNew()}><Check className="size-3.5" /> 저장</button>
          </div>
        </section>
      ) : null}

      {panelOpen ? <button type="button" className="fixed bottom-5 right-[4.5rem] z-[80] flex h-10 items-center gap-1 rounded-full bg-[var(--card)] px-3 text-sm font-medium text-[var(--foreground)] shadow-lg ring-1 ring-[var(--border)]" onClick={openNewMemo}><Plus className="size-4" /> 메모</button> : null}
      <button type="button" className="fixed bottom-4 right-4 z-[80] flex size-12 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg outline-none hover:brightness-105 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]" onClick={toggleAll} aria-label="화면 메모 열기">
        <StickyNote className="size-5" />
        {activeMemos.length ? <span className={`absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white shadow ${unreadIds.size ? "bg-[var(--destructive)]" : "bg-slate-600"}`}>{activeMemos.length}</span> : null}
      </button>
    </>
  )
}
