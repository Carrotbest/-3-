# R265 분석 출력물 양식 통일과 의뢰서 개편

상태: 미착수. 추론 강도 **medium**(R258에서 만든 출력물 전면 손질. 데이터 계약은 안 바뀐다).

R258로 만든 A4 출력물을 고친다. 요구는 넷이다.

1. 의뢰서와 리포트가 **같은 뼈대**를 쓴다. 출력 버튼도 하나로 합친다.
2. 상단 기본 정보를 **높이 절반**으로 줄이고 표(격자) 대신 제목과 값이 분명히 갈리는 형태로 바꾼다.
3. 의뢰서 swatch 자리의 **점선 안내선을 없애고 빈 공간만** 둔다.
4. 의뢰서 아래에 **결과 값 기입란**과 **참고 사진 2칸**을 작게 넣는다.

## 버튼을 하나로 합치는 규칙

`의뢰서 출력`과 `리포트 출력` 두 버튼을 **`출력` 하나**로 합친다. 무엇이 나갈지는 건의 상태가 정한다.

| 상태 | 나가는 종이 |
|---|---|
| 완료 | 분석 리포트 |
| 작성 · 의뢰 | 분석 의뢰서 |
| 취소 | 내보내지 않는다 |

여러 건을 골라 눌러도 된다. 건마다 제 상태에 맞는 종이가 한 장씩 이어 나온다. 그래서 인쇄 덱이 받던 `mode` 인자를 없애고 건마다 판정한다.

## A. `src/data/analysis-print.ts` 교체

파일 전체를 아래로 바꾼다. `analysisRequestFields`를 짧은 칸(`analysisHeadFields`)과 긴 줄(`analysisNoteLines`)로 나눈 것이 핵심이다. 상단 높이를 줄이려고 긴 글은 전폭 한 줄로 내린다.

```ts
import { analysisLeadDays } from "./fabric-analysis"
import type { AnalysisRequest } from "./schema"

export type AnalysisPrintMode = "request" | "report"

const text = (value: string | number | undefined | null): string => {
  const out = String(value ?? "").trim()
  return out || "-"
}

/** 어떤 종이가 나갈지. 완료 건은 리포트, 그 밖에는 의뢰서다. 버튼이 하나라 여기서 갈린다. */
export function analysisSheetMode(item: AnalysisRequest): AnalysisPrintMode {
  return item.state === "완료" ? "report" : "request"
}

/** 취소 건은 종이로 내보내지 않는다. */
export function isAnalysisPrintable(item: AnalysisRequest): boolean {
  return item.state !== "취소"
}

/** 상단 짧은 칸. 네 칸씩 세 줄로 앉는다. 라벨은 AX 리캡 열 이름을 그대로 쓴다. */
export function analysisHeadFields(item: AnalysisRequest): [string, string][] {
  return [
    ["Requester", text(item.requester)],
    ["Department", text(item.department)],
    ["Customer", text(item.customer)],
    ["Brand", text(item.brand)],
    ["Season / Year", text(item.season)],
    ["Gender / Age", text(item.gender)],
    ["Objective", text(item.objective)],
    ["Source", text(item.source)],
    ["Source code", text(item.sourceCode)],
    ["Construction", text(item.construction)],
    ["Fabric content", text(item.contents)],
    ["Weight (gsm)", item.weight === "" ? "-" : String(item.weight)],
  ]
}

/** 전폭 한 줄로 내리는 긴 글. */
export function analysisNoteLines(item: AnalysisRequest): [string, string][] {
  return [
    ["Request item", text(item.description)],
    ["Comment (Requester)", text(item.requesterComment)],
  ]
}

/** 리포트 결과 칸. 의뢰 때 적힌 값과 RND 결과를 나란히 둔다. */
export function analysisResultFields(item: AnalysisRequest): [string, string][] {
  return [
    ["In charge", text(item.inCharge)],
    ["Construction (RND)", text(item.constructionRnd)],
    ["Weight (RND, gsm)", item.weightRnd === "" ? "-" : String(item.weightRnd)],
    ["Construction (의뢰)", text(item.construction)],
    ["Fabric content (의뢰)", text(item.contents)],
    ["Weight (의뢰, gsm)", item.weight === "" ? "-" : String(item.weight)],
  ]
}

/** 의뢰서 아래 손으로 적는 결과 칸의 이름. 웹 입력 칸과 같은 이름이라 옮겨 적기 쉽다. */
export const ANALYSIS_WRITE_LINES = ["Yarn description", "Construction", "Weight (gsm)", "Comment (RND)"] as const

export function analysisLeadText(item: AnalysisRequest): string {
  const days = analysisLeadDays(item)
  return days == null ? "-" : `${days}일`
}

/** 꼬리말에 찍는 출력 시각. 언제 뽑은 종이인지 알아야 한다. */
export function analysisPrintStamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * 인쇄에 올릴 사진 경로. 의뢰서는 시료 사진 1장(참고 사진 칸에 앉는다),
 * 리포트는 시료 사진 + 분석 사진이다. 썸네일은 400px이라 인쇄에 쓰지 않는다.
 */
export function analysisPrintImages(item: AnalysisRequest, mode: AnalysisPrintMode): string[] {
  if (mode === "request") return item.imagePath ? [item.imagePath] : []
  return [item.imagePath, ...(item.resultImages ?? []).map((image) => image.imagePath)]
    .filter((path): path is string => Boolean(path))
}
```

