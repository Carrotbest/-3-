import { useEffect, useMemo, useState } from "react"
import { FileDown, ImageOff, Mail, Plus, Trash2 } from "lucide-react"

import { AnalysisDetailDialog } from "@/components/analysis/AnalysisDetailDialog"
import { AnalysisKpiChart } from "@/components/analysis/AnalysisKpiChart"
import { AnalysisRequestDialog } from "@/components/analysis/AnalysisRequestDialog"
import { PageHeader } from "@/components/layout/PageHeader"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuthStore, useScreenAccess } from "@/data/auth"
import { downloadAnalysisFinishedEml, downloadAnalysisRequestEml, openAnalysisFinishedMail, openAnalysisRequestMail } from "@/data/analysis-mail"
import { analysisLeadDays, analysisTodayValue, analysisWeeklySeries } from "@/data/fabric-analysis"
import { loadAnalysisRecipients } from "@/data/mail-recipients"
import type { MailAddress } from "@/data/mail-draft"
import { deleteRequestImage, requestImageUrl } from "@/data/request-image"
import { ANALYSIS_STATES, type AnalysisRequest, type AnalysisState } from "@/data/schema"
import { saveAnalysisRequests, useAppStore } from "@/store/useAppStore"

const ALL = "전체"
const stateClass: Record<AnalysisState, string> = {
  작성: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  의뢰: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  완료: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  취소: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
}
const stateDot: Record<AnalysisState, string> = { 작성: "bg-slate-400", 의뢰: "bg-amber-500", 완료: "bg-emerald-500", 취소: "bg-slate-300" }

function ImageThumb({ path, label }: { path?: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!path) return
    let live = true
    void requestImageUrl(path).then((next) => { if (live) setUrl(next) })
    return () => { live = false }
  }, [path])
  return url ? <img src={url} alt={`${label} 사진`} className="size-9 rounded-md object-cover ring-1 ring-[var(--border)]/60" /> : <span className="flex size-9 items-center justify-center rounded-md bg-[var(--muted)]/50 text-[var(--muted-foreground)]"><ImageOff className="size-3.5" /></span>
}

