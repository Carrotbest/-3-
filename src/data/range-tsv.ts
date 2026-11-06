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

/**
 * 엑셀 클립보드(TSV)를 격자로 읽는다(R390). RFC 4180 따옴표 규칙을 따른다.
 *
 * 엑셀은 줄바꿈이나 탭이 든 칸을 `"`로 감싸고 칸 안의 `"`는 `""`로 두 번 쓴다.
 * 따옴표를 안 보고 줄과 탭으로만 쪼개면 **여러 줄 칸 하나가 여러 행으로 흩어진다.**
 * 2026-11-06에 REQUEST 표에서 개발요청 한 칸이 스타일 네 개로 퍼졌다.
 *
 * 따옴표는 **칸이 비어 있을 때만** 연다. `abc"def`의 `"`는 그냥 글자다. 엑셀도 그렇게 쓴다.
 * 칸 안의 CRLF는 `\n` 하나로 맞춘다.
 */
export function parseTsvGrid(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let i = 0
  const endField = () => { row.push(field); field = "" }
  const endRow = () => { endField(); rows.push(row); row = [] }
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i += 2; continue }
        quoted = false; i += 1; continue
      }
      if (ch === "\r") { if (text[i + 1] === "\n") i += 1; field += "\n"; i += 1; continue }
      field += ch; i += 1; continue
    }
    if (ch === "\"" && field === "") { quoted = true; i += 1; continue }
    if (ch === "\t") { endField(); i += 1; continue }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      endRow(); i += 1; continue
    }
    field += ch; i += 1
  }
  endRow()
  // 끝의 빈 줄은 버린다. 예전 `.replace(/\n+$/, "")`와 같은 효과다.
  while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop()
  return rows
}

/**
 * 칸 하나를 TSV 글자로 바꾼다(R390). 탭·줄바꿈·따옴표가 있으면 감싸고 `"`를 두 번 쓴다.
 * 감싸지 않으면 엑셀이 그 칸을 여러 칸으로 읽는다.
 */
export function tsvCell(value: string): string {
  return /["\t\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value
}
