import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Building2, ChevronRight, Maximize2, Send, Users } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { META_FACILITIES, META_OBJECTS } from "@/components/meta/facilities"
import { usePresencePeople } from "@/components/meta/usePresencePeople"
import { routeDefinitions } from "@/routes/route-config"
import { chatCreatedAtMillis, sendMetaChat, subscribeMetaChat, type MetaChatMessage } from "@/data/meta-chat"
import { writePresenceMood, writePresenceSpot, type PresenceMood, type PresenceSpot, type PresenceStatus } from "@/data/presence"
import { isInProgress } from "@/data/derive"
import { useAppStore } from "@/store/useAppStore"

const OfficeScene = lazy(() => import("@/components/meta/OfficeScene").then((module) => ({ default: module.OfficeScene })))

const subtitle = routeDefinitions.find((route) => route.path === "/meta")?.subtitle ?? ""

const STATUS_OPTIONS: Array<{ value: PresenceStatus; label: string }> = [
  { value: "focus", label: "집중" },
  { value: "meeting", label: "회의" },
  { value: "away", label: "자리 비움" },
  { value: "busy", label: "바쁨" },
]

const MOOD_OPTIONS: Array<{ value: PresenceMood; label: string }> = [
  { value: "good", label: "좋음" },
  { value: "normal", label: "보통" },
  { value: "tired", label: "지침" },
  { value: "stuck", label: "막힘" },
]

function agoText(seconds: number): string {
  if (seconds < 60) return "방금"
  const minutes = Math.floor(seconds / 60)
  return minutes === 1 ? "1분 전" : `${minutes}분 전`
}

function SceneFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
      가상 오피스를 불러오는 중입니다
    </div>
  )
}