## B. `src/components/analysis/AnalysisPrintDeck.tsx` 교체

파일 전체를 아래로 바꾼다. 두 장이 같은 조각(`Head`, `Block`, `Fields`, `NoteLines`, `Foot`)을 쓴다.

```tsx
import { useEffect, useMemo, useRef, useState } from "react"

import {
  ANALYSIS_WRITE_LINES, analysisHeadFields, analysisLeadText, analysisNoteLines,
  analysisPrintImages, analysisPrintStamp, analysisResultFields, analysisSheetMode,
} from "@/data/analysis-print"
import { requestImageUrl } from "@/data/request-image"
import type { AnalysisRequest } from "@/data/schema"

type Props = { records: readonly AnalysisRequest[]; onDone: () => void }
type PageProps = { item: AnalysisRequest; urls: Record<string, string>; stamp: string; onImageSettled: () => void }

/** RDDA 월간 리포트가 전역 @page 를 A4 가로로 쓴다. 이 출력만 세로로 바꾸려고 인쇄 직전에 붙인다. */
const PAGE_STYLE = "@page { size: A4 portrait; margin: 12mm; }"
/** 사진이 안 뜨면 이만큼만 기다리고 그냥 인쇄한다. 종이가 안 나오는 것이 더 나쁘다. */
const IMAGE_WAIT_MS = 4000

function Head({ item, kind, meta }: { item: AnalysisRequest; kind: string; meta: string }) {
  return <header className="an-head">
    <div>
      <p className="an-doc">FABRIC ANALYSIS</p>
      <h1>{kind}</h1>
    </div>
    <div className="an-head-no">
      <strong>{item.anNo}</strong>
      <p>{meta}{item.requestType === "Urgent" ? <em>URGENT</em> : null}</p>
    </div>
  </header>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="an-block"><h2>{title}</h2>{children}</section>
}

function Fields({ items }: { items: [string, string][] }) {
  return <div className="an-fields">{items.map(([label, value]) => <div key={label} className="an-field"><span>{label}</span><b>{value}</b></div>)}</div>
}

function NoteLines({ items }: { items: [string, string][] }) {
  return <div className="an-notes">{items.map(([label, value]) => <div key={label} className="an-note"><span>{label}</span><b>{value}</b></div>)}</div>
}

function Foot({ item, kind, stamp }: { item: AnalysisRequest; kind: string; stamp: string }) {
  return <footer className="an-foot"><span>{item.anNo} · {kind}</span><span>출력 {stamp}</span></footer>
}

function RequestPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photo = item.imagePath ? urls[item.imagePath] : undefined
  const meta = `의뢰일 ${item.requestedAt || "-"} · ${item.requester || "의뢰자 미기재"}`
  return <section className="an-print-page">
    <Head item={item} kind="분석 의뢰서" meta={meta} />
    <Block title="의뢰 정보">
      <Fields items={analysisHeadFields(item)} />
      <NoteLines items={analysisNoteLines(item)} />
    </Block>
    <Block title="실물 SWATCH">
      <div className="an-blank" />
    </Block>
    <Block title="분석 결과 (R&D 기입)">
      <div className="an-write">
        {ANALYSIS_WRITE_LINES.map((label) => <div key={label} className="an-write-row"><span>{label}</span><i /></div>)}
      </div>
      <div className="an-hand">
        <div><span>3팀 수령일</span><i /></div>
        <div><span>담당 (In charge)</span><i /></div>
        <div><span>swatch 반환일</span><i /></div>
      </div>
    </Block>
    <Block title="참고 사진">
      <div className="an-shots">
        <div className="an-shot">{photo ? <img src={photo} alt="" onLoad={onImageSettled} onError={onImageSettled} /> : null}</div>
        <div className="an-shot" />
      </div>
    </Block>
    <Foot item={item} kind="분석 의뢰서" stamp={stamp} />
  </section>
}

function ReportPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photos = analysisPrintImages(item, "report").map((path) => urls[path]).filter(Boolean)
  const meta = `의뢰 ${item.requestedAt || "-"} · 완료 ${item.finishedAt || "-"} · 소요 ${analysisLeadText(item)}`
  return <section className="an-print-page">
    <Head item={item} kind="분석 리포트" meta={meta} />
    <Block title="의뢰 정보">
      <Fields items={analysisHeadFields(item)} />
      <NoteLines items={analysisNoteLines(item)} />
    </Block>
    <Block title="분석 결과">
      <Fields items={analysisResultFields(item)} />
      <div className="an-texts">
        <div><span>Yarn description</span><p>{item.yarnDescription || "-"}</p></div>
        <div><span>Comment (RND)</span><p>{item.commentRnd || "-"}</p></div>
      </div>
    </Block>
    <Block title="사진">
      {photos.length
        ? <div className="an-photos">{photos.map((url, index) => <div key={url}><img src={url} alt="" onLoad={onImageSettled} onError={onImageSettled} /><span>사진 {index + 1}</span></div>)}</div>
        : <p className="an-empty">등록된 사진이 없습니다.</p>}
    </Block>
    <Foot item={item} kind="분석 리포트" stamp={stamp} />
  </section>
}

export function AnalysisPrintDeck({ records, onDone }: Props) {
  const paths = useMemo(() => [...new Set(records.flatMap((item) => analysisPrintImages(item, analysisSheetMode(item))))], [records])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [resolved, setResolved] = useState(false)
  const [loaded, setLoaded] = useState(0)
  const printedRef = useRef(false)
  const stamp = useMemo(() => analysisPrintStamp(), [])
  const expected = paths.filter((path) => urls[path]).length

  useEffect(() => {
    if (!paths.length) { setResolved(true); return }
    let live = true
    void Promise.all(paths.map(async (path) => [path, await requestImageUrl(path)] as const)).then((pairs) => {
      if (!live) return
      const next: Record<string, string> = {}
      for (const [path, url] of pairs) if (url) next[path] = url
      setUrls(next)
      setResolved(true)
    })
    return () => { live = false }
  }, [paths])

  useEffect(() => {
    if (!resolved || printedRef.current) return
    const run = () => {
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
      // afterprint 를 안 부르는 브라우저가 있어 한 번 더 건다. finished 로 두 번 실행을 막는다.
      window.setTimeout(finish, 800)
    }
    const delay = loaded >= expected ? 120 : IMAGE_WAIT_MS
    const id = window.setTimeout(run, delay)
    return () => window.clearTimeout(id)
  }, [resolved, loaded, expected, onDone])

  const onImageSettled = () => setLoaded((value) => value + 1)
  return <div className="an-print-deck an-print-root" aria-hidden>
    {records.map((item) => analysisSheetMode(item) === "request"
      ? <RequestPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />
      : <ReportPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />)}
  </div>
}
```

