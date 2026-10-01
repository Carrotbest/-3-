import type { YarnSpec } from "./yarn-blend"

export type YarnPriceUnit = "USD/kg" | "USD/lb" | "USD/bale" | "KRW/kg"
export type FeeUnit = "KRW/kg" | "KRW/yd" | "USD/kg" | "USD/yd"
export type FeeGroup = "yarnDye" | "knitting" | "dyeing" | "other"

export interface CostYarnLine {
  name: string
  /** 원단 투입 중량비 %. */
  ratio: number
  price: number
  priceUnit: YarnPriceUnit
  /** 이 원사가 선염사인가. true 면 yarnDye 그룹 loss 를 먹는다. */
  yarnDyed?: boolean
  spec?: YarnSpec
}

export interface CostFee {
  group: FeeGroup
  label: string
  mill?: string
  rate: number
  unit: FeeUnit
  /** 공장 지정 loss %. 산출 대비다. */
  loss: number
  /** 공정별 비고. 사람이 적는다. 편직은 DD 편직 사양으로 처음 한 번 채운다. */
  remark?: string
}

export interface CostInput {
  /** 환율 KRW per USD. */
  fxRate: number
  /** 완성 중량 g/㎡. */
  gsm: number
  /** 완성 폭 inch. */
  widthInch: number
  yarns: CostYarnLine[]
  /** 배열 순서가 공정 순서다. yarnDye 그룹이 다른 공정보다 앞이어야 한다. */
  fees: CostFee[]
  /** 이익률 %. 원가 대비 마크업. 기본 0. */
  profitPct?: number
}

export interface CostLine { label: string; perKg: number; sharePct: number }

export interface CostResult {
  grPerYd: number
  /** 선염으로 표시된 원사의 투입 중량비 합(%). 이 비중의 원사에만 원사 그룹 loss 가 걸린다. 공정료는 전체 중량 기준이다. */
  dyedSharePct: number
  yarnPerKg: number
  feePerKg: number
  netPerKg: number
  netPerLb: number
  netPerYd: number
  netKrwPerYd: number
  profitPerKg: number
  totalPerKg: number
  totalPerLb: number
  totalPerYd: number
  totalKrwPerYd: number
  lines: CostLine[]
  warnings: string[]
}

/** DD 레코드에 저장하는 형태. 입력과 결과를 같이 남긴다. */
export interface FabricCostSheet {
  input: CostInput
  result: CostResult
  /** 계산 시각 ISO 문자열. */
  calculatedAt: string
  /** 계산한 사람. */
  calculatedBy?: string
}

const AREA_FACTOR = 1.3935
const KG_PER_BALE = 181.44
const LB_PER_KG = 2.2046

function round(value: number, digits = 0): number {
  const scale = 10 ** digits
  return Math.round((value + Number.EPSILON) * scale) / scale
}

function yarnPricePerKg(price: number, unit: YarnPriceUnit, fxRate: number): number {
  switch (unit) {
    case "USD/kg": return price
    case "USD/lb": return price * LB_PER_KG
    case "USD/bale": return price / KG_PER_BALE
    case "KRW/kg": return fxRate > 0 ? price / fxRate : 0
  }
}

function feeRatePerKg(rate: number, unit: FeeUnit, fxRate: number, grPerYd: number): number {
  switch (unit) {
    case "KRW/kg": return fxRate > 0 ? rate / fxRate : 0
    case "KRW/yd": return fxRate > 0 && grPerYd > 0 ? rate / fxRate / grPerYd * 1000 : 0
    case "USD/kg": return rate
    case "USD/yd": return grPerYd > 0 ? rate / grPerYd * 1000 : 0
  }
}

