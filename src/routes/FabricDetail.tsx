import { useMemo, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Link, useLocation, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { FABRIC_STATUS_META, buildFabricLedger, type FabricLedgerItem } from "@/data/fabric-ledger"
import { fmtDateFull, toDate } from "@/data/format"
import type { FabricLedgerAction, FabricLedgerEvent } from "@/data/schema"
import { useAppStore } from "@/store/useAppStore"

const ACTION_LABELS: Record<FabricLedgerAction, string> = {
  COMPLETE: "개발 완료",
  RECEIVE: "입고",
  OUTBOUND: "반출",
  EXHAUST: "소진 완료",
  DISPOSE: "폐기",
  RESTORE: "상태 복구",
  NOTE: "재고 변경",
}

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

function dateTimeText(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })
}

function numberText(value: number | null, unit = ""): string {
  return value === null ? "" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-1 min-h-5 break-words text-sm text-[var(--foreground)]">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">{title}</h2>
      {children}
    </section>
  )
}

function processRows(item: FabricLedgerItem): Array<{ label: string; mill: string; date: string }> {
  if (item.record) {
    const mills = item.record.tech?.mills
    const dates = item.record.tech?.processDates
    return [
      { label: "원사", mill: mills?.yarn ?? "", date: dates?.yarn ?? "" },
      { label: "편직", mill: mills?.knitting ?? "", date: dates?.knitting ?? "" },
      { label: "염색", mill: mills?.dyeing ?? "", date: dates?.dyeing ?? "" },
      { label: "가공", mill: mills?.finishing ?? "", date: dates?.finishing ?? "" },
    ]
  }

  const process = item.sample?.process
  return [
    { label: "원사", mill: process?.yarn ?? "", date: "" },
    { label: "편직", mill: process?.knit ?? "", date: "" },
    { label: "염색", mill: process?.dye ?? "", date: "" },
    { label: "가공", mill: process?.finish ?? "", date: "" },
  ]
}

function eventDetail(event: FabricLedgerEvent): string {
  if (event.action === "OUTBOUND") {
    const qty = typeof event.qty === "number" ? numberText(event.qty, " yds") : ""
    return [event.to, qty].filter(Boolean).join(" · ")
  }
  if (event.action === "DISPOSE") return event.reason || event.note
  return event.note
}

export function FabricDetail() {
  const { key: routeKey = "" } = useParams<{ key: string }>()
  const { pathname } = useLocation()
  const encodedKey = pathname.startsWith("/fabric/") ? pathname.slice("/fabric/".length) : routeKey
  const key = decodeFabricKey(encodedKey)
  const records = useAppStore((state) => state.records)
  const samples = useAppStore((state) => state.completed)
  const overrides = useAppStore((state) => state.fabricOverrides)
  const fabricEvents = useAppStore((state) => state.fabricEvents)
  const item = useMemo(
    () => buildFabricLedger(records, samples, overrides, fabricEvents).find((candidate) => candidate.key === key) ?? null,
    [fabricEvents, key, overrides, records, samples],
  )

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
  const processes = processRows(item)
  const events = fabricEvents
    .filter((event) => event.fabricKey === item.key)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))

  return (
    <div className="space-y-4">
      <Link to="/warehouse" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">
        <ArrowLeft className="size-4" />WAREHOUSE
      </Link>

      <header className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div><span className="mr-2 text-xs text-[var(--muted-foreground)]">FL#</span><strong className="font-mono text-sm">{item.flNo}</strong></div>
          <div><span className="mr-2 text-xs text-[var(--muted-foreground)]">Style No.</span><strong className="font-mono text-sm">{item.styleNo}</strong></div>
          <div><span className="mr-2 text-xs text-[var(--muted-foreground)]">R&amp;D No.</span><strong className="font-mono text-sm">{item.storageNo}</strong></div>
          <Badge className={`${status.tone} border-transparent text-white`}>{status.label}</Badge>
        </div>
        {/* 샘플관리대장 아카이브 행은 DD 원본(record)이 없어 일부 개발 필드가 비어 있다. */}
        {!item.record ? <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted-foreground)]">샘플관리대장 이력입니다. 개발 상세 일부는 기록되어 있지 않습니다.</p> : null}
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="개발">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
            <Field label="담당">{item.owner}</Field>
            <Field label="Season">{item.season}</Field>
            <Field label="Buyer">{item.buyer}</Field>
            <Field label="Category">{item.category}</Field>
            <Field label="Planner">{item.planner}</Field>
            <Field label="조직">{item.construction}</Field>
            <Field label="중량">{item.weight === "" ? "" : `${item.weight.toLocaleString("ko-KR")} gsm`}</Field>
            <Field label="Color">{item.color}</Field>
            <Field label="Dyeing">{item.dyeing}</Field>
            <Field label="접수일">{dateText(item.requestDate)}</Field>
            <Field label="납기">{dateText(item.dueDate)}</Field>
            <Field label="완료일">{dateText(item.completedAt)}</Field>
          </dl>
        </Section>

        <Section title="공정">
          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr><th className="px-3 py-2">단계</th><th className="px-3 py-2">업체</th><th className="px-3 py-2">완료일</th></tr>
              </thead>
              <tbody>
                {processes.map((process) => <tr key={process.label} className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-medium">{process.label}</th><td className="px-3 py-2">{process.mill}</td><td className="px-3 py-2">{dateText(process.date)}</td></tr>)}
              </tbody>
            </table>
          </div>
          {!item.record && item.sample?.process.remark ? <dl className="mt-4"><Field label="비고">{item.sample.process.remark}</Field></dl> : null}
        </Section>

        <Section title="창고">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            <Field label="R&amp;D No.">{item.storageNo}</Field>
            <Field label="보유">{numberText(item.yds, " yds")}</Field>
            <Field label="반출 합계">{numberText(item.outboundTotal, " yds")}</Field>
            <Field label="잔량">{numberText(item.balance, " yds")}</Field>
          </dl>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr><th className="px-3 py-2">날짜</th><th className="px-3 py-2">반출처</th><th className="px-3 py-2">사업부</th><th className="px-3 py-2 text-right">수량</th></tr>
              </thead>
              <tbody>
                {item.outbound.length ? item.outbound.map((outbound, index) => <tr key={`${outbound.date}-${index}`} className="border-t border-[var(--border)]"><td className="px-3 py-2">{dateText(outbound.date)}</td><td className="px-3 py-2">{outbound.to}</td><td className="px-3 py-2">{outbound.division ?? ""}</td><td className="px-3 py-2 text-right tabular-nums">{numberText(outbound.qty, " yds")}</td></tr>) : <tr><td colSpan={4} className="px-3 py-7 text-center text-[var(--muted-foreground)]">반출 이력이 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="이력">
          {events.length ? <ol className="divide-y divide-[var(--border)]">
            {events.map((event) => {
              const from = FABRIC_STATUS_META[event.fromStatus].label
              const to = FABRIC_STATUS_META[event.toStatus].label
              const detail = eventDetail(event)
              return <li key={event.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)]"><time className="text-xs text-[var(--muted-foreground)]">{dateTimeText(event.occurredAt)}</time><div className="min-w-0"><p className="text-sm font-medium">{ACTION_LABELS[event.action]}</p><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{from !== to ? `${from} → ${to}` : from}{event.actor ? ` · ${event.actor}` : ""}</p>{detail ? <p className="mt-1 break-words text-sm">{detail}</p> : null}</div></li>
            })}
          </ol> : <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">변경 이력이 없습니다</p>}
        </Section>
      </div>
    </div>
  )
}
