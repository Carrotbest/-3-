import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import { useUpdateAvailable } from "@/data/app-version"
import { flushDevelopmentRecords } from "@/store/useAppStore"

export function UpdateBanner() {
  const { available } = useUpdateAvailable()
  const [saving, setSaving] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!available) return
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
  }, [available])

  const handleReload = async () => {
    setSaving(true)
    try {
      await flushDevelopmentRecords()
    } catch {
      // Reload even when the final save fails; stale clients must not keep writing.
    } finally {
      window.location.reload()
    }
  }

  if (!available) return null

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
          여러 부서가 같은 데이터를 쓰고 있어 새로고침한 뒤에 계속 사용할 수 있습니다. 작업 중이던 내용은 저장하고 새로고침합니다.
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
