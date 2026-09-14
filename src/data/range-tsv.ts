/** 표 선택 영역(행·열 인덱스). DD MASTER와 WAREHOUSE가 같은 규칙으로 여러 영역을 다룬다. */
export interface IndexRect {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Ctrl+클릭으로 고른 여러 영역을 탭 구분 텍스트 하나로 합친다. 엑셀과 같은 규칙이다.
 * - 모든 영역의 열 범위가 같으면 위에서 아래 순서로 이어 붙인다.
 * - 모든 영역의 행 범위가 같으면 왼쪽에서 오른쪽 순서로 옆에 붙인다.
 * - 둘 다 아니면 붙일 모양이 없으므로 null을 돌려 복사를 막는다.
 */
export function combineRangeTsv<T extends IndexRect>(areas: readonly T[], toTsv: (area: T) => string): string | null {
  if (!areas.length) return ""
  if (areas.length === 1) return toTsv(areas[0])
  const first = areas[0]
  if (areas.every((area) => area.left === first.left && area.right === first.right)) {
    return [...areas].sort((a, b) => a.top - b.top).map(toTsv).join("\n")
  }
  if (areas.every((area) => area.top === first.top && area.bottom === first.bottom)) {
    const blocks = [...areas].sort((a, b) => a.left - b.left).map((area) => toTsv(area).split("\n"))
    return blocks[0].map((_, row) => blocks.map((block) => block[row] ?? "").join("\t")).join("\n")
  }
  return null
}

export const MULTI_RANGE_COPY_BLOCKED = "여러 영역은 같은 열이나 같은 행으로 맞춰야 복사할 수 있습니다."

export const formatStatNumber = (value: number): string =>
  value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })
