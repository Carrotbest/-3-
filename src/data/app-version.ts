import { useEffect, useState } from "react"

const CHECK_INTERVAL_MS = 60 * 1000

export function useUpdateAvailable(): { available: boolean } {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return

    let active = true
    let intervalId: number | undefined

    const checkForUpdate = async () => {
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
    window.addEventListener("focus", checkForUpdate)

    return () => {
      active = false
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", checkForUpdate)
    }
  }, [])

  return { available: import.meta.env.DEV ? false : available }
}
