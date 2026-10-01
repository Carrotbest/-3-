export const DENIER_PER_TEX = 9
export const COTTON_COUNT_DENIER = 5314.9
export const DENIER_PER_NM = 9000
export const DENIER_PER_DTEX = 0.9

/** 입력 약어 → 사내 섬유명. 대소문자를 무시하고 찾는다. */
export const FIBER_ALIASES: Record<string, string> = {
  t: "Polyester", p: "Polyester", poly: "Polyester", pe: "Polyester",
  polyester: "Polyester",
  c: "Cotton", co: "Cotton", cm: "Cotton", cd: "Cotton", cotton: "Cotton",
  r: "Rayon", ry: "Rayon", rayon: "Rayon", viscose: "Viscose",
  mo: "Modal", modal: "Modal",
  lyocell: "Lyocell", tencel: "Tencel",
  sp: "Spandex", span: "Spandex", spandex: "Spandex", lycra: "Spandex", elastane: "Spandex",
  na: "Nylon", ny: "Nylon", nylon: "Nylon", polyamide: "Nylon",
  ac: "Acrylic", acrylic: "Acrylic",
  wo: "Wool", wool: "Wool",
  li: "Linen", linen: "Linen",
}

/** 사내 섬유명 → 미국 라벨 생성명(FTC 16 CFR 303.7). 없으면 그대로 쓴다. */
export const FTC_LABEL_NAME: Record<string, string> = {
  Modal: "Rayon",
  Viscose: "Rayon",
  Tencel: "Lyocell",
}

/** 5% 미만이어도 이름을 쓸 수 있는 기능성 섬유. */
export const FUNCTIONAL_FIBERS = new Set(["Spandex", "Nylon"])

/** 사내 혼방 표기 → 섬유 순서(우세 순). */
export const BLEND_NOTATIONS: Record<string, string[]> = {
  CVC: ["Cotton", "Polyester"],
  "T/C": ["Polyester", "Cotton"],
  "T/R": ["Polyester", "Rayon"],
  "C/R": ["Cotton", "Rayon"],
  "R/C": ["Rayon", "Cotton"],
  "C/P/R": ["Cotton", "Polyester", "Rayon"],
  "T/C/R": ["Polyester", "Cotton", "Rayon"],
}

export type CountUnit = "D" | "dtex" | "tex" | "Ne" | "Nm"

/** 성분이 합사에 들어가는 방식. */
export type ComponentMode = "plain" | "draft" | "overfeed"

export interface YarnComponent {
  /** 사내 섬유명. FIBER_ALIASES 를 거친 정규명. */
  fiber: string
  nominal: number
  unit: CountUnit
  mode: ComponentMode
  /** mode="draft" 면 드래프트 배수(기본 3), "overfeed" 면 퍼센트. "plain" 이면 무시. */
  factor?: number
  /** 이 성분이 혼방 방적사일 때 내부 중량비. 합이 100 이어야 한다. */
  blend?: { fiber: string; pct: number }[]
}

export interface YarnSpec {
  /** 사내 표기 원문. 화면에 그대로 보여 준다. */
  raw?: string
  components: YarnComponent[]
  /** 표시 총 번수. */
  total?: { nominal: number; unit: CountUnit }
  /**
   * total 로 마지막 성분을 역산할지.
   * 코어스판 방적사만 true. 커버링·연사·인팅은 false 다.
   */
  totalGoverns?: boolean
}

export interface BlendEntry { fiber: string; pct: number }

export interface BlendResult {
  /** 사내 섬유명 기준 정확값. 내림차순. */
  internal: BlendEntry[]
  /** FTC 생성명으로 합산한 정확값. 내림차순. */
  label: BlendEntry[]
  /** 정수화한 라벨 문자열. 예 "55% Polyester 39% Rayon 6% Spandex" */
  labelText: string
  warnings: string[]
}

export function toDenier(nominal: number, unit: CountUnit): number {
  switch (unit) {
    case "D": return nominal
    case "dtex": return nominal * DENIER_PER_DTEX
    case "tex": return nominal * DENIER_PER_TEX
    case "Ne": return COTTON_COUNT_DENIER / nominal
    case "Nm": return DENIER_PER_NM / nominal
  }
}

