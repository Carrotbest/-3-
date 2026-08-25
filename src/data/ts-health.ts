import type { TsRecord } from "./sample"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * TS 목록이 현재 스키마대로 정상 파싱된 데이터인지 판별한다.
 *
 * 구버전 파서가 만든 데이터는 접수일(receivedAt)이 비어 있고 id에 날짜 문자열이 들어가,
 * 화면에서 "날짜 미등록"·월별 그래프 0으로 나타난다. 중앙(Firestore)에 그런 낡은 값이
 * 남아 있어도 정상 데이터를 덮어쓰지 않도록, 반영 전에 이 검사를 통과시킨다.
 */
export function isTsWellFormed(records: readonly TsRecord[] | null | undefined): boolean {
  if (!Array.isArray(records) || records.length === 0) return false
  const dated = records.filter((record) => ISO_DATE.test((record?.receivedAt ?? "").trim())).length
  return dated / records.length >= 0.9
}
