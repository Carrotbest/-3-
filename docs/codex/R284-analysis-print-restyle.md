# R284 — FABRIC ANALYSIS 출력 디자인 재설계

추론 강도: **medium**. 파일 2개. R282가 만든 출력 디자인을 통째로 갈아 끼운다.

## 상태와 경위

R265가 격자를 걷어 종이에서 안 읽혔다. R282에서 **하드카피 엑셀 양식을 그대로 흉내 내** 검은 격자 표로 바꿨다. 시인성은 올라갔지만 2026-10-02에 박향근이 보고 방향이 아니라고 했다.

요구는 **엑셀 양식 복제가 아니라 웹 대시보드 톤앤매너의 세련된 문서**다. 시인성은 R282 수준을 유지하고 색을 쓴다.

R282의 검은 0.3mm 격자와 `#dce6f1` 라벨 셀은 이번에 **전부 걷어낸다.** 다만 **R265로 돌아가지 말 것.** 옅은 회색 라벨(`#9ca3af` 6.5pt)과 무테 레이아웃이 실패한 원인이다.

## 디자인 원칙

- 선은 **가는 회색 수평선**(`#e2e8f0` 0.2mm)만 쓴다. 칸을 사방으로 두르지 않는다.
- 색은 **인디고 한 가지**다. 구역 제목 배경(`#eef2ff`), 머리말 밑줄(`#4f46e5`), swatch 점선(`#c7d2fe`). 앱이 실제로 쓰는 계열이다(`#6366f1`, `#4f46e5`).
- 라벨은 **`#475569` 8pt 700**이다. 회색이되 읽힌다. 값은 `#0f172a` 10pt 500이다.
- URGENT만 호박색(`#b45309`) 알약으로 튀게 둔다.
- 흑백 출력에서도 명도 차로 구분되게 톤을 벌려 둔다.

## 건드리지 말 것

- `AnalysisPrintDeck.tsx` 123행 이후 `AnalysisPrintDeck` 본체 전부. `PAGE_STYLE`, `IMAGE_WAIT_MS`, `useEffect` 두 개, `printedRef`, `afterprint` 이중 방어, `onDone`.
- 1~17행 import와 타입.
- `src/data/analysis-print.ts`. 읽기만 한다.
- `.an-print-root` 가시성 규칙. RDDA 월간 리포트가 `body *`를 숨겨서 필요하다.
- CSS 변수 이름은 전부 `--an-` 접두사다. **`--accent`, `--border` 같은 앱 전역 토큰 이름을 재정의하지 말 것.** 자식에게 샌다.

## 작업 1. `src/index.css`

**847행 `.an-print-deck { display: none; }` 부터 890행 `}`(`@media print` 닫는 괄호)까지** 전체를 교체한다.

