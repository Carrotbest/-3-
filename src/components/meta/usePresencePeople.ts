import { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"

import { useAuthStore } from "@/data/auth"
import { ACTIVITY_TTL_MS, subscribePresence, screenTitleOf, type PresenceActivity, type PresenceEntry, type PresenceMood, type PresenceSpot, type PresenceStatus } from "@/data/presence"
import { MEMBERS } from "@/data/schema"

export interface PresencePerson {
  uid: string
  name: string
  path: string
  screen: string
  ago: number
  color: string
  isSelf: boolean
  status?: PresenceStatus
  mood?: PresenceMood
  activity?: PresenceActivity
  spot?: PresenceSpot
}

const MEMBER_COLORS: Record<string, string> = {
  박근후: "#7b61c9",
  박향근: "#2f7fd0",
  김지현: "#2a9d78",
  변재휘: "#c97a2a",
}

const FALLBACK_COLORS = ["#6574c4", "#298c80", "#b46d32", "#a8558f", "#4b7f9e", "#738348"]
const MEMBER_NAMES = new Set<string>(MEMBERS.map((member) => member.name))

function updatedAtMillis(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("toMillis" in value)) return null
  const toMillis = (value as { toMillis?: unknown }).toMillis
  if (typeof toMillis !== "function") return null
  const millis = toMillis.call(value)
  return typeof millis === "number" ? millis : null
}

function colorOf(entry: Pick<PresenceEntry, "uid" | "name">): string {
  const name = entry.name.trim()
  if (MEMBER_NAMES.has(name) && MEMBER_COLORS[name]) return MEMBER_COLORS[name]

  let total = 0
  for (const character of entry.uid) total += character.codePointAt(0) ?? 0
  return FALLBACK_COLORS[total % FALLBACK_COLORS.length]
}

export function usePresencePeople(selfStatus?: PresenceStatus, selfMood?: PresenceMood, selfSpot?: PresenceSpot, selfActivity: PresenceActivity = "view"): PresencePerson[] {
  const { pathname } = useLocation()
  const currentUser = useAuthStore((state) => state.user)
  const [entries, setEntries] = useState<PresenceEntry[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => subscribePresence(setEntries), [])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(interval)
  }, [])

  return useMemo(() => {
    const others = entries.map((entry) => {
      const updatedAt = updatedAtMillis(entry.updatedAt)
      return {
        uid: entry.uid,
        name: entry.name.trim() || entry.email.split("@")[0] || entry.email,
        path: entry.path,
        screen: entry.screen.trim() || screenTitleOf(entry.path),
        ago: updatedAt === null ? 0 : Math.max(0, Math.floor((now - updatedAt) / 1000)),
        color: colorOf(entry),
        isSelf: false,
        status: entry.status,
        mood: entry.mood,
        activity: entry.activityAt && now - entry.activityAt < ACTIVITY_TTL_MS ? entry.activity : "view",
        spot: entry.spot,
      }
    })

    if (!currentUser) return others
    const email = currentUser.email ?? ""
    const name = currentUser.displayName?.trim() || email.split("@")[0] || email
    return [{
      uid: currentUser.uid,
      name,
      path: pathname,
      screen: screenTitleOf(pathname),
      ago: 0,
      color: colorOf({ uid: currentUser.uid, name }),
      isSelf: true,
      status: selfStatus,
      mood: selfMood,
      activity: selfActivity,
      spot: selfSpot,
    }, ...others]
  }, [currentUser, entries, now, pathname, selfStatus, selfMood, selfSpot, selfActivity])
}
