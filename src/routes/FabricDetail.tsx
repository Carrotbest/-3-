import { useMemo, useState, type ReactNode } from "react"
import { ArrowLeft, Check, Pencil, X } from "lucide-react"
import { Link, useLocation, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FABRIC_STATUS_META, buildFabricLedger, type FabricLedgerItem } from "@/data/fabric-ledger"
import { fmtDateFull, toDate } from "@/data/format"
import type { FabricLedgerAction, FabricLedgerEvent } from "@/data/schema"
import { applyFabricAction, saveFabricFields, useAppStore } from "@/store/useAppStore"

const ACTION_LABELS: Record<FabricLedgerAction, string> = {
  COMPLETE: "개발 완료",
  RECEIVE: "입고",
  UNRECEIVE: "입고 대기로 되돌림",
  CONFIRM: "실물 입고 확인",
  OUTBOUND: "반출",
  EXHAUST: "소진 완료",
  DISPOSE: "폐기",
  RESTORE: "상태 복구",
  REMOVE: "목록에서 삭제",
  NOTE: "재고 변경",
}

/** 창고 오버라이드에 쓰는 값. 나머지는 개발 데이터라 DD 레코드나 override.fields로 간다. */
const STOCK_IDS = new Set(["storageNo", "stockTotal", "stockBalance"])

