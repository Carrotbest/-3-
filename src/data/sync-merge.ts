/**
 * 3-way 병합. baseline은 이 클라이언트가 마지막으로 본 원격 값이다.
 * 내가 고친 항목은 내 값을, 건드리지 않은 항목은 원격 값을 쓴다.
 * 순서는 원격 순서를 따르고, 나만 가진 새 항목은 뒤에 붙인다.
 */
export function mergeKeyed<T>(
  baseline: readonly T[] | null,
  mine: readonly T[],
  theirs: readonly T[],
  idOf: (item: T) => string,
): T[] {
  if (!baseline) return [...theirs]
  const toMap = (list: readonly T[]) => {
    const map = new Map<string, T>()
    list.forEach((item) => map.set(idOf(item), item))
    return map
  }
  const base = toMap(baseline)
  const local = toMap(mine)
  const same = (left: T | undefined, right: T | undefined) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

  const result: T[] = []
  const used = new Set<string>()
  theirs.forEach((item) => {
    const id = idOf(item)
    used.add(id)
    if (!local.has(id)) {
      // 내가 지웠으면 빼고, 상대가 새로 넣었으면 받는다.
      if (base.has(id)) return
      result.push(item)
      return
    }
    // 내가 고쳤으면 내 값, 아니면 원격 값.
    result.push(same(local.get(id), base.get(id)) ? item : local.get(id)!)
  })
  mine.forEach((item) => {
    const id = idOf(item)
    if (used.has(id)) return
    // 원격에는 없는 항목. 내가 새로 넣었으면 살리고, 상대가 지운 것이면 뺀다.
    if (base.has(id) && same(local.get(id), base.get(id))) return
    result.push(item)
  })
  return result
}

/**
 * 같은 값이 여러 번 나오는 목록의 병합 id를 `값|몇 번째`로 만든다.
 * 자연 키가 겹치는 행이 섞여 있어도 모든 행이 서로 다른 id를 갖는다.
 * 목록 순서가 같으면 어느 클라이언트에서 계산해도 같은 id가 나온다.
 */
export function occurrenceIds<T>(list: readonly T[], baseOf: (item: T) => string): string[] {
  const seen = new Map<string, number>()
  return list.map((item) => {
    const base = baseOf(item)
    const occurrence = (seen.get(base) ?? 0) + 1
    seen.set(base, occurrence)
    return `${base}|${occurrence}`
  })
}

/**
 * 목록 문맥이 있어야 id가 서는 키의 3-way 병합. id를 목록마다 따로 계산해 붙인 뒤 `mergeKeyed`에 넘긴다.
 * 항목마다 id를 구하는 함수로는 "같은 값 중 몇 번째"를 알 수 없어 따로 둔다.
 */
export function mergeKeyedByList<T>(
  baseline: readonly T[] | null,
  mine: readonly T[],
  theirs: readonly T[],
  idsOf: (list: readonly T[]) => string[],
): T[] {
  if (!baseline) return [...theirs]
  const wrap = (list: readonly T[]) => {
    const ids = idsOf(list)
    return list.map((value, index) => ({ id: ids[index], value }))
  }
  return mergeKeyed(wrap(baseline), wrap(mine), wrap(theirs), (entry) => entry.id).map((entry) => entry.value)
}
