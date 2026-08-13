// 작지(작업지시서) 파서 — 로컬 파이썬 도구(zaji/parser.py)의 GD 양식 파싱을 웹으로 포팅.
// GD: Fabric sample request report (.xlsx) 를 판별·파싱해 신규 작지 접수 폼을 자동 채운다.
// 파싱 로직은 원본과 동일하게 유지한다(헤더 라벨→열 매핑, 조직명 끝위치 최장일치, Part+Color 중복 제거).
import * as XLSX from "xlsx"

import { createBlankDevRecord } from "./dd-workflow"
import type { DevRecord, DevTechnical } from "./schema"

// ─────────────────────────────────────────────── TDS Lists 기준값 (lists.py)
export const CONSTRUCTIONS = [
  "1*1 Rib", "10*6 Rib", "12*13 Rib", "2*1 Rib", "2*2 Rib", "2*4 Rib", "3*1 Rib", "3*2 Rib", "3*3 Rib",
  "4*1 Rib", "4*2 Rib", "4*3 Rib", "4*4 Rib", "5*2 Drop Needle Rib", "5*2 Rib", "5*3 Rib", "5*4 Rib",
  "6*2 Rib", "6*3 Rib", "6*4 Rib", "6*6 Rib", "7*3 Rib", "7*4 Rib", "7*5 Rib", "8*3 Rib", "8*4 Rib",
  "8*5 Rib", "9*2 Rib", "9*4 Rib", "Boa Fleece", "Boucle", "Canvas", "Chambray", "Chiffon", "Comez Tape",
  "Corduroy", "Crepe", "Crinkled Jersey", "Crochet", "Damboru", "Dazzle", "Denim", "Double Crepe",
  "Double Face", "Double Jacquard", "Double Jersey", "Double Knit", "Double Mesh", "Double Pique",
  "Double Sherpa", "Drop Needle", "Drop Needle Rib", "Drop Needle Single Jersey", "Duo Fold",
  "Duo Fold Thermal", "Eyelet", "Eyelet Jacquard", "Eyelet Mesh", "Fabric Bonding", "Faux Leather",
  "Faux Shearling", "Faux Suede", "Felt", "Film Bonding", "Flannel", "Flat Back Mesh", "Flat Back Rib",
  "Flat Knit", "Flat Knit Jacquard", "Flatback Rib", "Flatback Thermal", "Fleece", "Fleece Velour",
  "French Rib", "French Terry", "Fur", "Gauze", "Geargette", "Genuine Leather", "Hacci", "Herringbone",
  "Honeycomb Jacquard", "Honeycomb Mesh", "Inlay Terry", "Interlock", "ITY", "Jacquard Rib", "Lace",
  "Loop Terry", "Matte Jersey", "Memory", "Mesh", "Mesh Fleece", "Mesh Jacquard", "Milano Rib",
  "Mini French Terry", "Mink Fleece", "Modified Single Jersey", "Nonwoven", "Ottoman", "Oxford",
  "Pique Stripe", "Plain", "Plaited Jersey", "Pleats", "Pointelle", "Polar Fleece", "Polynosic", "Ponte",
  "Poplin", "Pre-smocked Jersey", "Pucker Jersey", "Quilt", "Quilt Jacquard", "Raschel", "Rib Thermal",
  "Russel Tape", "S-Knit", "Satin", "Scuba", "Seersucker", "Sequine", "Sherpa", "Single Crepe",
  "Single Jacquard", "Single Jersey", "Single Pique", "Single Stripe", "Slub Jersey", "Sweater Fleece",
  "Taffeta", "Terry", "Terry Jacquard", "Terry Velour", "Thermal", "Thermal Fleece", "Tricot",
  "Tricot Mesh", "Twill", "Twill Fleece", "Twill Jersey", "Twill Rib", "Twill Terry", "Variegated Rib",
  "Velour", "Velour Loop Terry", "Velvet", "Wide Rib", "Woven",
]

const NAME_MAP: Record<string, string> = {
  "Park, Hyang-Keun": "박향근", "Jin, Young-Eun": "진영은", "Byun, Jae-Hwi": "변재휘", "Kim, Ji-Hyun": "김지현",
  박향근: "박향근", 진영은: "진영은", 변재휘: "변재휘", 김지현: "김지현",
}

const SEASON_PREFIX: Record<string, string> = {
  spring: "SS", summer: "SS", fall: "FW", autumn: "FW", winter: "FW", holiday: "FW",
}

