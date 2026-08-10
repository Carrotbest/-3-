import { useEffect } from "react"
import { CheckCircle2, LoaderCircle, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { setIngestState, useAppStore, type IngestStep } from "@/store/useAppStore"

const LABELS: Record<IngestStep, string> = { reading: "읽는 중", parsing: "파싱 중", validating: "검증 중", done: "완료", error: "오류" }

export function ParsingOverlay() {
  const ingest = useAppStore((state) => state.ingest)
  useEffect(() => {
    if (!ingest.active || ingest.step !== "done") return
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1200
    const timer = window.setTimeout(() => setIngestState({ active: false }), delay)
    return () => window.clearTimeout(timer)
  }, [ingest.active, ingest.step])
  if (!ingest.active) return null
  const busy = ingest.step !== "done" && ingest.step !== "error"
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_35%,transparent)] p-4" role="dialog" aria-modal="true" aria-labelledby="parsing-title">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--card-foreground)] shadow-xl">
        <div className="flex items-start gap-4">
          {busy ? <LoaderCircle aria-hidden="true" className="size-6 shrink-0 animate-spin text-[var(--primary)] motion-reduce:animate-none" /> : ingest.step === "error" ? <TriangleAlert aria-hidden="true" className="size-6 shrink-0 text-[var(--destructive)]" /> : <CheckCircle2 aria-hidden="true" className="size-6 shrink-0 text-[var(--chart-2)]" />}
          <div className="min-w-0 flex-1"><h2 id="parsing-title" className="font-semibold">{LABELS[ingest.step]}</h2><p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">{ingest.fileName}</p>{ingest.message ? <p role={ingest.step === "error" ? "alert" : "status"} className={`mt-3 text-sm ${ingest.step === "error" ? "text-[var(--destructive)]" : "text-[var(--foreground)]"}`}>{ingest.message}</p> : null}</div>
          {ingest.step === "error" ? <Button type="button" variant="ghost" size="icon" aria-label="닫기" onClick={() => setIngestState({ active: false })}><X aria-hidden="true" /></Button> : null}
        </div>
      </div>
    </div>
  )
}
