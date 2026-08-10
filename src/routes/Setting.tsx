import { useEffect, useMemo, useState } from "react"
import { Database, Save, Settings2, Trash2 } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { StatusBadge } from "@/components/data-table/StatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { checkStyleNo, fmtDateFull, fmtTime, normalizeSeason } from "@/data/format"
import { clearCache } from "@/data/cache"
import { ingestDevelopment, ingestFabric, ingestRdda, ingestSamples, ingestStudyWorkbook, ingestTs } from "@/data/upload"
import { rddaMonthFromFlNo } from "@/data/derive"
import { CATEGORIES, MEMBERS } from "@/data/schema"
import { createInitialAppState, useAppStore } from "@/store/useAppStore"

const STORAGE_KEY = "fabric.settings"
const PERMISSIONS = ["조회", "등록·처리", "관리자"] as const
type Permission = (typeof PERMISSIONS)[number]

interface StandardValue { value: string; active: boolean }
interface SettingsUser { id: string; name: string; role: string; permission: Permission; active: boolean }
interface AlertRule { key: string; label: string; enabled: boolean; value: string; unit: string }
interface HistoryEntry { id: string; at: string; by: string; item: string; before: string; after: string }
interface SettingsState {
  standards: Record<string, StandardValue[]>
  users: SettingsUser[]
  alerts: AlertRule[]
  history: HistoryEntry[]
}

const STANDARD_GROUPS = [
  { key: "construction", label: "조직", values: ["Interlock", "Single Jersey", "Rib 1x1", "Fleece", "Terry", "Mesh"] },
  { key: "dyeing", label: "가공/염색", values: ["Piece", "Yarn", "Solution", "Garment"] },
  { key: "season", label: "시즌", values: ["SS'27", "FW'27", "SS'26", "FW'26"] },
  { key: "category", label: "카테고리", values: [...CATEGORIES] },
  { key: "owner", label: "담당자", values: MEMBERS.map((member) => member.name) },
  { key: "buyer", label: "Buyer", values: [] },
] as const

function defaults(): SettingsState {
  return {
    standards: Object.fromEntries(STANDARD_GROUPS.map((group) => [group.key, group.values.map((value) => ({ value, active: true }))])),
    users: MEMBERS.map((member, index) => ({ ...member, permission: index === 0 ? "관리자" : "등록·처리", active: true })),
    alerts: [
      { key: "dueSoon", label: "납기 임박 알림", enabled: true, value: "3", unit: "일 전" },
      { key: "overdue", label: "납기 초과 알림", enabled: true, value: "당일", unit: "" },
      { key: "tdsStale", label: "TDS 미반영 알림", enabled: true, value: "7", unit: "일" },
      { key: "studyDue", label: "STUDY 마감 알림", enabled: true, value: "목요일 1일 전", unit: "" },
    ],
    history: [],
  }
}

function loadSettings(): SettingsState {
  const base = defaults()
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SettingsState> | null
    if (!saved) return base
    return {
      standards: { ...base.standards, ...(saved.standards ?? {}) },
      users: Array.isArray(saved.users) ? saved.users : base.users,
      alerts: Array.isArray(saved.alerts) ? saved.alerts : base.alerts,
      history: Array.isArray(saved.history) ? saved.history : base.history,
    }
  } catch {
    return base
  }
}

function cloneSettings(settings: SettingsState): SettingsState {
  return JSON.parse(JSON.stringify(settings)) as SettingsState
}