```css
.an-print-deck { display: none; }

@media print {
  .an-print-root, .an-print-root * { visibility: visible !important; }
  .an-print-root { position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important; translate: none !important; transform: none !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
  .an-print-deck { display: block !important; background: #fff; color: #0f172a; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .an-print-page {
    --an-ink: #0f172a; --an-soft: #475569; --an-faint: #94a3b8;
    --an-rule: #e2e8f0; --an-accent: #4f46e5; --an-accent-soft: #eef2ff; --an-accent-line: #c7d2fe; --an-tint: #f8fafc;
    box-sizing: border-box; width: 186mm; font-size: 9.5pt; line-height: 1.4; color: var(--an-ink);
    page-break-after: always; break-after: page;
  }
  .an-print-page:last-child { page-break-after: auto; break-after: auto; }

  /* 머리말 */
  .an-head { margin-bottom: 5mm; }
  .an-head-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; padding-bottom: 3mm; border-bottom: 0.7mm solid var(--an-accent); }
  .an-eyebrow { margin: 0; font-size: 7pt; font-weight: 700; letter-spacing: 0.26em; color: var(--an-accent); }
  .an-head h1 { margin: 1.5mm 0 0; font-size: 19pt; font-weight: 700; letter-spacing: -0.015em; }
  .an-sub { margin: 0.8mm 0 0; font-size: 8pt; font-weight: 600; letter-spacing: 0.14em; color: var(--an-soft); }
  .an-head-no { text-align: right; white-space: nowrap; }
  .an-head-no strong { display: block; font-size: 14pt; font-weight: 700; letter-spacing: 0.04em; }
  .an-head-no em { display: inline-block; margin-top: 1.5mm; padding: 0.6mm 2.4mm; border-radius: 6mm; background: #b45309; color: #fff; font-style: normal; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.1em; }

  /* 머리말 아래 요약 띠 */
  .an-meta { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 3mm; border: 0.2mm solid var(--an-rule); border-radius: 1.5mm; background: var(--an-tint); overflow: hidden; }
  .an-meta > div { padding: 2mm 3mm; border-left: 0.2mm solid var(--an-rule); }
  .an-meta > div:first-child { border-left: 0; }
  .an-meta span { display: block; font-size: 6.8pt; font-weight: 700; letter-spacing: 0.1em; color: var(--an-soft); text-transform: uppercase; }
  .an-meta b { display: block; margin-top: 0.8mm; font-size: 10pt; font-weight: 600; }

  /* 구역 제목 */
  .an-block { margin-top: 5mm; break-inside: avoid; }
  .an-block > h2 { display: flex; align-items: center; gap: 2mm; margin: 0 0 2mm; padding: 1.6mm 3mm; border-radius: 1.5mm; background: var(--an-accent-soft); font-size: 9.5pt; font-weight: 700; color: var(--an-ink); }
  .an-block > h2::before { content: ""; width: 1.2mm; height: 4mm; border-radius: 1mm; background: var(--an-accent); }

  /* 표: 가로선만 */
  .an-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .an-grid th, .an-grid td { border-bottom: 0.2mm solid var(--an-rule); padding: 2mm 3mm; vertical-align: top; word-break: break-word; }
  .an-grid th { background: var(--an-tint); font-size: 8pt; font-weight: 700; color: var(--an-soft); text-align: left; }
  .an-grid td { font-size: 10pt; font-weight: 500; }
  .an-grid tbody tr:first-child th, .an-grid tbody tr:first-child td { border-top: 0.2mm solid var(--an-rule); }
  .an-grid td + th { border-left: 0.2mm solid var(--an-rule); }
  .an-grid td:empty::after { content: ""; display: block; min-height: 4.5mm; }
  .an-grid-write td { height: 8.5mm; background: #fff; }

  /* 실물 swatch 붙이는 자리 */
  .an-swatch { display: flex; align-items: center; justify-content: center; height: 62mm; border: 0.5mm dashed var(--an-accent-line); border-radius: 2mm; background: #fff; }
  .an-swatch span { font-size: 8pt; letter-spacing: 0.08em; color: var(--an-faint); }

  /* 수령·담당·반환 */
  .an-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 3mm; }
  .an-sign span { display: block; font-size: 7.5pt; font-weight: 700; color: var(--an-soft); }
  .an-sign i { display: block; margin-top: 6mm; border-bottom: 0.2mm solid var(--an-rule); }

  /* 사진 */
  .an-shots { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; }
  .an-shot { box-sizing: border-box; height: 50mm; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 0.2mm solid var(--an-rule); border-radius: 2mm; background: var(--an-tint); }
  .an-shot img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .an-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .an-photos div { break-inside: avoid; }
  .an-photos img { display: block; width: 100%; height: 40mm; object-fit: contain; border: 0.2mm solid var(--an-rule); border-radius: 2mm; background: var(--an-tint); }
  .an-photos span { display: block; margin-top: 1mm; font-size: 7.5pt; color: var(--an-soft); }
  .an-empty { margin: 0; padding: 6mm 3mm; border: 0.3mm dashed var(--an-rule); border-radius: 2mm; font-size: 8.5pt; text-align: center; color: var(--an-faint); }

  .an-foot { display: flex; justify-content: space-between; margin-top: 5mm; padding-top: 2mm; border-top: 0.2mm solid var(--an-rule); font-size: 7.5pt; color: var(--an-faint); }
}
```