export function FabricAnalysis() {
  const rows = useAppStore((state) => state.analysisRequests)
  const access = useScreenAccess("/fabric-analysis")
  const canEdit = access === "edit"
  const user = useAuthStore((state) => state.user)
  const defaultName = user?.displayName || user?.email?.split("@")[0] || ""
  const [activeState, setActiveState] = useState<AnalysisState | typeof ALL>("의뢰")
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<AnalysisRequest | null>(null)
  const [editRecord, setEditRecord] = useState<AnalysisRequest | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [recipients, setRecipients] = useState<MailAddress[]>([])
  const [notice, setNotice] = useState("")

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
  const finishedSelected = selectedRows.filter((item) => item.state === "완료")
  const monthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const recentStart = Date.now() - 90 * 86_400_000
  const leadDays = rows.map((item) => ({ item, days: analysisLeadDays(item) })).filter(({ item, days }) => days != null && new Date(`${item.finishedAt}T00:00:00`).getTime() >= recentStart).map(({ days }) => days as number)
  const averageLead = leadDays.length ? leadDays.reduce((sum, value) => sum + value, 0) / leadDays.length : 0
  const weekly = useMemo(() => analysisWeeklySeries(rows), [rows])
  const metrics: Array<{ label: string; value: number; suffix?: string; decimals?: number; color: string; onClick: () => void }> = [
    { label: "작성", value: rows.filter((item) => item.state === "작성").length, color: "bg-slate-400", onClick: () => { setActiveState("작성"); setUrgentOnly(false) } },
    { label: "분석 대기", value: rows.filter((item) => item.state === "의뢰").length, color: "bg-amber-500", onClick: () => { setActiveState("의뢰"); setUrgentOnly(false) } },
    { label: "Urgent 대기", value: rows.filter((item) => item.state === "의뢰" && item.requestType === "Urgent").length, color: "bg-rose-500", onClick: () => { setActiveState("의뢰"); setUrgentOnly(true) } },
    { label: "이번 달 완료", value: rows.filter((item) => item.state === "완료" && item.finishedAt.startsWith(monthPrefix)).length, color: "bg-teal-600 dark:bg-teal-400", onClick: () => { setActiveState("완료"); setUrgentOnly(false) } },
    { label: "평균 소요일", value: averageLead, suffix: leadDays.length ? "일" : "-", decimals: leadDays.length ? 1 : 0, color: "bg-slate-400", onClick: () => { setActiveState("완료"); setUrgentOnly(false) } },
  ]

  const saveOne = (record: AnalysisRequest) => {
    const current = useAppStore.getState().analysisRequests
    saveAnalysisRequests(current.map((item) => item.id === record.id ? record : item))
    setDetail(record)
  }
  const confirmRequests = () => {
    if (!draftSelected.length) return
    const ids = new Set(draftSelected.map((item) => item.id))
    const today = analysisTodayValue()
    const now = new Date().toISOString()
    const confirmed = draftSelected.map((item) => ({ ...item, state: "의뢰" as const, requestedAt: today, updatedAt: now }))
    const confirmedById = new Map(confirmed.map((item) => [item.id, item]))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? confirmedById.get(item.id) ?? item : item))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
    void openAnalysisRequestMail(confirmed, recipients).then((result) => showNotice(result === "mailto"
      ? `본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다.${recipients.length ? "" : " 받는 사람 목록이 비어 있습니다."}`
      : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
  }
  const finishedMail = () => {
    if (!finishedSelected.length) return
    void openAnalysisFinishedMail(finishedSelected, recipients).then((result) => showNotice(result === "mailto"
      ? "본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다."
      : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
  }
  const deleteDrafts = () => {
    if (!draftSelected.length || !confirm(`작성 중인 의뢰 ${draftSelected.length}건을 삭제할까요?`)) return
    const targets = [...draftSelected]
    const ids = new Set(targets.map((item) => item.id))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.filter((item) => !ids.has(item.id)))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
    void Promise.allSettled(targets.flatMap((item) => [deleteRequestImage(`analysis-${item.id}`), ...(item.resultImages ?? []).map((image) => deleteRequestImage(`analysis-${item.id}-r${image.key}`))]))
  }
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
      <CardHeader className="gap-3"><CardTitle className="text-base font-medium">분석 의뢰 목록</CardTitle><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><Tabs value={activeState} onValueChange={(value) => { setActiveState(value as AnalysisState | typeof ALL); setUrgentOnly(false) }}><TabsList className="bg-transparent">{[ALL, ...ANALYSIS_STATES].map((state) => <TabsTrigger key={state} value={state} className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none dark:data-[state=active]:border-teal-400 dark:data-[state=active]:text-teal-300">{state}</TabsTrigger>)}</TabsList></Tabs><div className="flex items-center gap-2 lg:w-full lg:max-w-xl">{canEdit ? <Button type="button" className="shrink-0 bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600" onClick={() => { setEditRecord(null); setRequestOpen(true) }}><Plus />새 분석 의뢰</Button> : null}<Input className="min-w-0 flex-1" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="AN No. · Source code · Brand · Requester 검색" /></div></div>
        {urgentOnly ? <p className="text-xs text-rose-600">Urgent 대기만 표시 중</p> : null}
        {selected.size ? <div className="flex flex-wrap items-center gap-2 rounded-md bg-teal-500/5 p-2 text-sm"><span className="px-1">{selected.size}건 선택</span>{canEdit ? <Button size="sm" disabled={!draftSelected.length} className="bg-teal-600 text-white hover:bg-teal-700" onClick={confirmRequests}><Mail />의뢰 확정</Button> : null}<Button size="sm" variant="outline" disabled={!finishedSelected.length} onClick={finishedMail}>완료 메일</Button>{canEdit ? <Button size="sm" variant="outline" disabled={!draftSelected.length} onClick={deleteDrafts}><Trash2 />삭제</Button> : null}<Button size="sm" variant="ghost" disabled={!draftSelected.length && !finishedSelected.length} onClick={downloadSelectedEml}><FileDown />.eml로 받기</Button></div> : null}
        {notice ? <p className="text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
      </CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[1700px] text-[13px]"><TableHeader className="bg-[var(--muted)]/40"><TableRow className="border-[var(--border)]/50">
        <TableHead className="w-10 text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]"><Checkbox className="data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600" checked={allVisibleSelected} onCheckedChange={() => setSelected((current) => { const next = new Set(current); if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id)); else visibleIds.forEach((id) => next.add(id)); return next })} aria-label="현재 목록 전체 선택" /></TableHead>
        {['사진','AN No.','의뢰일','구분','Requester','Brand','Source code','Construction','Contents','Weight','Request item','상태','In charge','완료일','Analysis result'].map((head) => <TableHead key={head} className="text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]">{head}</TableHead>)}
      </TableRow></TableHeader><TableBody>{filtered.length ? filtered.map((item) => <TableRow key={item.id} className={`cursor-pointer border-[var(--border)]/50 font-normal transition-colors duration-150 hover:bg-teal-500/[0.06] dark:hover:bg-teal-400/10 ${selected.has(item.id) ? "bg-teal-500/10" : ""} ${item.requestType === "Urgent" ? "shadow-[inset_2px_0_0_#f43f5e]" : ""}`} onClick={() => setDetail(item)}>
        <TableCell onClick={(event) => event.stopPropagation()}><Checkbox className="data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600" checked={selected.has(item.id)} onCheckedChange={() => setSelected((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })} aria-label={`${item.anNo} 선택`} /></TableCell>
        <TableCell><ImageThumb path={item.imageThumbPath || item.imagePath} label={item.anNo} /></TableCell><TableCell className="font-medium tabular-nums">{item.anNo}</TableCell><TableCell>{item.requestedAt || "-"}</TableCell><TableCell>{item.requestType === "Urgent" ? <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-700 dark:text-rose-300">Urgent</span> : "Normal"}</TableCell><TableCell>{item.requester}</TableCell><TableCell>{item.brand || "-"}</TableCell><TableCell>{item.sourceCode || "-"}</TableCell><TableCell>{item.construction || "-"}</TableCell><TableCell>{item.contents || "-"}</TableCell><TableCell>{item.weight === "" ? "-" : item.weight}</TableCell><TableCell className="max-w-56 truncate">{item.description}</TableCell><TableCell><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${stateClass[item.state]}`}><i className={`size-1.5 rounded-full ${stateDot[item.state]}`} />{item.state}</span></TableCell><TableCell>{item.inCharge || "-"}</TableCell><TableCell>{item.finishedAt || "-"}</TableCell><TableCell className="max-w-64 truncate">{item.yarnDescription || item.commentRnd || "-"}</TableCell>
      </TableRow>) : <TableRow><TableCell colSpan={16} className="h-32 text-center text-[var(--muted-foreground)]">표시할 분석 의뢰가 없습니다.</TableCell></TableRow>}</TableBody></Table></div></CardContent>
    </Card>

    <AnalysisRequestDialog open={requestOpen} onOpenChange={setRequestOpen} record={editRecord} requester={defaultName} requesterEmail={user?.email ?? ""} onSaved={(saved) => { if (editRecord) setDetail(saved) }} />
    <AnalysisDetailDialog record={detail} canEdit={canEdit} defaultInCharge={defaultName} recipients={recipients} onOpenChange={(open) => { if (!open) setDetail(null) }} onSave={saveOne} onEditRequest={(selectedRecord) => { setDetail(null); setEditRecord(selectedRecord); setRequestOpen(true) }} />
  </section>
}
