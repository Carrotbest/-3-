import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import type { CostSheetDoc } from "@/data/cost-sheets"
import type { FeeGroup } from "@/data/fabric-cost"
import type { YarnSpec } from "@/data/yarn-blend"

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

/**
 * A4 한 장짜리 원가계산서 본문(R348).
 *
 * **화면 팝업과 인쇄가 이 하나를 같이 쓴다.** 예전에는 인쇄 전용이었는데, 자료실 팝업을
 * 따로 그리면 보이는 것과 종이로 나오는 것이 갈린다. 한쪽만 고치는 일이 반드시 생긴다.
 * 바깥에서 `.cs-sheet-view` 로 감싸면 화면에 뜨고, `CostSheetPrintDeck` 이 감싸면 인쇄로 나간다.
 */
export function CostSheetBody({ doc }: { doc: CostSheetDoc }) {
  const { input, result } = doc.sheet
  const fields: [string, string][] = [
    ["Style No.", value(doc.styleNo)], ["Project", value(doc.project)], ["Buyer", value(doc.buyer)], ["Season", value(doc.season)],
    ["Color", value(doc.color)], ["담당", value(doc.owner)], ["조직", value(doc.construction)], ["환율", number(input.fxRate, 0)],
    ["완성 폭", `${number(input.widthInch, 2)} inch`], ["완성 중량", `${number(input.gsm, 2)} g/㎡`], ["환산 중량", `${number(result.grPerYd, 2)} gr/yd`],
  ]

  return <div className="cs-print-deck">
    <header className="cs-print-head">
      <div><p>사전 원가계산서</p><h1>FL No. {value(doc.flNo)}</h1></div>
      <div className="cs-print-meta"><strong>R&amp;D No. {value(doc.storageNo)}</strong><span>{doc.version === 0 ? "임시" : `v${doc.version}`}</span></div>
    </header>

    <Block title="기준">
      <div className="cs-print-fields">{fields.map(([label, text]) => <div key={label}><span>{label}</span><b>{text}</b></div>)}</div>
    </Block>

    <Block title="원사">
      <table className="cs-print-table"><thead><tr><th>표기</th><th>성분</th><th>투입%</th><th>단가</th><th>단위</th><th>선염</th><th>$/kg</th><th>비중%</th></tr></thead><tbody>
        {input.yarns.map((yarn, index) => { const line = result.lines[index]; return <tr key={`${yarn.name}-${index}`}><td>{value(yarn.name)}</td><td>{describeSpec(yarn.spec)}</td><td>{number(yarn.ratio, 1)}</td><td>{number(yarn.price, 2)}</td><td>{yarn.priceUnit}</td><td>{yarn.yarnDyed ? "Y" : ""}</td><td>{number(line?.perKg ?? 0, 2)}</td><td>{number(line?.sharePct ?? 0, 1)}</td></tr> })}
      </tbody></table>
    </Block>

    {doc.blend?.labelText ? <Block title="혼용율"><p className="cs-print-blend">{doc.blend.labelText}</p></Block> : null}

    <Block title="공정">
      <table className="cs-print-table"><thead><tr><th>그룹</th><th>공정명</th><th>업체</th><th>REMARK</th><th>단가</th><th>단위</th><th>LOSS%</th><th>$/kg</th><th>비중%</th></tr></thead><tbody>
        {input.fees.map((fee, index) => { const line = result.lines[input.yarns.length + index]; return <tr key={`${fee.label}-${index}`}><td>{FEE_GROUP_LABEL[fee.group]}</td><td>{value(fee.label)}</td><td>{value(fee.mill)}</td><td>{value(fee.remark)}</td><td>{number(fee.rate, 2)}</td><td>{fee.unit}</td><td>{number(fee.loss, 1)}</td><td>{number(line?.perKg ?? 0, 2)}</td><td>{number(line?.sharePct ?? 0, 1)}</td></tr> })}
      </tbody></table>
    </Block>

    <Block title="결과">
      <div className="cs-print-results">
        <div><span>Net USD/yd</span><b>{number(result.netPerYd, 2)}</b></div><div><span>Net USD/lb</span><b>{number(result.netPerLb, 2)}</b></div><div><span>Net USD/kg</span><b>{number(result.netPerKg, 2)}</b></div>
        {(input.profitPct ?? 0) !== 0 ? <><div><span>이익 포함 USD/yd</span><b>{number(result.totalPerYd, 2)}</b></div><div><span>이익 포함 USD/lb</span><b>{number(result.totalPerLb, 2)}</b></div><div><span>이익 포함 USD/kg</span><b>{number(result.totalPerKg, 2)}</b></div></> : null}
      </div>
    </Block>

    {doc.note?.trim() ? <Block title="메모"><p className="cs-print-note">{doc.note}</p></Block> : null}
  </div>
}

type DeckProps = { docs: readonly CostSheetDoc[]; onDone: () => void }

/**
 * 고른 원가계산서를 장마다 한 건씩 인쇄한다(R348).
 *
 * 뿌리를 `createPortal` 로 `body` 바로 밑에 붙이고 일반 흐름(static)에 둔다. 예전처럼
 * `position: fixed` 로 두면 쪽 나눔을 못 타서 여러 장이 한 자리에 겹쳐 찍힌다(R343 과 같은 사고).
 * 한 건만 뽑으면 겹칠 상대가 없어 멀쩡해 보이므로 단건으로 확인하지 말 것.
 */
export function CostSheetPrintDeck({ docs, onDone }: DeckProps) {
  const printedRef = useRef(false)

  useEffect(() => {
    document.body.classList.add("cs-printing")
    return () => document.body.classList.remove("cs-printing")
  }, [])

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
      // afterprint 를 안 부르는 브라우저가 있어 한 번 더 건다.
      window.setTimeout(finish, 800)
    }, 120)
    return () => window.clearTimeout(id)
  }, [onDone])

  return createPortal(
    <div className="cs-print-root" aria-hidden>
      {docs.map((doc) => <CostSheetBody key={doc.id} doc={doc} />)}
    </div>,
    document.body,
  )
}

/** 한 건만 뽑는 기존 호출부(DD MASTER 입력 팝업)를 위한 얇은 껍데기. */
export function CostSheetPrintSheet({ doc, onDone }: { doc: CostSheetDoc; onDone: () => void }) {
  return <CostSheetPrintDeck docs={[doc]} onDone={onDone} />
}
