export const SCREEN_PERMISSION_OPTIONS = [
  { key: "home", label: "HOME", paths: ["/"] },
  { key: "fabricRequest", label: "DEVELOPMENT REQUEST", paths: ["/request"] },
  { key: "development", label: "PROGRESS OVERVIEW", paths: ["/development"] },
  { key: "ddMaster", label: "DD MASTER", prefixes: ["/development/"] },
  { key: "warehouse", label: "WAREHOUSE", paths: ["/warehouse"], prefixes: ["/fabric/"] },
  // 창고 화면 안에서 1팀 원단 스코프만 지배한다. 경로가 없어 라우팅에는 영향을 주지 않는다.
  { key: "warehouseFabric1", label: "WAREHOUSE (1팀)" },
  // 출고 요청 메일은 데이터를 저장하지 않는 기능이라 편집 권한과 별도로 둔다.
  { key: "warehouseOutbound", label: "출고 요청 메일" },
  { key: "ts", label: "TROUBLE SHOOTING", paths: ["/ts"] },
  { key: "study", label: "TECHNICAL REFERENCES", paths: ["/study"] },
  { key: "rdda", label: "RDDA REPORT", paths: ["/rdda"] },
  { key: "fabricAnalysis", label: "FABRIC ANALYSIS", paths: ["/fabric-analysis"] },
  { key: "fabricTrend", label: "FABRIC TREND", paths: ["/trend/fabric", "/trend/macro"] },
  { key: "portfolio", label: "PORTFOLIO", paths: ["/trend/portfolio"] },
  { key: "processInnovation", label: "PROCESS INNOVATION", paths: ["/process-innovation"] },
  { key: "calendar", label: "CALENDAR", paths: ["/calendar"] },
  // SETTING은 소유자 전용이다. 목록에 남겨 두되 실제 접근은 App에서 소유자만 통과시킨다.
  { key: "setting", label: "SETTING", paths: ["/setting"] },
  // 화면이 아니라 기능 권한이다. 경로가 없어 라우팅에는 영향을 주지 않는다.
  { key: "excelBackup", label: "엑셀 백업" },
] as const

export type ScreenPermissionKey = (typeof SCREEN_PERMISSION_OPTIONS)[number]["key"]
export type ScreenPermissions = Record<ScreenPermissionKey, boolean>

export function createScreenPermissions(enabled: boolean): ScreenPermissions {
  return Object.fromEntries(
    SCREEN_PERMISSION_OPTIONS.map((option) => [option.key, enabled]),
  ) as ScreenPermissions
}

/** 기존 승인 사용자의 권한 문서가 없으면 이전 동작과 같도록 전체 허용한다. */
export function normalizeScreenPermissions(value: unknown, fallback = true): ScreenPermissions {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return Object.fromEntries(
    SCREEN_PERMISSION_OPTIONS.map((option) => [
      option.key,
      typeof source[option.key] === "boolean" ? source[option.key] : fallback,
    ]),
  ) as ScreenPermissions
}

export function permissionKeyForPath(pathname: string): ScreenPermissionKey | null {
  const option = SCREEN_PERMISSION_OPTIONS.find((candidate) => {
    if ("paths" in candidate && candidate.paths.some((path) => path === pathname)) return true
    return "prefixes" in candidate && candidate.prefixes.some((prefix) => pathname.startsWith(prefix))
  })
  return option?.key ?? null
}

/** 등록되지 않은 경로는 라우터의 404 처리에 맡기고, 등록 화면만 권한을 검사한다. */
export function canAccessScreenPath(pathname: string, permissions: ScreenPermissions): boolean {
  const key = permissionKeyForPath(pathname)
  return key === null || permissions[key]
}

/* ------------------------------------------------------------------
 * 화면별 접근 수준(R217). 없음 / 읽기 / 편집 세 단계.
 * 기존 screenPermissions(불리언)는 라우팅·사이드바 호환용으로 access에서 파생해 함께 저장한다.
 * ------------------------------------------------------------------ */
export type ScreenAccess = "none" | "read" | "edit"
export type ScreenAccessMap = Record<ScreenPermissionKey, ScreenAccess>

export const ACCESS_LABELS: Record<ScreenAccess, string> = { none: "없음", read: "읽기", edit: "편집" }

