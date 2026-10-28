import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { FileSpreadsheet, ImageOff, Mail, Plus, Printer, Send, Trash2 } from "lucide-react"

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
import { openAnalysisFinishedMail, openAnalysisRequestMail } from "@/data/analysis-mail"
import { isAnalysisPrintable } from "@/data/analysis-print"
import { analysisChartFileName, buildRequestStyleFromAnalysis, hasLiveRequestLink, pickTransferable, transferSkipNotice } from "@/data/analysis-to-request"
import { analysisLeadDays, analysisTodayValue, analysisWeeklySeries, canDeleteAnalysis } from "@/data/fabric-analysis"
import { buildRequestWorkbook } from "@/data/request-template"
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
  const requestStyles = useAppStore((state) => state.requests)
  /** 살아 있는 의뢰 스타일의 id. 지워진 스타일을 가리키는 REQ 딱지를 걸러낸다(R360). */
  const liveReqIds = useMemo(() => new Set(requestStyles.map((style) => style.reqId)), [requestStyles])
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
  /**
   * 체크박스 끌어서 여러 건 고르기(R356).
   * `mode`는 끄는 동안 칠할 값이다. 처음 누른 행이 꺼져 있었으면 켜면서 끌고, 켜져 있었으면 끄면서 끈다.
   * `moved`는 끈 적이 있는지다. 끌고 나서 올라온 mouseup이 행 클릭(상세 팝업)으로 이어지는 것을 막는다.
   */
  const dragSelect = useRef<{ mode: boolean; moved: boolean } | null>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => { void loadAnalysisRecipients().then(setRecipients).catch(() => setRecipients([])) }, [])

  useEffect(() => {
    const stop = () => { window.setTimeout(() => { dragSelect.current = null }, 0) }
    window.addEventListener("mouseup", stop)
    return () => window.removeEventListener("mouseup", stop)
  }, [])

  /*
   * 의뢰 화면의 AN 배지가 `/fabric-analysis?q=<anNo>`로 보낸다(R352).
   * 검색어로 받아 그 건만 남긴다. 탭은 전체로 열어야 상태와 무관하게 보인다.
   * 파라미터는 읽고 지운다. 남겨 두면 새로 고칠 때마다 검색어가 되살아난다.
   */
  useEffect(() => {
    const query = searchParams.get("q")
    if (!query) return
    setActiveState(ALL)
    setUrgentOnly(false)
    setSearch(query)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("q")
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  /*
   * 탭을 옮기면 체크를 푼다(2026-10-21 박향근 지시). 안 풀면 지금 목록에 보이지도 않는 건이
   * 선택에 남아 출력·메일 버튼의 건수에 섞여 들어간다. 56건을 뽑으려다 엉뚱한 건이 같이 나간다.
   * 상단 KPI 카드도 탭을 바꾸므로 핸들러가 아니라 activeState 변화에 건다.
   * 검색어와 Urgent 토글은 일부러 두지 않는다. 글자를 칠 때마다 풀리면 고른 것을 계속 잃는다.
   */
  /*
   * 예외는 확정·완료·되돌리기가 행을 다음 탭으로 옮기는 경우뿐이다(R348).
   * 그때는 옮긴 id를 여기 넣어 두고 새 탭에서 그대로 다시 고른다.
   * 사람이 탭을 누르면 이 자리가 비어 있어 위 규칙대로 선택이 풀린다.
   */
  const carrySelection = useRef<string[] | null>(null)
  useEffect(() => {
    const keep = carrySelection.current
    carrySelection.current = null
    setSelected(new Set(keep ?? []))
  }, [activeState])
  /*
   * 행을 옮길 때는 ref에 넣고, 탭을 바꾸고, 선택도 직접 넣는다. 셋 다 해야 한다(R348).
   * 탭이 실제로 바뀌면 위 효과가 ref에서 되살리고, 이미 그 탭이면 효과가 안 돌아 setSelected가 그대로 선다.
   * setSelected 한 줄만 쓰면 탭이 바뀌는 순간 효과가 덮어 버린다.
   */
  const moveTo = (state: AnalysisState, ids: string[]) => {
    carrySelection.current = ids
    setUrgentOnly(false)
    setActiveState(state)
    setSelected(new Set(ids))
  }
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
  // 전체 탭은 보기 전용이다(2026-10-21 박향근 지시, R348). 탭마다 한 상태만 보이므로
  // 완료 건을 완료 탭 밖에서 고치는 길은 이것으로 함께 막힌다.
  // 삭제와 메일은 가리지 않는다. 권한만 보는 것이 R301에서 정한 규칙이다.
  const previewOnly = activeState === ALL
  const detailCanEdit = canEdit && !previewOnly
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
    // 메일은 여기서 보내지 않는다(R348). 의뢰 탭으로 옮겨 고른 채로 두고 사람이 메일 버튼을 누른다.
    moveTo("의뢰", [...ids])
    showNotice(`${confirmed.length}건을 의뢰로 옮겼습니다. 그대로 선택돼 있습니다. 의뢰 메일 발송을 누르세요.`)
  }
  const requestMail = () => {
    if (!requestedSelected.length) return
    void openAnalysisRequestMail(requestedSelected, recipients).then((result) => showNotice(result === "mailto"
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
    // 메일은 여기서 보내지 않는다(R348). 완료 탭으로 옮겨 고른 채로 두고 사람이 메일 버튼을 누른다.
    moveTo("완료", [...ids])
    showNotice(`${completed.length}건을 완료로 옮겼습니다. 그대로 선택돼 있습니다. 완료 메일 발송을 누르세요.`)
  }
  const finishedMail = () => {
    if (!finishedSelected.length) return
    void openAnalysisFinishedMail(finishedSelected, recipients).then((result) => showNotice(result === "mailto"
      ? "본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다."
      : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
  }
  const revertToDraft = (targets: AnalysisRequest[]) => {
    const requested = targets.filter((item) => item.state === "의뢰")
    if (!requested.length) return
    if (!confirm(`선택한 ${requested.length}건을 작성으로 되돌립니다. 의뢰일이 지워집니다. 계속할까요?`)) return
    const ids = new Set(requested.map((item) => item.id))
    const now = new Date().toISOString()
    const reverted = requested.map((item) => ({ ...item, state: "작성" as const, requestedAt: "", updatedAt: now }))
    const byId = new Map(reverted.map((item) => [item.id, item]))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? byId.get(item.id) ?? item : item))
    moveTo("작성", [...ids])
    showNotice(`${reverted.length}건을 작성으로 되돌렸습니다.`)
  }
  const revertToRequested = (targets: AnalysisRequest[]) => {
    const finished = targets.filter((item) => item.state === "완료")
    if (!finished.length) return
    if (!confirm(`선택한 ${finished.length}건을 의뢰로 되돌립니다. 완료일과 In charge, 분석 결과 네 칸이 모두 지워집니다. 분석 사진은 남습니다. 되돌릴 수 없습니다. 계속할까요?`)) return
    const ids = new Set(finished.map((item) => item.id))
    const now = new Date().toISOString()
    // 결과를 전부 비운다(2026-10-21 박향근 결정). 사진은 남긴다. 지우면 Storage 파일이 날아간다.
    const reverted = finished.map((item) => ({
      ...item, state: "의뢰" as const,
      finishedAt: "", inCharge: "", yarnDescription: "", constructionRnd: "", weightRnd: "" as const, commentRnd: "",
      updatedAt: now,
    }))
    const byId = new Map(reverted.map((item) => [item.id, item]))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => ids.has(item.id) ? byId.get(item.id) ?? item : item))
    moveTo("의뢰", [...ids])
    showNotice(`${reverted.length}건을 의뢰로 되돌렸습니다. 분석 결과를 비웠습니다.`)
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
  /*
   * 개발 의뢰로 넘기기(R352). 여기서는 대상만 정하고 의뢰 화면으로 보낸다.
   * 스타일을 실제로 만드는 것은 의뢰 화면이다. 요청 저장은 `FabricRequest.tsx`의
   * `commitRequests` 하나를 지나야 하는데 그것이 컴포넌트 안 지역 함수라 여기서 부를 수 없다.
   * `saveRequests`를 직접 부르는 길을 만들지 말 것. 보드 이력이 빠지고 전체 탭 편집이 뚫린다.
   */
  const transferToRequest = () => {
    const pick = pickTransferable(rows, selected, { liveReqIds })
    if (!pick.targets.length) {
      showNotice(pick.alreadyLinked ? "고른 건은 이미 개발 의뢰로 넘겼습니다." : "완료 상태인 건만 넘길 수 있습니다.")
      return
    }
    const skipped = transferSkipNotice(pick)
    if (skipped) showNotice(skipped)
    navigate(`/request?fromAnalysis=${pick.targets.map((item) => item.id).join(",")}`)
  }
  /*
   * 의뢰 양식 그대로의 엑셀로 받는다(2026-10-28 박향근 요구).
   * 열 구성을 새로 짜지 않고 `buildRequestWorkbook`을 그대로 쓴다. 의뢰 화면 「양식 내려받기」와
   * 같은 파일이 나오므로 받아서 그대로 업로드할 수 있다.
   * 보드가 없으므로 boardId와 chart는 빈 값이고, `requestReqId`는 기록하지 않는다.
   * 파일만 받은 것을 의뢰가 생긴 것으로 치면 나중에 웹으로 넘기는 길이 막힌다.
   */
  const downloadRequestChart = async () => {
    const pick = pickTransferable(rows, selected, { allowLinked: true, liveReqIds })
    if (!pick.targets.length) {
      showNotice("완료 상태인 건만 엑셀로 받을 수 있습니다.")
      return
    }
    try {
      const styles = pick.targets.map((item, index) => buildRequestStyleFromAnalysis(item, { boardId: "", chart: "", seq: index + 1 }))
      const blob = await buildRequestWorkbook(styles, { dropBasicBand: true, minOptionRows: 4, mergeStyleCells: true, matchScreenWidths: true })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = analysisChartFileName()
      anchor.click()
      URL.revokeObjectURL(url)
      const skipped = pick.notFinished ? ` 완료가 아닌 ${pick.notFinished}건은 뺐습니다.` : ""
      showNotice(`${pick.targets.length}건을 의뢰 양식으로 받았습니다.${skipped}`)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "엑셀을 만들지 못했습니다.")
    }
  }
  const visibleIds = filtered.map((item) => item.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  return <section className={`min-w-0 space-y-4${previewOnly ? " an-preview" : ""}`}>
    <PageHeader title="FABRIC ANALYSIS" subtitle="원단 분석 의뢰와 결과를 관리합니다." />

    <div className="grid min-h-16 grid-cols-2 divide-x divide-[var(--border)]/60 rounded-lg border border-[var(--border)]/60 bg-[var(--card)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:grid-cols-5">{metrics.map((metric) => <button type="button" key={metric.label} className="flex min-w-0 items-center gap-3 px-4 py-2 text-left hover:bg-[var(--muted)]/30" onClick={metric.onClick}><span className={`size-2 shrink-0 rounded-full ${metric.color}`} /><span className="min-w-0"><span className="block truncate text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]">{metric.label}</span>{metric.label === "평균 소요일" && !leadDays.length ? <span className="text-xl font-semibold">-</span> : <NumberTicker value={metric.value} decimals={metric.decimals} suffix={metric.suffix} className="text-xl font-semibold" />}</span></button>)}</div>
    <AnalysisKpiChart data={weekly} />

    <Card className="border-[var(--border)]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:translate-y-0 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className={`gap-3${previewOnly ? "" : " sticky top-16 z-10 rounded-t-xl border-b border-[var(--border)]/60 bg-[var(--card)]"}`}><CardTitle className="flex items-center gap-2 text-base font-medium">분석 의뢰 목록{previewOnly ? <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">보기 전용 · 편집은 상태 탭에서</span> : null}</CardTitle>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><Tabs value={activeState} onValueChange={(value) => { setActiveState(value as AnalysisState | typeof ALL); setUrgentOnly(false) }}><TabsList className="bg-transparent">{[ALL, ...ANALYSIS_STATES].map((state) => <TabsTrigger key={state} value={state} className="group rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none dark:data-[state=active]:border-teal-400 dark:data-[state=active]:text-teal-300">{state}<span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--muted-foreground)] group-data-[state=active]:bg-teal-600/15 group-data-[state=active]:text-teal-700 dark:group-data-[state=active]:text-teal-300">{tabCounts[state] ?? 0}</span></TabsTrigger>)}</TabsList></Tabs>
        {/* 선택 묶음은 탭 줄 가운데에 선다. 늘 자리를 차지해 체크할 때마다 아래 표가 밀리지 않는다. */}
        {/* 그 탭에서 쓸 수 없는 버튼은 뜨지 않는다(R348). 탭마다 보이는 행은 한 상태뿐이다. */}
        <div className="flex min-h-9 flex-1 flex-wrap items-center justify-center gap-2 text-sm">{!previewOnly && selected.size ? <>
          <span className="rounded-md bg-teal-500/10 px-2 py-1">{selected.size}건 선택</span>
          {activeState === "작성" && canEdit ? <Button size="sm" className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => confirmRequests(draftSelected)}><Mail />의뢰 확정</Button> : null}
          {activeState === "의뢰" ? <Button size="sm" className="bg-teal-600 text-white hover:bg-teal-700" onClick={requestMail}><Mail />의뢰 메일 발송</Button> : null}
          {activeState === "의뢰" && canEdit ? <Button size="sm" variant="outline" onClick={() => completeRequests(requestedSelected)}>완료 처리</Button> : null}
          {activeState === "의뢰" && canEdit ? <Button size="sm" variant="outline" onClick={() => revertToDraft(requestedSelected)}>작성으로 되돌리기</Button> : null}
          {activeState === "완료" ? <Button size="sm" className="bg-teal-600 text-white hover:bg-teal-700" onClick={finishedMail}><Mail />완료 메일 발송</Button> : null}
          {activeState === "완료" && canEdit ? <Button size="sm" variant="outline" disabled={!finishedSelected.length} title="고른 완료 건을 DEVELOPMENT REQUEST 스타일로 만듭니다" onClick={transferToRequest}><Send />개발 의뢰로 넘기기</Button> : null}
          {activeState === "완료" ? <Button size="sm" variant="outline" disabled={!finishedSelected.length} title="의뢰 양식 그대로의 엑셀로 받습니다" onClick={() => void downloadRequestChart()}><FileSpreadsheet />엑셀 차트 내려받기</Button> : null}
          {activeState === "완료" && canEdit ? <Button size="sm" variant="outline" onClick={() => revertToRequested(finishedSelected)}>의뢰로 되돌리기</Button> : null}
          {canEdit ? <Button size="sm" variant="outline" disabled={!deletableSelected.length} title={deletableSelected.length ? "선택한 의뢰를 지웁니다" : "만든 사람과 관리자만 지울 수 있습니다"} onClick={deleteSelected}><Trash2 />삭제</Button> : null}
          <Button size="sm" variant="outline" disabled={!printableSelected.length} title="완료 건은 분석 리포트, 그 밖에는 분석 의뢰서로 나갑니다" onClick={() => startPrint(printableSelected)}><Printer />출력</Button>
        </> : null}</div>
        <div className="flex items-center gap-2 lg:w-full lg:max-w-xl">{canEdit && activeState === "작성" ? <ShinyActionButton tone="teal" icon={<Plus />} onClick={() => { setEditRecord(null); setRequestOpen(true) }}>새 분석 의뢰</ShinyActionButton> : null}<Input className="min-w-0 flex-1" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="AN No. · Source code · Brand · Requester 검색" /></div></div>
        {urgentOnly ? <p className="text-xs text-rose-600">Urgent 대기만 표시 중</p> : null}
        {notice ? <p className="text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
      </CardHeader>
      <CardContent className="p-0"><div className={previewOnly ? "overflow-x-auto" : "max-h-[calc(100vh-20rem)] overflow-auto"}><Table className="min-w-[1750px] table-fixed text-xs [&_td]:py-1">
        <colgroup>{(previewOnly ? [86, 48, 108, 92, 72, 90, 88, 118, 124, 150, 64, 200, 88, 92, 220, 70] : [40, 86, 48, 108, 92, 72, 90, 88, 118, 124, 150, 64, 200, 88, 92, 220, 70]).map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <TableHeader className={previewOnly ? "bg-[var(--muted)]/40" : "sticky top-0 z-20 bg-[var(--card)] shadow-sm"}><TableRow className="border-[var(--border)]/50">
        {previewOnly ? null : <TableHead className="w-10 text-[11px] font-medium tracking-wide text-[var(--muted-foreground)] sticky top-0 z-20 bg-[var(--muted)]"><Checkbox className="data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600" checked={allVisibleSelected} onCheckedChange={() => setSelected((current) => { const next = new Set(current); if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id)); else visibleIds.forEach((id) => next.add(id)); return next })} aria-label="현재 목록 전체 선택" /></TableHead>}
        {['상태','사진','AN No.','의뢰일','구분','Requester','Brand','Source code','Construction','Contents','Weight','Request item','In charge','완료일','Analysis result',''].map((head, index) => <TableHead key={`${head}-${index}`} className={`text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]${previewOnly ? "" : " sticky top-0 z-20 bg-[var(--muted)]"}`}>{head}</TableHead>)}
      </TableRow></TableHeader><TableBody>{filtered.length ? filtered.map((item) => <TableRow key={item.id} className={`cursor-pointer border-[var(--border)]/50 font-normal transition-colors duration-150 hover:bg-teal-500/[0.06] dark:hover:bg-teal-400/10 ${selected.has(item.id) ? "bg-teal-500/10" : ""} ${item.requestType === "Urgent" ? "shadow-[inset_2px_0_0_#f43f5e]" : ""} ${item.state === "완료" ? "text-[var(--muted-foreground)]" : ""}`} onClick={() => { if (dragSelect.current?.moved) return; setDetail(item) }}>
        {previewOnly ? null : <TableCell
          onClick={(event) => { event.stopPropagation() }}
          onMouseDown={() => { dragSelect.current = { mode: !selected.has(item.id), moved: false } }}
          onMouseEnter={() => {
            const drag = dragSelect.current
            if (!drag) return
            drag.moved = true
            setSelected((current) => {
              const next = new Set(current)
              if (drag.mode) next.add(item.id); else next.delete(item.id)
              return next
            })
          }}
        ><Checkbox className="data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600" checked={selected.has(item.id)} onCheckedChange={() => setSelected((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })} aria-label={`${item.anNo} 선택`} /></TableCell>}
        <TableCell><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${stateClass[item.state]}`}><i className={`size-1.5 rounded-full ${stateDot[item.state]}`} />{item.state}</span></TableCell><TableCell><ImageThumb path={item.imageThumbPath || item.imagePath} label={item.anNo} /></TableCell><TableCell className="font-medium tabular-nums">{item.anNo}{hasLiveRequestLink(item, liveReqIds) ? <span className="ml-1.5 rounded-sm bg-sky-500/15 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300" title="개발 의뢰로 넘긴 건입니다">REQ</span> : null}</TableCell><TableCell>{item.requestedAt || "-"}</TableCell><TableCell>{item.requestType === "Urgent" ? <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-700 dark:text-rose-300">Urgent</span> : "Normal"}</TableCell><TableCell>{item.requester}</TableCell><TableCell>{item.brand || "-"}</TableCell><TableCell>{item.sourceCode || "-"}</TableCell><TableCell>{item.construction || "-"}</TableCell><TableCell>{item.contents || "-"}</TableCell><TableCell>{item.weight === "" ? "-" : item.weight}</TableCell><TableCell className="max-w-56 truncate">{item.description}</TableCell><TableCell>{item.inCharge || "-"}</TableCell><TableCell>{item.finishedAt || "-"}</TableCell><TableCell className="max-w-64 truncate">{item.yarnDescription || item.commentRnd || "-"}</TableCell><TableCell onClick={(event) => event.stopPropagation()}>{previewOnly ? null : item.state === "작성" && canEdit ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); confirmRequests([item]) }}>의뢰</Button> : item.state === "의뢰" && canEdit ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); completeRequests([item]) }}>완료</Button> : item.state === "완료" ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void openAnalysisFinishedMail([item], recipients).then((result) => showNotice(result === "mailto" ? "본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다." : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다.")) }}>메일</Button> : null}</TableCell>
      </TableRow>) : <TableRow><TableCell colSpan={previewOnly ? 16 : 17} className="h-32 text-center text-[var(--muted-foreground)]">표시할 분석 의뢰가 없습니다.</TableCell></TableRow>}</TableBody></Table></div></CardContent>
    </Card>

    <AnalysisRequestDialog open={requestOpen} onOpenChange={setRequestOpen} record={editRecord} requester={defaultName} requesterEmail={user?.email ?? ""} onSaved={(saved) => { if (editRecord) setDetail(saved) }} />
    <AnalysisDetailDialog record={detail} canEdit={detailCanEdit} defaultInCharge={defaultName} recipients={recipients} onOpenChange={(open) => { if (!open) setDetail(null) }} onSave={saveOne} onPrint={(record) => startPrint([record])} onEditRequest={(selectedRecord) => { setDetail(null); setEditRecord(selectedRecord); setRequestOpen(true) }} />
    {printJob ? <AnalysisPrintDeck records={printJob} onDone={() => setPrintJob(null)} /> : null}
  </section>
}
