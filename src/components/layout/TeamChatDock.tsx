import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MessageCircle, Send, X } from "lucide-react"
import { useLocation } from "react-router-dom"

import { useAuthStore } from "@/data/auth"
import {
  chatCreatedAtMillis,
  chatLastReadAt,
  markChatRead,
  sendMetaChat,
  subscribeMetaChat,
  unreadChatCount,
  type MetaChatMessage,
} from "@/data/meta-chat"

type ChatTarget = { uid: string; name: string }

const COLORS = ["#4f46e5", "#0f766e", "#b45309", "#be123c", "#0369a1", "#7e22ce"]

function userColor(uid: string): string {
  let hash = 0
  for (let index = 0; index < uid.length; index += 1) hash = (hash * 31 + uid.charCodeAt(index)) >>> 0
  return COLORS[hash % COLORS.length]
}

function messageTime(value: unknown): string {
  const millis = chatCreatedAtMillis(value)
  if (millis === null) return ""
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(millis)
}

export function TeamChatDock() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const approval = useAuthStore((state) => state.approval)
  const isOwner = useAuthStore((state) => state.isOwner)
  const allowed = Boolean(user && (approval === "approved" || isOwner))
  const uid = user?.uid ?? ""
  const name = user?.displayName?.trim() || "팀원"
  const color = userColor(uid)
  const [messages, setMessages] = useState<MetaChatMessage[]>([])
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<ChatTarget | null>(null)
  const [draft, setDraft] = useState("")
  const [sendError, setSendError] = useState(false)
  const [sending, setSending] = useState(false)
  const [readAt, setReadAt] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!allowed || !uid) return
    setReadAt(chatLastReadAt(uid))
    return subscribeMetaChat(setMessages)
  }, [allowed, uid])

  useEffect(() => {
    if (!allowed) return
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<ChatTarget>).detail
      if (!detail?.uid || !detail.name || detail.uid === uid) return
      setTarget({ uid: detail.uid, name: detail.name })
      setOpen(true)
      setSendError(false)
    }
    window.addEventListener("fabric:chat-open", handleOpen)
    return () => window.removeEventListener("fabric:chat-open", handleOpen)
  }, [allowed, uid])

  const markRead = useCallback(() => {
    if (!uid) return
    const at = Date.now()
    markChatRead(uid, at)
    setReadAt(at)
  }, [uid])

  useEffect(() => {
    if (!open || !allowed) return
    markRead()
  }, [allowed, messages, open, markRead])

  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, open])

  const unread = useMemo(() => {
    void readAt
    return uid ? unreadChatCount(messages, uid) : 0
  }, [messages, readAt, uid])
  const hasDirectUnread = useMemo(() => {
    const since = chatLastReadAt(uid)
    return messages.some((message) => message.uid !== uid && message.to === uid && (chatCreatedAtMillis(message.createdAt) ?? 0) > since)
  }, [messages, readAt, uid])

  const handleSend = useCallback(async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    setSendError(false)
    const sent = await sendMetaChat(draft, "", name, color, target ?? undefined)
    setSending(false)
    if (sent) setDraft("")
    else setSendError(true)
  }, [color, draft, name, sending, target])

  if (!allowed) return null
  // META 화면은 오른쪽 패널에 자체 채팅을 들고 있다. 떠 있는 창까지 띄우면 둘이 겹친다.
  // 이 줄은 반드시 `if (!open)` 바깥이어야 한다. 안에 두면 닫힌 단추만 숨고 열린 창은 그대로 겹친다.
  if (location.pathname === "/meta") return null
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`팀 채팅 열기${unread > 0 ? `, 읽지 않은 메시지 ${unread}개` : ""}`}
        className="fixed bottom-4 right-4 z-[80] flex size-12 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg outline-none hover:brightness-105 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
      >
        <MessageCircle className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className={`absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-5 text-white ${hasDirectUnread ? "bg-[var(--destructive)]" : "bg-slate-600"}`}>
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <section className="fixed bottom-4 right-4 z-[80] flex h-[420px] max-h-[calc(100vh-32px)] w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--card)] shadow-2xl" aria-label="팀 채팅">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-[var(--primary)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold">팀 채팅</h2>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="팀 채팅 닫기" className="flex size-8 items-center justify-center rounded-[8px] outline-none hover:bg-[var(--muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">아직 대화가 없습니다</p>
        ) : messages.map((message) => {
          const forMe = message.to === uid
          return (
            <div key={message.id} className={`flex gap-2 rounded-r-[8px] py-1 pr-1 ${forMe ? "border-l-2 border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] pl-2" : "pl-1"}`}>
              <span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: message.color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
                  <strong className="truncate font-medium">{message.name}</strong>
                  {forMe ? <span className="shrink-0 rounded-full bg-[var(--primary)]/10 px-1.5 py-0.5 font-semibold text-[var(--primary)]">나에게</span> : null}
                  <time className="ml-auto shrink-0 text-[var(--muted-foreground)]">{messageTime(message.createdAt)}</time>
                </div>
                <p className="mt-0.5 break-words text-xs leading-5">{message.text}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        {target ? (
          <div className="mb-2 flex">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--muted)] py-1 pl-2.5 pr-1 text-xs">
              <span className="truncate">→ {target.name}</span>
              <button type="button" onClick={() => setTarget(null)} aria-label="받는 사람 지우기" className="flex size-5 shrink-0 items-center justify-center rounded-full outline-none hover:bg-[var(--card)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setSendError(false) }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return
              event.preventDefault()
              void handleSend()
            }}
            maxLength={200}
            placeholder={target ? `${target.name} 님에게 보내기` : "메시지 입력"}
            className="h-9 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
          />
          <button type="button" onClick={() => { void handleSend() }} disabled={!draft.trim() || sending} aria-label="보내기" className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--primary)] text-[var(--primary-foreground)] outline-none disabled:opacity-40 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
            <Send className="size-4" aria-hidden="true" />
          </button>
        </div>
        {sendError ? <p className="mt-1.5 text-xs text-[var(--destructive)]">보내지 못했습니다</p> : null}
      </div>
    </section>
  )
}
