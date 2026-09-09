/**
 * 화면 보기 설정 저장소 — 그룹 펼침/접힘 같은 개인 취향 값.
 *
 * **개인 브라우저에만 남는다.** `CACHE_KEYS`에 없으므로 Firestore로 올라가지 않고,
 * 한 사람이 접거나 펴도 팀원 화면은 그대로다. 원장 데이터와 성격이 다르다.
 *
 * 계정이 아니라 브라우저에 붙는다. 그래서 공용 PC에서는 앞사람 설정이 그대로 보이고,
 * 같은 사람이라도 다른 PC로 가면 기본값에서 시작한다. 열 너비 저장과 같은 성질이다.
 *
 * 저장소를 못 쓰는 환경(사생활 보호 모드, 용량 초과)에서도 화면은 기본값으로 정상 동작한다.
 */

/** 저장된 값 중 기본값에 있는 키만, 타입이 맞을 때만 받는다. 낡거나 손상된 값은 무시한다. */
export function loadViewGroups<T extends Record<string, boolean>>(key: string, defaults: T): T {
  if (typeof window === "undefined") return { ...defaults }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return { ...defaults }
    const stored = JSON.parse(raw) as unknown
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...defaults }
    const next: Record<string, boolean> = { ...defaults }
    Object.entries(stored as Record<string, unknown>).forEach(([name, value]) => {
      if (name in next && typeof value === "boolean") next[name] = value
    })
    return next as T
  } catch {
    return { ...defaults }
  }
}

/** 참·거짓 하나짜리 보기 값(하위 그룹 펼침 등). */
export function loadViewFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw === "true" ? true : raw === "false" ? false : fallback
  } catch {
    return fallback
  }
}

export function saveViewPref(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장소가 막혀도 이번 세션의 화면 상태는 그대로 유지된다.
  }
}
