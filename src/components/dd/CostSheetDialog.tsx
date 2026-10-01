import { Fragment, useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Download, Plus, Printer, Save, Trash2, TriangleAlert } from "lucide-react"

import { CostSheetPrintSheet } from "@/components/dd/CostSheetPrintSheet"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { compareCostSheets, isCostSheetStale, listCostSheets, saveCostSheet, updateCostSheet, type CostSheetDoc } from "@/data/cost-sheets"
import { costSheetFileName, exportCostSheetWorkbook } from "@/data/cost-export"
import { downloadBlob } from "@/data/dd-export"
import { computeFabricCost, type CostFee, type CostInput, type CostYarnLine, type FabricCostSheet, type FeeGroup, type FeeUnit, type YarnPriceUnit } from "@/data/fabric-cost"
import { auth } from "@/data/firebase"
import type { DevRecord, DevTechnical } from "@/data/schema"
import { composeBlend, FIBER_ALIASES, guessCountUnit, parseYarnSpec, splitYarnDetail, type CountUnit, type YarnComponent, type YarnSpec } from "@/data/yarn-blend"

interface CostSheetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: DevRecord[]
  canEdit: boolean
  onSaved: (rowKey: string, ref: NonNullable<DevTechnical["costRef"]>) => void
  /** 창고 원장에서 찾은 R&D No. 표기. 연결이 없으면 빈 문자열. */
  storageNoFor?: (row: DevRecord) => string
}

const YARN_UNITS: YarnPriceUnit[] = ["USD/kg", "USD/lb", "USD/bale", "KRW/kg"]
const FEE_UNITS: FeeUnit[] = ["KRW/kg", "KRW/yd", "USD/kg", "USD/yd"]
const FEE_GROUPS: { value: FeeGroup; label: string }[] = [
  { value: "yarnDye", label: "원사" }, { value: "knitting", label: "편직" },
  { value: "dyeing", label: "염색" }, { value: "other", label: "기타" },
]
const FEE_LABEL_PRESETS: Record<FeeGroup, string[]> = {
  yarnDye: ["선염", "연사", "인팅"],
  knitting: ["편직"],
  dyeing: ["염색"],
  other: ["워싱", "기모", "컴팩"],
}
const ALL_PRESETS = new Set(Object.values(FEE_LABEL_PRESETS).flat())
const COUNT_UNITS: CountUnit[] = ["D", "dtex", "tex", "Ne", "Nm"]
const rowKeyOf = (row: DevRecord): string => `${row._src.sheet}::${row._src.row}`
const numberValue = (value: string): number => Number.isFinite(Number(value)) ? Number(value) : 0
const money = (value: number, digits = 2): string => value.toLocaleString("ko-KR", { maximumFractionDigits: digits })

