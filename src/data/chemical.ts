import * as XLSX from "xlsx"

export interface ChemicalAttachment {
  id: string
  name: string
  type: string
  size: number
  kind: "image" | "pdf" | "other"
  addedAt: string
}

export interface ChemicalItem {
  id: string
  category: string
  state: "개발완료" | "개발중" | "미착수" | "Drop" | string
  chemical: string
  market: string
  description: string
  fabrication: string
  flNos: string[]
  passNotes: string[]
  passCount: number
  source?: "excel" | "web"
  link?: string
  owner?: string
  attachments?: ChemicalAttachment[]
  createdAt?: string
  updatedAt?: string
}

export interface ChemicalCategory {
  name: string
  labelEn: string
  labelKo: string
  strategy: string
  items: ChemicalItem[]
}

export interface ChemicalPortfolio {
  categories: ChemicalCategory[]
  items: ChemicalItem[]
  totals: {
    categories: number
    items: number
    done: number
    ongoing: number
    notStarted: number
    dropped: number
    fl: number
    pass: number
  }
}

export type ChemicalStage = "plan" | "progress" | "done" | "drop"

export interface FlYearCount {
  year: string
  count: number
}

/** 원본 상태값은 보존하고 화면 표기와 집계에서 사용할 단계만 정규화한다. */
export function stageOf(state: string): ChemicalStage {
  const normalized = state.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR")
  if (normalized === "개발완료") return "done"
  if (normalized === "개발중") return "progress"
  if (normalized === "drop") return "drop"
  return "plan"
}

/** 유효한 FL 번호의 YY 구간을 읽어 고유 FL 기준 등록 연도 분포를 만든다. */
export function flYearDistribution(portfolio: ChemicalPortfolio): FlYearCount[] {
  const uniqueFlNos = new Set(portfolio.items.flatMap((item) => item.flNos.map((flNo) => flNo.normalize("NFKC").trim().toUpperCase())))
  const counts = new Map<string, number>()
  uniqueFlNos.forEach((flNo) => {
    const match = flNo.match(/^FL(\d{2})\d{6,8}$/)
    if (!match) return
    const year = `20${match[1]}`
    counts.set(year, (counts.get(year) ?? 0) + 1)
  })
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([year, count]) => ({ year, count }))
}

type Row = unknown[]

const CATEGORY_PATTERN = /^[A-Za-z][A-Za-z /\-·]*\s*\(.+\)$/
const FL_PATTERN = /FL\d{8,10}/gi
const PASS_PATTERN = /\(([^)]*(?:pass)[^)]*)\)/gi

const cellText = (value: unknown): string => String(value ?? "").normalize("NFKC").trim()
const compactHeader = (value: unknown): string => cellText(value).toLocaleLowerCase("ko-KR").replace(/\s+/g, "")

const stableHash = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const normalizeState = (value: string): string => {
  const compact = value.replace(/\s+/g, "")
  if (compact === "개발완료") return "개발완료"
  if (compact === "개발중") return "개발중"
  if (compact === "미착수") return "미착수"
  if (compact.toLocaleLowerCase("en-US") === "drop") return "Drop"
  return value.trim()
}

const categoryLabels = (name: string): Pick<ChemicalCategory, "labelEn" | "labelKo"> => {
  const match = name.match(/^(.+?)\s*\((.+)\)$/)
  return {
    labelEn: match?.[1]?.trim() ?? name,
    labelKo: match?.[2]?.trim() ?? "",
  }
}

const portfolioTotals = (categories: ChemicalCategory[], items: ChemicalItem[]): ChemicalPortfolio["totals"] => {
  const uniqueFlNos = new Set(items.flatMap((item) => item.flNos.filter((flNo) => /^FL\d{8,10}$/i.test(flNo))))
  return {
    categories: categories.length,
    items: items.length,
    done: items.filter((item) => stageOf(item.state) === "done").length,
    ongoing: items.filter((item) => stageOf(item.state) === "progress").length,
    notStarted: items.filter((item) => stageOf(item.state) === "plan").length,
    dropped: items.filter((item) => stageOf(item.state) === "drop").length,
    fl: uniqueFlNos.size,
    pass: items.reduce((total, item) => total + item.passCount, 0),
  }
}