const LABELS = /^(Customer account|Customer name|Brand code|Brand name|Request type|Request to|Main style number|Year ?\/ ?Season|Light source|Due date|Department|Created date|Created by|Remark|Buyer|S\/O No|Production Order|Order type|Sewing Factory|Raw Material|Origin|FTA|Purchase Requisition|Fabric Delivery|Order Qty|StyleNo)/i
const MILL_NOISE = /^(Part|Total|Loss|Unit|Qty|YDS|PCS|F\/D|Pattern|Color Name|Yarn Detail|Dyeing Method|Order Qty kg|No)$/i

type Cell = string | number | boolean | Date | null | undefined
type Grid = Cell[][]

// ─────────────────────────────────────────────── 값 정규화
export function cellSafe(value: Cell): string | number {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return value
  let text = String(value)
  text = text.replace(/\r\n|\r|\n/g, " / ").replace(/\t/g, " ")
  text = text.replace(/\s*\/\s*\/\s*/g, " / ").replace(/\s{2,}/g, " ")
  text = text.replace(/^\s*\/\s*|\s*\/\s*$/g, "")
  return text.trim()
}

function fmtDate(value: Cell): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate()
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  const text = String(value ?? "").trim()
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`
  return ""
}

function convertSeason(raw: string): string {
  const text = String(raw ?? "").trim()
  const m = text.match(/(\d{2})\s*\/\s*([A-Za-z]+)/)
  if (!m) return text
  const prefix = SEASON_PREFIX[m[2].toLowerCase()]
  return prefix ? `${prefix}${m[1]}` : text
}

/** 조직명과 시작 위치. 끝나는 지점이 더 뒤인 것 우선, 끝이 같으면 더 긴 이름(French Terry가 Terry로 안 잘리게). */
export function findConstruction(text: string): [string, number] {
  if (!text) return ["", -1]
  const low = String(text).toLowerCase()
  let best = "", bestAt = -1, bestEnd = -1
  for (const name of CONSTRUCTIONS) {
    const at = low.lastIndexOf(name.toLowerCase())
    if (at < 0) continue
    const end = at + name.length
    if (end > bestEnd || (end === bestEnd && name.length > best.length)) { best = name; bestAt = at; bestEnd = end }
  }
  return [best, bestAt]
}

function splitYarn(name: string): [string, string] {
  const raw = String(name ?? "").trim()
  if (!raw) return ["", ""]
  const [cons, at] = findConstruction(raw)
  if (!cons || at <= 0) return [raw.replace(/\*/g, "+"), cons]
  const yarn = raw.slice(0, at).trim().replace(/[*,\-/]+$/, "").trim()
  return [(yarn || raw).replace(/\*/g, "+"), cons]
}

function matchDyeing(color: string, method: string): string {
  const blob = `${color || ""} ${method || ""}`.toUpperCase()
  if (/DOUBLE\s*DYE|(^|\s)DD(\s|$)/.test(blob)) return "DD"
  if (/YARN\s*DYE|(^|\s)YD(\s|$)/.test(blob)) return "YD"
  if (blob.includes("CPB")) return "CPB"
  if (/SINGLE\s*DYE|CSD|(^|\s)SD(\s|$)/.test(blob)) return "CSD"
  return ""
}

// ─────────────────────────────────────────────── 데이터 구조
export interface ZajiOption {
  part: string
  color: string
  weight: string
  yarn: string
  cons: string
  rawName: string
  remark: string
  dyeing: string
  mills: { yarn: string; knit: string; dye: string; finish: string }
}

export interface Zaji {
  fmt: "GD" | "국내"
  subFmt: string
  number: string
  dept: string
  created: string
  due: string
  author: string
  developer: string
  style: string
  season: string
  brand: string
  co: string
  options: ZajiOption[]
  notes: string[]
  dupRemoved: number
}

// ─────────────────────────────────────────────── 시트 헬퍼 (_Grid)
function makeGrid(rows: Grid) {
  const at = (r: number, c: number | undefined): string => {
    if (c === undefined || r < 0 || r >= rows.length) return ""
    const row = rows[r]
    if (!row || c >= row.length || row[c] === null || row[c] === undefined) return ""
    return String(row[c]).trim()
  }
  const raw = (r: number, c: number | undefined): Cell => {
    if (c === undefined || r < 0 || r >= rows.length) return null
    const row = rows[r]
    return row && c < row.length ? row[c] : null
  }
  const find = (label: string): [number, number] | null => {
    const low = label.toLowerCase()
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri] ?? []
      for (let ci = 0; ci < row.length; ci++) {
        const v = row[ci]
        if (v !== null && v !== undefined && String(v).toLowerCase().includes(low)) return [ri, ci]
      }
    }
    return null
  }
  const rawRightOf = (label: string, step = 8): Cell => {
    const pos = find(label)
    if (!pos) return null
    const [ri, ci] = pos
    const row = rows[ri] ?? []
    for (let c = ci + 1; c < Math.min(ci + 1 + step, row.length); c++) {
      const v = row[c]
      if (v === null || v === undefined || ["", "~"].includes(String(v).trim())) continue
      if (typeof v === "string" && LABELS.test(v.trim())) return null
      return v
    }
    return null
  }
  const rightOf = (label: string, step = 8): string => {
    const v = rawRightOf(label, step)
    return v === null || v === undefined ? "" : String(v).trim()
  }
  const belowOf = (label: string, depth = 6): string => {
    const pos = find(label)
    if (!pos) return ""
    const [ri, ci] = pos
    for (let r = ri + 1; r < Math.min(ri + 1 + depth, rows.length); r++) {
      const text = at(r, ci)
      if (!text || MILL_NOISE.test(text)) continue
      return text
    }
    return ""
  }
  const headerMap = (r: number): Record<string, number> => {
    const out: Record<string, number> = {}
    const row = r < rows.length ? rows[r] ?? [] : []
    for (let i = 0; i < row.length; i++) {
      const v = row[i]
      if (v === null || v === undefined || String(v).trim() === "") continue
      const key = String(v).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
      if (!(key in out)) out[key] = i
    }
    return out
  }
  const rowTexts = (r: number): string[] => (r < rows.length ? rows[r] ?? [] : []).map((v) => (v === null || v === undefined ? "" : String(v).trim()))
  return { rows, at, raw, find, rawRightOf, rightOf, belowOf, headerMap, rowTexts }
}

// ─────────────────────────────────────────────── 양식 판별
function detectFormat(rows: Grid): "GD" | "국내" | null {
  const head = rows.slice(0, 12).map((row) => (row ?? []).map((v) => (v === null || v === undefined ? "" : String(v))).join(" ")).join(" ").toLowerCase()
  if (head.includes("outsourcing production order") || head.includes("yarn dyeing work sheet") || head.includes("production requisition no")) return "국내"
  if (head.includes("fabric sample request") || head.includes("sample fabric request")) return "GD"
  return null
}

// ─────────────────────────────────────────────── GD 양식
function parseGd(rows: Grid): Zaji {
  const g = makeGrid(rows)
  const z: Zaji = {
    fmt: "GD", subFmt: "Fabric sample request report", number: g.rightOf("Fabric sample request"),
    dept: g.rightOf("Department"), created: fmtDate(g.rawRightOf("Created date")), due: fmtDate(g.rawRightOf("Due date")),
    author: g.rightOf("Created by"), developer: "", style: g.rightOf("Main style number"),
    season: convertSeason(g.rightOf("Year / Season")), brand: g.rightOf("Brand name"), co: "",
    options: [], notes: [], dupRemoved: 0,
  }
  z.developer = NAME_MAP[z.author] ?? ""
  const requestTo = g.rightOf("Request to")
  z.co = /global\s*dyeing/i.test(requestTo) ? "GD" : "국내"

  const fabricPos = g.find("Fabric and yarns")
  const colorPos = g.find("Colors and quantit")
  const notePos = g.find("(요청사항)")

  // Fabric and yarns 표
  const parts: Record<string, { name: string; weight: string; dyeing: string; remark: string }> = {}
  if (fabricPos) {
    let header: number | null = null
    for (let r = fabricPos[0]; r < Math.min(fabricPos[0] + 6, rows.length); r++) {
      if (g.rowTexts(r).includes("Part")) { header = r; break }
    }
    if (header !== null) {
      const cols = g.headerMap(header)
      const limit = colorPos ? colorPos[0] : rows.length
      for (let r = header + 1; r < limit; r++) {
        const code = g.at(r, cols["Part"])
        if (!code || code.includes("Colors")) continue
        parts[code] = {
          name: g.at(r, cols["Product name"]), weight: g.at(r, cols["Weight (g/m2)"]),
          dyeing: g.at(r, cols["Dyeing method"]), remark: g.at(r, cols["Remark"]),
        }
      }
    }
  }

  // Colors and quantity 표 → 옵션
  const rawOpts: { part: string; color: string; remark: string }[] = []
  if (colorPos) {
    let header: number | null = null
    for (let r = colorPos[0]; r < Math.min(colorPos[0] + 5, rows.length); r++) {
      if (g.rowTexts(r).includes("No")) { header = r; break }
    }
    if (header !== null) {
      const cols = g.headerMap(header)
      const limit = notePos ? notePos[0] : rows.length
      const seen = new Set<string>()
      let lastColor = ""
      for (let r = header + 1; r < limit; r++) {
        const color = g.at(r, cols["Color"])
        if (color) lastColor = color
        const part = g.at(r, cols["Part"])
        if (!part) continue
        const key = `${part} ${lastColor}`
        if (seen.has(key)) { z.dupRemoved += 1; continue }
        seen.add(key)
        rawOpts.push({ part, color: lastColor, remark: g.at(r, cols["Remark"]) })
      }
    }
  }

  // 요청사항
  if (notePos) {
    for (let r = notePos[0] + 1; r < rows.length; r++) {
      const texts = g.rowTexts(r).filter(Boolean)
      if (texts.some((t) => t.includes("원사 필요량"))) break
      if (texts.length) z.notes.push(texts.join(" "))
    }
  }

  for (const o of rawOpts) {
    const pt = parts[o.part] ?? { name: "", weight: "", dyeing: "", remark: "" }
    const [yarn, cons] = splitYarn(pt.name)
    const remark = [pt.remark, o.remark].filter(Boolean).join(" / ")
    z.options.push({
      part: o.part, color: o.color, weight: pt.weight, yarn, cons, rawName: pt.name, remark,
      dyeing: matchDyeing(o.color, pt.dyeing),
      mills: { yarn: z.co, knit: z.co, dye: z.co, finish: z.co },
    })
  }
  return z
}

// ─────────────────────────────────────────────── 공개 API
export function parseZajiBuffer(data: ArrayBuffer | Uint8Array): Zaji {
  const wb = XLSX.read(data, { type: "array", cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, blankrows: true, defval: null })
  const fmt = detectFormat(rows)
  if (fmt === null) throw new Error("작지 양식을 인식하지 못했습니다. GD 양식(Fabric sample request report)만 현재 지원합니다.")
  if (fmt === "국내") throw new Error("국내 결재 양식은 아직 지원하지 않습니다. GD 양식(Fabric sample request report)만 지원합니다.")
  return parseGd(rows)
}

export async function parseZaji(file: File): Promise<Zaji> {
  return parseZajiBuffer(await file.arrayBuffer())
}

/** 테스트 전용 내부 노출. 화면 코드에서 쓰지 말 것. */
export const __test = { convertSeason, splitYarn, matchDyeing, fmtDate, detectFormat, parseGd }

// ─────────────────────────────────────────────── DevRecord 매핑 (폼 자동 채움)
function toWeight(raw: string): number | "" {
  const num = parseFloat(String(raw).replace(/[^\d.]/g, ""))
  return String(raw).trim() !== "" && Number.isFinite(num) ? num : ""
}

/** 작지 공통(헤더) 필드를 레코드에 반영한다. */
export function applyZajiHeader(record: DevRecord, z: Zaji): DevRecord {
  const tech: DevTechnical = {
    ...record.tech,
    development: { ...record.tech?.development, developer: z.developer || record.owner, co: z.co === "GD" || z.co === "국내" ? z.co : record.tech?.development?.co },
    original: { ...record.tech?.original, brand: z.brand || record.tech?.original?.brand },
  }
  return {
    ...record,
    owner: z.developer || record.owner,
    styleNo: z.style || record.styleNo,
    season: z.season || record.season,
    requestDate: z.created || record.requestDate,
    dueDate: z.due || record.dueDate,
    devStatus: "진행중",
    devType: z.co === "GD" ? "GD" : z.co === "국내" ? "국내" : record.devType,
    tech,
  }
}

/** 작지의 특정 옵션(part·color)을 레코드에 반영한다. 헤더 필드는 건드리지 않는다. */
export function applyZajiOption(record: DevRecord, z: Zaji, index: number): DevRecord {
  const o = z.options[index]
  if (!o) return record
  const tech: DevTechnical = {
    ...record.tech,
    yarnDetail: o.yarn || record.tech?.yarnDetail,
    mills: { ...record.tech?.mills, yarn: o.mills.yarn, knitting: o.mills.knit, dyeing: o.mills.dye, finishing: o.mills.finish },
  }
  return {
    ...record,
    opt: String(index + 1),
    color: o.color || record.color,
    weight: toWeight(o.weight),
    construction: o.cons || findConstruction(o.rawName || o.yarn)[0] || record.construction,
    dyeing: o.dyeing || record.dyeing,
    note: o.remark || record.note,
    tech,
  }
}

/** 작지 + 옵션 인덱스로 신규 작지 레코드를 만든다(빈 레코드 기반). */
export function zajiToRecord(z: Zaji, index = 0): DevRecord {
  return applyZajiOption(applyZajiHeader(createBlankDevRecord(), z), z, index)
}