const blankComponent = (unit: CountUnit = "Ne"): YarnComponent => ({ fiber: "", nominal: 0, unit, mode: "plain" })
const blankYarn = (): CostYarnLine => ({ name: "", ratio: 100, price: 0, priceUnit: "USD/kg", spec: { components: [blankComponent()] } })
const blankFee = (group: FeeGroup = "other", mill = ""): CostFee => ({ group, label: "", mill, rate: 0, unit: "KRW/kg", loss: 0 })
const KNIT_SPEC_LABELS: [keyof NonNullable<DevTechnical["knitSpec"]>, string][] = [
  ["inch", "Inch"], ["gauge", "Gauge"], ["needles", "Needles"],
  ["loopF", "Loop F"], ["loopT", "Loop T"], ["loopB", "Loop B"],
]
const knitSpecRemark = (row: DevRecord): string => {
  const spec = row.tech?.knitSpec
  if (!spec) return ""
  return KNIT_SPEC_LABELS
    .map(([key, label]) => [label, (spec[key] ?? "").trim()] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label} ${value}`)
    .join(" / ")
}
const specSummary = (yarn: CostYarnLine): string => {
  const components = yarn.spec?.components ?? []
  if (!components.length) return "성분 입력"
  const first = components[0]
  if (first.blend?.length) return first.blend.map((item) => `${item.fiber} ${item.pct}`).join(" / ")
  return components.map((item) => `${item.fiber || "성분"}${item.nominal ? ` ${item.nominal}${item.unit}` : ""}`).join(" + ")
}

const normalizeComponentMode = (component: YarnComponent): YarnComponent => {
  const fiber = FIBER_ALIASES[component.fiber.trim().toLowerCase()] ?? component.fiber.trim()
  return fiber === "Spandex"
    ? { ...component, mode: "draft", factor: 3 }
    : { ...component, mode: "plain", factor: undefined }
}
const normalizeSpecModes = (spec: YarnSpec): YarnSpec => ({ ...spec, components: spec.components.map(normalizeComponentMode) })
const normalizeInputModes = (input: CostInput): CostInput => ({ ...input, yarns: input.yarns.map((yarn) => ({ ...yarn, spec: yarn.spec ? normalizeSpecModes(yarn.spec) : yarn.spec })) })

function yarnsFromRow(row: DevRecord): { yarns: CostYarnLine[]; auto: boolean[] } {
  const parts = splitYarnDetail(row.tech?.yarnDetail ?? "")
  if (!parts.length) return { yarns: [blankYarn()], auto: [false] }
  const ratio = parts.length === 1 ? 100 : 0
  const parsed = parts.map((name) => parseYarnSpec(name))
  return {
    yarns: parts.map((name, index) => ({ ...blankYarn(), name, ratio, spec: parsed[index] ? normalizeSpecModes(parsed[index]) : { components: [blankComponent(guessCountUnit(name) ?? "Ne")] } })),
    auto: parsed.map(Boolean),
  }
}

function defaultInput(row: DevRecord, yarns: CostYarnLine[]): CostInput {
  return {
    fxRate: 1300,
    gsm: Number(row.tech?.actual?.weight ?? row.weight) || 0,
    widthInch: Number(row.tech?.actual?.width) || 0,
    yarns,
    fees: [
      { ...blankFee("yarnDye", row.tech?.mills?.yarn), label: "선염" },
      { ...blankFee("knitting", row.tech?.mills?.knitting), label: "편직", remark: knitSpecRemark(row) },
      { ...blankFee("dyeing", row.tech?.mills?.dyeing), label: "염색" },
      { ...blankFee("other", row.tech?.mills?.finishing), label: "워싱" },
    ],
    profitPct: 0,
  }
}

export function CostSheetDialog({ open, onOpenChange, rows, canEdit, onSaved, storageNoFor }: CostSheetDialogProps) {
  const [active, setActive] = useState(0)
  const [input, setInput] = useState<CostInput | null>(null)
  const [note, setNote] = useState("")
  const [versions, setVersions] = useState<CostSheetDoc[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState("")
  const [, setAutoYarns] = useState<boolean[]>([])
  const [openSpecRows, setOpenSpecRows] = useState<number[]>([])
  const row = rows[Math.min(active, Math.max(0, rows.length - 1))]
  const current = versions.find((item) => item.id === selectedId) ?? null

  const loadVersion = (doc: CostSheetDoc) => {
    setSelectedId(doc.id)
    setInput(normalizeInputModes(structuredClone(doc.sheet.input)))
    setAutoYarns(doc.sheet.input.yarns.map(() => false))
    setNote(doc.note ?? "")
  }

  useEffect(() => {
    if (!open) return
    setActive(0)
  }, [open])

  useEffect(() => {
    if (!open || !row) return
    let live = true
    const initialYarns = yarnsFromRow(row)
    setLoading(true); setError(""); setVersions([]); setSelectedId(""); setInput(defaultInput(row, initialYarns.yarns)); setAutoYarns(initialYarns.auto); setNote("")
    const filter = row.tech?.costRef?.groupId ? { groupId: row.tech.costRef.groupId } : { rowKey: rowKeyOf(row) }
    void listCostSheets(filter).then((docs) => {
      if (!live) return
      const ordered = [...docs].sort((left, right) => right.version - left.version)
      setVersions(ordered)
      if (ordered[0]) loadVersion(ordered[0])
    }).catch(() => { if (live) setError("계산서 이력을 불러오지 못했습니다.") })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, row])

  const result = useMemo(() => input ? computeFabricCost(input) : null, [input])
  const blend = useMemo(() => {
    if (!input) return null
    const parsed: { ratio: number; spec: YarnSpec }[] = []
    input.yarns.forEach((yarn) => {
      const components = yarn.spec?.components ?? []
      const usable = components.length === 1
        ? Boolean(components[0].fiber.trim())
        : components.some((component) => component.fiber.trim() && component.nominal > 0)
      if (yarn.spec && usable) parsed.push({ ratio: yarn.ratio, spec: yarn.spec })
    })
    return parsed.length ? composeBlend(parsed) : null
  }, [input])
  const ratioTotal = input?.yarns.reduce((sum, yarn) => sum + yarn.ratio, 0) ?? 0
  const ratioValid = Math.abs(ratioTotal - 100) <= 1e-9
  const ratioWarning = `원사 투입비 합이 100%가 되어야 저장할 수 있습니다. 현재 ${money(ratioTotal)}%`
  const blendWarningText = [...(!ratioValid ? [ratioWarning] : []), ...(blend?.warnings ?? [])].join("\n")
  const blendAvailable = Boolean(blend?.labelText) && !blendWarningText
  const selectedIndex = current ? [...versions].sort((a, b) => a.version - b.version).findIndex((item) => item.id === current.id) : -1
  const chronological = useMemo(() => [...versions].sort((a, b) => a.version - b.version), [versions])
  const comparison = current && selectedIndex > 0 ? compareCostSheets(chronological[selectedIndex - 1], current) : []

  if (!row || !input || !result) return null

  const storageNo = storageNoFor?.(row) ?? ""
  const fullDetail = [row.tech?.yarnDetail, row.construction].map((value) => (value ?? "").trim()).filter(Boolean).join("  /  ")

  const setYarn = (index: number, patch: Partial<CostYarnLine>) => setInput((value) => value && ({ ...value, yarns: value.yarns.map((item, at) => at === index ? { ...item, ...patch } : item) }))
  const editYarn = (index: number, patch: Partial<CostYarnLine>) => setYarn(index, patch)
  const setFee = (index: number, patch: Partial<CostFee>) => setInput((value) => value && ({ ...value, fees: value.fees.map((item, at) => at === index ? { ...item, ...patch } : item) }))
  const changeFeeGroup = (index: number, group: FeeGroup) => {
    const fee = input.fees[index]
    const keep = fee.label.trim() && !ALL_PRESETS.has(fee.label.trim())
    setFee(index, { group, ...(keep ? {} : { label: FEE_LABEL_PRESETS[group][0] }) })
  }
  const setComponent = (yarnIndex: number, componentIndex: number, patch: Partial<YarnComponent>) => {
    const yarn = input.yarns[yarnIndex]
    const spec = yarn.spec ?? { components: [blankComponent()] }
    setAutoYarns((items) => items.map((item, at) => at === yarnIndex ? false : item))
    editYarn(yarnIndex, { spec: { ...spec, components: spec.components.map((item, at) => at === componentIndex ? { ...item, ...patch } : item) } })
  }
  const moveFee = (index: number, offset: -1 | 1) => setInput((value) => {
    if (!value) return value
    const target = index + offset
    if (target < 0 || target >= value.fees.length) return value
    const fees = [...value.fees]; [fees[index], fees[target]] = [fees[target], fees[index]]
    return { ...value, fees }
  })
  const removeYarn = (index: number) => {
    setInput({ ...input, yarns: input.yarns.filter((_, at) => at !== index) })
    setAutoYarns((items) => items.filter((_, at) => at !== index))
    setOpenSpecRows([])
  }
  const toggleSpec = (index: number) =>
    setOpenSpecRows((rows) => rows.includes(index) ? rows.filter((at) => at !== index) : [...rows, index])

  const buildSheet = (): FabricCostSheet => ({ input: normalizeInputModes(input), result, calculatedAt: new Date().toISOString(), ...(auth.currentUser?.email ? { calculatedBy: auth.currentUser.email } : {}) })
  const outputDoc = (): CostSheetDoc => ({
    id: current?.id ?? "", groupId: current?.groupId ?? row.tech?.costRef?.groupId ?? "", version: current?.version ?? 0,
    rowKey: rowKeyOf(row), flNo: row.flNo, styleNo: row.styleNo, project: row.tech?.project ?? "",
    buyer: row.buyer, season: row.season, construction: row.construction, color: row.color, owner: row.owner, storageNo,
    sheet: buildSheet(), ...(blend ? { blend: { labelText: blend.labelText, label: blend.label } } : {}),
    by: current?.by ?? auth.currentUser?.email ?? "", at: current?.at ?? Date.now(), note,
  })
  const saveExcel = async () => {
    setBusy(true); setError("")
    try {
      const doc = outputDoc()
      downloadBlob(await exportCostSheetWorkbook(doc), costSheetFileName(doc))
    } catch { setError("엑셀을 만들지 못했습니다.") } finally { setBusy(false) }
  }
  const refOf = (doc: CostSheetDoc): NonNullable<DevTechnical["costRef"]> => ({
    sheetId: doc.id, groupId: doc.groupId, version: doc.version, at: doc.at,
    netKrwPerYd: doc.sheet.result.netKrwPerYd, netPerYd: doc.sheet.result.netPerYd,
  })
  const saveNew = async () => {
    if (!ratioValid) return
    setSaving(true); setError("")
    try {
      const saved = await saveCostSheet({
        groupId: current?.groupId ?? row.tech?.costRef?.groupId ?? "", rowKey: rowKeyOf(row),
        flNo: row.flNo, styleNo: row.styleNo, project: row.tech?.project ?? "", buyer: row.buyer,
        season: row.season, construction: row.construction, color: row.color, owner: row.owner, storageNo,
        sheet: buildSheet(), ...(blend ? { blend: { labelText: blend.labelText, label: blend.label } } : {}), note,
      })
      setVersions((items) => [saved, ...items]); setSelectedId(saved.id); onSaved(rowKeyOf(row), refOf(saved))
    } catch { setError("계산서 저장에 실패했습니다. 다시 시도해 주세요.") } finally { setSaving(false) }
  }
  const overwrite = async () => {
    if (!current || !ratioValid) return
    setSaving(true); setError("")
    try {
      const updated = { ...current, sheet: buildSheet(), ...(blend ? { blend: { labelText: blend.labelText, label: blend.label } } : { blend: undefined }), note }
      await updateCostSheet(current.id, { sheet: updated.sheet, ...(updated.blend ? { blend: updated.blend } : {}), note })
      setVersions((items) => items.map((item) => item.id === current.id ? updated : item)); onSaved(rowKeyOf(row), refOf(updated))
    } catch { setError("계산서 수정에 실패했습니다. 다시 시도해 주세요.") } finally { setSaving(false) }
  }

  const field = "h-8 px-2 text-xs"
  return <Dialog open={open} onOpenChange={(next) => { if (!next) setPrinting(false); if (!saving) onOpenChange(next) }}>
    <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-none flex-col xl:w-[900px]">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8"><DialogTitle className="flex flex-wrap items-baseline gap-2"><span className="text-[10px] font-normal tracking-[0.18em] text-[var(--muted-foreground)]">사전 원가계산서</span><span>{row.flNo?.trim() || "FL 미등록"}</span>{storageNo ? <span className="text-xs font-normal text-[var(--muted-foreground)]">R&amp;D No. {storageNo}</span> : null}</DialogTitle>
          {current && isCostSheetStale(current) ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">계산일이 {Math.floor((Date.now() - current.at) / 86400000)}일 지났습니다</span> : null}
        </div>
        <DialogDescription>국내·생산 원단의 원사와 공정료를 계산합니다.</DialogDescription>
        {rows.length > 1 ? <div className="flex flex-wrap gap-1 pt-1" role="tablist">{rows.map((item, index) => <button key={rowKeyOf(item)} type="button" role="tab" aria-selected={index === active} onClick={() => setActive(index)} className={`rounded-full border px-3 py-1 text-xs ${index === active ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)]"}`}>{item.tech?.bodyNo || item.opt || `BODY ${index + 1}`}</button>)}</div> : null}
      </DialogHeader>
      <DialogBody className="min-h-0 space-y-3 overflow-y-auto">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-1 text-[11px]">
            {[['Style No.', row.styleNo], ['Project', row.tech?.project], ['Buyer', row.buyer], ['Season', row.season], ['Color', row.color]].map(([label, value]) => <span key={label}><span className="text-[var(--muted-foreground)]">{label} </span>{value || "-"}</span>)}
            {loading ? <span className="text-[var(--muted-foreground)]">이력 불러오는 중…</span> : null}
            <div className="ml-auto flex items-center gap-2">{versions.length ? <><Label className="text-xs">버전</Label><select value={selectedId} onChange={(event) => { const doc = versions.find((item) => item.id === event.target.value); if (doc) loadVersion(doc) }} className="h-8 rounded border border-[var(--input)] bg-[var(--background)] px-2 text-xs">{chronological.map((item) => <option key={item.id} value={item.id}>v{item.version} · {new Date(item.at).toLocaleDateString("ko-KR")}</option>)}</select></> : null}</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1"><Label className="text-[11px]">FULL DETAIL</Label><div title={fullDetail} className="mt-1 flex h-8 items-center truncate rounded border border-[var(--border)] bg-[var(--muted)]/30 px-2 text-xs">{fullDetail || "-"}</div></div>
            <div className="w-[110px]"><Label className="text-[11px]">완성 폭 (inch)</Label><Input type="number" disabled={!canEdit} value={input.widthInch} onChange={(event) => setInput({ ...input, widthInch: numberValue(event.target.value) })} className={`${field} text-right tabular-nums`} /></div>
            <div className="w-[110px]"><Label className="text-[11px]">완성 중량 (g/㎡)</Label><Input type="number" disabled={!canEdit} value={input.gsm} onChange={(event) => setInput({ ...input, gsm: numberValue(event.target.value) })} className={`${field} text-right tabular-nums`} /></div>
            <div className="w-[110px]"><Label className="text-[11px]">gr/yd</Label><div className="h-8 rounded border border-[var(--border)] bg-[var(--muted)]/30 px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-[var(--muted-foreground)]">{money(result.grPerYd)}</div></div>
            <div className="w-[110px]"><Label className="text-[11px]">환율 (KRW/USD)</Label><Input type="number" disabled={!canEdit} value={input.fxRate} onChange={(event) => setInput({ ...input, fxRate: numberValue(event.target.value) })} className={`${field} text-right tabular-nums`} /></div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between border-b pb-1 text-xs font-semibold">원사<Button type="button" size="sm" variant="ghost" disabled={!canEdit} onClick={() => { setInput({ ...input, yarns: [...input.yarns, { ...blankYarn(), ratio: 0 }] }); setAutoYarns((items) => [...items, false]) }}><Plus className="size-3.5" />행 추가</Button></div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><colgroup><col className="w-8" /><col /><col className="w-[64px]" /><col className="w-[84px]" /><col className="w-[92px]" /><col className="w-[52px]" /><col className="w-[72px]" /></colgroup>
            <thead><tr className="border-b text-[10px] text-[var(--muted-foreground)]"><th className="px-1.5 py-1 text-left">#</th><th className="px-1.5 py-1 text-left">원사 표기</th><th className="px-1.5 py-1 text-right">투입 %</th><th className="px-1.5 py-1 text-right">단가</th><th className="px-1.5 py-1 text-left">단위</th><th className="px-1.5 py-1 text-center">선염</th><th /></tr></thead>
            <tbody>{input.yarns.map((yarn, index) => {
              const specOpen = !parseYarnSpec(yarn.name) || openSpecRows.includes(index)
              return <Fragment key={index}><tr className="border-b border-[var(--border)] align-top">
              <td className="px-1.5 py-1">{index + 1}</td><td className="px-1.5 py-1"><div className="flex items-center gap-1.5"><Input aria-label="원사 표기" placeholder="CM26's/1" disabled={!canEdit} value={yarn.name} title={parseYarnSpec(yarn.name) ? undefined : "표기를 해석하지 못했습니다. 성분을 직접 채워 주세요"} onChange={(event) => { const name = event.target.value; const parsed = parseYarnSpec(name); setAutoYarns((items) => items.map((item, at) => at === index ? Boolean(parsed) : item)); setYarn(index, { name, spec: parsed ? normalizeSpecModes(parsed) : { components: [blankComponent(guessCountUnit(name) ?? "Ne")] } }) }} className={`${field} min-w-0 flex-1 ${parseYarnSpec(yarn.name) ? "" : "border-amber-500"}`} /><button type="button" onClick={() => toggleSpec(index)} title="성분 보기와 고치기" className="shrink-0 max-w-[140px] truncate text-left text-[10px] text-[var(--muted-foreground)] underline decoration-dotted underline-offset-2">{specSummary(yarn)}</button></div></td>
              <td className="px-1.5 py-1"><Input aria-label="원사 투입 비율" type="number" disabled={!canEdit} value={yarn.ratio || ""} onChange={(event) => editYarn(index, { ratio: numberValue(event.target.value) })} className={`${field} text-right tabular-nums`} /></td>
              <td className="px-1.5 py-1"><Input aria-label="원사 단가" type="number" disabled={!canEdit} value={yarn.price || ""} onChange={(event) => editYarn(index, { price: numberValue(event.target.value) })} className={`${field} text-right tabular-nums`} /></td>
              <td className="px-1.5 py-1"><select aria-label="원사 단위" disabled={!canEdit} value={yarn.priceUnit} onChange={(event) => editYarn(index, { priceUnit: event.target.value as YarnPriceUnit })} className="h-8 w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 text-xs">{YARN_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
              <td className="px-1.5 py-1 text-center"><input aria-label="선염" type="checkbox" disabled={!canEdit} checked={Boolean(yarn.yarnDyed)} onChange={(event) => editYarn(index, { yarnDyed: event.target.checked })} /></td>
              <td className="px-1.5 py-1"><div className="flex justify-end"><Button type="button" size="icon" variant="ghost" disabled={!canEdit || input.yarns.length === 1} onClick={() => removeYarn(index)}><Trash2 className="size-3.5" /></Button></div></td>
            </tr>{specOpen ? <tr className="bg-[var(--muted)]/20"><td colSpan={7} className="px-1.5 py-1"><div className="flex flex-wrap items-center gap-1">{(yarn.spec?.components ?? [blankComponent()]).map((component, componentIndex, components) => <div key={componentIndex} className="flex items-center gap-0.5"><Input aria-label="섬유명" placeholder="cotton" disabled={!canEdit} value={component.fiber} onChange={(event) => setComponent(index, componentIndex, normalizeComponentMode({ ...component, fiber: event.target.value }))} className={`${field} w-[104px]`} /><Input aria-label="번수" placeholder="굵기" type="number" disabled={!canEdit} value={component.nominal || ""} onChange={(event) => setComponent(index, componentIndex, { nominal: numberValue(event.target.value) })} className={`${field} w-[56px] text-right tabular-nums`} /><select aria-label="번수 단위" disabled={!canEdit} value={component.unit} onChange={(event) => setComponent(index, componentIndex, { unit: event.target.value as CountUnit })} className="h-8 w-[62px] rounded border border-[var(--input)] bg-[var(--background)] px-1 text-xs">{COUNT_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>{components.length >= 2 ? <Button type="button" size="icon" variant="ghost" className="size-6" disabled={!canEdit} onClick={() => editYarn(index, { spec: { ...(yarn.spec ?? { components: [] }), components: components.filter((_, at) => at !== componentIndex) } })}><Trash2 className="size-3.5" /></Button> : null}</div>)}{(yarn.spec?.components.length ?? 1) < 4 ? <Button type="button" size="icon" variant="ghost" className="size-6" aria-label="성분 추가" title="성분 추가" disabled={!canEdit} onClick={() => editYarn(index, { spec: { ...(yarn.spec ?? { components: [] }), components: [...(yarn.spec?.components ?? []), blankComponent()] } })}><Plus className="size-3.5" /></Button> : null}</div></td></tr> : null}</Fragment>
            })}</tbody>
            <tfoot><tr className="border-t font-medium"><td colSpan={2} className={`px-1.5 py-1 ${ratioValid ? "" : "text-[var(--destructive)]"}`}>투입 합계 {money(ratioTotal)}%</td><td colSpan={5} className="px-1.5 py-1 text-right"><span className="text-[var(--muted-foreground)]">혼용율 </span><span className={blendAvailable ? "font-semibold" : "text-[var(--muted-foreground)]"}>{blendAvailable ? blend?.labelText : "산출 불가"}</span>{blendWarningText ? <span title={blendWarningText} className="ml-1 inline-flex align-middle"><TriangleAlert className="size-3.5 text-amber-600" /></span> : null}</td></tr></tfoot>
          </table></div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between border-b pb-1 text-xs font-semibold">공정<Button type="button" size="sm" variant="ghost" disabled={!canEdit} onClick={() => setInput({ ...input, fees: [...input.fees, { ...blankFee("other"), label: "워싱" }] })}><Plus className="size-3.5" />행 추가</Button></div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><colgroup><col className="w-8" /><col className="w-[72px]" /><col className="w-[88px]" /><col className="w-[96px]" /><col /><col className="w-[84px]" /><col className="w-[92px]" /><col className="w-[52px]" /><col className="w-[72px]" /></colgroup><thead><tr className="border-b text-[10px] text-[var(--muted-foreground)]"><th className="px-1.5 py-1 text-left">#</th><th className="px-1.5 py-1 text-left">그룹</th><th className="px-1.5 py-1 text-left">공정명</th><th className="px-1.5 py-1 text-left">업체</th><th className="px-1.5 py-1 text-left">REMARK</th><th className="px-1.5 py-1 text-right">단가</th><th className="px-1.5 py-1 text-left">단위</th><th className="border-l border-[var(--border)] px-1.5 py-1 text-right">LOSS %</th><th /></tr></thead><tbody>{input.fees.map((fee, index) => {
            const seq = input.fees.slice(0, index).filter((item) => item.group === fee.group).length + 1
            return <Fragment key={index}>{fee.group !== input.fees[index - 1]?.group ? <tr><td colSpan={9} className="bg-[var(--muted)]/40 px-1.5 py-1 text-[10px] font-medium">{FEE_GROUPS.find((group) => group.value === fee.group)?.label}</td></tr> : null}<tr className="border-b border-[var(--border)] align-top">
            <td className="px-1.5 py-1">{seq}</td><td className="px-1.5 py-1"><select aria-label="공정 그룹" disabled={!canEdit} value={fee.group} onChange={(event) => changeFeeGroup(index, event.target.value as FeeGroup)} className="h-8 w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 text-xs">{FEE_GROUPS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}</select>{fee.group === "yarnDye" ? <div className="pt-0.5 text-[10px] text-[var(--muted-foreground)]">선염 {money(result.dyedSharePct, 1)}%</div> : null}</td>
            <td className="px-1.5 py-1"><Input list={`cost-fee-${fee.group}`} aria-label="공정명" placeholder="" disabled={!canEdit} value={fee.label} onChange={(event) => setFee(index, { label: event.target.value })} className={field} /></td><td className="px-1.5 py-1"><Input aria-label="업체" placeholder="업체" disabled={!canEdit} value={fee.mill ?? ""} onChange={(event) => setFee(index, { mill: event.target.value })} className={field} /></td><td className="px-1.5 py-1"><Input aria-label="비고" disabled={!canEdit} value={fee.remark ?? ""} title={fee.remark || undefined} onChange={(event) => setFee(index, { remark: event.target.value })} className={field} /></td><td className="px-1.5 py-1"><Input aria-label="공정 단가" type="number" disabled={!canEdit} value={fee.rate} onChange={(event) => setFee(index, { rate: numberValue(event.target.value) })} className={`${field} text-right tabular-nums`} />{fee.group === "yarnDye" ? <div title="원사 공정료는 원단 전체 중량에 곱해집니다. 선염 원사 비중만큼 깎은 값을 적으십시오. LOSS는 공장값 그대로 적습니다. 선염 체크된 원사에만 걸립니다." className="pt-0.5 text-right text-[10px] text-[var(--muted-foreground)]">비중 곱한 값</div> : null}</td>
            <td className="px-1.5 py-1"><select aria-label="공정 단위" disabled={!canEdit} value={fee.unit} onChange={(event) => setFee(index, { unit: event.target.value as FeeUnit })} className="h-8 w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 text-xs">{FEE_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></td><td className="border-l border-[var(--border)] px-1.5 py-1"><Input aria-label="로스" type="number" disabled={!canEdit} value={fee.loss} onChange={(event) => setFee(index, { loss: numberValue(event.target.value) })} className={`${field} text-right tabular-nums`} /></td>
            <td className="px-1.5 py-1"><div className="flex justify-end"><Button type="button" size="icon" variant="ghost" className="size-6" disabled={!canEdit || index === 0} onClick={() => moveFee(index, -1)}><ArrowUp className="size-3.5" /></Button><Button type="button" size="icon" variant="ghost" className="size-6" disabled={!canEdit || index === input.fees.length - 1} onClick={() => moveFee(index, 1)}><ArrowDown className="size-3.5" /></Button><Button type="button" size="icon" variant="ghost" className="size-6" disabled={!canEdit} onClick={() => setInput({ ...input, fees: input.fees.filter((_, at) => at !== index) })}><Trash2 className="size-3.5" /></Button></div></td>
          </tr></Fragment>})}</tbody></table></div>
          {FEE_GROUPS.map((group) => <datalist key={group.value} id={`cost-fee-${group.value}`}>{FEE_LABEL_PRESETS[group.value].map((label) => <option key={label} value={label} />)}</datalist>)}
        </section>

        <section className="space-y-3">
          <div className="border-b pb-1 text-xs font-semibold">결과</div>
          {[...result.warnings.filter((warning) => warning !== "원사 투입 중량비 합이 100이 아닙니다."), ...(!ratioValid ? [ratioWarning] : []), ...(blend?.warnings ?? [])].map((warning) => <div key={warning} className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{warning}</div>)}
          <div className="grid gap-2 md:grid-cols-3">{[["Net USD/yd", result.netPerYd], ["Net USD/lb", result.netPerLb], ["Net USD/kg", result.netPerKg]].map(([label, value]) => <div key={String(label)} className="rounded border border-[var(--border)] p-2"><div className="text-[11px] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{money(Number(value))}</div></div>)}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs"><Label className="text-[11px]">이익률 %</Label><Input type="number" disabled={!canEdit} value={input.profitPct ?? 0} onChange={(event) => setInput({ ...input, profitPct: numberValue(event.target.value) })} className={`${field} w-[80px] text-right tabular-nums`} /><span className="text-[10px] text-[var(--muted-foreground)]">비워 두어도 Net 원가는 계산됩니다. 팀 산출물은 Net price 까지입니다.</span></div>
          {(input.profitPct ?? 0) !== 0 ? <div className="text-xs text-[var(--muted-foreground)]">이익 포함: USD/yd {money(result.totalPerYd)} · USD/lb {money(result.totalPerLb)} · USD/kg {money(result.totalPerKg)}</div> : null}
          <details><summary className="cursor-pointer text-xs font-semibold">항목별 원가 {result.lines.length}건</summary><table className="mt-1 w-full text-xs"><thead><tr className="border-b"><th className="px-1.5 py-1 text-left">항목</th><th className="px-1.5 py-1 text-right">USD/kg</th><th className="px-1.5 py-1 text-right">비중</th></tr></thead><tbody>{result.lines.map((line, index) => <tr key={`${line.label}-${index}`} className="border-b border-[var(--border)]"><td className="px-1.5 py-1">{line.label || "미입력"}</td><td className="px-1.5 py-1 text-right tabular-nums">{money(line.perKg)}</td><td className="px-1.5 py-1 text-right tabular-nums">{money(line.sharePct, 1)}%</td></tr>)}</tbody></table></details>
          {comparison.length ? <details><summary className="cursor-pointer text-xs font-semibold">이전 버전 대비</summary><table className="mt-1 w-full text-xs"><tbody>{comparison.map((item) => <tr key={item.label} className="border-b border-[var(--border)]"><td className="px-1.5 py-1">{item.label}</td><td className="px-1.5 py-1 text-right tabular-nums">{money(item.prev)}</td><td className="px-1.5 py-1 text-right tabular-nums">{money(item.next)}</td><td className={`px-1.5 py-1 text-right tabular-nums ${item.diff > 0 ? "text-[var(--destructive)]" : ""}`}>{item.diff >= 0 ? "+" : ""}{money(item.diff)} ({item.diffPct.toFixed(1)}%)</td></tr>)}</tbody></table></details> : null}
          <div><Label className="text-[11px]">메모</Label><textarea disabled={!canEdit} value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded border border-[var(--input)] bg-transparent px-3 py-2 text-sm disabled:opacity-50" /></div>
        </section>
      </DialogBody>
      <DialogFooter><span role="alert" className="mr-auto text-xs text-[var(--destructive)]">{error}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void saveExcel()}><Download className="size-4" />엑셀</Button><Button type="button" size="sm" variant="outline" onClick={() => setPrinting(true)}><Printer className="size-4" />인쇄</Button><Button type="button" size="sm" variant="outline" onClick={() => { setPrinting(false); onOpenChange(false) }}>닫기</Button>{current ? <Button type="button" size="sm" variant="outline" disabled={!canEdit || saving || !ratioValid} onClick={() => void overwrite()}><Save className="size-4" />이 버전 고치기</Button> : null}<Button type="button" size="sm" disabled={!canEdit || saving || !ratioValid} onClick={() => void saveNew()}><Save className="size-4" />{current ? "새 버전으로 저장" : "저장"}</Button></DialogFooter>
      {printing ? <CostSheetPrintSheet doc={outputDoc()} onDone={() => setPrinting(false)} /> : null}
    </DialogContent>
  </Dialog>
}