## C. `src/index.css` — 839~892행 교체

839행 `/* ---` 주석부터 892행 `}`(그 `@media print` 블록의 닫는 괄호)까지를 통째로 아래로 바꾼다. 앞의 RDDA 인쇄 블록(819~837행)은 건드리지 마라.

```css
/* ------------------------------------------------------------------
 * FABRIC ANALYSIS A4 출력(R258 → R265 개편). 의뢰서와 리포트가 같은 뼈대를 쓴다.
 * 격자를 걷고 제목줄 + 값만 남겼다. 라벨은 작게 위, 값은 크게 아래다.
 * 세로 @page 는 CSS 가 아니라 AnalysisPrintDeck 이 인쇄 직전에 붙이는 <style> 이 정한다.
 * 위 RDDA 블록이 body * 를 숨기므로 여기서는 우리 뿌리만 다시 보이게 한다.
 * 인쇄 길이 기준: A4 세로 여백 12mm → 가로 186mm, 세로 273mm.
 * ------------------------------------------------------------------ */
.an-print-deck { display: none; }

@media print {
  .an-print-root, .an-print-root * { visibility: visible !important; }
  .an-print-root { position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important; translate: none !important; transform: none !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
  .an-print-deck { display: block !important; background: white; color: #111827; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .an-print-page { box-sizing: border-box; width: 186mm; font-size: 9pt; line-height: 1.4; page-break-after: always; break-after: page; }
  .an-print-page:last-child { page-break-after: auto; break-after: auto; }

  /* 머리말 */
  .an-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 8mm; padding-bottom: 2.5mm; border-bottom: 0.5mm solid #111827; }
  .an-doc { margin: 0; font-size: 7.5pt; letter-spacing: 0.22em; color: #6b7280; }
  .an-head h1 { margin: 1mm 0 0; font-size: 16pt; font-weight: 600; letter-spacing: -0.01em; }
  .an-head-no { text-align: right; white-space: nowrap; }
  .an-head-no strong { font-size: 13pt; font-weight: 600; letter-spacing: 0.06em; }
  .an-head-no p { margin: 1mm 0 0; font-size: 8pt; color: #4b5563; }
  .an-head-no em { margin-left: 2mm; padding: 0 1.5mm; border: 0.25mm solid #b91c1c; color: #b91c1c; font-style: normal; font-weight: 600; }

  /* 구역: 제목줄과 내용을 확실히 가른다 */
  .an-block { margin-top: 6mm; break-inside: avoid; }
  .an-block > h2 { margin: 0 0 2mm; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.18em; color: #6b7280; text-transform: uppercase; }

  /* 짧은 칸 네 줄. 격자 대신 값 아래 실선 하나만 둔다 */
  .an-fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 6mm; }
  .an-field { padding: 1.4mm 0; border-bottom: 0.2mm solid #e5e7eb; break-inside: avoid; }
  .an-field span { display: block; font-size: 6.5pt; letter-spacing: 0.08em; color: #9ca3af; text-transform: uppercase; }
  .an-field b { display: block; margin-top: 0.4mm; font-size: 9pt; font-weight: 500; }

  /* 긴 글은 전폭 한 줄 */
  .an-notes { margin-top: 2mm; }
  .an-note { display: flex; gap: 4mm; padding: 1.4mm 0; border-bottom: 0.2mm solid #e5e7eb; }
  .an-note span { flex: 0 0 34mm; font-size: 6.5pt; letter-spacing: 0.08em; color: #9ca3af; text-transform: uppercase; padding-top: 0.6mm; }
  .an-note b { flex: 1; font-size: 9pt; font-weight: 500; white-space: pre-wrap; }

  /* 의뢰서: swatch 자리. 테두리도 안내선도 없이 비운다 */
  .an-blank { height: 96mm; }

  /* 의뢰서: 손으로 적는 결과 칸 */
  .an-write-row { display: flex; align-items: flex-end; gap: 4mm; margin-bottom: 4mm; }
  .an-write-row span { flex: 0 0 34mm; font-size: 7pt; color: #6b7280; }
  .an-write-row i { flex: 1; border-bottom: 0.2mm solid #9ca3af; height: 4mm; }
  .an-hand { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; margin-top: 1mm; }
  .an-hand div { display: flex; align-items: flex-end; gap: 2mm; }
  .an-hand span { font-size: 7pt; color: #6b7280; white-space: nowrap; }
  .an-hand i { flex: 1; border-bottom: 0.2mm solid #9ca3af; height: 4mm; }

  /* 의뢰서: 참고 사진 두 칸. 비어 있으면 붙일 자리다 */
  .an-shots { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
  .an-shot { box-sizing: border-box; height: 34mm; border: 0.2mm solid #d1d5db; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .an-shot img { max-width: 100%; max-height: 100%; object-fit: contain; }

  /* 리포트: 서술 칸과 사진 */
  .an-texts { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 3mm; }
  .an-texts div { break-inside: avoid; }
  .an-texts span { display: block; font-size: 6.5pt; letter-spacing: 0.08em; color: #9ca3af; text-transform: uppercase; }
  .an-texts p { margin: 1mm 0 0; min-height: 22mm; padding-bottom: 1mm; border-bottom: 0.2mm solid #e5e7eb; white-space: pre-wrap; }
  .an-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .an-photos div { break-inside: avoid; }
  .an-photos img { display: block; width: 100%; height: 38mm; object-fit: contain; border: 0.2mm solid #e5e7eb; }
  .an-photos span { display: block; margin-top: 1mm; font-size: 7pt; color: #9ca3af; }
  .an-empty { margin: 0; font-size: 8pt; color: #9ca3af; }

  .an-foot { display: flex; justify-content: space-between; margin-top: 6mm; padding-top: 2mm; border-top: 0.2mm solid #e5e7eb; font-size: 7.5pt; color: #9ca3af; }
}
```

