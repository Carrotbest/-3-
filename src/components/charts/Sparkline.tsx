import { Line, LineChart, ResponsiveContainer } from "recharts"

import { readChartTheme } from "./chart-theme"

export type SparklineTone = "positive" | "negative" | "neutral"

interface SparklineProps {
  data: number[]
  tone?: SparklineTone
}

export function Sparkline({ data, tone = "neutral" }: SparklineProps) {
  const theme = readChartTheme()
  const stroke =
    tone === "positive"
      ? theme.chart[1]
      : tone === "negative"
        ? theme.destructive
        : theme.mutedForeground
  const points = data.map((value, index) => ({ index, value }))

  return (
    <div className="h-9 w-24" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
