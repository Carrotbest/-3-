import type { FabricLedgerItem } from "./fabric-ledger"
import type { DevRecord } from "./schema"

export interface WarehouseFlCheck {
  fl: string
  formatWarning: boolean
  mergeRecords: DevRecord[]
  sameStyleNoFl: DevRecord[]
  duplicateItems: FabricLedgerItem[]
}

const normalizeFlKey = (value: string): string => value.replace(/\s+/g, "").toUpperCase()
const normalizeStyleNo = (value: string): string => value.trim().toUpperCase()

/** 창고 직접 추가 원단의 FL을 저장하기 전에 DD·원장 중복 가능성을 확인한다. */
export function checkWarehouseFlEntry(
  value: string,
  item: FabricLedgerItem,
  records: readonly DevRecord[],
  ledger: readonly FabricLedgerItem[],
): WarehouseFlCheck {
  const fl = value.trim()
  const flKey = normalizeFlKey(fl)
  if (!flKey) return { fl, formatWarning: false, mergeRecords: [], sameStyleNoFl: [], duplicateItems: [] }

  const mergeRecords = records.filter((record) => normalizeFlKey(record.flNo) === flKey)
  const styleNo = normalizeStyleNo(item.styleNo)
  const sameStyleNoFl = mergeRecords.length || !styleNo ? [] : records.filter((record) => (
    normalizeStyleNo(record.styleNo) === styleNo && !normalizeFlKey(record.flNo)
  ))
  const duplicateItems = ledger.filter((candidate) => (
    candidate.key !== item.key
    && normalizeFlKey(candidate.flNo) === flKey
    && (!candidate.record || !mergeRecords.includes(candidate.record))
  ))

  return {
    fl,
    formatWarning: !/^FL\d{8}$/i.test(fl),
    mergeRecords,
    sameStyleNoFl,
    duplicateItems,
  }
}

export function needsFlConfirm(check: WarehouseFlCheck): boolean {
  return check.formatWarning
    || check.mergeRecords.length > 0
    || check.sameStyleNoFl.length > 0
    || check.duplicateItems.length > 0
}
