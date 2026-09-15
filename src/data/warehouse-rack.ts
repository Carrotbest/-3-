/**
 * 통합원단부 전용 창고 rack 번호 규칙(창고팀 선반배치도 2026.09.01 기준).
 *
 * 형식은 `{열}-{rack}-{칸}`이다. 예: K-1-1 = K열 1번 rack의 1번 칸(맨 윗층).
 * 전용 rack은 K열 9개, L열 10개이고 rack마다 칸은 3개(위에서부터 1, 2, 3)다.
 * 배치도에는 가운데 rack이 "RND"로만 적혀 있어, 번호가 적힌 rack과 같이 모두 3칸으로 본다.
 *
 * 원단은 입고 순서대로 쌓지 않고 빈 칸을 찾아 넣는다. 그래서 원단마다 rack 번호를 붙인다.
 * 한 칸에 원단 여러 롤이 들어가므로 같은 번호를 여러 원단이 쓸 수 있다.
 */
export const RACK_ROWS: Readonly<Record<string, number>> = { K: 9, L: 10 }
export const RACK_LEVELS = 3

/** 추천 목록 맨 위의 지정 해제 항목. 고르고 확정하면 rack 번호를 지운다. */
export const RACK_NONE_LABEL = "선택 안함"

/**
 * 칸 하나의 위치. 배치도(2D)와 이후 3D 맵이 같은 모델을 읽는다.
 * rowIndex는 열의 앞뒤 순서(3D 깊이), rack은 가로 위치, level은 위에서부터 층(1이 맨 위)이다.
 */
export interface RackSlot {
  id: string
  row: string
  rowIndex: number
  rack: number
  level: number
}

/** 배치도에 그리는 열 순서(위부터). 실제 선반 배치에 맞춰 L열을 위에 둔다. */
export const RACK_ROW_ORDER: readonly string[] = ["L", "K"]

export const RACK_SLOTS: readonly RackSlot[] = RACK_ROW_ORDER.flatMap((row, rowIndex) =>
  Array.from({ length: RACK_ROWS[row] }, (_, rack) =>
    Array.from({ length: RACK_LEVELS }, (_, level) => ({ id: `${row}-${rack + 1}-${level + 1}`, row, rowIndex, rack: rack + 1, level: level + 1 }))).flat())

/** 입력칸 추천용 전체 칸 목록. 배치도 순서와 무관하게 K-1-1 ... L-10-3 순서다. */
export const RACK_POSITIONS: readonly string[] = [...RACK_SLOTS]
  .sort((left, right) => left.row.localeCompare(right.row) || left.rack - right.rack || left.level - right.level)
  .map((slot) => slot.id)

export const RACK_FORMAT_HINT = "Rack No.는 K-1-1처럼 입력하세요. K열 rack 1~9, L열 rack 1~10, 칸 1~3입니다."

/**
 * 사람이 친 값을 표준 형식으로 바꾼다. `k 1 1`, `K1-1`, `k-01-1`도 받는다.
 * 빈 값, "선택 안함", "미지정", "-"는 ""(지정 해제), 규칙에 안 맞으면 null이다.
 */
export function normalizeRackNo(raw: string): string | null {
  const text = raw.trim().toUpperCase()
  if (!text || text === RACK_NONE_LABEL || text === "미지정" || text === "-") return ""
  const match = /^([A-Z])\s*[-\s]?\s*(\d{1,2})\s*[-\s]\s*(\d{1,2})$/.exec(text)
  if (!match) return null
  const [, row, rackText, levelText] = match
  const racks = RACK_ROWS[row]
  const rack = Number(rackText)
  const level = Number(levelText)
  if (!racks || rack < 1 || rack > racks || level < 1 || level > RACK_LEVELS) return null
  return `${row}-${rack}-${level}`
}
