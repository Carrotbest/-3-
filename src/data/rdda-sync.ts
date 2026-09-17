import { setIngestState, useAppStore } from "../store/useAppStore"
import { ingestRddaMessage } from "./upload"

export const RDDA_ORIGIN = "https://rdda.hansoll.com"

let activePopup: Window | null = null

export function startRddaSync(): void {
  if (activePopup) {
    activePopup.focus()
    return
  }

  const popup = window.open(`${RDDA_ORIGIN}/`, "rdda-sync")
  if (!popup) {
    setIngestState({
      active: true,
      kind: "rdda-report",
      fileName: "RDDA 자동 수집",
      step: "error",
      message: "팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.",
    })
    return
  }

  activePopup = popup
  setIngestState({
    active: true,
    kind: "rdda-report",
    fileName: "RDDA 자동 수집",
    step: "reading",
    message: "RDDA 창에서 북마크 'RDDA 수집'을 눌러 주세요.",
  })

  let finished = false
  let closeInterval: number
  let timeout: number

  const cleanup = () => {
    window.removeEventListener("message", onMessage)
    window.clearInterval(closeInterval)
    window.clearTimeout(timeout)
    activePopup = null
  }

  const onMessage = async (event: MessageEvent) => {
    if (event.origin !== RDDA_ORIGIN) return
    if (event.source !== popup) return
    if (event.data?.source !== "rdda-collector") return
    if (finished) return

    if (event.data.type === "progress") {
      setIngestState({ step: "parsing", message: String(event.data.message) })
      return
    }

    if (event.data.type === "error") {
      finished = true
      setIngestState({ step: "error", message: String(event.data.message) })
      cleanup()
      return
    }

    if (event.data.type === "report") {
      finished = true
      const ok = await ingestRddaMessage(event.data.report)
      popup.postMessage({
        source: "fabric-rnd",
        type: "ack",
        ok,
        message: ok ? "대시보드에 반영했습니다." : (useAppStore.getState().ingest.message ?? "반영에 실패했습니다."),
      }, RDDA_ORIGIN)
      if (ok) setIngestState({ message: "RDDA 집계를 반영했습니다." })
      cleanup()
    }
  }

  window.addEventListener("message", onMessage)
  closeInterval = window.setInterval(() => {
    if (!popup.closed || finished) return
    finished = true
    setIngestState({ step: "error", message: "RDDA 창이 닫혀 갱신을 취소했습니다." })
    cleanup()
  }, 1_000)
  timeout = window.setTimeout(() => {
    if (finished) return
    finished = true
    setIngestState({ step: "error", message: "RDDA 갱신 시간이 초과되었습니다." })
    cleanup()
  }, 15 * 60 * 1_000)
}
