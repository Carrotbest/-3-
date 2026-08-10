import type { LucideIcon } from "lucide-react"
import {
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  Microscope,
  RefreshCw,
  Ruler,
  Settings,
  TrendingUp,
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
  { path: "/development/eu", title: "DEVELOPMENT · EU", subtitle: "EU 개발 건을 확인합니다." },
  { path: "/development/season", title: "DEVELOPMENT · SEASON", subtitle: "시즌별 개발 건을 확인합니다." },
  { path: "/development/core", title: "DEVELOPMENT · CORE", subtitle: "Core 개발 건을 확인합니다." },
  { path: "/development/project", title: "DEVELOPMENT · PROJECT", subtitle: "프로젝트별 개발 건을 확인합니다." },
  { path: "/rdda", title: "RDDA REPORT", subtitle: "RDDA 보고 현황을 확인합니다." },
  { path: "/ts", title: "TS 관리", subtitle: "Technical Service 업무를 관리합니다." },
  { path: "/study", title: "STUDY 과제", subtitle: "팀 학습 과제와 점검 현황을 확인합니다." },
  { path: "/fabric-analysis", title: "FABRIC ANALYSIS", subtitle: "원단 분석 화면을 준비하고 있습니다." },
  { path: "/construction-guide", title: "CONSTRUCTION GUIDE", subtitle: "조직 가이드 화면을 준비하고 있습니다." },
  { path: "/calendar", title: "CALENDAR", subtitle: "팀 일정과 주요 납기를 확인합니다." },
  { path: "/sync", title: "데이터 상태", subtitle: "TDS 데이터 출처와 대조 결과를 확인합니다." },
  { path: "/setting", title: "SETTING", subtitle: "업무 플랫폼 설정을 관리합니다." },
  { path: "/trend/macro", title: "MACRO TREND", subtitle: "거시 트렌드 화면을 준비하고 있습니다." },
  { path: "/trend/fabric", title: "FABRIC TREND", subtitle: "원단 트렌드 화면을 준비하고 있습니다." },
  { path: "/trend/portfolio", title: "PORTFOLIO", subtitle: "포트폴리오 화면을 준비하고 있습니다." },
  { path: "/process-innovation", title: "PROCESS INNOVATION", subtitle: "프로세스 혁신 화면을 준비하고 있습니다." },
]

export const navigationGroups: NavigationGroup[] = [
  {
    label: "General",
    items: [
      { label: "HOME", path: "/", icon: LayoutDashboard },
      {
        label: "DEVELOPMENT",
        path: "/development",
        icon: FlaskConical,
        children: [
          { label: "Overview", path: "/development" },
          { label: "EU", path: "/development/eu" },
          { label: "Season", path: "/development/season" },
          { label: "Core", path: "/development/core" },
          { label: "Project", path: "/development/project" },
        ],
      },
      { label: "RDDA REPORT", path: "/rdda", icon: ClipboardList },
    ],
  },
  {
    label: "Technical Services",
    items: [
      { label: "TS 관리", path: "/ts", icon: Wrench },
      { label: "STUDY 과제", path: "/study", icon: BookOpenCheck },
      { label: "FABRIC ANALYSIS", path: "/fabric-analysis", icon: Microscope },
      { label: "CONSTRUCTION GUIDE", path: "/construction-guide", icon: Ruler },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "CALENDAR", path: "/calendar", icon: CalendarDays },
      { label: "데이터 상태", path: "/sync", icon: RefreshCw },
      { label: "SETTING", path: "/setting", icon: Settings },
    ],
  },
  {
    label: "Trend / Process",
    items: [
      { label: "MACRO TREND", path: "/trend/macro", icon: TrendingUp },
      { label: "FABRIC TREND", path: "/trend/fabric", icon: Waves },
      { label: "PORTFOLIO", path: "/trend/portfolio", icon: Layers3 },
      { label: "PROCESS INNOVATION", path: "/process-innovation", icon: Workflow },
    ],
  },
]
