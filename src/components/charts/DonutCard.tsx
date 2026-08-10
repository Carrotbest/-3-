import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { SectionCard } from "@/components/dashboard/SectionCard"

import { readChartTheme, tooltipStyle } from "./chart-theme"

export interface DonutDatum {
  label: string | number
  count: number
}

export interface DonutCardProps {
  title: string
  subtitle?: string
  data: DonutDatum[]
  className?: string
  revealDelay?: number
}

const SWATCH_CLASSES = [
  "bg-[var(--chart-1)]",
  "bg-[var(--chart-2)]",
  "bg-[var(--chart-3)]",
  "bg-[var(--chart-4)]",
  "bg-[var(--chart-5)]",
]

export function DonutCard({ title, subtitle, data, className, revealDelay }: DonutCardProps) {
  const theme = readChartTheme()
  const total = data.reduce((sum, item) => sum + item.count, 0)

  return (
    <SectionCard title={title} subtitle={subtitle} contentClassName="pt-2" wrapperClassName={className} revealDelay={revealDelay}>
      <div className="h-72 min-w-0" role="img" aria-label={`${title} 도넛 차트, 합계 ${total}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              stroke={theme.card}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((item, index) => (
                <Cell key={`${item.label}-${index}`} fill={theme.chart[index % theme.chart.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle(theme)}
              formatter={(value, name) => [`${Number(value).toLocaleString("ko-KR")}건`, String(name)]}
            />
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fill={theme.foreground}>
              <tspan x="50%" className="text-2xl font-semibold">{total.toLocaleString("ko-KR")}</tspan>
              <tspan x="50%" dy="1.6em" fill={theme.mutedForeground} className="text-xs">합계</tspan>
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[var(--muted-foreground)]">
        {data.map((item, index) => (
          <span key={String(item.label)} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${SWATCH_CLASSES[index % SWATCH_CLASSES.length]}`} />
            {item.label}
          </span>
        ))}
      </div>
    </SectionCard>
  )
}