/** 권한 표에 보이는 묶음. SETTING은 소유자 전용이라 표에 넣지 않는다. excelBackup은 기능이라 허용/차단 두 단계다. */
export const ACCESS_GROUPS: { label: string; keys: ScreenPermissionKey[] }[] = [
  { label: "업무", keys: ["home", "fabricRequest", "development", "ddMaster", "warehouse", "warehouseFabric1", "calendar"] },
  { label: "분석·자료", keys: ["rdda", "fabricAnalysis", "fabricTrend", "portfolio", "processInnovation", "ts", "study"] },
  { label: "기능", keys: ["excelBackup", "warehouseOutbound"] },
]

export const FEATURE_KEYS: readonly ScreenPermissionKey[] = ["excelBackup", "warehouseOutbound"]

export function createScreenAccess(level: ScreenAccess): ScreenAccessMap {
  return Object.fromEntries(SCREEN_PERMISSION_OPTIONS.map((option) => [option.key, option.key === "setting" ? "none" : level])) as ScreenAccessMap
}

const isAccess = (value: unknown): value is ScreenAccess => value === "none" || value === "read" || value === "edit"

/**
 * 저장된 access를 읽는다. 없으면 예전 불리언 권한에서 옮긴다(허용 = 편집, 기존 동작 유지).
 * 둘 다 없으면 fallback 수준을 쓴다.
 */
export function normalizeScreenAccess(access: unknown, legacy: unknown, fallback: ScreenAccess = "edit"): ScreenAccessMap {
  const source = access && typeof access === "object" ? access as Record<string, unknown> : null
  const old = legacy && typeof legacy === "object" ? legacy as Record<string, unknown> : null
  return Object.fromEntries(SCREEN_PERMISSION_OPTIONS.map((option) => {
    const stored = source?.[option.key]
    if (isAccess(stored)) return [option.key, stored]
    const flag = old?.[option.key]
    if (typeof flag === "boolean") return [option.key, flag ? "edit" : "none"]
    return [option.key, fallback]
  })) as ScreenAccessMap
}

export function accessToScreenPermissions(access: ScreenAccessMap): ScreenPermissions {
  return Object.fromEntries(SCREEN_PERMISSION_OPTIONS.map((option) => [option.key, access[option.key] !== "none"])) as ScreenPermissions
}

/**
 * 중앙 저장 키마다 편집을 허용하는 화면. 이 중 하나라도 편집이면 그 키를 저장할 수 있다.
 * 목록에 없는 키(orgMembers 등)는 소유자만 저장한다.
 */
export const CACHE_KEY_SCREENS: Record<string, readonly ScreenPermissionKey[]> = {
  records: ["ddMaster", "development"],
  meta: ["ddMaster", "development"],
  completed: ["warehouse", "ddMaster", "warehouseFabric1"],
  fabricOverrides: ["warehouse", "ddMaster", "warehouseFabric1"],
  fabricEvents: ["warehouse", "ddMaster", "warehouseFabric1"],
  disposalRounds: ["warehouse"],
  requests: ["fabricRequest"],
  requestBoards: ["fabricRequest"],
  requestArchive: ["fabricRequest"],
  ts: ["ts"],
  study: ["study"],
  studyFiles: ["study"],
  events: ["calendar", "home"],
  rdda: ["rdda"],
  rddaSnapshots: ["rdda"],
  rddaReports: ["rdda"],
  analysisRequests: ["fabricAnalysis"],
  fabricAnalysis: ["fabricAnalysis"],
  materials: ["processInnovation", "portfolio", "study"],
  materialsManual: ["processInnovation", "portfolio", "study"],
  materialDiagnostics: ["processInnovation", "portfolio", "study"],
  chemical: ["portfolio", "processInnovation"],
  chemicalManual: ["portfolio", "processInnovation"],
  chemicalLinks: ["portfolio", "processInnovation"],
}

export function canEditCacheKey(access: ScreenAccessMap, key: string): boolean {
  const screens = CACHE_KEY_SCREENS[key]
  return Boolean(screens?.some((screen) => access[screen] === "edit"))
}

export function accessForPath(pathname: string, access: ScreenAccessMap): ScreenAccess | null {
  const key = permissionKeyForPath(pathname)
  return key ? access[key] : null
}
