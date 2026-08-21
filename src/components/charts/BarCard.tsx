import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { SectionCard } from "@/components/dashboard/SectionCard"

import { readChartTheme, tooltipStyle } from "./chart-theme"

export interface BarSeries {
  dataKey: string
  label: string
}

export interface BarCardProps {
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  series: BarSeries[]
  stacked?: boolean
  horizontal?: boolean
  className?: string
  revealDelay?: number
  onItemClick?: (label: string) => void
}

export function BarCard({ title, subtitle, data, series, stacked = false, horizontal = false, className, revealDelay, onItemClick }: BarCardProps) {
  const theme = readChartTheme()

  return (
    <SectionCard title={title} subtitle={subtitle} contentClassName="pt-2" wrapperClassName={className} revealDelay={revealDelay}>
      <div className={`h-72 min-w-0 ${onItemClick ? "[&_path.recharts-rectangle]:cursor-pointer" : ""}`} role="img" aria-label={`${title} 막대 차트`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 12, right: 8, left: horizontal ? 28 : -20, bottom: 0 }}>
            <CartesianGrid vertical={!horizontal} horizontal={horizontal} stroke={theme.border} strokeDasharray="3 3" />
            <XAxis
              dataKey={horizontal ? undefined : "label"}
              type={horizontal ? "number" : "category"}
              axisLine={false}
              tickLine={false}
              tick={{ fill: theme.mutedForeground }}
              tickMargin={10}
              allowDecimals={false}
            />
            <YAxis
              dataKey={horizontal ? "label" : undefined}
              type={horizontal ? "category" : "number"}
              axisLine={false}
              tickLine={false}
              tick={{ fill: theme.mutedForeground }}
              allowDecimals={false}
              width={horizontal ? 92 : undefined}
            />
            <Tooltip
              contentStyle={tooltipStyle(theme)}
              cursor={{ fill: theme.border, fillOpacity: 0.35 }}
              formatter={(value, name) => [Number(value).toLocaleString("ko-KR"), String(name)]}
            />
            {series.map((item, index) => (
              <Bar
                key={item.dataKey}
                dataKey={item.dataKey}
                name={item.label}
                fill={theme.chart[index % theme.chart.length]}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                stackId={stacked ? "total" : undefined}
                isAnimationActive={false}
                onClick={onItemClick ? (entry) => {
                  const label = String(entry.payload?.label ?? "")
                  if (label) onItemClick(label)
                } : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
