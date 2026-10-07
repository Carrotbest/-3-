import { useEffect, useMemo, useRef, useState } from "react"
import { FileDown, ImageOff, Mail, Plus, Printer, Trash2 } from "lucide-react"

import { AnalysisDetailDialog } from "@/components/analysis/AnalysisDetailDialog"
import { AnalysisPrintDeck } from "@/components/analysis/AnalysisPrintDeck"
import { AnalysisKpiChart } from "@/components/analysis/AnalysisKpiChart"
import { AnalysisRequestDialog } from "@/components/analysis/AnalysisRequestDialog"
import { PageHeader } from "@/components/layout/PageHeader"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Button } from "@/components/ui/button"
import { ShinyActionButton } from "@/components/ui/shiny-action-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuthStore, useScreenAccess } from "@/data/auth"
import { downloadAnalysisFinishedEml, downloadAnalysisRequestEml, openAnalysisFinishedMail, openAnalysisRequestMail } from "@/data/analysis-mail"
import { isAnalysisPrintable } from "@/data/analysis-print"
import { analysisLeadDays, analysisTodayValue, analysisWeeklySeries, canDeleteAnalysis } from "@/data/fabric-analysis"
import { loadAnalysisRecipients } from "@/data/mail-recipients"
import type { MailAddress } from "@/data/mail-draft"
import { deleteRequestImage, requestImageUrl } from "@/data/request-image"
import { ANALYSIS_STATES, LEGACY_ANALYSIS_CANCELLED, type AnalysisRequest, type AnalysisState } from "@/data/schema"
import { saveAnalysisRequests, useAppStore } from "@/store/useAppStore"

const ALL = "전체"
const stateClass: Record<AnalysisState, string> = {
  작성: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  의뢰: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  완료: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
}
const stateDot: Record<AnalysisState, string> = { 작성: "bg-slate-400", 의뢰: "bg-amber-500", 완료: "bg-emerald-500" }

function ImageThumb({ path, label }: { path?: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!path) return
    let live = true
    void requestImageUrl(path).then((next) => { if (live) setUrl(next) })
    return () => { live = false }
  }, [path])
  return url ? <img src={url} alt={`${label} 사진`} className="size-7 rounded-md object-cover ring-1 ring-[var(--border)]/60" /> : <span className="flex size-7 items-center justify-center rounded-md bg-[var(--muted)]/50 text-[var(--muted-foreground)]"><ImageOff className="size-3" /></span>
}