export function Setting() {
  const records = useAppStore((state) => state.records)
  const completed = useAppStore((state) => state.completed)
  const orgMembers = useAppStore((state) => state.orgMembers)
  const [saved, setSaved] = useState<SettingsState>(loadSettings)
  const [draft, setDraft] = useState<SettingsState>(() => cloneSettings(saved))
  const [selectedGroup, setSelectedGroup] = useState("construction")
  const [seasonPreview, setSeasonPreview] = useState("SP27")
  const [permissionError, setPermissionError] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [recentUploads, setRecentUploads] = useState<Record<string, string>>({})

  const resetCache = async () => {
    await clearCache()
    useAppStore.setState(createInitialAppState())
    setSaveMessage("파싱 캐시를 비우고 예시 데이터로 돌아갔습니다.")
  }

  useEffect(() => {
    if (!saveMessage) return
    const timer = window.setTimeout(() => setSaveMessage(""), 3000)
    return () => window.clearTimeout(timer)
  }, [saveMessage])

  const standards = useMemo(() => {
    const next = cloneSettings(draft).standards
    const buyers = [...new Set(records.map((record) => record.buyer).filter(Boolean))]
    const existing = new Set((next.buyer ?? []).map((item) => item.value))
    next.buyer = [...(next.buyer ?? []), ...buyers.filter((buyer) => !existing.has(buyer)).map((value) => ({ value, active: true }))]
    return next
  }, [draft, records])
  const group = STANDARD_GROUPS.find((item) => item.key === selectedGroup) ?? STANDARD_GROUPS[0]
  const values = standards[group.key] ?? []
  const normalizedSeason = normalizeSeason(seasonPreview)
  const invalidStyleCount = records.filter((record) => !checkStyleNo(record.styleNo).ok).length
  const teamHierarchy = useMemo(
    () => [...orgMembers].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko-KR")),
    [orgMembers],
  )
  const sampleAudit = useMemo(() => {
    const unique = new Map(completed.filter((sample) => /\d/.test(sample.flNo)).map((sample) => [sample.flNo.replace(/\s+/g, "").toUpperCase(), sample]))
    const months = new Map<string, number>()
    const sheets = new Set<string>()
    let invalidMonth = 0
    unique.forEach((sample) => {
      const month = rddaMonthFromFlNo(sample.flNo)
      if (month) months.set(month, (months.get(month) ?? 0) + 1)
      else invalidMonth += 1
      if (sample.sourceSheet) sheets.add(sample.sourceSheet)
    })
    return { total: unique.size, june: months.get("2026-06") ?? 0, july: months.get("2026-07") ?? 0, invalidMonth, sheets: [...sheets] }
  }, [completed])

  const deliverOne = (key: string, files: File[], handler: (file: File) => Promise<void>) => {
    const file = files[0]
    if (!file) return
    setRecentUploads((current) => ({ ...current, [key]: file.name }))
    void handler(file)
  }

  const useCount = (key: string, value: string) => records.filter((record) => String(record[key as keyof typeof record] ?? "") === value).length

  const toggleStandard = (index: number) => {
    setDraft((current) => {
      const next = cloneSettings(current)
      next.standards = { ...standards }
      next.standards[group.key] = values.map((item, itemIndex) => itemIndex === index ? { ...item, active: !item.active } : item)
      return next
    })
  }

  const changePermission = (id: string, permission: Permission) => {
    const currentUser = draft.users.find((user) => user.id === id)
    if (!currentUser) return
    const adminCount = draft.users.filter((user) => user.permission === "관리자").length
    if (currentUser.permission === "관리자" && permission !== "관리자" && adminCount === 1) {
      setPermissionError("관리자는 최소 1명이 필요합니다. 기존 권한으로 되돌렸습니다.")
      return
    }
    setPermissionError("")
    setDraft((current) => ({ ...current, users: current.users.map((user) => user.id === id ? { ...user, permission } : user) }))
  }

  const save = () => {
    const timestamp = new Date().toISOString()
    const next = cloneSettings(draft)
    next.standards = standards
    next.history = [{
      id: timestamp,
      at: timestamp,
      by: "현재 사용자",
      item: "SETTING",
      before: "이전 저장값",
      after: "변경 내용 반영",
    }, ...saved.history].slice(0, 100)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // 저장소 제한이 있어도 화면의 현재 세션 설정은 유지한다.
    }
    setSaved(next)
    setDraft(cloneSettings(next))
    setSaveMessage("저장했습니다.")
  }

  const historyColumns: DataTableColumn<HistoryEntry>[] = [
    { id: "at", header: "시각", accessor: (row) => row.at, cell: (row) => `${fmtDateFull(row.at)} ${fmtTime(row.at)}` },
    { id: "by", header: "변경자", accessor: (row) => row.by },
    { id: "item", header: "항목", accessor: (row) => row.item },
    { id: "change", header: "변경", accessor: (row) => `${row.before} → ${row.after}` },
  ]

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="SETTING"
        subtitle="기준값, 사용자 권한과 알림 규칙을 관리합니다."
        actions={<Button type="button" onClick={save}><Save aria-hidden="true" />저장</Button>}
      />
      <p aria-live="polite" className="min-h-5 text-sm font-medium text-[var(--chart-2)]">{saveMessage}</p>

      <SectionCard title="파일 연결 센터" subtitle="열려 있는 Excel 파일도 탐색기에서 각 카드로 끌어다 놓을 수 있습니다. 파일은 한 번에 하나씩 해당 연결 카드에 올려주세요.">
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { key: "development", title: "개발 현황 (DD)", file: "Development Dashboard.xlsx", targets: "HOME 완료·신규·스케줄 / DEVELOPMENT 전체 현황", accept: ".xlsx,.xls", onFiles: (files: File[]) => deliverOne("development", files, ingestDevelopment) },
            { key: "samples", title: "샘플 관리 대장", file: "샘플 관리 대장.xlsx", targets: "HOME RDDA 등록 현황(7월까지) / DEVELOPMENT 완료 샘플", accept: ".xlsx,.xls", onFiles: (files: File[]) => deliverOne("samples", files, ingestSamples) },
            { key: "study", title: "STUDY 현황", file: "Capability Improvement.xlsx", targets: "STUDY 진행 현황 / HOME 업무 카드", accept: ".xlsx,.xls", onFiles: (files: File[]) => deliverOne("study", files, ingestStudyWorkbook) },
            { key: "ts", title: "TS 관리", file: "Technical survices {연도}.xlsx", targets: "TS 접수·처리 목록 / HOME 업무 카드", accept: ".xlsx,.xls,.csv", onFiles: (files: File[]) => deliverOne("ts", files, ingestTs) },
            { key: "rdda", title: "RDDA 리포트", file: "26년 N월 RDDA.xlsx", targets: "RDDA REPORT Meeting·Pickup·월별 스냅샷", accept: ".xlsx,.xls", onFiles: (files: File[]) => deliverOne("rdda", files, async (file) => ingestRdda([file])) },
            { key: "fabric", title: "원단분석", file: "원단분석 export 파일", targets: "FABRIC ANALYSIS / HOME 원단분석 업무 카드", accept: ".xlsx,.xls,.csv", onFiles: (files: File[]) => deliverOne("fabric", files, ingestFabric) },
          ].map((item) => (
            <article key={item.key} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-start gap-3 border-b border-[var(--border)] p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]"><Database className="size-4" /></span>
                <div className="min-w-0"><h3 className="text-sm font-semibold text-[var(--foreground)]">{item.title}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">파일: {item.file}</p><p className="mt-2 text-xs font-medium text-[var(--foreground)]">연결: {item.targets}</p>{recentUploads[item.key] ? <p className="mt-2 truncate text-[11px] text-[var(--chart-2)]">최근 선택: {recentUploads[item.key]}</p> : null}</div>
              </div>
              <div className="p-3"><DataUpload kind={item.key} label={`${item.title} 파일 놓기`} accept={item.accept} onFiles={item.onFiles} /></div>
            </article>
          ))}
        </div>
        <div className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">샘플관리대장 FL 파싱 확인</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">동일 FL 제거 후 {sampleAudit.total.toLocaleString("ko-KR")}건 · FL 2606 {sampleAudit.june.toLocaleString("ko-KR")}건 · FL 2607 {sampleAudit.july.toLocaleString("ko-KR")}건 · 월 형식 불일치 {sampleAudit.invalidMonth.toLocaleString("ko-KR")}건</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">인식 시트: {sampleAudit.sheets.length ? sampleAudit.sheets.join(" · ") : "기존 캐시 — 샘플관리대장을 다시 올리면 시트별 정보가 표시됩니다."}</p>
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <Button type="button" variant="outline" onClick={() => { void resetCache() }}><Trash2 aria-hidden="true" />캐시 비우기</Button>
        </div>
      </SectionCard>

      <Tabs defaultValue="standards" className="min-w-0">
        <TabsList aria-label="SETTING 메뉴">
          <TabsTrigger value="standards">기준값</TabsTrigger>
          <TabsTrigger value="users">사용자</TabsTrigger>
          <TabsTrigger value="alerts">알림</TabsTrigger>
          <TabsTrigger value="history">이력</TabsTrigger>
        </TabsList>

        <TabsContent value="standards" className="mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <SectionCard title="기준값 목록" subtitle="관리할 항목을 선택합니다." revealDelay={0}>
              <nav className="grid gap-2" aria-label="기준값 항목">
                {STANDARD_GROUPS.map((item) => (
                  <Button key={item.key} type="button" variant={selectedGroup === item.key ? "secondary" : "ghost"} className="justify-start" onClick={() => setSelectedGroup(item.key)}>{item.label}</Button>
                ))}
              </nav>
            </SectionCard>
            <SectionCard title={`${group.label} 기준값`} subtitle="삭제하지 않고 비활성 상태로 전환합니다." revealDelay={75}>
              <div className="grid gap-2">
                {values.length ? values.map((item, index) => (
                  <div key={item.value} className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3">
                    <div className="min-w-0 flex-1"><p className="font-medium text-[var(--foreground)]">{item.value}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">사용 <NumberTicker value={useCount(group.key, item.value)} suffix="건" /></p></div>
                    <StatusBadge status={item.active ? "Active" : "Suspended"} />
                    <Button type="button" variant="ghost" onClick={() => toggleStandard(index)}>{item.active ? "비활성화" : "되돌리기"}</Button>
                  </div>
                )) : <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">등록된 기준값이 없습니다.</p>}
              </div>
            </SectionCard>
          </div>
          {selectedGroup === "season" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="시즌 표기 미리보기" subtitle="원본은 바꾸지 않고 표시만 통일합니다.">
                <Label htmlFor="season-preview">시즌 입력</Label>
                <Input id="season-preview" className="mt-2" value={seasonPreview} onChange={(event) => setSeasonPreview(event.target.value)} />
                <output className="mt-4 block text-2xl font-semibold text-[var(--foreground)]">{normalizedSeason.value || "—"}</output>
              </SectionCard>
              <SectionCard title="Style No. 형식 점검" subtitle="영문 2자 + 숫자 2자 - 숫자 3~4자">
                <p className="text-2xl font-semibold text-[var(--foreground)]">위반 <NumberTicker value={invalidStyleCount} suffix="건" /></p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">예: GD26-1042</p>
              </SectionCard>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="users" className="mt-6 space-y-4">
          <SectionCard title="팀 계층" subtitle="조직도 JSON을 기준으로 직급 순서대로 표시합니다.">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="팀 계층">
              {teamHierarchy.map((member) => (
                <div key={`${member.name}-${member.title}`} className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3" role="listitem">
                  <Badge variant="secondary">{member.name}</Badge>
                  <Badge variant="outline">{member.title}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="사용자 권한" subtitle="권한은 저장 버튼을 눌러 반영합니다.">
            <div className="divide-y divide-[var(--border)]">
              {draft.users.map((user) => (
                <div key={user.id} className="grid items-center gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_12rem_auto]">
                  <strong>{user.name}</strong><span className="text-sm text-[var(--muted-foreground)]">{user.role}</span>
                  <Select value={user.permission} onValueChange={(value) => changePermission(user.id, value as Permission)}>
                    <SelectTrigger aria-label={`${user.name} 권한`}><SelectValue /></SelectTrigger>
                    <SelectContent>{PERMISSIONS.map((permission) => <SelectItem key={permission} value={permission}>{permission}</SelectItem>)}</SelectContent>
                  </Select>
                  <Badge variant="outline">사용</Badge>
                </div>
              ))}
            </div>
            {permissionError ? <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{permissionError}</p> : null}
          </SectionCard>
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <SectionCard title="알림 규칙" subtitle="변경 후 저장 버튼을 눌러 반영합니다.">
            <div className="grid gap-3">
              {draft.alerts.map((rule) => (
                <div key={rule.key} className="grid items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4 sm:grid-cols-[auto_minmax(10rem,1fr)_minmax(8rem,12rem)_auto]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`${rule.label} ${rule.enabled ? "켜짐" : "꺼짐"}`}
                    onClick={() => setDraft((current) => ({ ...current, alerts: current.alerts.map((item) => item.key === rule.key ? { ...item, enabled: !item.enabled } : item) }))}
                    className={`relative h-6 w-11 rounded-full border outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${rule.enabled ? "border-[var(--chart-2)] bg-[var(--chart-2)]" : "border-[var(--border)] bg-[var(--background)]"}`}
                  >
                    <span className={`block size-4 rounded-full bg-[var(--primary-foreground)] transition-transform motion-reduce:transition-none ${rule.enabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                  <div><strong className="text-sm">{rule.label}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">{rule.enabled ? "사용 중" : "꺼짐"}</p></div>
                  <Input aria-label={`${rule.label} 기준값`} value={rule.value} onChange={(event) => setDraft((current) => ({ ...current, alerts: current.alerts.map((item) => item.key === rule.key ? { ...item, value: event.target.value } : item) }))} />
                  <span className="text-sm text-[var(--muted-foreground)]">{rule.unit}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <SectionCard title="변경 이력" subtitle={<NumberTicker value={saved.history.length} suffix="건" />} contentClassName="p-0">
            <DataTable columns={historyColumns} rows={saved.history} getRowId={(row) => row.id} pageSize={10} emptyMessage="아직 변경 이력이 없습니다." />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><Settings2 aria-hidden="true" className="size-4" />설정은 이 브라우저에만 저장됩니다.</div>
    </section>
  )
}