840~845행 주석 블록은 그대로 둔다. 다만 **841~842행 두 줄**만 아래로 바꾼다.

현재(R282가 넣은 두 줄):
```
 * 하드카피 양식과 같은 검은 격자 표다(R282). 라벨 셀은 음영, 값은 흰 셀이다.
 * R265에서 격자를 걷었다가 종이에서 안 읽혀 되돌렸다. 다시 걷지 말 것.
```
교체:
```
 * 대시보드 톤앤매너의 문서다(R284). 가로선만 쓰고 색은 인디고 하나다.
 * R265 무테 옅은 회색(안 읽힘)과 R282 검은 격자(엑셀 복제)를 둘 다 지난 결과다. 어느 쪽으로도 되돌리지 말 것.
```

## 작업 2. `src/components/analysis/AnalysisPrintDeck.tsx`

**19행 `function chunkPairs` 부터 121행 `ReportPage` 가 닫히는 `}` 까지** 전체를 교체한다. 1~17행과 123행 이후는 그대로 둔다.

```tsx
function chunkPairs(items: [string, string][]): [string, string][][] {
  const rows: [string, string][][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

function Head({ item, kind, sub, meta }: { item: AnalysisRequest; kind: string; sub: string; meta: [string, string][] }) {
  return <header className="an-head">
    <div className="an-head-top">
      <div>
        <p className="an-eyebrow">FABRIC ANALYSIS</p>
        <h1>{kind}</h1>
        <p className="an-sub">{sub}</p>
      </div>
      <div className="an-head-no">
        <strong>{item.anNo}</strong>
        {item.requestType === "Urgent" ? <em>URGENT</em> : null}
      </div>
    </div>
    <div className="an-meta">{meta.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
  </header>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="an-block"><h2>{title}</h2>{children}</section>
}

/** 라벨·값 표. 짧은 항목은 2쌍씩, 긴 글은 전폭 한 줄이다. */
function Grid({ pairs, wide }: { pairs: [string, string][]; wide?: [string, string][] }) {
  return <table className="an-grid">
    <colgroup><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /></colgroup>
    <tbody>
      {chunkPairs(pairs).map((row, index) => <tr key={index}>
        {row.map(([label, value]) => <Fragment key={label}><th>{label}</th><td>{value}</td></Fragment>)}
        {row.length === 1 ? <><th /><td /></> : null}
      </tr>)}
      {(wide ?? []).map(([label, value]) => <tr key={label}><th>{label}</th><td colSpan={3}>{value}</td></tr>)}
    </tbody>
  </table>
}

function Foot({ item, kind, stamp }: { item: AnalysisRequest; kind: string; stamp: string }) {
  return <footer className="an-foot"><span>{item.anNo} · {kind}</span><span>출력 {stamp}</span></footer>
}

function RequestPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photo = item.imagePath ? urls[item.imagePath] : undefined
  const meta: [string, string][] = [
    ["Requested", item.requestedAt || "-"],
    ["Type", item.requestType || "-"],
    ["Requester", item.requester || "-"],
    ["Department", item.department || "-"],
  ]
  return <section className="an-print-page">
    <Head item={item} kind="분석 의뢰서" sub="FABRIC ANALYSIS REQUEST" meta={meta} />
    <Block title="의뢰 정보 (Request)">
      <Grid pairs={analysisHeadFields(item)} wide={analysisNoteLines(item)} />
    </Block>
    <Block title="실물 SWATCH (Original Fabric Swatch)">
      <div className="an-swatch"><span>원단을 이 칸에 붙여 주세요</span></div>
    </Block>
    <Block title="분석 결과 (R&D 기입)">
      <table className="an-grid an-grid-write">
        <colgroup><col style={{ width: "22%" }} /><col style={{ width: "78%" }} /></colgroup>
        <tbody>{ANALYSIS_WRITE_LINES.map((label) => <tr key={label}><th>{label}</th><td /></tr>)}</tbody>
      </table>
      <div className="an-sign">
        <div><span>3팀 수령일</span><i /></div>
        <div><span>담당 (In charge)</span><i /></div>
        <div><span>swatch 반환일</span><i /></div>
      </div>
    </Block>
    {photo ? <Block title="참고 사진 (Reference)">
      <div className="an-shots"><div className="an-shot"><img src={photo} alt="" onLoad={onImageSettled} onError={onImageSettled} /></div></div>
    </Block> : null}
    <Foot item={item} kind="분석 의뢰서" stamp={stamp} />
  </section>
}

function ReportPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photos = analysisPrintImages(item, "report").map((path) => urls[path]).filter(Boolean)
  const meta: [string, string][] = [
    ["Requested", item.requestedAt || "-"],
    ["Finished", item.finishedAt || "-"],
    ["Lead time", analysisLeadText(item)],
    ["In charge", item.inCharge || "-"],
  ]
  return <section className="an-print-page">
    <Head item={item} kind="분석 리포트" sub="FABRIC ANALYSIS REPORT" meta={meta} />
    <Block title="의뢰 정보 (Request)">
      <Grid pairs={analysisHeadFields(item)} wide={analysisNoteLines(item)} />
    </Block>
    <Block title="분석 결과 (Result)">
      <Grid pairs={analysisResultFields(item)} wide={[["Yarn description", item.yarnDescription || "-"], ["Comment (RND)", item.commentRnd || "-"]]} />
    </Block>
    <Block title="사진 (Photo)">
      {photos.length
        ? <div className="an-photos">{photos.map((url, index) => <div key={url}><img src={url} alt="" onLoad={onImageSettled} onError={onImageSettled} /><span>사진 {index + 1}</span></div>)}</div>
        : <p className="an-empty">등록된 사진이 없습니다.</p>}
    </Block>
    <Foot item={item} kind="분석 리포트" stamp={stamp} />
  </section>
}
```

