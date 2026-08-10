import { useId } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { SectionCard } from "@/components/dashboard/SectionCard"

import { readChartTheme, tooltipStyle } from "./chart-theme"

export interface AreaSeries {
  dataKey: string
  label: string
}

export interface AreaCardProps {
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  series: AreaSeries[]
  className?: string
  revealDelay?: number
}

export function AreaCard({ title, subtitle, data, series, className, revealDelay }: AreaCardProps) {
  const theme = readChartTheme()
  const id = useId().replace(/:/g, "")

  return (
    <SectionCard title={title} subtitle={subtitle} contentClassName="pt-2" wrapperClassName={className} revealDelay={revealDelay}>
      <div className="h-72 min-w-0" role="img" aria-label={`${title} 면적 차트`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
            <defs>
              {series.map((item, index) => (
                <linearGradient key={item.dataKey} id={`${id}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.chart[index % theme.chart.length]} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={theme.chart[index % theme.chart.length]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={theme.border} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: theme.mutedForeground }}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: theme.mutedForeground }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={tooltipStyle(theme)}
              cursor={{ stroke: theme.border }}
              formatter={(value, name) => [Number(value).toLocaleString("ko-KR"), String(name)]}
            />
            {series.map((item, index) => (
              <Area
                key={item.dataKey}
                type="monotone"
                dataKey={item.dataKey}
                name={item.label}
                stroke={theme.chart[index % theme.chart.length]}
                strokeWidth={2}
                fill={`url(#${id}-${index})`}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