/** 표기에서 번수 단위를 읽는다. 읽을 수 없으면 null. */
export function guessCountUnit(raw: string): CountUnit | null {
  if (/dtex\b/i.test(raw)) return "dtex"
  if (/tex\b/i.test(raw)) return "tex"
  if (/nm\b/i.test(raw)) return "Nm"
  if (/(?:den|de|d)\b/i.test(raw)) return "D"
  if (/(?:['’´]\s*)?s(?:\s*\/\s*1)?\b|\/\s*1\b/i.test(raw)) return "Ne"
  return null
}

function normalizeFiber(value: string): string | null {
  return FIBER_ALIASES[value.trim().toLowerCase()] ?? null
}

/** 지원하는 사내 혼방 방적사와 커버링 표기만 파싱한다. */
export function parseYarnSpec(raw: string): YarnSpec | null {
  const text = raw.trim()
  const covering = /^cvr\s+(\S+)\s+(\S+)$/i.exec(text)
  if (covering) {
    const fibers = covering[1].split("/").map(normalizeFiber)
    const deniers = covering[2].split("/").map(Number)
    if (
      fibers.length < 2
      || fibers.length !== deniers.length
      || fibers.some((fiber) => fiber === null)
      || deniers.some((denier) => !Number.isFinite(denier) || denier <= 0)
    ) return null

    return {
      raw,
      components: fibers.map((fiber, index) => ({
        fiber: fiber as string,
        nominal: deniers[index],
        unit: "D",
        mode: index === 0 ? "draft" : "plain",
        ...(index === 0 ? { factor: 3 } : {}),
      })),
      totalGoverns: false,
    }
  }

  const spun = /^([A-Za-z]+(?:\s*\/\s*[A-Za-z]+)+)\s+(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*)\s+(\d+(?:\.\d+)?)\s*['’´]?\s*[Ss]?\s*(?:\/\s*1)?(?:\s+.*)?$/i.exec(text)
    ?? /^(CVC)\s+(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*)\s+(\d+(?:\.\d+)?)\s*['’´]?\s*[Ss]?\s*(?:\/\s*1)?(?:\s+.*)?$/i.exec(text)
  if (spun) {
    const notation = spun[1].toUpperCase().replace(/\s+/g, "")
    const fibers = BLEND_NOTATIONS[notation]
      ?? notation.split("/").map(normalizeFiber).filter((fiber): fiber is string => fiber !== null)
    const tokenCount = BLEND_NOTATIONS[notation] ? fibers.length : notation.split("/").length
    const percentages = spun[2].split("/").map(Number)
    const nominal = Number(spun[3])
    if (
      fibers.length !== tokenCount
      || fibers.length < 2
      || percentages.length !== fibers.length
      || percentages.some((pct) => !Number.isFinite(pct) || pct < 0)
      || Math.abs(percentages.reduce((sum, pct) => sum + pct, 0) - 100) > 1e-9
      || !Number.isFinite(nominal)
      || nominal <= 0
    ) return null

    return {
      raw,
      components: [{
        fiber: fibers[0],
        nominal,
        unit: "Ne",
        mode: "plain",
        blend: fibers.map((fiber, index) => ({ fiber, pct: percentages[index] })),
      }],
    }
  }

  const filament = /^([A-Za-z]+)\s*(\d+(?:\.\d+)?)\s*(dtex|tex|nm|den|de|d)(?:\s*\/\s*\d+\s*f)?(?:\s+.*)?$/i.exec(text)
  const singleSpun = /^([A-Za-z]+)\s*(\d+(?:\.\d+)?)\s*(?:['’´]?\s*[Ss]\s*(?:\/\s*1)?|\/\s*1)(?:\s+.*)?$/i.exec(text)
  const single = filament ?? singleSpun
  if (!single) return null

  const fiber = normalizeFiber(single[1])
  const nominal = Number(single[2])
  if (!fiber || !Number.isFinite(nominal) || nominal <= 0) return null

  let unit: CountUnit = "Ne"
  if (filament) {
    const suffix = filament[3].toLowerCase()
    unit = suffix === "dtex" ? "dtex" : suffix === "tex" ? "tex" : suffix === "nm" ? "Nm" : "D"
  }
  return { raw, components: [{ fiber, nominal, unit, mode: "plain" }] }
}

/** DD 의 `tech.yarnDetail` 을 원사 단위로 가른다. */
export function splitYarnDetail(raw: string): string[] {
  return raw.split(/[+*]/).map((part) => part.trim()).filter(Boolean)
}

function notationWarning(spec: YarnSpec): string | null {
  if (!spec.raw || spec.components.length !== 1) return null
  const blend = spec.components[0].blend
  if (!blend || blend.length < 2) return null

  const notation = spec.raw.trim().split(/\s+/, 1)[0].toUpperCase()
  const declared = BLEND_NOTATIONS[notation]
  if (!declared || declared.length !== blend.length) return null

  let mismatchAt = -1
  for (let i = 1; i < blend.length; i += 1) {
    if (blend[i].pct > blend[i - 1].pct) {
      mismatchAt = i
      break
    }
  }
  if (mismatchAt < 0) return null

  const actual = blend
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.pct - a.pct || a.index - b.index)
  const alternative = Object.entries(BLEND_NOTATIONS).find(([, fibers]) => (
    fibers.length === actual.length && fibers.every((fiber, index) => fiber === actual[index].fiber)
  ))
  const suggestion = alternative
    ? ` ${alternative[0]} ${actual.map((entry) => entry.pct).join("/")} 아닌지 확인하십시오.`
    : " 표기와 혼용률 순서를 확인하십시오."
  return `표기는 ${declared[mismatchAt - 1]} 우세인데 ${declared[mismatchAt]} 이 더 많습니다.${suggestion}`
}

function addAmount(map: Map<string, number>, fiber: string, amount: number): void {
  map.set(fiber, (map.get(fiber) ?? 0) + amount)
}

function effectiveDenier(component: YarnComponent): number | null {
  const denier = toDenier(component.nominal, component.unit)
  if (!Number.isFinite(denier) || denier <= 0) return null
  if (component.mode === "draft") {
    const factor = component.factor ?? 3
    return factor < 1 ? null : denier / factor
  }
  if (component.mode === "overfeed") return denier * (1 + (component.factor ?? 0) / 100)
  return denier
}

function apportion(entries: BlendEntry[]): number[] {
  const floors = entries.map((entry) => Math.floor(entry.pct))
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = entries
    .map((entry, index) => ({
      index,
      fraction: entry.pct - Math.floor(entry.pct),
      value: entry.pct,
    }))
    .sort((a, b) => b.fraction - a.fraction || b.value - a.value || a.index - b.index)
  for (let i = 0; i < remainder; i += 1) floors[order[i % order.length].index] += 1
  return floors
}

export function composeBlend(
  lines: { ratio: number; spec: YarnSpec }[],
): BlendResult {
  const warnings: string[] = []
  const yarns: { ratio: number; fibers: Map<string, number> }[] = []

  for (const line of lines) {
    const notationMessage = notationWarning(line.spec)
    if (notationMessage) warnings.push(notationMessage)

    if (line.spec.components.length === 1 && !line.spec.totalGoverns) {
      const component = line.spec.components[0]
      const fibers = new Map<string, number>()
      if (component.blend) {
        const blendTotal = component.blend.reduce((sum, entry) => sum + entry.pct, 0)
        if (!(blendTotal > 0)) {
          warnings.push(`${component.fiber}의 혼용률 합계를 확인하십시오.`)
          continue
        }
        if (Math.abs(blendTotal - 100) > 1e-9) warnings.push(`${component.fiber}의 혼용률 합이 100이 아닙니다.`)
        for (const entry of component.blend) {
          const fiber = normalizeFiber(entry.fiber) ?? entry.fiber
          addAmount(fibers, fiber, entry.pct / blendTotal)
        }
      } else {
        const fiber = normalizeFiber(component.fiber) ?? component.fiber
        addAmount(fibers, fiber, 1)
      }
      yarns.push({ ratio: line.ratio, fibers })
      continue
    }

    const effective: { component: YarnComponent; denier: number }[] = []
    for (let index = 0; index < line.spec.components.length; index += 1) {
      const component = line.spec.components[index]
      if (component.mode === "draft" && (component.factor ?? 3) < 1) {
        warnings.push(`${component.fiber}의 드래프트 배수는 1 이상이어야 합니다.`)
        continue
      }
      const denier = effectiveDenier(component)
      if (denier === null) {
        warnings.push(`${component.fiber}의 번수를 계산할 수 없어 성분에서 제외했습니다.`)
        continue
      }
      effective.push({ component, denier })
    }

    if (line.spec.totalGoverns && line.spec.components.length > 0) {
      const lastComponent = line.spec.components[line.spec.components.length - 1]
      const total = line.spec.total ? toDenier(line.spec.total.nominal, line.spec.total.unit) : 0
      const preceding = effective
        .filter(({ component }) => component !== lastComponent)
        .reduce((sum, item) => sum + item.denier, 0)
      const remainder = total - preceding
      if (!Number.isFinite(remainder) || remainder <= 0) {
        warnings.push(`${line.spec.raw ?? "원사"}의 총 번수 역산값이 0 이하라 원사에서 제외했습니다.`)
        continue
      }
      const lastIndex = effective.findIndex(({ component }) => component === lastComponent)
      if (lastIndex >= 0) effective[lastIndex].denier = remainder
      else effective.push({ component: lastComponent, denier: remainder })
    }

    const totalDenier = effective.reduce((sum, item) => sum + item.denier, 0)
    if (!(totalDenier > 0)) continue

    const fibers = new Map<string, number>()
    for (const { component, denier } of effective) {
      const componentShare = denier / totalDenier
      if (component.blend) {
        const blendTotal = component.blend.reduce((sum, entry) => sum + entry.pct, 0)
        if (!(blendTotal > 0)) {
          warnings.push(`${component.fiber}의 혼용률 합계를 확인하십시오.`)
          continue
        }
        if (Math.abs(blendTotal - 100) > 1e-9) {
          warnings.push(`${component.fiber}의 혼용률 합이 100이 아닙니다.`)
        }
        for (const entry of component.blend) {
          const fiber = normalizeFiber(entry.fiber) ?? entry.fiber
          addAmount(fibers, fiber, componentShare * entry.pct / blendTotal)
        }
      } else {
        const fiber = normalizeFiber(component.fiber) ?? component.fiber
        addAmount(fibers, fiber, componentShare)
      }
    }
    yarns.push({ ratio: line.ratio, fibers })
  }

  const ratioTotal = yarns.reduce((sum, yarn) => sum + yarn.ratio, 0)
  if (Math.abs(ratioTotal - 100) > 1e-9) warnings.push("원사 투입비 합이 100이 아니어서 합계 기준으로 정규화했습니다.")

  const internalMap = new Map<string, number>()
  if (ratioTotal !== 0) {
    for (const yarn of yarns) {
      for (const [fiber, share] of yarn.fibers) {
        addAmount(internalMap, fiber, share * yarn.ratio / ratioTotal * 100)
      }
    }
  }
  const internal = Array.from(internalMap, ([fiber, pct]) => ({ fiber, pct }))
    .sort((a, b) => b.pct - a.pct)

  const labelMap = new Map<string, number>()
  for (const entry of internal) addAmount(labelMap, FTC_LABEL_NAME[entry.fiber] ?? entry.fiber, entry.pct)

  let other = 0
  const label: BlendEntry[] = []
  for (const [fiber, pct] of labelMap) {
    if (pct < 5 && !FUNCTIONAL_FIBERS.has(fiber) && fiber !== "Wool") other += pct
    else label.push({ fiber, pct })
  }
  label.sort((a, b) => b.pct - a.pct)
  if (other > 0) label.push({ fiber: "Other Fiber", pct: other })

  const integers = label.length > 0 ? apportion(label) : []
  const labelText = label.map((entry, index) => `${integers[index]}% ${entry.fiber}`).join(" ")
  return { internal, label, labelText, warnings }
}