function decodeFabricKey(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function dateText(value: string): string {
  return toDate(value) ? fmtDateFull(value) : ""
}

/** 이력 한 줄에 들어갈 짧은 날짜. 초 단위는 쓰지 않는다. */
function shortDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${String(date.getFullYear()).slice(2)}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function numberText(value: number | null, unit = ""): string {
  return value === null ? "" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`
}

/** 화면에 보이는 현재 값. 편집 초기값도 여기서 만든다. */
function valueOf(item: FabricLedgerItem, id: string): string {
  switch (id) {
    case "styleNo": return item.styleNo
    case "flNo": return item.flNo
    case "season": return item.season
    case "category": return item.category
    case "buyer": return item.buyer
    case "owner": return item.owner
    case "planner": return item.planner
    case "construction": return item.construction
    case "color": return item.color
    case "dyeing": return item.dyeing
    case "note": return item.note
    case "requestDate": return item.requestDate
    case "dueDate": return item.dueDate
    case "completedAt": return item.completedAt
    case "weight": return item.weight === "" ? "" : String(item.weight)
    case "storageNo": return item.storageNo
    case "stockTotal": return item.yds === null ? "" : String(item.yds)
    case "stockBalance": return item.balance === null ? "" : String(Math.max(0, item.balance))
    default: return item.fields[id] ?? ""
  }
}

function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <h2 className="flex items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--muted)_55%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
        <span aria-hidden="true" className={"h-3.5 w-1 rounded-full " + accent} />{title}
      </h2>
      <div className="p-3">{children}</div>
    </section>
  )
}

/** 라벨과 값이 한눈에 갈리도록 라벨은 옅은 띠에, 값은 그 아래 진한 글자로 둔다. */
function CellShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-r border-[var(--border)]">
      <dt className="truncate bg-[color-mix(in_srgb,var(--muted)_45%,transparent)] px-2 py-1 text-[10px] font-semibold tracking-wide text-[var(--muted-foreground)]">{label}</dt>
      <dd className="min-h-8 px-2 py-1.5">{children}</dd>
    </div>
  )
}

/** 고칠 수 없는 값(상태·계산값·이벤트 기록). 편집 모드에서도 입력칸이 되지 않는다. */
function StaticCell({ label, children }: { label: string; children: ReactNode }) {
  return <CellShell label={label}><span className="block truncate text-sm text-[var(--foreground)]">{children}</span></CellShell>
}

/** 값 칸을 격자로 묶는다. 왼쪽·위 선은 컨테이너가, 칸 사이 선은 각 칸이 그린다. */
const GRID = "grid overflow-hidden rounded-[var(--radius)] border-l border-t border-[var(--border)]"

/**
 * 편집 중에는 입력칸, 아니면 값만 보여준다.
 * 본문 밖에 둬야 한다. 안에 두면 렌더마다 새 컴포넌트가 되어 한 글자 칠 때마다 포커스가 빠진다.
 */
function FieldCell({ id, label, type = "text", suffix = "", item, editing, draft, onChange }: {
  id: string
  label: string
  type?: "text" | "date" | "number"
  suffix?: string
  item: FabricLedgerItem
  editing: boolean
  draft: Record<string, string>
  onChange: (id: string, value: string) => void
}) {
  const stored = valueOf(item, id)
  const value = editing ? draft[id] ?? stored : stored
  const mono = id === "flNo" || id === "styleNo" || id === "storageNo"
  return (
    <CellShell label={label}>
      {editing ? (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(id, event.target.value)}
          className="h-6 w-full rounded-sm border border-[var(--border)] bg-[var(--background)] px-1 text-sm outline-none focus:border-[var(--grid-selection)]"
        />
      ) : (
        <span className={"block truncate text-sm font-medium text-[var(--foreground)]" + (mono ? " font-mono" : "") + (type === "number" ? " tabular-nums" : "")} title={value}>
          {(type === "date" ? dateText(value) : value) || <span className="font-normal text-[var(--muted-foreground)]">—</span>}
          {value && suffix ? <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">{suffix}</span> : null}
        </span>
      )}
    </CellShell>
  )
}

function eventDetail(event: FabricLedgerEvent): string {
  if (event.action === "OUTBOUND") {
    const qty = typeof event.qty === "number" ? numberText(event.qty, "yds") : ""
    return [event.to, qty].filter(Boolean).join(" ")
  }
  if (event.action === "DISPOSE") return event.reason || event.note
  return event.note
}

export function FabricDetail() {
  const { key: routeKey = "" } = useParams<{ key: string }>()
  const { pathname } = useLocation()
  const encodedKey = pathname.startsWith("/fabric/") ? pathname.slice("/fabric/".length) : routeKey
  return <FabricDetailBody fabricKey={decodeFabricKey(encodedKey)} />
}

/** 라우트와 창고 팝업이 같은 본문을 쓴다. 두 곳에 같은 화면을 따로 만들지 않는다. */
export function FabricDetailBody({ fabricKey }: { fabricKey: string }) {
  const key = fabricKey
  const records = useAppStore((state) => state.records)
  const samples = useAppStore((state) => state.completed)
  const overrides = useAppStore((state) => state.fabricOverrides)
  const fabricEvents = useAppStore((state) => state.fabricEvents)
  const ledger = useMemo(
    () => buildFabricLedger(records, samples, overrides, fabricEvents),
    [fabricEvents, overrides, records, samples],
  )
  const item = ledger.find((candidate) => candidate.key === key) ?? null

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  if (!item) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-[var(--foreground)]">해당 원단을 찾을 수 없습니다</h1>
          <Link to="/warehouse" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline">
            <ArrowLeft className="size-4" />창고로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  const status = FABRIC_STATUS_META[item.status]
  const events = fabricEvents
    .filter((event) => event.fabricKey === item.key)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  const disposalReason = events.find((event) => event.action === "DISPOSE")?.reason
  const terminationReason = item.status === "EXHAUSTED" ? "전량 소진" : item.status === "DISPOSED" ? `폐기${disposalReason ? ` · ${disposalReason}` : ""}` : ""

  const startEdit = () => {
    setDraft({})
    setError("")
    setEditing(true)
  }
  const cancelEdit = () => {
    setDraft({})
    setError("")
    setEditing(false)
  }
  const change = (id: string, value: string) => {
    setDraft((current) => ({ ...current, [id]: value }))
    // 전체와 잔량은 한쪽을 고치면 나머지가 따라간다. 잔량 = 전체 − 반출 합계.
    if (id === "stockTotal") {
      const parsed = Number(value)
      setDraft((current) => ({ ...current, stockBalance: value.trim() && Number.isFinite(parsed) ? String(Math.max(0, parsed - item.outboundTotal)) : "" }))
    }
    if (id === "stockBalance") {
      const parsed = Number(value)
      setDraft((current) => ({ ...current, stockTotal: value.trim() && Number.isFinite(parsed) ? String(parsed + item.outboundTotal) : "" }))
    }
  }

  const confirmEdit = async () => {
    const changed = Object.entries(draft).filter(([id, value]) => value !== valueOf(item, id))
    if (!changed.length) { cancelEdit(); return }
    const nextStorageNo = draft.storageNo ?? item.storageNo
    const duplicate = nextStorageNo.trim()
      && nextStorageNo.trim() !== item.storageNo
      && ledger.some((other) => other.key !== item.key && other.storageNo.trim() === nextStorageNo.trim())
    if (duplicate) { setError(`R&D No. ${nextStorageNo.trim()} 는 다른 원단이 이미 쓰고 있습니다.`); return }

    setSaving(true)
    setError("")
    try {
      const stockChanged = changed.some(([id]) => STOCK_IDS.has(id))
      if (stockChanged) {
        const totalRaw = draft.stockTotal ?? valueOf(item, "stockTotal")
        const parsedTotal = Number(totalRaw)
        await applyFabricAction({
          fabricKey: item.key,
          action: "NOTE",
          fromStatus: item.status,
          toStatus: item.status,
          storageNo: nextStorageNo,
          yds: totalRaw.trim() && Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : undefined,
          clearYds: !totalRaw.trim(),
          note: "원단 상세에서 수정",
          autoExhaust: false,
        })
      }
      const dataPatch = Object.fromEntries(changed.filter(([id]) => !STOCK_IDS.has(id)))
      if (Object.keys(dataPatch).length) await saveFabricFields(item, dataPatch)
      setEditing(false)
      setDraft({})
    } catch (caught) {
      setError((caught as Error)?.message ?? "저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const cell = (id: string, label: string, type: "text" | "date" | "number" = "text", suffix = "") =>
    <FieldCell key={id} id={id} label={label} type={type} suffix={suffix} item={item} editing={editing} draft={draft} onChange={change} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link to="/warehouse" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">
          <ArrowLeft className="size-4" />WAREHOUSE
        </Link>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={cancelEdit}><X />취소</Button>
              <Button type="button" size="sm" disabled={saving} onClick={() => { void confirmEdit() }}><Check />{saving ? "저장 중…" : "확인"}</Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={startEdit}><Pencil />수정</Button>
          )}
        </div>
      </div>

      {error ? <p className="rounded-[var(--radius)] border border-[var(--destructive)] px-3 py-2 text-sm text-[var(--destructive)]">{error}</p> : null}

      <header className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className={GRID + " min-w-0 flex-1 grid-cols-2 sm:grid-cols-4"}>
            {cell("flNo", "FL#")}
            {cell("styleNo", "Style No.")}
            {cell("storageNo", "R&D No.")}
            <StaticCell label="상태"><Badge className={`${status.tone} border-transparent text-white`}>{status.label}</Badge></StaticCell>
          </dl>
          <dl className={GRID + " w-full shrink-0 grid-cols-3 sm:w-auto sm:min-w-[22rem]"}>
            {cell("stockTotal", "전체 yds", "number")}
            <StaticCell label="반출 합계"><span className="tabular-nums">{numberText(item.outboundTotal) || "0"}</span></StaticCell>
            {cell("stockBalance", "잔량 yds", "number")}
          </dl>
        </div>
        {terminationReason ? <p className="mt-3 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted-foreground)]">종료 사유 {terminationReason}</p> : null}
        {!item.record ? <p className="mt-3 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted-foreground)]">샘플관리대장 행입니다. 여기서 고친 값은 이 화면에만 저장되고 대장 원본은 그대로 둡니다.</p> : null}
      </header>

      <div className="grid gap-3 xl:grid-cols-2">
        <Section title="원단" accent="bg-emerald-500">
          <dl className={GRID + " grid-cols-2 sm:grid-cols-4"}>
            {cell("construction", "조직")}
            {cell("weight", "목표 중량", "number", "gsm")}
            {cell("actualWeight", "실측 중량", "number", "gsm")}
            {cell("actualWidth", "폭", "number", "cm")}
            {cell("shrinkageLength", "축률 경", "number", "%")}
            {cell("shrinkageWidth", "축률 위", "number", "%")}
            {cell("color", "Color")}
            {cell("dyeing", "Dyeing")}
          </dl>
          <dl className={GRID + " mt-3 grid-cols-1 sm:grid-cols-2"}>
            {cell("yarnDetail", "원사")}
            {cell("note", "Remark")}
          </dl>
          <dl className={GRID + " mt-3 grid-cols-2 sm:grid-cols-4"}>
            {cell("millYarn", "원사처")}
            {cell("millKnitting", "편직")}
            {cell("millDyeing", "염색")}
            {cell("millFinishing", "가공")}
          </dl>
        </Section>

        <Section title="분류 · 의뢰" accent="bg-sky-500">
          <dl className={GRID + " grid-cols-2 sm:grid-cols-4"}>
            {cell("season", "Season")}
            {cell("category", "Category")}
            {cell("buyer", "Buyer")}
            {cell("owner", "담당")}
            {cell("planner", "Planner")}
            {cell("requestDate", "접수일", "date")}
            {cell("dueDate", "납기", "date")}
            {cell("completedAt", "샘플 완료일", "date")}
            {cell("fds", "FDS", "date")}
            {cell("yds", "YDS", "date")}
            <StaticCell label="입고일">{item.intakeAt ? dateText(item.intakeAt.slice(0, 10)) : <span className="text-[var(--muted-foreground)]">—</span>}</StaticCell>
            {cell("passFail", "Pass/Fail")}
          </dl>
          <dl className={GRID + " mt-3 grid-cols-1"}>
            {cell("review", "Review")}
          </dl>
        </Section>

        <Section title="반출" accent="bg-amber-500">
          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr><th className="px-3 py-1.5">날짜</th><th className="px-3 py-1.5">반출처</th><th className="px-3 py-1.5">사업부</th><th className="px-3 py-1.5 text-right">수량</th></tr>
              </thead>
              <tbody>
                {item.outbound.length ? item.outbound.map((outbound, index) => <tr key={`${outbound.date}-${index}`} className="border-t border-[var(--border)]"><td className="px-3 py-1.5">{dateText(outbound.date)}</td><td className="px-3 py-1.5">{outbound.to}</td><td className="px-3 py-1.5">{outbound.division ?? ""}</td><td className="px-3 py-1.5 text-right tabular-nums">{numberText(outbound.qty, " yds")}</td></tr>) : <tr><td colSpan={4} className="px-3 py-5 text-center text-[var(--muted-foreground)]">반출 이력이 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="이력" accent="bg-slate-400">
          {events.length ? <ul className="divide-y divide-[var(--border)] text-xs">
            {events.map((event) => {
              const from = FABRIC_STATUS_META[event.fromStatus].label
              const to = FABRIC_STATUS_META[event.toStatus].label
              const detail = eventDetail(event)
              return (
                <li key={event.id} className="flex items-baseline gap-2 py-1">
                  <time className="w-24 shrink-0 tabular-nums text-[var(--muted-foreground)]">{shortDateTime(event.occurredAt)}</time>
                  <span className="w-28 shrink-0 font-medium text-[var(--foreground)]">{ACTION_LABELS[event.action]}</span>
                  <span className="shrink-0 text-[var(--muted-foreground)]">{from !== to ? `${from} → ${to}` : from}</span>
                  {detail ? <span className="min-w-0 truncate text-[var(--muted-foreground)]" title={detail}>{detail}</span> : null}
                </li>
              )
            })}
          </ul> : <p className="py-3 text-center text-sm text-[var(--muted-foreground)]">변경 이력이 없습니다</p>}
        </Section>
      </div>
    </div>
  )
}