### 지면 계산 (칸 높이를 임의로 올리지 마라)

| 의뢰서 | 높이 |
|---|---|
| 머리말 | 15mm |
| 의뢰 정보(제목 + 4열 3줄 + 긴 줄 2개) | 37mm |
| 실물 SWATCH(제목 + 빈 공간) | 102mm |
| 분석 결과 기입(제목 + 4줄 + 수령 3칸) | 38mm |
| 참고 사진(제목 + 34mm 두 칸) | 40mm |
| 꼬리말 | 8mm |
| 합계 | 약 246mm (한도 273mm) |

리포트는 머리말 15, 의뢰 정보 37, 결과(제목 + 4열 2줄 + 서술 22) 45, 사진 최대 두 줄 88, 꼬리말 8로 약 233mm다. 상단 기본 정보는 R258의 62mm에서 37mm로 줄었다.

## D. `src/routes/FabricAnalysis.tsx` — 버튼 하나로

### D-1. import

`import type { AnalysisPrintMode } from "@/data/analysis-print"` 를 아래로 바꾼다.

```tsx
import { isAnalysisPrintable } from "@/data/analysis-print"
```

### D-2. 상태와 함수

```tsx
  const [printJob, setPrintJob] = useState<{ mode: AnalysisPrintMode; records: AnalysisRequest[] } | null>(null)
```

