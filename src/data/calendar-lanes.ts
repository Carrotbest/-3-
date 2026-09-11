export interface LaneBar<T> {
  event: T
  startCol: number
  span: number
  lane: number
  isStart: boolean
  isEnd: boolean
}

export interface LaneAssignment<T> {
  bars: LaneBar<T>[]
  laneCount: number
  overflow: number
}

/** 한 주에 걸치는 기간 일정을 겹치지 않는 최대 3개 레인에 배정한다. */
export function assignLanes<T extends { date: string; endDate?: string }>(
  weekKeys: readonly string[],
  events: readonly T[],
  endOf: (event: T) => string,
): LaneAssignment<T> {
  if (weekKeys.length !== 7) return { bars: [], laneCount: 0, overflow: 0 }

  const weekStart = weekKeys[0]
  const weekEnd = weekKeys[6]
  const sorted = events
    .filter((event) => event.date <= weekEnd && endOf(event) >= weekStart)
    .map((event) => ({ event, end: endOf(event) }))
    .sort((left, right) => left.event.date.localeCompare(right.event.date)
      || right.end.localeCompare(left.end))

  const occupied: Array<Array<[number, number]>> = [[], [], []]
  const bars: LaneBar<T>[] = []
  let overflow = 0

  sorted.forEach(({ event, end }) => {
    const startIndex = weekKeys.indexOf(event.date)
    const endIndex = weekKeys.indexOf(end)
    const startCol = startIndex < 0 ? 0 : startIndex
    const endCol = endIndex < 0 ? 6 : endIndex
    const lane = occupied.findIndex((ranges) => ranges.every(([start, finish]) => endCol < start || startCol > finish))

    if (lane < 0) {
      overflow += 1
      return
    }

    occupied[lane].push([startCol, endCol])
    bars.push({
      event,
      startCol,
      span: endCol - startCol + 1,
      lane,
      isStart: startIndex >= 0,
      isEnd: endIndex >= 0,
    })
  })

  const laneCount = bars.length ? Math.max(...bars.map((bar) => bar.lane)) + 1 : 0
  return { bars, laneCount, overflow }
}
