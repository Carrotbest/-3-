import { useEffect, useRef } from "react"

import type { CostSheetDoc } from "@/data/cost-sheets"
import type { FeeGroup } from "@/data/fabric-cost"
import type { YarnSpec } from "@/data/yarn-blend"

type Props = { doc: CostSheetDoc; onDone: () => void }

const PAGE_STYLE = "@page { size: A4 portrait; margin: 12mm; }"
const FEE_GROUP_LABEL: Record<FeeGroup, string> = { yarnDye: "원사", knitting: "편직", dyeing: "염색", other: "기타" }
const number = (value: number, digits = 4): string => value.toLocaleString("ko-KR", { maximumFractionDigits: digits })
const value = (text: string | undefined): string => text?.trim() || "-"
const describeSpec = (spec?: YarnSpec): string => spec?.components.length
  ? spec.components.map((item) => {
    const mode = item.mode === "draft" ? ` ÷ ${item.factor ?? 3}` : item.mode === "overfeed" ? ` + ${item.factor ?? 0}%` : ""
    return `${item.fiber || "성분"} ${item.nominal || "-"}${item.unit}${mode}`
  }).join(" + ")
  : "직접 입력"

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="cs-print-block"><h2>{title}</h2>{children}</section>
}

export function CostSheetPrintSheet({ doc, onDone }: Props) {
  const printedRef = useRef(false)
  const { input, result } = doc.sheet

  useEffect(() => {
    if (printedRef.current) return
    const id = window.setTimeout(() => {
      if (printedRef.current) return
      printedRef.current = true
      const style = document.createElement("style")
      style.textContent = PAGE_STYLE
      document.head.append(style)
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        style.remove()
        window.removeEventListener("afterprint", finish)
        onDone()
      }
      window.addEventListener("afterprint", finish)
      window.print()
      window.setTimeout(finish, 800)
    }, 120)
    return () => window.clearTimeout(id)
  }, [onDone])

  const fields: [string, string][] = [
    ["Style No.", value(doc.styleNo)], ["Project", value(doc.project)], ["Buyer", value(doc.buyer)], ["Season", value(doc.season)],
    ["Color", value(doc.color)], ["담당", value(doc.owner)], ["조직", value(doc.construction)], ["환율", number(input.fxRate, 0)],
    ["완성 폭", `${number(input.widthInch, 2)} inch`], ["완성 중량", `${number(input.gsm, 2)} g/㎡`], ["환산 중량", `${number(result.grPerYd, 2)} gr/yd`],
  ]

  return <div className="cs-print-root" aria-hidden>
    <div className="cs-print-deck">
      <header className="cs-print-head">
        <div><p>사전 원가계산서</p><h1>FL No. {value(doc.flNo)}</h1></div>
        <div className="cs-print-meta"><strong>R&amp;D No. {value(doc.storageNo)}</strong><span>{doc.version === 0 ? "임시" : `v${doc.version}`}</span></div>
      </header>

      <Block title="기준">
        <div className="cs-print-fields">{fields.map(([label, text]) => <div key={label}><span>{label}</span><b>{text}</b></div>)}</div>
      </Block>

      <Block title="원사">
        <table className="cs-print-table"><thead><tr><th>표기</th><th>성분</th><th>투입%</th><th>단가</th><th>단위</th><th>선염</th><th>$/kg</th><th>비중%</th></tr></thead><tbody>
          {input.yarns.map((yarn, index) => { const line = result.lines[index]; return <tr key={`${yarn.name}-${index}`}><td>{value(yarn.name)}</td><td>{describeSpec(yarn.spec)}</td><td>{number(yarn.ratio, 1)}</td><td>{number(yarn.price)}</td><td>{yarn.priceUnit}</td><td>{yarn.yarnDyed ? "Y" : ""}</td><td>{number(line?.perKg ?? 0)}</td><td>{number(line?.sharePct ?? 0, 1)}</td></tr> })}
        </tbody></table>
      </Block>

      {doc.blend?.labelText ? <Block title="혼용율"><p className="cs-print-blend">{doc.blend.labelText}</p></Block> : null}

      <Block title="공정">
        <table className="cs-print-table"><thead><tr><th>그룹</th><th>공정명</th><th>업체</th><th>REMARK</th><th>단가</th><th>단위</th><th>LOSS%</th><th>$/kg</th><th>비중%</th></tr></thead><tbody>
          {input.fees.map((fee, index) => { const line = result.lines[input.yarns.length + index]; return <tr key={`${fee.label}-${index}`}><td>{FEE_GROUP_LABEL[fee.group]}</td><td>{value(fee.label)}</td><td>{value(fee.mill)}</td><td>{value(fee.remark)}</td><td>{number(fee.rate)}</td><td>{fee.unit}</td><td>{number(fee.loss, 1)}</td><td>{number(line?.perKg ?? 0)}</td><td>{number(line?.sharePct ?? 0, 1)}</td></tr> })}
        </tbody></table>
      </Block>

      <Block title="결과">
        <div className="cs-print-results">
          <div><span>Net USD/yd</span><b>{number(result.netPerYd)}</b></div><div><span>Net USD/lb</span><b>{number(result.netPerLb)}</b></div><div><span>Net USD/kg</span><b>{number(result.netPerKg)}</b></div>
          {(input.profitPct ?? 0) !== 0 ? <><div><span>이익 포함 USD/yd</span><b>{number(result.totalPerYd)}</b></div><div><span>이익 포함 USD/lb</span><b>{number(result.totalPerLb)}</b></div><div><span>이익 포함 USD/kg</span><b>{number(result.totalPerKg)}</b></div></> : null}
        </div>
      </Block>

      {doc.note?.trim() ? <Block title="메모"><p className="cs-print-note">{doc.note}</p></Block> : null}
    </div>
  </div>
}