를 아래로 바꾼다.

```tsx
  const [printJob, setPrintJob] = useState<AnalysisRequest[] | null>(null)
```

`printableSelected` 정의를 아래로 바꾼다.

```tsx
  // 취소 건은 종이로 내보내지 않는다. 완료 건은 리포트, 나머지는 의뢰서로 나간다.
  const printableSelected = selectedRows.filter(isAnalysisPrintable)
```

`startPrint` 를 아래로 바꾼다.

```tsx
  const startPrint = (targets: AnalysisRequest[]) => {
    const printable = targets.filter(isAnalysisPrintable)
    if (!printable.length) return
    setDetail(null)
    setPrintJob(printable)
  }
```

### D-3. 선택 액션 바

의뢰서 출력·리포트 출력 두 버튼을 아래 한 버튼으로 바꾼다.

```tsx
<Button size="sm" variant="outline" disabled={!printableSelected.length} title="완료 건은 분석 리포트, 그 밖에는 분석 의뢰서로 나갑니다" onClick={() => startPrint(printableSelected)}><Printer />출력</Button>
```

### D-4. 팝업 연결과 덱

`<AnalysisDetailDialog ... onPrint={...} />` 의 prop 을 바꾼다.

```tsx
onPrint={(record) => startPrint([record])}
```

덱 렌더를 바꾼다.

```tsx
    {printJob ? <AnalysisPrintDeck records={printJob} onDone={() => setPrintJob(null)} /> : null}
```

## E. `src/components/analysis/AnalysisDetailDialog.tsx` — 버튼 하나로

`import type { AnalysisPrintMode } from "@/data/analysis-print"` 줄을 지운다.

Props 의 `onPrint` 를 바꾼다.

```ts
onPrint: (record: AnalysisRequest) => void
```

푸터의 출력 버튼 두 개를 하나로 바꾼다. 지금은 `의뢰서 출력`과 (완료일 때) `리포트 출력` 두 개다. 아래 하나만 남긴다. 그 옆 `완료 메일` 버튼은 그대로 둔다.

```tsx
<Button type="button" variant="outline" disabled={completionPending} title="완료 건은 분석 리포트, 그 밖에는 분석 의뢰서로 나갑니다" onClick={() => onPrint(record)}><Printer />출력</Button>
```

## 하지 말 것

- PDF 라이브러리를 넣지 마라. 브라우저 인쇄 그대로다.
- 세로 `@page` 를 CSS 파일에 쓰지 마라. 인쇄 직전에 붙였다 뗀다.
- RDDA 인쇄 블록(`index.css` 819~837행)을 건드리지 마라.
- `AnalysisRequest` 스키마, 저장 키, 메일 초안(`analysis-mail.ts`), 사진 업로드 경로를 고치지 마라.
- 의뢰서 swatch 자리에 테두리, 점선, 안내 문구를 다시 넣지 마라. 제목줄 하나만 둔다.
- 지면 계산에 맞춘 높이와 글자 크기를 임의로 올리지 마라.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/data/analysis-print.ts` | A, 전체 교체 |
| `src/components/analysis/AnalysisPrintDeck.tsx` | B, 전체 교체 |
| `src/index.css` | C, 839~892행 교체 |
| `src/routes/FabricAnalysis.tsx` | D |
| `src/components/analysis/AnalysisDetailDialog.tsx` | E |

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. 화면 확인은 사용자가 한다.
