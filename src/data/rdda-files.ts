import * as XLSX from "xlsx"

import { normalizeFl } from "./disposal-round"

const headKey = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase()
const validFl = (value: unknown) => {
  const fl = normalizeFl(value)
  return /^FL\d{8}$/.test(fl) ? fl : ""
}

/** RDDA 라이브러리 목록. FL NO, Meeting Count, Pickup Count만 읽는다. */
export function parseRddaUsage(workbook: XLSX.WorkBook): { byFl: Map<string, { meeting: number; pickup: number }>; fileRows: number } {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null })
  const headIndex = rows.slice(0, 10).findIndex((row) => {
    const heads = row.map(headKey)
    return ["FL NO", "MEETING COUNT", "PICKUP COUNT"].every((head) => heads.includes(head))
  })
  if (headIndex < 0) throw new Error("RDDA 라이브러리 파일이 아닙니다. FL NO, Meeting Count, Pickup Count 열이 필요합니다.")
  const heads = rows[headIndex].map(headKey)
  const flIndex = heads.indexOf("FL NO")
  const meetingIndex = heads.indexOf("MEETING COUNT")
  const pickupIndex = heads.indexOf("PICKUP COUNT")
  const byFl = new Map<string, { meeting: number; pickup: number }>()
  rows.slice(headIndex + 1).forEach((row) => {
    const fl = validFl(row[flIndex])
    if (!fl) return
    const meetingValue = Number(row[meetingIndex])
    const pickupValue = Number(row[pickupIndex])
    const meeting = Number.isFinite(meetingValue) ? meetingValue : 0
    const pickup = Number.isFinite(pickupValue) ? pickupValue : 0
    const previous = byFl.get(fl)
    byFl.set(fl, { meeting: Math.max(previous?.meeting ?? 0, meeting), pickup: Math.max(previous?.pickup ?? 0, pickup) })
  })
  return { byFl, fileRows: Math.max(0, rows.length - headIndex - 1) }
}

/** RDDA 목록 내보내기(보관 목록). Ref. No 또는 FL NO 또는 FL# 열의 FL만 읽는다. */
export function parseRddaFlList(workbook: XLSX.WorkBook): { fls: string[]; fileRows: number } {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null })
  const names = ["REF. NO", "FL NO", "FL#"]
  const headIndex = rows.slice(0, 10).findIndex((row) => row.map(headKey).some((head) => names.includes(head)))
  const fls = new Set<string>()
  if (headIndex >= 0) {
    const heads = rows[headIndex].map(headKey)
    const column = heads.findIndex((head) => names.includes(head))
    rows.slice(headIndex + 1).forEach((row) => { const fl = validFl(row[column]); if (fl) fls.add(fl) })
  } else {
    rows.forEach((row) => row.forEach((value) => { const fl = validFl(value); if (fl) fls.add(fl) }))
  }
  if (!fls.size) throw new Error("FL 번호를 찾지 못했습니다. RDDA 목록 파일을 올려 주세요.")
  return { fls: [...fls], fileRows: headIndex >= 0 ? Math.max(0, rows.length - headIndex - 1) : rows.length }
}
