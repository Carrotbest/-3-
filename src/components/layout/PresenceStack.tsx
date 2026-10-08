import { useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAuthStore } from "@/data/auth"
import { clearPresence, subscribePresence, writePresence, type PresenceEntry } from "@/data/presence"

const HEARTBEAT_MS = 60_000
const MAX_VISIBLE = 4

const displayNameOf = (entry: PresenceEntry): string =>
  entry.name.trim() || entry.email.split("@")[0] || entry.email

const initialOf = (entry: PresenceEntry): string =>
  (entry.name.trim()[0] || entry.email.split("@")[0]?.[0] || "?").toLocaleUpperCase("ko-KR")

export function PresenceStack() {
  const { pathname } = useLocation()
  const approval = useAuthStore((state) => state.approval)
  const isOwner = useAuthStore((state) => state.isOwner)
  const enabled = isOwner || approval === "approved"
  const pathnameRef = useRef(pathname)
  const [entries, setEntries] = useState<PresenceEntry[]>([])

  useEffect(() => {
    pathnameRef.current = pathname
    if (enabled) void writePresence(pathname)
  }, [enabled, pathname])

  useEffect(() => {
    if (!enabled) {
      setEntries([])
      void clearPresence()
      return
    }

    const heartbeat = () => {
      if (!document.hidden) void writePresence(pathnameRef.current)
    }
    const handleVisibilityChange = () => {
      if (!document.hidden) void writePresence(pathnameRef.current)
    }
    const handlePageHide = () => { void clearPresence() }
    const interval = window.setInterval(heartbeat, HEARTBEAT_MS)

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handlePageHide)
      void clearPresence()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    return subscribePresence(setEntries)
  }, [enabled])

  if (entries.length === 0) return null

  const visible = entries.slice(0, MAX_VISIBLE)
  const remaining = entries.length - visible.length

  return (
    <div className="hidden items-center -space-x-2 sm:flex" aria-label="접속 중인 팀원">
      {visible.map((entry) => {
        const displayName = displayNameOf(entry)
        return (
          <Avatar
            key={entry.uid}
            className="size-8 ring-2 ring-[var(--background)]"
            title={entry.screen ? `${displayName} · ${entry.screen}` : displayName}
          >
            <AvatarFallback className="bg-[var(--muted)] text-xs font-medium text-[var(--muted-foreground)]">
              {initialOf(entry)}
            </AvatarFallback>
          </Avatar>
        )
      })}
      {remaining > 0 ? (
        <span
          className="relative flex size-8 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-medium text-[var(--accent-foreground)] ring-2 ring-[var(--background)]"
          title={`그 외 ${remaining}명`}
        >
          +{remaining}
        </span>
      ) : null}
    </div>
  )
}
