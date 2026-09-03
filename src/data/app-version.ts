import { useCallback, useEffect, useRef, useState } from "react"

const CHECK_INTERVAL_MS = 5 * 60 * 1000
const SNOOZE_DURATION_MS = 10 * 60 * 1000
const SNOOZE_KEY = "fabric-rnd:update-snooze-until"

function readSnoozeUntil() {
  try {
    const value = Number(sessionStorage.getItem(SNOOZE_KEY))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

export function useUpdateAvailable(): { available: boolean; snooze: () => void } {
  const [available, setAvailable] = useState(false)
  const snoozeUntilRef = useRef(import.meta.env.DEV ? 0 : readSnoozeUntil())

  const isSnoozed = useCallback(() => {
    snoozeUntilRef.current = Math.max(snoozeUntilRef.current, readSnoozeUntil())
    return Date.now() < snoozeUntilRef.current
  }, [])

  const snooze = useCallback(() => {
    const snoozeUntil = Date.now() + SNOOZE_DURATION_MS
    snoozeUntilRef.current = snoozeUntil
    setAvailable(false)
    try {
      sessionStorage.setItem(SNOOZE_KEY, String(snoozeUntil))
    } catch {
      // Keep the in-memory snooze when session storage is unavailable.
    }
  }, [])

  useEffect(() => {
    if (import.meta.env.DEV) return

    let active = true
    let intervalId: number | undefined

    const checkForUpdate = async () => {
      if (isSnoozed()) {
        if (active) setAvailable(false)
        return
      }

      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
          cache: "no-store",
        })
        if (!response.ok) return
        const data: unknown = await response.json()
        if (
          active
          && typeof data === "object"
          && data !== null
          && "buildId" in data
          && typeof data.buildId === "string"
          && data.buildId !== __BUILD_ID__
          && !isSnoozed()
        ) {
          setAvailable(true)
        }
      } catch {
        // A later check will retry after transient network or parsing failures.
      }
    }

    const stopInterval = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
        intervalId = undefined
      }
    }

    const startInterval = () => {
      stopInterval()
      intervalId = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate()
        startInterval()
      } else {
        stopInterval()
      }
    }

    void checkForUpdate()
    if (document.visibilityState === "visible") startInterval()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      active = false
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isSnoozed])

  return { available: import.meta.env.DEV ? false : available, snooze }
}
