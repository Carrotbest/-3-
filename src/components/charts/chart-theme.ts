import type { CSSProperties } from "react"

export interface ChartTheme {
  chart: string[]
  border: string
  mutedForeground: string
  card: string
  foreground: string
  destructive: string
}

function readToken(name: string): string {
  if (typeof document === "undefined") return `var(${name})`
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || `var(${name})`
}

export function readChartTheme(): ChartTheme {
  return {
    chart: [1, 2, 3, 4, 5].map((index) => readToken(`--chart-${index}`)),
    border: readToken("--border"),
    mutedForeground: readToken("--muted-foreground"),
    card: readToken("--card"),
    foreground: readToken("--foreground"),
    destructive: readToken("--destructive"),
  }
}

export function tooltipStyle(theme: ChartTheme): CSSProperties {
  return {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: "var(--radius)",
    color: theme.foreground,
  }
}
