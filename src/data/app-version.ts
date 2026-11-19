import { useEffect, useState } from "react"

const CHECK_INTERVAL_MS = 60 * 1000

export function useUpdateAvailable(): { available: boolean; notes: readonly string[] } {
  const [available, setAvailable] = useState(false)
  const [notes, setNotes] = useState<readonly string[]>([])

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
          const incoming = "notes" in data && Array.isArray(data.notes)
            ? data.notes.filter((item): item is string => typeof item === "string")
            : []
          // 내 빌드에 박힌 안내문과 같으면 보이지 않는다. TREND 수집기가 매일 자동 커밋을
          // 올려 배포가 한 번 더 도는데, 그때 지난 기능 배포의 안내문을 다시 띄우면
          // 무엇이 바뀌었다는 말이 거짓이 된다. 상태를 따로 저장할 필요 없이 이 비교로 갈린다.
          const same = JSON.stringify(incoming) === JSON.stringify([...__BUILD_NOTES__])
          setNotes(same ? [] : incoming)
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

  return import.meta.env.DEV ? { available: false, notes: [] } : { available, notes }
}
