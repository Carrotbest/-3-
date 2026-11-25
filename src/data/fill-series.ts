/**
 * 채우기 핸들이 이어서 넣을 값들(R458). 연속으로 볼 수 없으면 `null` 이고
 * 그때 호출하는 쪽은 지금까지처럼 원본을 되풀이한다.
 *
 * `source` 는 끄는 방향으로 늘어선 원본 칸의 값이고 `count` 는 새로 채울 칸 수다.
 *
 * **한 칸짜리 원본은 언제나 `null` 이다.** 엑셀은 날짜 한 칸을 끌면 하루씩 올리지만
 * DD 는 한 Style 의 옵션 행에 같은 날짜를 넣는 일이 훨씬 흔하다. 수취일, 공정 완료일,
 * 납기가 다 그렇다. 하루씩 올리면 사람이 같은 값을 기대한 자리에 다른 날짜가 조용히
 * 박힌다. 틀린 것이 눈에 안 띄는 변경이다. **되돌리지 말 것**(2026-11-26 확정).
 *
 * 연속은 원본이 두 칸 이상이고 간격이 일정할 때만이다. 그것은 사람이 패턴을 보여 준 것이다.
 */
export function fillSeriesValues(source: readonly string[], count: number): string[] | null {
  if (count <= 0 || source.length < 2) return null
  const values = source.map((item) => String(item ?? "").trim())
  if (values.some((item) => !item)) return null

  const dates = values.map(dayNumber)
  if (dates.every((item) => item !== null)) {
    const step = stepOf(dates as number[])
    if (step === null) return null
    const last = dates[dates.length - 1] as number
    return Array.from({ length: count }, (_, index) => dateText(last + step * (index + 1)))
  }

  const numbers = values.map(numberValue)
  if (numbers.every((item) => item !== null)) {
    const step = stepOf(numbers as number[])
    if (step === null) return null
    const digits = Math.max(...values.map(decimals))
    const last = numbers[numbers.length - 1] as number
    return Array.from({ length: count }, (_, index) => (last + step * (index + 1)).toFixed(digits))
  }

  return null
}

/** 간격이 일정하면 그 값, 아니면 `null`. 소수 오차는 눈감아 준다. */
function stepOf(values: number[]): number | null {
  const step = values[1] - values[0]
  for (let index = 2; index < values.length; index += 1) {
    if (Math.abs(values[index] - values[index - 1] - step) > 1e-9) return null
  }
  return step
}

/**
 * `YYYY-MM-DD` 만 날짜로 보고 1970-01-01 부터 센 날수를 돌려준다. 그 밖에는 `null`.
 * **`new Date(문자열)` 로 파싱하지 말 것.** 시간대에 따라 하루가 밀린다.
 * 저장 형식이 `YYYY-MM-DD` 하나뿐이라 직접 쪼개는 것이 맞다.
 */
function dayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  // 2026-02-31 처럼 달력에 없는 날짜를 거른다.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return Math.round(time / 86400000)
}

/** 날수를 `YYYY-MM-DD` 로 되돌린다. UTC 로만 다뤄 시간대에 흔들리지 않는다. */
function dateText(days: number): string {
  const date = new Date(days * 86400000)
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/**
 * 숫자 하나로만 된 칸이면 그 값, 아니면 `null`.
 * **`1,200` 같은 쉼표 숫자를 받지 말 것.** 결과를 쉼표 없이 돌려주면 같은 열에 두 표기가 섞인다.
 * `12개` 처럼 단위가 붙은 값도 숫자로 보지 않는다.
 */
function numberValue(value: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 소수점 아래 자릿수. 원본이 `1.5` 면 결과도 한 자리로 맞춘다. */
function decimals(value: string): number {
  const dot = value.indexOf(".")
  return dot < 0 ? 0 : value.length - dot - 1
}