/** 엑셀 원본과 웹 등록분을 합쳐 화면이 소비하는 단일 포트폴리오를 만든다. */
export function mergeChemicalPortfolio(excel: ChemicalPortfolio | null, manual: readonly ChemicalItem[]): ChemicalPortfolio {
  const categories = (excel?.categories ?? []).map((category) => ({
    ...category,
    items: category.items
      .filter((item) => item.source !== "web")
      .map((item) => ({ ...item, source: item.source ?? "excel" as const })),
  })).filter((category) => category.items.length > 0)
  const categoryMap = new Map(categories.map((category) => [category.name, category]))
  const manualItems = [...new Map(manual
    .filter((item) => item.source === "web")
    .map((item) => [item.id, {
      ...item,
      source: "web" as const,
      flNos: [...new Set(item.flNos)],
      passNotes: [...item.passNotes],
      passCount: item.passNotes.length,
      attachments: item.attachments ? [...item.attachments] : [],
    }])).values()]

  manualItems.forEach((item) => {
    let category = categoryMap.get(item.category)
    if (!category) {
      category = { name: item.category, ...categoryLabels(item.category), strategy: "", items: [] }
      categories.push(category)
      categoryMap.set(item.category, category)
    }
    category.items.push(item)
  })

  const items = categories.flatMap((category) => category.items)
  return { categories, items, totals: portfolioTotals(categories, items) }
}

const headerRowIndex = (rows: Row[]): number => rows.findIndex((row) => {
  const values = row.map(compactHeader)
  return values.some((value) => value.includes("chemical"))
    && values.some((value) => value.includes("fl#") || value === "fl")
})

export function parseChemicalPortfolio(workbook: XLSX.WorkBook): ChemicalPortfolio {
  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) return false
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: "", raw: false })
    return headerRowIndex(rows) >= 0
  })
  if (!sheetName) throw new Error("Chemical 및 FL# 열이 있는 헤더 행을 찾지 못했습니다.")

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: "", raw: false })
  const headerIndex = headerRowIndex(rows)
  const categories: ChemicalCategory[] = []
  const items: ChemicalItem[] = []
  let currentCategory: ChemicalCategory | null = null
  let expectsStrategy = false

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const values = Array.from({ length: 6 }, (_, column) => cellText(rows[rowIndex]?.[column]))
    const [columnA, chemical, market, description, fabrication, flCell] = values
    const trailingValues = values.slice(1)
    const trailingCount = trailingValues.filter(Boolean).length
    const onlyColumnA = Boolean(columnA) && trailingCount === 0

    if (onlyColumnA && CATEGORY_PATTERN.test(columnA)) {
      const labels = categoryLabels(columnA)
      currentCategory = { name: columnA, ...labels, strategy: "", items: [] }
      categories.push(currentCategory)
      expectsStrategy = true
      continue
    }

    if (onlyColumnA && expectsStrategy && currentCategory && !currentCategory.strategy) {
      currentCategory.strategy = columnA
      expectsStrategy = false
      continue
    }

    if (trailingCount < 2 || !currentCategory) {
      if (values.some(Boolean)) expectsStrategy = false
      continue
    }

    expectsStrategy = false
    const flNos = [...new Set((flCell.match(FL_PATTERN) ?? []).map((value) => value.toUpperCase()))]
    const passNotes = [...flCell.matchAll(PASS_PATTERN)].map((match) => match[0])
    const item: ChemicalItem = {
      id: `chemical-${stableHash(currentCategory.name)}-${rowIndex + 1}`,
      category: currentCategory.name,
      state: normalizeState(columnA),
      chemical,
      market,
      description,
      fabrication,
      flNos,
      passNotes,
      passCount: passNotes.length,
      source: "excel",
    }
    currentCategory.items.push(item)
    items.push(item)
  }

  if (!items.length) throw new Error("기능성 개발 항목을 찾지 못했습니다. 파일 형식을 확인해 주세요.")

  return { categories, items, totals: portfolioTotals(categories, items) }
}
