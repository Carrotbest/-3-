import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import { useUpdateAvailable } from "@/data/app-version"
import { awaitPendingPushes } from "@/data/firestore-sync"
import { flushDevelopmentRecords } from "@/store/useAppStore"

/** 편집 중이면 막기 전에 기다려 주는 최대 시간(2026-10-13 박향근 확정). */
const GRACE_MS = 2 * 60 * 1000

/** 열린 팝업이 있거나 입력칸에 커서가 있으면 편집 중으로 본다. */
function isEditing(): boolean {
  if (document.querySelector('[role="dialog"]')) return true
  const active = document.activeElement
  return active instanceof HTMLElement
    && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable)
}

export function UpdateBanner() {
  const { available } = useUpdateAvailable()
  const [saving, setSaving] = useState(false)
  // 새 버전이 떠도 편집 중이면 바로 막지 않는다. 편집을 마치거나 유예가 끝나면 막는다(R288 보완).
  const [blocking, setBlocking] = useState(false)
  const [remaining, setRemaining] = useState(GRACE_MS)
  const cardRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!available || blocking) return
    const started = Date.now()
    const check = () => {
      const left = GRACE_MS - (Date.now() - started)
      if (left <= 0 || !isEditing()) { setBlocking(true); return }
      setRemaining(left)
    }
    check()
    const timer = window.setInterval(check, 1000)
    return () => window.clearInterval(timer)
  }, [available, blocking])

  useEffect(() => {
    if (!available || !blocking) return
    const root = document.getElementById("root")
    root?.setAttribute("inert", "")
    buttonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Node && cardRef.current?.contains(target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener("keydown", handleKeyDown, true)

    return () => {
      root?.removeAttribute("inert")
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [available, blocking])

  const handleReload = async () => {
    setSaving(true)
    try {
      await flushDevelopmentRecords()
      // DD 외 키(창고, 요청, TS 등)는 저장 즉시 전송된다. 그 전송이 끝날 때까지 기다린다(최대 8초).
      await awaitPendingPushes()
    } catch {
      // Reload even when the final save fails; stale clients must not keep writing.
    } finally {
      window.location.reload()
    }
  }

  if (!available) return null

  if (!blocking) {
    const seconds = Math.ceil(remaining / 1000)
    return createPortal(
      <div role="status" className="fixed inset-x-0 top-0 z-[1000] flex justify-center p-2">
        <div className="rounded-[var(--radius)] border border-[var(--warning)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--foreground)] shadow-md">
          새 버전이 배포되었습니다. 입력 중인 내용을 저장하고 창을 닫으면 새로고침 안내가 뜹니다.
          <span className="ml-2 font-mono tabular-nums text-[var(--warning)]">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        className="w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--foreground)] shadow-xl"
      >
        <h2 id="update-dialog-title" className="text-lg font-semibold">새 버전이 배포되었습니다</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
          여러 부서가 같은 데이터를 쓰고 있어 새로고침한 뒤에 계속 사용할 수 있습니다. 이미 저장한 내용은 서버 전송을 마친 뒤 새로고침합니다. 저장하지 않고 열어 둔 입력 창의 내용은 남지 않습니다.
        </p>
        <div className="mt-6 flex justify-end">
          <Button ref={buttonRef} type="button" disabled={saving} onClick={handleReload}>
            {saving ? "저장 중…" : "새로고침"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
