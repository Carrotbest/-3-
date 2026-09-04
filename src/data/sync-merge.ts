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
