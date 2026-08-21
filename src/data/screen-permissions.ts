export const SCREEN_PERMISSION_OPTIONS = [
  { key: "home", label: "HOME", paths: ["/"] },
  { key: "development", label: "DEVELOPMENT", paths: ["/development"] },
  { key: "ddMaster", label: "DD MASTER", prefixes: ["/development/"] },
  { key: "warehouse", label: "WAREHOUSE", paths: ["/warehouse"] },
  { key: "ts", label: "TROUBLE SHOOTING", paths: ["/ts"] },
  { key: "study", label: "FABRIC STUDY", paths: ["/study"] },
  { key: "rdda", label: "RDDA REPORT", paths: ["/rdda"] },
  { key: "fabricAnalysis", label: "FABRIC ANALYSIS", paths: ["/fabric-analysis"] },
  { key: "fabricTrend", label: "FABRIC TREND", paths: ["/trend/fabric", "/trend/macro"] },
  { key: "portfolio", label: "PORTFOLIO", paths: ["/trend/portfolio"] },
  { key: "processInnovation", label: "PROCESS INNOVATION", paths: ["/process-innovation"] },
  { key: "calendar", label: "CALENDAR", paths: ["/calendar"] },
  { key: "data", label: "DATA", paths: ["/sync"] },
  { key: "setting", label: "SETTING", paths: ["/setting"] },
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