export function computeFabricCost(input: CostInput): CostResult {
  const warnings: string[] = []
  const validSize = input.gsm > 0 && input.widthInch > 0
  const grPerYd = validSize ? round(input.gsm * AREA_FACTOR * input.widthInch / 60) : 0

  if (!validSize) warnings.push("GSM과 완성 폭은 0보다 커야 합니다.")
  if (input.fxRate <= 0) warnings.push("환율은 0보다 커야 합니다.")
  const firstOtherIndex = input.fees.findIndex((fee) => fee.group !== "yarnDye")
  if (firstOtherIndex >= 0 && input.fees.some((fee, index) => fee.group === "yarnDye" && index > firstOtherIndex)) {
    warnings.push("원사 공정(선염·연사·인팅)은 편직보다 앞에 있어야 합니다.")
  }
  const ratioTotal = input.yarns.reduce((sum, yarn) => sum + yarn.ratio, 0)
  const dyedSharePct = input.yarns.reduce((sum, yarn) => sum + (yarn.yarnDyed ? yarn.ratio : 0), 0)
  const hasYarnDyeRate = input.fees.some((fee) => fee.group === "yarnDye" && fee.rate > 0)
  if (Math.abs(ratioTotal - 100) > 1e-9) warnings.push("원사 투입 중량비 합이 100이 아닙니다.")
  if (hasYarnDyeRate && dyedSharePct <= 0) warnings.push("원사 공정 단가가 있는데 선염 체크된 원사가 없습니다. loss가 아무 원사에도 걸리지 않습니다.")
  if (dyedSharePct > 0 && !hasYarnDyeRate) warnings.push("선염 체크된 원사가 있는데 원사 공정 단가가 비어 있습니다.")
  for (const fee of input.fees) {
    if (fee.loss < 0 || fee.loss > 50) warnings.push(`${fee.label}의 loss는 0~50 범위여야 합니다.`)
  }

  const yarnValues = input.yarns.map((yarn) => {
    let downstream = 1
    for (const fee of input.fees) {
      if (fee.group !== "yarnDye" || yarn.yarnDyed) downstream *= 1 + fee.loss / 100
    }
    return yarnPricePerKg(yarn.price, yarn.priceUnit, input.fxRate) * yarn.ratio / 100 * downstream
  })

  const feeValues = input.fees.map((fee, index) => {
    let downstream = 1
    for (let later = index + 1; later < input.fees.length; later += 1) {
      downstream *= 1 + input.fees[later].loss / 100
    }
    return feeRatePerKg(fee.rate, fee.unit, input.fxRate, grPerYd) * downstream
  })

  const yarnPerKg = yarnValues.reduce((sum, value) => sum + value, 0)
  const feePerKg = feeValues.reduce((sum, value) => sum + value, 0)
  const netPerKg = round(yarnPerKg + feePerKg, 2)
  const netPerLb = round(netPerKg / LB_PER_KG, 2)
  const netPerYd = netPerKg * grPerYd / 1000
  const netKrwPerYd = round(netPerYd * input.fxRate)
  const totalPerKg = netPerKg * (1 + (input.profitPct ?? 0) / 100)
  const totalPerLb = totalPerKg / LB_PER_KG
  const totalPerYd = totalPerKg * grPerYd / 1000
  const totalKrwPerYd = round(totalPerYd * input.fxRate)
  const profitPerKg = round(totalPerKg - netPerKg, 2)

  const rawLines = [
    ...input.yarns.map((yarn, index) => ({ label: yarn.name, perKg: yarnValues[index] })),
    ...input.fees.map((fee, index) => ({ label: fee.label, perKg: feeValues[index] })),
  ]
  const lines = rawLines.map((line) => ({
    ...line,
    sharePct: netPerKg !== 0 ? line.perKg / netPerKg * 100 : 0,
  }))

  return {
    grPerYd,
    dyedSharePct,
    yarnPerKg,
    feePerKg,
    netPerKg,
    netPerLb,
    netPerYd,
    netKrwPerYd,
    profitPerKg,
    totalPerKg,
    totalPerLb,
    totalPerYd,
    totalKrwPerYd,
    lines,
    warnings,
  }
}
