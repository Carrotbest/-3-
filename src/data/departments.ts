import { createScreenAccess, type ScreenAccess, type ScreenAccessMap, type ScreenPermissionKey } from "./screen-permissions"

/**
 * 부서별 기본 권한(R217). 부서를 고르면 이 값으로 채우고, 이후 화면별로 고치면 "직접 설정"으로 본다.
 * 통합원단부 3팀이 원단 R&D(이 앱을 운영하는 팀)다. HOME은 3팀만 공개, 나머지 부서는 읽기(블러)다.
 */
export type DepartmentId = "fabric1" | "fabric2" | "fabric3" | "settlement" | "business" | "related"

const preset = (base: ScreenAccess, overrides: Partial<Record<ScreenPermissionKey, ScreenAccess>>): ScreenAccessMap =>
  ({ ...createScreenAccess(base), ...overrides, setting: "none" })

export const DEPARTMENTS: { id: DepartmentId; label: string; short: string; hint: string; access: ScreenAccessMap }[] = [
  {
    // 디자인·마케팅 성격의 소싱 위주 팀. FABRIC REQUEST로 소싱 의뢰를 넣고 개발 진행과 트렌드를 본다.
    id: "fabric1", label: "통합원단부 1팀(디자인·마케팅 소싱)", short: "1팀", hint: "소싱 의뢰(REQUEST) 편집, 1팀 창고 편집, 3팀 창고는 읽기+출고 요청",
    access: preset("read", { fabricRequest: "edit", excelBackup: "none", warehouseFabric1: "edit", warehouseOutbound: "edit" }),
  },
  {
    id: "fabric2", label: "통합원단부 2팀", short: "2팀", hint: "요청 편집, 출고 요청, HOME 블러, 나머지 읽기",
    access: preset("read", { fabricRequest: "edit", excelBackup: "none", warehouseFabric1: "none", warehouseOutbound: "edit" }),
  },
  {
    id: "fabric3", label: "통합원단부 3팀(원단 R&D)", short: "3팀", hint: "우리 팀. HOME 공개, 전 화면 편집",
    access: preset("edit", {}),
  },
  {
    id: "settlement", label: "정산관리팀(창고팀)", short: "창고", hint: "3팀·1팀 창고 편집, HOME 블러, 캘린더 읽기",
    access: preset("none", { warehouse: "edit", warehouseFabric1: "edit", warehouseOutbound: "edit", home: "read", calendar: "read" }),
  },
  {
    id: "business", label: "사업부서", short: "사업부", hint: "HOME 블러, 요청·개발 현황·창고·트렌드 읽기",
    access: preset("none", { home: "read", fabricRequest: "read", development: "read", warehouse: "read", fabricTrend: "read", portfolio: "read", study: "read", calendar: "read" }),
  },
  {
    // 위 부서에 속하지 않는 기타 유관부서(품질, 생산, 기획 등). 최소 권한으로 시작하고 필요한 화면만 연다.
    id: "related", label: "유관부서", short: "유관", hint: "HOME 블러, 요청·개발 현황·트렌드 읽기",
    access: preset("none", { home: "read", fabricRequest: "read", development: "read", fabricTrend: "read", calendar: "read" }),
  },
]

export const departmentById = (id: unknown) => DEPARTMENTS.find((department) => department.id === id) ?? null

/**
 * 메일 본문에 적는 부서 이름. `label`에서 괄호 설명을 뺀 값이다("통합원단부 3팀(원단 R&D)" → "통합원단부 3팀").
 * `short`("3팀")는 화면 배지용이라 외부로 나가는 문서에는 쓰지 않는다.
 */
export const departmentMailLabel = (id: unknown): string =>
  departmentById(id)?.label.replace(/\s*\(.*\)\s*$/, "") ?? ""

/** access가 부서 기본값과 같으면 true. 다르면 화면에서 "직접 설정" 표시를 붙인다. */
export function matchesDepartment(id: unknown, access: ScreenAccessMap): boolean {
  const department = departmentById(id)
  if (!department) return false
  return (Object.keys(department.access) as ScreenPermissionKey[]).every((key) => key === "setting" || department.access[key] === access[key])
}