## 주의

- `Grid`에서 `write` prop 을 없앴다. 기입 표는 `RequestPage` 안에서 `an-grid an-grid-write` 로 직접 그린다. **`Grid`에 `write`를 남기지 말 것.** 타입 오류가 난다.
- `analysisLeadText`는 `ReportPage`의 `meta`에서 계속 쓴다. **import 에서 지우지 말 것.** `ANALYSIS_WRITE_LINES`, `analysisHeadFields`, `analysisNoteLines`, `analysisResultFields`, `analysisPrintImages` 도 전부 계속 쓴다.
- `row.length === 1` 분기를 지우지 말 것. 지금은 항목이 12개라 안 걸리지만 하나 늘면 표가 깨진다.
- `.an-grid td:empty::after` 가 빈 값 칸의 최소 높이다. `.an-grid-write td` 의 `height`는 손으로 적는 칸 높이다. 둘 다 필요하다.
- 라벨 셀 음영과 인디고 배경은 `print-color-adjust: exact` 가 있어야 인쇄된다. 이미 `.an-print-deck` 에 있다. 빼지 말 것.
- 의뢰서 한 장 세로 합이 약 235mm다(A4 여백 12mm 기준 가용 273mm). swatch 62mm 를 키우면 결과 기입란이 2쪽으로 밀린다. **높이를 늘리지 말 것.**

## 검증

1. `npm run build` 한 번. **실패하면 고치고 다시 돌려라.** 통과할 때까지다.
2. `git status --short` 로 이번에 바뀐 파일이 `src/index.css` 와 `src/components/analysis/AnalysisPrintDeck.tsx` 둘뿐인지 확인한다. `src/data/cost-sheets.ts` 와 `src/components/dd/CostSheetDialog.tsx` 는 R283 변경이라 그대로 남아 있어야 한다.

화면 확인은 박향근이 한다.