export function Meta() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<PresenceStatus>("focus")
  const [mood, setMood] = useState<PresenceMood>("good")
  const [spot, setSpot] = useState<PresenceSpot | undefined>(undefined)
  const people = usePresencePeople(status, mood, spot)
  const [focusUid, setFocusUid] = useState<string | null>(null)
  const [selectedRoomPath, setSelectedRoomPath] = useState<string | null>(null)
  const [messages, setMessages] = useState<MetaChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [chatTab, setChatTab] = useState<"all" | "room">("all")
  const [objectId, setObjectId] = useState<string | null>(null)
  const chatListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => subscribeMetaChat(setMessages), [])

  useEffect(() => {
    const list = chatListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  useEffect(() => {
    void writePresenceMood(status, mood)
  }, [status, mood])

  const self = people.find((person) => person.isSelf)

  const records = useAppStore((state) => state.records)
  const requests = useAppStore((state) => state.requests)
  const events = useAppStore((state) => state.events)
  const fabricOverrides = useAppStore((state) => state.fabricOverrides)
  const rdda = useAppStore((state) => state.rdda)
  const trends = useAppStore((state) => state.trends)

  const objectCard = useMemo(() => {
    if (!objectId) return null
    const meta = META_OBJECTS.find((entry) => entry.id === objectId)
    if (!meta) return null
    const lines: Array<{ label: string; value: string }> = []

    if (objectId === "dd-wall") {
      const inProgress = records.filter(isInProgress).length
      lines.push({ label: "전체 개발 건", value: `${records.length}건` })
      lines.push({ label: "진행 중", value: `${inProgress}건` })
    } else if (objectId === "request-hanger") {
      const options = requests.reduce((sum, style) => sum + (style.options?.length ?? 0), 0)
      lines.push({ label: "의뢰 스타일", value: `${requests.length}건` })
      lines.push({ label: "옵션 줄", value: `${options}줄` })
    } else if (objectId === "warehouse-rack") {
      const stored = fabricOverrides.filter((item) => item.status === "WAREHOUSE").length
      lines.push({ label: "창고보관", value: stored > 0 ? `${stored}건` : "집계 없음" })
      lines.push({ label: "원단 기록", value: `${fabricOverrides.length}건` })
    } else if (objectId === "calendar-board") {
      const now = Date.now()
      const week = events.filter((item) => {
        const at = new Date(item.date).getTime()
        return Number.isFinite(at) && at >= now && at - now < 7 * 24 * 3600 * 1000
      })
      lines.push({ label: "전체 일정", value: `${events.length}건` })
      lines.push({ label: "이번 주", value: week.length > 0 ? `${week.length}건` : "없음" })
    } else if (objectId === "rdda-screen") {
      lines.push({ label: "RDDA 집계", value: rdda ? "불러옴" : "집계 없음" })
    } else if (objectId === "macro-ticker") {
      lines.push({ label: "수집 기사", value: trends.length > 0 ? `${trends.length}건` : "수집 전" })
    }

    return { name: meta.name, lines }
  }, [objectId, records, requests, events, fabricOverrides, rdda, trends])

  const bubbles = useMemo(() => {
    const map: Record<string, { text: string; at: number }> = {}
    messages.forEach((message) => {
      const at = chatCreatedAtMillis(message.createdAt) ?? Date.now()
      map[message.uid] = { text: message.text, at }
    })
    return map
  }, [messages])

  const visibleMessages = chatTab === "room" && selectedRoomPath
    ? messages.filter((message) => message.room === selectedRoomPath)
    : messages

  const handleSend = useCallback(() => {
    if (!self) return
    const text = draft
    setDraft("")
    void sendMetaChat(text, selectedRoomPath ?? "", self.name, self.color)
  }, [draft, self, selectedRoomPath])

  useEffect(() => {
    if (focusUid && !people.some((person) => person.uid === focusUid)) setFocusUid(null)
  }, [focusUid, people])

  const handlePick = useCallback((kind: "room" | "person" | "facility" | "spot" | "object", id: string, path?: string) => {
    if (kind === "facility" && path) {
      navigate(path)
      return
    }
    if (kind === "spot" && path) {
      const [rawX, rawZ] = id.split(",")
      const x = Number(rawX)
      const z = Number(rawZ)
      if (Number.isFinite(x) && Number.isFinite(z)) {
        setSpot({ path, x, z, at: Date.now() })
        void writePresenceSpot(path, x, z)
      }
      return
    }
    if (kind === "object") {
      setObjectId(id)
      return
    }
    if (kind === "room") {
      setSelectedRoomPath(id || null)
      setObjectId(null)
    }
    setFocusUid(kind === "person" && id ? id : null)
  }, [navigate])

  const selectedRoom = selectedRoomPath ? routeDefinitions.find((route) => route.path === selectedRoomPath) : null
  const selectedFacilities = selectedRoomPath ? META_FACILITIES.filter((facility) => facility.roomPath === selectedRoomPath) : []
  const orderedPeople = selectedRoomPath
    ? [...people].sort((left, right) => Number(right.path === selectedRoomPath) - Number(left.path === selectedRoomPath))
    : people

  return (
    <section className="-mt-1 min-w-0 space-y-3 pb-4">
      <header className="relative overflow-hidden rounded-[14px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_76%,transparent)] px-4 py-2 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:px-5">
        <span aria-hidden="true" className="absolute inset-x-7 top-0 h-px bg-white/95" />
        <span aria-hidden="true" className="absolute -right-16 -top-20 size-56 rounded-full bg-[var(--gradient-1)] opacity-[0.08] blur-3xl" />
        <span aria-hidden="true" className="absolute -bottom-24 left-1/3 size-48 rounded-full bg-[var(--gradient-3)] opacity-[0.07] blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-3)] text-white shadow-[0_10px_22px_-10px_rgba(76,91,212,0.7)]">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">META</h1>
              <p className="text-xs text-[var(--muted-foreground)]">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-2 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur">
            <Users className="size-4 text-[var(--gradient-1)]" aria-hidden="true" />
            <span className="text-xs text-[var(--muted-foreground)]">접속</span>
            <strong className="tabular-nums">{people.length}명</strong>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--card)] shadow-sm [height:clamp(280px,86vw,520px)] lg:min-h-[420px] lg:[height:calc(100vh-230px)]">
            <Suspense fallback={<SceneFallback />}>
              <OfficeScene people={people} focusUid={focusUid} selectedRoomPath={selectedRoomPath} onPick={handlePick} bubbles={bubbles} />
            </Suspense>
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
            끌기로 돌리고, 스페이스를 누른 채 끌면 화면이 움직입니다. 휠로 확대합니다. 육면체 표지나 사람을 누르면 그쪽으로 들어가고, 더블클릭하면 전체 화면으로 돌아옵니다.
          </p>
        </div>

        <aside className="min-w-0 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm" aria-label="가상 오피스 정보">
          {selectedRoom ? (
            <div className="mb-3 rounded-[11px] border border-[color-mix(in_oklab,var(--gradient-1)_30%,var(--border))] bg-[color-mix(in_oklab,var(--gradient-1)_6%,var(--card))] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">선택한 방</p>
                  <h2 className="truncate text-sm font-semibold">{selectedRoom.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRoomPath(null)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
                >
                  <Maximize2 className="size-3.5" aria-hidden="true" />
                  전체 보기
                </button>
              </div>
              <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
                {selectedFacilities.map((facility) => (
                  <button
                    key={`${facility.roomPath}-${facility.name}`}
                    type="button"
                    disabled={!facility.path}
                    onClick={() => facility.path && navigate(facility.path)}
                    className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-xs outline-none enabled:hover:bg-[var(--muted)] enabled:focus-visible:ring-[3px] enabled:focus-visible:ring-[var(--ring)] disabled:cursor-default disabled:text-[var(--muted-foreground)]"
                  >
                    <span className="size-2 shrink-0 bg-[var(--gradient-1)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{facility.name}</span>
                    {facility.path ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {objectCard ? (
            <div className="mb-3 rounded-[11px] border border-[color-mix(in_oklab,var(--gradient-1)_30%,var(--border))] bg-[color-mix(in_oklab,var(--gradient-1)_6%,var(--card))] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">오브젝트</p>
                  <h2 className="truncate text-sm font-semibold">{objectCard.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setObjectId(null)}
                  className="shrink-0 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
                >
                  닫기
                </button>
              </div>
              <dl className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
                {objectCard.lines.map((line) => (
                  <div key={line.label} className="flex items-center justify-between gap-2 text-xs">
                    <dt className="text-[var(--muted-foreground)]">{line.label}</dt>
                    <dd className="font-medium tabular-nums">{line.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="mb-3 flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">상태</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as PresenceStatus)}
                className="h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
              >
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">기분</span>
              <select
                value={mood}
                onChange={(event) => setMood(event.target.value as PresenceMood)}
                className="h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
              >
                {MOOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between border-b border-[var(--border)] px-1 pb-3">
            <div>
              <h2 className="text-sm font-semibold">지금 접속</h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">사람을 누르면 카메라가 이동합니다.</p>
            </div>
            <span className="rounded-full bg-[var(--muted)] px-2 py-1 text-xs font-semibold tabular-nums">{people.length}</span>
          </div>

          {people.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-[var(--muted-foreground)]">지금 접속한 사람이 없습니다</p>
          ) : (
            <div className="mt-2 space-y-1">
              {orderedPeople.map((person) => {
                const selected = person.uid === focusUid
                return (
                  <button
                    key={person.uid}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFocusUid(person.uid)}
                    className={`flex w-full items-center gap-3 rounded-[10px] border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${selected ? "border-[color-mix(in_oklab,var(--gradient-1)_45%,var(--border))] bg-[color-mix(in_oklab,var(--gradient-1)_8%,var(--card))]" : "border-transparent hover:border-[var(--border)] hover:bg-[var(--muted)]/60"}`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: person.color }}>
                      {person.name.slice(0, 1).toLocaleUpperCase("ko-KR")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <strong className="truncate text-sm font-medium">{person.name}</strong>
                        {person.isSelf ? <span className="shrink-0 rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted-foreground)]">나</span> : null}
                      </span>
                      <span className="block truncate text-xs text-[var(--muted-foreground)]">{person.screen || person.path}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">{agoText(person.ago)}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setChatTab("all")}
                className={`rounded-[8px] px-2 py-1 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${chatTab === "all" ? "bg-[var(--muted)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/60"}`}
              >
                전체
              </button>
              <button
                type="button"
                disabled={!selectedRoomPath}
                onClick={() => setChatTab("room")}
                className={`rounded-[8px] px-2 py-1 text-xs font-medium outline-none disabled:cursor-default disabled:text-[var(--muted-foreground)]/60 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${chatTab === "room" ? "bg-[var(--muted)]" : "text-[var(--muted-foreground)] enabled:hover:bg-[var(--muted)]/60"}`}
              >
                이 방
              </button>
            </div>

            <div ref={chatListRef} className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {visibleMessages.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">아직 대화가 없습니다</p>
              ) : visibleMessages.map((message) => (
                <div key={message.id} className="flex gap-2">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: message.color }} aria-hidden="true" />
                  <p className="min-w-0 flex-1 break-words text-xs">
                    <strong className="font-medium">{message.name}</strong>
                    <span className="ml-1.5 text-[var(--muted-foreground)]">{message.text}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-2 flex gap-1.5">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  handleSend()
                }}
                maxLength={200}
                placeholder={selectedRoomPath ? "이 방에 보내기" : "전체에 보내기"}
                className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim()}
                aria-label="보내기"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--card)] outline-none enabled:hover:bg-[var(--muted)] disabled:text-[var(--muted-foreground)]/50 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
              >
                <Send className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
