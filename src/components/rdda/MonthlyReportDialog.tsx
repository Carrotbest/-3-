import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { RddaMonthlyReport } from "@/data/rdda-report"

const statusText = (status: RddaMonthlyReport["status"]) => status === "confirmed" ? "확정" : "작성 중"

export function MonthlyReportDialog({ open, report, onOpenChange, onSave, onRegenerate }: {
  open: boolean
  report: RddaMonthlyReport | null
  onOpenChange: (open: boolean) => void
  onSave: (report: RddaMonthlyReport) => void
  onRegenerate: () => RddaMonthlyReport
}) {
  const [draft, setDraft] = useState(report)
  useEffect(() => setDraft(report), [report, open])
  if (!draft) return null

  const save = (next = draft) => {
    const updated = { ...next, updatedAt: new Date().toISOString() }
    setDraft(updated)
    onSave(updated)
  }
  const toggleConfirmed = () => {
    const confirmed = draft.status !== "confirmed"
    save({ ...draft, status: confirmed ? "confirmed" : "draft", confirmedAt: confirmed ? new Date().toISOString() : undefined })
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="rdda-print-root h-[96vh] w-[calc(100vw-1rem)] max-w-[96vw] border-white/75 bg-[color-mix(in_oklab,var(--card)_91%,transparent)] backdrop-blur-xl" showCloseButton>
      <div className="rdda-report-editor flex min-h-0 flex-1 flex-col">
        <DialogHeader className="bg-white/28"><DialogTitle className="flex items-center gap-3">RDDA 월간 분석 · {draft.monthId}<span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${draft.status === "confirmed" ? "border-emerald-200 bg-emerald-50/80 text-emerald-700" : "border-slate-200 bg-slate-50/80 text-slate-600"}`}>{statusText(draft.status)}</span></DialogTitle></DialogHeader>
        <DialogBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["3팀 픽업률", `${draft.kpi.teamPickRate.toFixed(1)}%`],
              ["제안 원단", `${draft.kpi.offers.toLocaleString()}건`],
              ["전체 픽업률", `${draft.kpi.pickRate.toFixed(1)}%`],
              ["3팀 비중", `${draft.kpi.teamShare.toFixed(1)}%`],
            ].map(([label, value], index) => <div key={`${label}-${index}`} className="relative overflow-hidden rounded-[11px] border border-white/75 bg-white/48 p-4 shadow-[0_12px_26px_-24px_rgba(15,23,42,0.34)]"><span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)]" /><p className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p><p className="mt-2 text-[26px] font-semibold tracking-[-0.035em]">{value}</p></div>)}
          </div>
          {draft.sections.map((section, index) => <section key={section.id} className="rounded-[11px] border border-white/70 bg-white/35 p-4 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.3)]"><label htmlFor={`rdda-section-${section.id}`} className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-full bg-[color-mix(in_oklab,var(--gradient-1)_10%,var(--card))] text-[10px] text-[var(--gradient-1)]">{index + 1}</span>{section.title}</label><textarea id={`rdda-section-${section.id}`} className="mt-3 min-h-32 w-full resize-y rounded-[9px] border border-[var(--border)]/80 bg-[color-mix(in_oklab,var(--background)_82%,transparent)] p-3 text-sm leading-6 shadow-inner outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]" value={section.body} onChange={(event) => setDraft({ ...draft, sections: draft.sections.map((item) => item.id === section.id ? { ...item, body: event.target.value } : item) })} /></section>)}
        </DialogBody>
        <DialogFooter className="justify-between"><Button type="button" variant="outline" onClick={() => { if (window.confirm("자동 문장으로 다시 생성할까요? 현재 편집 내용은 사라집니다.")) setDraft(onRegenerate()) }}>다시 생성</Button><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => window.print()}>인쇄</Button><Button type="button" variant="outline" onClick={toggleConfirmed}>{draft.status === "confirmed" ? "확정 해제" : "확정"}</Button><Button type="button" onClick={() => save()}>저장</Button></div></DialogFooter>
      </div>
      <div className="rdda-print-deck" aria-hidden="true">
        <section className="rdda-print-page rdda-print-cover"><h1>RDDA 월간 분석</h1><p>{draft.monthId}</p><small>{draft.confirmedAt ? `확정일 ${new Date(draft.confirmedAt).toLocaleDateString("ko-KR")}` : "작성 중"}</small></section>
        <section className="rdda-print-page"><h2>핵심 지표</h2><div className="rdda-print-kpis">{[["3팀 픽업률", `${draft.kpi.teamPickRate.toFixed(1)}%`], ["제안 원단", `${draft.kpi.offers.toLocaleString()}건`], ["전체 픽업률", `${draft.kpi.pickRate.toFixed(1)}%`], ["3팀 비중", `${draft.kpi.teamShare.toFixed(1)}%`]].map(([label, value], index) => <div key={`${label}-${index}`}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
        {draft.sections.map((section, index) => <section key={section.id} className="rdda-print-page"><h2>{index + 1}. {section.title}</h2><p>{section.body}</p></section>)}
      </div>
    </DialogContent>
  </Dialog>
}