export function FabricAnalysis() {
  const rows = useAppStore((state) => state.analysisRequests)
  const access = useScreenAccess("/fabric-analysis")
  const canEdit = access === "edit"
  const isOwner = useAuthStore((state) => state.isOwner)
  const user = useAuthStore((state) => state.user)
  const defaultName = user?.displayName || user?.email?.split("@")[0] || ""
  const [activeState, setActiveState] = useState<AnalysisState | typeof ALL>(ALL)
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<AnalysisRequest | null>(null)
  const [editRecord, setEditRecord] = useState<AnalysisRequest | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [recipients, setRecipients] = useState<MailAddress[]>([])
  const [notice, setNotice] = useState("")
  const [printJob, setPrintJob] = useState<AnalysisRequest[] | null>(null)

  useEffect(() => { void loadAnalysisRecipients().then(setRecipients).catch(() => setRecipients([])) }, [])
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 6000) }
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return rows.filter((item) => activeState === ALL || item.state === activeState)
      .filter((item) => !urgentOnly || (item.state === "의뢰" && item.requestType === "Urgent"))
      .filter((item) => !query || [item.anNo, item.sourceCode, item.brand, item.requester, item.contents, item.construction].some((value) => value.toLocaleLowerCase("ko-KR").includes(query)))
      .sort((a, b) => b.anNo.localeCompare(a.anNo, "en", { numeric: true }))
  }, [rows, activeState, urgentOnly, search])
  const selectedRows = rows.filter((item) => selected.has(item.id))
  const draftSelected = selectedRows.filter((item) => item.state === "작성")
  const requestedSelected = selectedRows.filter((item) => item.state === "의뢰")
  const finishedSelected = selectedRows.filter((item) => item.state === "완료")
  const printableSelected = selectedRows.filter(isAnalysisPrintable)
  // 삭제는 상태를 가리지 않는다. 가리는 것은 권한뿐이다(R301).
  const viewerForDelete = { isOwner, email: user?.email ?? "" }
  const deletableSelected = selectedRows.filter((item) => canDeleteAnalysis(item, viewerForDelete))
  // 완료 건은 완료 탭에서만 고친다(2026-10-07 방향근 지시). 전체 목록에서는 보기만 한다.
  // 삭제와 메일은 가리지 않는다. 권한만 보는 것이 R301에서 정한 규칙이다.
  const detailCanEdit = canEdit && !(detail?.state === "완료" && activeState !== "완료")
  const monthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const recentStart = Date.now() - 90 * 86_400_000
  const leadDays = rows.map((item) => ({ item, days: analysisLeadDays(item) })).filter(({ item, days }) => days != null && new Date(`${item.finishedAt}T00:00:00`).getTime() >= recentStart).map(({ days }) => days as number)
  const averageLead = leadDays.length ? leadDays.reduce((sum, value) => sum + value, 0) / leadDays.length : 0
  const weekly = useMemo(() => analysisWeeklySeries(rows), [rows])
  // 탭 배지는 전체 건수를 쓴다. 검색과 Urgent 필터에 따라 숫자가 흔들리면 어디에 몇 건인지 알 수 없다.
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL]: rows.length }
    for (const state of ANALYSIS_STATES) counts[state] = rows.filter((item) => item.state === state).length
    return counts
  }, [rows])
  const metrics: Array<{ label: string; value: number; suffix?: string; decimals?: number; color: string; onClick: () => void }> = [
    { label: "작성", value: rows.filter((item) => item.state === "작성").length, color: "bg-slate-400", onClick: () => { setActiveState("작성"); setUrgentOnly(false) } },
    { label: "분석 대기", value: rows.filter((item) => item.state === "의뢰").length, color: "bg-amber-500", onClick: () => { setActiveState("의뢰"); setUrgentOnly(false) } },
    { label: "Urgent 대기", value: rows.filter((item) => item.state === "의뢰" && item.requestType === "Urgent").length, color: "bg-rose-500", onClick: () => { setActiveState("의뢰"); setUrgentOnly(true) } },
    { label: "이번 달 완료", value: rows.filter((item) => item.state === "완료" && item.finishedAt.startsWith(monthPrefix)).length, color: "bg-teal-600 dark:bg-teal-400", onClick: () => { setActiveState("완료"); setUrgentOnly(false) } },
    { label: "평균 소요일", value: averageLead, suffix: leadDays.length ? "일" : "-", decimals: leadDays.length ? 1 : 0, color: "bg-slate-400", onClick: () => { setActiveState("완료"); setUrgentOnly(false) } },
  ]

  // 팝업이 열려 있으면 먼저 닫는다. 팝업 오버레이가 인쇄 화면에 겹치는 것을 막는다.
  const startPrint = (targets: AnalysisRequest[]) => {
    const printable = targets.filter(isAnalysisPrintable)
    if (!printable.length) return
    setDetail(null)
    setPrintJob(printable)
  }

  const saveOne = (record: AnalysisRequest) => {
    const current = useAppStore.getState().analysisRequests
    saveAnalysisRequests(current.map((item) => item.id === record.id ? record : item))
    setDetail(record)
  }
  const confirmRequests = (targets: AnalysisRequest[]) => {
    const drafts = targets.filter((item) => item.state === "작성")
    if (!drafts.length) return
    const ids = new Set(drafts.map((item) => item.id))
    const today = analysisTodayValue()
    const now = new Date().toISOString()
    const confirmed = drafts.map((item) => ({ ...item, state: "의뢰" as const, requestedAt: today, updatedAt: now }))
    const confirmedById = new Map(confirmed.map((item) => [item.id, item]))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? confirmedById.get(item.id) ?? item : item))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
    void openAnalysisRequestMail(confirmed, recipients).then((result) => showNotice(result === "mailto"
      ? `본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다.${recipients.length ? "" : " 받는 사람 목록이 비어 있습니다."}`
      : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
  }
  const completeRequests = (targets: AnalysisRequest[]) => {
    const requested = targets.filter((item) => item.state === "의뢰")
    if (!requested.length) return
    const blankResults = requested.filter((item) => !item.yarnDescription.trim() && !item.commentRnd.trim()).length
    if (blankResults && !confirm(`분석 결과가 비어 있는 건이 ${blankResults}건 있습니다. 완료 메일 표가 비어 나갑니다. 계속할까요?`)) return
    const ids = new Set(requested.map((item) => item.id))
    const now = new Date().toISOString()
    const completed = requested.map((item) => ({
      ...item,
      state: "완료" as const,
      finishedAt: item.finishedAt || analysisTodayValue(),
      inCharge: item.inCharge || defaultName,
      updatedAt: now,
    }))
    const completedById = new Map(completed.map((item) => [item.id, item]))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? completedById.get(item.id) ?? item : item))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
    void openAnalysisFinishedMail(completed, recipients).then((result) => showNotice(result === "mailto"
      ? "본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다."
      : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
  }
  const finishedMail = () => {
    if (!finishedSelected.length) return
    void openAnalysisFinishedMail(finishedSelected, recipients).then((result) => showNotice(result === "mailto"
      ? "본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다."
      : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
  }
  const deleteSelected = () => {
    if (!deletableSelected.length) return
    const question = deletableSelected.length === selectedRows.length
      ? `선택한 ${deletableSelected.length}건을 삭제할까요? 되돌릴 수 없습니다.`
      : `선택한 ${selectedRows.length}건 가운데 삭제 권한이 있는 ${deletableSelected.length}건만 지웁니다. 계속할까요?`
    if (!confirm(question)) return
    const targets = [...deletableSelected]
    const ids = new Set(targets.map((item) => item.id))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.filter((item) => !ids.has(item.id)))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
    void Promise.allSettled(targets.flatMap((item) => [deleteRequestImage(`analysis-${item.id}`), ...(item.resultImages ?? []).map((image) => deleteRequestImage(`analysis-${item.id}-r${image.key}`))]))
  }

  // 취소 상태를 제거하면서(R301) 남은 옛 건을 치운다. 탭이 없어 사람이 골라낼 수 없다.
  // 첫 동기화 전에 지우면 동기화가 되살릴 수 있어 몇 번 다시 시도하되, 무한 반복은 막는다.
  const cleanupTries = useRef(0)
  useEffect(() => {
    if (!canEdit || cleanupTries.current >= 3) return
    const stale = rows.filter((item) => (item.state as string) === LEGACY_ANALYSIS_CANCELLED)
    if (!stale.length) return
    cleanupTries.current += 1
    const ids = new Set(stale.map((item) => item.id))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.filter((item) => !ids.has(item.id)))
    void Promise.allSettled(stale.flatMap((item) => [deleteRequestImage(`analysis-${item.id}`), ...(item.resultImages ?? []).map((image) => deleteRequestImage(`analysis-${item.id}-r${image.key}`))]))
    showNotice(`제거된 취소 상태 ${stale.length}건을 정리했습니다.`)
  }, [rows, canEdit])
  const downloadSelectedEml = () => {
    if (draftSelected.length) downloadAnalysisRequestEml(draftSelected, recipients)
    else if (finishedSelected.length) downloadAnalysisFinishedEml(finishedSelected, recipients)
  }
  const visibleIds = filtered.map((item) => item.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  return <section className="min-w-0 space-y-4">
    <PageHeader title="FABRIC ANALYSIS" subtitle="원단 분석 의뢰와 결과를 관리합니다." />

    <div className="grid min-h-16 grid-cols-2 divide-x divide-[var(--border)]/60 rounded-lg border border-[var(--border)]/60 bg-[var(--card)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:grid-cols-5">{metrics.map((metric) => <button type="button" key={metric.label} className="flex min-w-0 items-center gap-3 px-4 py-2 text-left hover:bg-[var(--muted)]/30" onClick={metric.onClick}><span className={`size-2 shrink-0 rounded-full ${metric.color}`} /><span className="min-w-0"><span className="block truncate text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]">{metric.label}</span>{metric.label === "평균 소요일" && !leadDays.length ? <span className="text-xl font-semibold">-</span> : <NumberTicker value={metric.value} decimals={metric.decimals} suffix={metric.suffix} className="text-xl font-semibold" />}</span></button>)}</div>
    <AnalysisKpiChart data={weekly} />

    <Card className="border-[var(--border)]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:translate-y-0 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="gap-3"><CardTitle className="text-base font-medium">분석 의뢰 목록</CardTitle>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><Tabs value={activeState} onValueChange={(value) => { setActiveState(value as AnalysisState | typeof ALL); setUrgentOnly(false) }}><TabsList className="bg-transparent">{[ALL, ...ANALYSIS_STATES].map((state) => <TabsTrigger key={state} value={state} className="group rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none dark:data-[state=active]:border-teal-400 dark:data-[state=active]:text-teal-300">{state}<span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--muted-foreground)] group-data-[state=active]:bg-teal-600/15 group-data-[state=active]:text-teal-700 dark:group-data-[state=active]:text-teal-300">{tabCounts[state] ?? 0}</span></TabsTrigger>)}</TabsList></Tabs>
        {/* 선택 묶음은 탭 줄 가운데에 선다. 늘 자리를 차지해 체크할 때마다 아래 표가 밀리지 않는다. */}
        <div className="flex min-h-9 flex-1 flex-wrap items-center justify-center gap-2 text-sm">{selected.size ? <>
          <span className="rounded-md bg-teal-500/10 px-2 py-1">{selected.size}건 선택</span>
          {canEdit ? <Button size="sm" disabled={!draftSelected.length} className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => confirmRequests(draftSelected)}><Mail />의뢰 확정</Button> : null}
          {canEdit ? <Button size="sm" variant="outline" disabled={!requestedSelected.length} onClick={() => completeRequests(requestedSelected)}>완료 처리</Button> : null}
          <Button size="sm" variant="outline" disabled={!finishedSelected.length} onClick={finishedMail}>완료 메일</Button>
          {canEdit ? <Button size="sm" variant="outline" disabled={!deletableSelected.length} title={deletableSelected.length ? "선택한 의뢰를 지웁니다" : "만든 사람과 관리자만 지울 수 있습니다"} onClick={deleteSelected}><Trash2 />삭제</Button> : null}
          <Button size="sm" variant="outline" disabled={!printableSelected.length} title="완료 건은 분석 리포트, 그 밖에는 분석 의뢰서로 나갑니다" onClick={() => startPrint(printableSelected)}><Printer />출력</Button>
          <Button size="sm" variant="ghost" disabled={!draftSelected.length && !finishedSelected.length} onClick={downloadSelectedEml}><FileDown />.eml로 받기</Button>
        </> : null}</div>
        <div className="flex items-center gap-2 lg:w-full lg:max-w-xl">{canEdit ? <ShinyActionButton tone="teal" icon={<Plus />} onClick={() => { setEditRecord(null); setRequestOpen(true) }}>새 분석 의뢰</ShinyActionButton> : null}<Input className="min-w-0 flex-1" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="AN No. · Source code · Brand · Requester 검색" /></div></div>
        {urgentOnly ? <p className="text-xs text-rose-600">Urgent 대기만 표시 중</p> : null}
        {notice ? <p className="text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
      </CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[1750px] table-fixed text-xs [&_td]:py-1">
        <colgroup>{[40, 86, 48, 108, 92, 72, 90, 88, 118, 124, 150, 64, 200, 88, 92, 220, 70].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <TableHeader className="bg-[var(--muted)]/40"><TableRow className="border-[var(--border)]/50">
        <TableHead className="w-10 text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]"><Checkbox className="data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600" checked={allVisibleSelected} onCheckedChange={() => setSelected((current) => { const next = new Set(current); if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id)); else visibleIds.forEach((id) => next.add(id)); return next })} aria-label="현재 목록 전체 선택" /></TableHead>
        {['상태','사진','AN No.','의뢰일','구분','Requester','Brand','Source code','Construction','Contents','Weight','Request item','In charge','완료일','Analysis result',''].map((head, index) => <TableHead key={`${head}-${index}`} className="text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]">{head}</TableHead>)}
      </TableRow></TableHeader><TableBody>{filtered.length ? filtered.map((item) => <TableRow key={item.id} className={`cursor-pointer border-[var(--border)]/50 font-normal transition-colors duration-150 hover:bg-teal-500/[0.06] dark:hover:bg-teal-400/10 ${selected.has(item.id) ? "bg-teal-500/10" : ""} ${item.requestType === "Urgent" ? "shadow-[inset_2px_0_0_#f43f5e]" : ""} ${item.state === "완료" ? "text-[var(--muted-foreground)]" : ""}`} onClick={() => setDetail(item)}>
        <TableCell onClick={(event) => event.stopPropagation()}><Checkbox className="data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600" checked={selected.has(item.id)} onCheckedChange={() => setSelected((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })} aria-label={`${item.anNo} 선택`} /></TableCell>
        <TableCell><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${stateClass[item.state]}`}><i className={`size-1.5 rounded-full ${stateDot[item.state]}`} />{item.state}</span></TableCell><TableCell><ImageThumb path={item.imageThumbPath || item.imagePath} label={item.anNo} /></TableCell><TableCell className="font-medium tabular-nums">{item.anNo}</TableCell><TableCell>{item.requestedAt || "-"}</TableCell><TableCell>{item.requestType === "Urgent" ? <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-700 dark:text-rose-300">Urgent</span> : "Normal"}</TableCell><TableCell>{item.requester}</TableCell><TableCell>{item.brand || "-"}</TableCell><TableCell>{item.sourceCode || "-"}</TableCell><TableCell>{item.construction || "-"}</TableCell><TableCell>{item.contents || "-"}</TableCell><TableCell>{item.weight === "" ? "-" : item.weight}</TableCell><TableCell className="max-w-56 truncate">{item.description}</TableCell><TableCell>{item.inCharge || "-"}</TableCell><TableCell>{item.finishedAt || "-"}</TableCell><TableCell className="max-w-64 truncate">{item.yarnDescription || item.commentRnd || "-"}</TableCell><TableCell onClick={(event) => event.stopPropagation()}>{item.state === "작성" && canEdit ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); confirmRequests([item]) }}>의뢰</Button> : item.state === "의뢰" && canEdit ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); completeRequests([item]) }}>완료</Button> : item.state === "완료" ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void openAnalysisFinishedMail([item], recipients).then((result) => showNotice(result === "mailto" ? "본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다." : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다.")) }}>메일</Button> : null}</TableCell>
      </TableRow>) : <TableRow><TableCell colSpan={17} className="h-32 text-center text-[var(--muted-foreground)]">표시할 분석 의뢰가 없습니다.</TableCell></TableRow>}</TableBody></Table></div></CardContent>
    </Card>

    <AnalysisRequestDialog open={requestOpen} onOpenChange={setRequestOpen} record={editRecord} requester={defaultName} requesterEmail={user?.email ?? ""} onSaved={(saved) => { if (editRecord) setDetail(saved) }} />
    <AnalysisDetailDialog record={detail} canEdit={detailCanEdit} defaultInCharge={defaultName} recipients={recipients} onOpenChange={(open) => { if (!open) setDetail(null) }} onSave={saveOne} onPrint={(record) => startPrint([record])} onEditRequest={(selectedRecord) => { setDetail(null); setEditRecord(selectedRecord); setRequestOpen(true) }} />
    {printJob ? <AnalysisPrintDeck records={printJob} onDone={() => setPrintJob(null)} /> : null}
  </section>
}
