import type { ReactNode } from "react"

/**
 * 바이어 시험 기준 화면의 기술 도판(R332).
 * 도면처럼 보이도록 1px 선, 치수선, 고정폭 라벨만 쓴다. 색은 currentColor와 CSS 변수만 쓴다.
 */

type FigureProps = { className?: string; title?: string }

const LABEL = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 7, letterSpacing: 0.4 } as const

function Frame({ children, className, title, label }: FigureProps & { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 240 150" role="img" aria-label={title ?? label} className={className} fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="square">
      <defs>
        <marker id={`arr-${label}`} viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 z" fill="currentColor" stroke="none" />
        </marker>
      </defs>
      <rect x="0.5" y="0.5" width="239" height="149" strokeOpacity={0.35} />
      <path d="M0.5 8 H8 V0.5 M232 0.5 V8 H239.5 M0.5 142 H8 V149.5 M232 149.5 V142 H239.5" strokeOpacity={0.6} />
      <text x="12" y="141" style={LABEL} fill="currentColor" stroke="none" opacity={0.6}>{label}</text>
      {children}
    </svg>
  )
}

const arrow = (label: string) => `url(#arr-${label})`

/** 물성: 원단 시편과 세탁 치수변화 치수선 */
export function PhysicalFigure(props: FigureProps) {
  const id = "FIG-1"
  return (
    <Frame {...props} label={`${id}  DIMENSIONAL CHANGE`}>
      <rect x="62" y="28" width="96" height="84" strokeOpacity={0.9} />
      <rect x="70" y="35" width="80" height="70" strokeDasharray="3 2" stroke="var(--ref-cat-1)" />
      {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${62 + (i + 1) * 12} 28 V112`} strokeOpacity={0.12} />)}
      <path d="M78 43 h10 M78 43 v10 M142 97 h-10 M142 97 v-10" stroke="var(--ref-cat-1)" />
      <path d="M62 120 V126 M158 120 V126" strokeOpacity={0.6} />
      <path d="M64 123 H156" markerStart={arrow(id)} markerEnd={arrow(id)} />
      <text x="96" y="133" style={LABEL} fill="currentColor" stroke="none">W 250mm</text>
      <path d="M166 28 H172 M166 112 H172" strokeOpacity={0.6} />
      <path d="M169 30 V110" markerStart={arrow(id)} markerEnd={arrow(id)} />
      <text x="176" y="73" style={LABEL} fill="currentColor" stroke="none">L 250mm</text>
      <text x="176" y="83" style={LABEL} fill="var(--ref-cat-1)" stroke="none">-5.0%</text>
      <path d="M150 105 L182 122" strokeOpacity={0.5} />
      <text x="168" y="131" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>3 HL</text>
      <text x="14" y="20" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>AATCC 135</text>
    </Frame>
  )
}

/** 견뢰도: 그레이스케일 5단계와 다섬 교직포 */
export function ColorfastnessFigure(props: FigureProps) {
  const id = "FIG-2"
  const steps = [0.9, 0.68, 0.46, 0.26, 0.08]
  const bands = ["ACE", "CO", "PA", "PES", "PAC", "WO"]
  return (
    <Frame {...props} label={`${id}  GREY SCALE / MULTIFIBER`}>
      {steps.map((opacity, i) => (
        <g key={i}>
          <rect x={22 + i * 22} y="30" width="20" height="44" fill="currentColor" fillOpacity={opacity} strokeOpacity={0.7} />
          <text x={29 + i * 22} y="86" style={LABEL} fill="currentColor" stroke="none">{i + 1}</text>
        </g>
      ))}
      <path d="M22 96 H130" strokeOpacity={0.5} markerEnd={arrow(id)} />
      <text x="22" y="108" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>GRADE  1 ... 5</text>
      <rect x="150" y="26" width="68" height="96" strokeOpacity={0.9} />
      {bands.map((band, i) => (
        <g key={band}>
          <path d={`M150 ${26 + (i + 1) * 16} H218`} strokeOpacity={0.35} />
          <text x="156" y={37 + i * 16} style={LABEL} fill="currentColor" stroke="none">{band}</text>
          <rect x="196" y={30 + i * 16} width="16" height="8" fill="var(--ref-cat-1)" fillOpacity={0.08 + (i % 3) * 0.08} stroke="none" />
        </g>
      ))}
      <text x="150" y="20" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>MULTIFIBER</text>
      <text x="22" y="20" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>CHANGE  STAIN</text>
    </Frame>
  )
}

/** 안전: pH 눈금과 허용 범위 */
export function SafetyFigure(props: FigureProps) {
  const id = "FIG-3"
  const x = (ph: number) => 24 + ph * 13.5
  return (
    <Frame {...props} label={`${id}  pH TOLERANCE`}>
      <rect x="24" y="52" width="189" height="16" strokeOpacity={0.9} />
      {Array.from({ length: 15 }, (_, ph) => (
        <g key={ph}>
          <path d={`M${x(ph)} 68 V${ph % 7 === 0 ? 76 : 72}`} strokeOpacity={0.7} />
          {ph % 2 === 0 ? <text x={x(ph) - 2} y="86" style={LABEL} fill="currentColor" stroke="none">{ph}</text> : null}
        </g>
      ))}
      <rect x={x(4.5)} y="52" width={x(7.5) - x(4.5)} height="16" fill="var(--ref-cat-1)" fillOpacity={0.16} stroke="var(--ref-cat-1)" />
      <path d={`M${x(4.5)} 44 V50 M${x(7.5)} 44 V50`} stroke="var(--ref-cat-1)" />
      <path d={`M${x(4.5) + 2} 47 H${x(7.5) - 2}`} stroke="var(--ref-cat-1)" markerStart={arrow(id)} markerEnd={arrow(id)} />
      <text x={x(4.5) + 6} y="40" style={LABEL} fill="var(--ref-cat-1)" stroke="none">4.5 ~ 7.5</text>
      <path d="M170 98 h12 v10 l12 18 h-36 l12 -18 z" strokeOpacity={0.85} />
      <path d="M163 120 h26" stroke="var(--ref-cat-1)" strokeOpacity={0.6} />
      <text x="24" y="112" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>AATCC 81 / ISO 3071</text>
      <text x="24" y="122" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>HCHO  75 ppm MAX</text>
      <text x="24" y="20" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>ACID  NEUTRAL  ALKALI</text>
    </Frame>
  )
}

/** 기능성: 수직 흡수 시험편과 상승 높이 */
export function PerformanceFigure(props: FigureProps) {
  const id = "FIG-4"
  return (
    <Frame {...props} label={`${id}  VERTICAL WICKING`}>
      <path d="M70 18 H120" strokeOpacity={0.8} />
      <path d="M95 18 V24" strokeOpacity={0.8} />
      <rect x="86" y="24" width="18" height="96" strokeOpacity={0.9} />
      <rect x="86" y="72" width="18" height="48" fill="var(--ref-cat-1)" fillOpacity={0.14} stroke="none" />
      <path d="M86 72 q4.5 -3 9 0 t9 0" stroke="var(--ref-cat-1)" />
      <path d="M60 104 V128 H130 V104" strokeOpacity={0.85} />
      <path d="M60 112 H130" stroke="var(--ref-cat-1)" strokeDasharray="4 2" />
      <path d="M112 72 H122 M112 112 H122" strokeOpacity={0.6} />
      <path d="M117 74 V110" markerStart={arrow(id)} markerEnd={arrow(id)} />
      <text x="126" y="90" style={LABEL} fill="var(--ref-cat-1)" stroke="none">h ≥ 76mm</text>
      <text x="126" y="100" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>@ 30 min</text>
      <path d="M182 46 c0 0 -12 14 -12 22 a12 12 0 0 0 24 0 c0 -8 -12 -22 -12 -22 z" strokeOpacity={0.85} />
      <path d="M176 70 a6 6 0 0 0 6 6" stroke="var(--ref-cat-1)" />
      <text x="164" y="100" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>Qmax / UPF</text>
      <text x="164" y="110" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>SPRAY 90</text>
      <text x="14" y="20" style={LABEL} fill="currentColor" stroke="none" opacity={0.75}>AATCC 197</text>
    </Frame>
  )
}

export const GROUP_FIGURES = {
  physical: PhysicalFigure,
  colorfastness: ColorfastnessFigure,
  safety: SafetyFigure,
  performance: PerformanceFigure,
} as const
