import type { LucideIcon } from "lucide-react"
import {
  BookOpenCheck,
  Boxes,
  CalendarDays,
  ClipboardList,
  Database,
  FlaskConical,
  Globe2,
  Layers3,
  LayoutDashboard,
  LayoutGrid,
  Microscope,
  Settings,
  Waves,
  Workflow,
  Wrench,
} from "lucide-react"

export interface RouteDefinition {
  path: string
  title: string
  subtitle: string
}

export interface NavigationItem {
  label: string
  path: string
  icon: LucideIcon
  children?: Array<Pick<NavigationItem, "label" | "path">>
}

export interface NavigationGroup {
  label: string
  items: NavigationItem[]
}

export const routeDefinitions: RouteDefinition[] = [
  { path: "/", title: "HOME", subtitle: "원단 개발 업무 현황을 한눈에 확인합니다." },
  { path: "/development", title: "DEVELOPMENT", subtitle: "개발 건의 전체 진행 현황을 확인합니다." },
  { path: "/development/workspace", title: "DD MASTER", subtitle: "Development Dashboard 전체 열과 샘플 관리 상태를 한 시트에서 관리합니다." },
  { path: "/development/eu", title: "DD MASTER · EU", subtitle: "EU 개발 건을 확인합니다." },
  { path: "/development/season", title: "DD MASTER · SEASON", subtitle: "시즌별 개발 건을 확인합니다." },
  { path: "/development/core", title: "DD MASTER · CORE", subtitle: "Core 개발 건을 확인합니다." },
  { path: "/development/project", title: "DD MASTER · PROJECT", subtitle: "프로젝트별 개발 건을 확인합니다." },
  { path: "/rdda", title: "RDDA REPORT", subtitle: "RDDA 보고 현황을 확인합니다." },
  { path: "/ts", title: "TROUBLE SHOOTING", subtitle: "Technical Service 업무를 관리합니다." },
  { path: "/study", title: "TECHNICAL REFERENCES", subtitle: "팀 학습 과제와 점검 현황을 확인합니다." },
  { path: "/fabric-analysis", title: "FABRIC ANALYSIS", subtitle: "원단 분석 화면을 준비하고 있습니다." },
  { path: "/warehouse", title: "WAREHOUSE", subtitle: "완료 샘플의 입고·보관·소진·폐기 이력을 관리합니다." },
  { path: "/calendar", title: "CALENDAR", subtitle: "팀 일정과 주요 납기를 확인합니다." },
  { path: "/sync", title: "DATA", subtitle: "TDS 데이터 출처와 대조 결과를 확인합니다." },
  { path: "/setting", title: "SETTING", subtitle: "업무 플랫폼 설정을 관리합니다." },
  { path: "/trend/macro", title: "MACRO TREND", subtitle: "바이어 매출과 원자재·정부 통계를 확인합니다." },
  { path: "/trend/fabric", title: "FABRIC TREND", subtitle: "소재·원사·원단·염색가공 개발 기사를 모아 봅니다." },
  { path: "/trend/portfolio", title: "PORTFOLIO", subtitle: "팀이 개발한 기능성 원단 자산입니다." },
  { path: "/process-innovation", title: "PROCESS INNOVATION", subtitle: "프로세스 혁신 화면을 준비하고 있습니다." },
]

export const navigationGroups: NavigationGroup[] = [
  {
    label: "개요",
    items: [
      { label: "HOME", path: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "개발",
    items: [
      { label: "DEVELOPMENT", path: "/development", icon: FlaskConical },
      {
        label: "DD MASTER",
        path: "/development/workspace",
        icon: LayoutGrid,
        children: [
          { label: "EU", path: "/development/eu" },
          { label: "SEASON", path: "/development/season" },
          { label: "CORE", path: "/development/core" },
          { label: "PROJECT", path: "/development/project" },
        ],
      },
      { label: "WAREHOUSE", path: "/warehouse", icon: Boxes },
    ],
  },
  {
    label: "기술 · 분석",
    items: [
      { label: "TROUBLE SHOOTING", path: "/ts", icon: Wrench },
      { label: "TECHNICAL REFERENCES", path: "/study", icon: BookOpenCheck },
      { label: "RDDA REPORT", path: "/rdda", icon: ClipboardList },
      { label: "FABRIC ANALYSIS", path: "/fabric-analysis", icon: Microscope },
    ],
  },
  {
    label: "트렌드 · 일정",
    items: [
      { label: "FABRIC TREND", path: "/trend/fabric", icon: Waves },
      { label: "MACRO TREND", path: "/trend/macro", icon: Globe2 },
      { label: "PORTFOLIO", path: "/trend/portfolio", icon: Layers3 },
      { label: "PROCESS INNOVATION", path: "/process-innovation", icon: Workflow },
      { label: "CALENDAR", path: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "시스템",
    items: [
      { label: "DATA", path: "/sync", icon: Database },
      { label: "SETTING", path: "/setting", icon: Settings },
    ],
  },
]
