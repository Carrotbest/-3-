import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE_URL = "http://localhost:5175/-3-/"
const SHOTS_DIR = "docs/manual/shots"
const VIEWPORT = { width: 1440, height: 1024, deviceScaleFactor: 2 }

const screens = [
  {
    n: 1, slug: "home", sectionId: "home", route: "#/", name: "HOME",
    callouts: [
      { n: 1, findText: "완료", label: "완료·접수·납기 요약 카드" },
      { n: 2, selector: '[aria-label^="공정 누적 도달률"]', findText: "공정 누적 도달률", label: "공정 누적 도달률" },
      { n: 3, selector: '[aria-label="팀 일정 구분 범례"]', findText: "팀 일정", label: "팀 일정 유형 범례" },
    ],
  },
  {
    n: 2, slug: "development", sectionId: "development", route: "#/development", name: "DEVELOPMENT",
    callouts: [
      { n: 1, findText: "총 개발 (진행중)", label: "진행 중 개발 요약 KPI" },
      { n: 2, findText: "4공정 KPI", label: "공정별 누적 현황" },
      { n: 3, findText: "Categories", label: "카테고리별 개발 현황" },
    ],
  },
  {
    n: 3, slug: "dd-master", sectionId: "ddmaster", route: "#/development/workspace", name: "DD MASTER",
    callouts: [
      { n: 1, selector: "thead", findText: "담당", label: "담당·Status·Style 고정 열" },
      { n: 2, selector: "tbody", findText: "Style No.", label: "두 번 눌러 수정하는 셀 영역" },
      { n: 3, findText: "신규 작지 접수", label: "신규 작업지시 접수" },
      { n: 4, selector: 'button[title="전체 항목 수정"]', findText: "전체 항목 수정", label: "한 건 전체 항목 수정" },
    ],
  },
  {
    n: 4, slug: "warehouse", sectionId: "warehouse", route: "#/warehouse", name: "WAREHOUSE",
    callouts: [
      { n: 1, selector: '[role="tablist"]', findText: "입고 대기", label: "입고대기·보관·소진·폐기 탭" },
      { n: 2, findText: "창고 재고 (yds)", label: "상단 재고 요약 KPI" },
      { n: 3, selector: "tbody", findText: "드래그해서 상태 이동", label: "드래그 가능한 원단 목록" },
      { n: 4, findText: "선택 입고", label: "입고 작업 버튼" },
    ],
  },
  {
    n: 5, slug: "ts", sectionId: "ts", route: "#/ts", name: "TROUBLE SHOOTING",
    callouts: [
      { n: 1, findText: "+ 신규 접수 입력", label: "신규 접수 입력" },
      { n: 2, selector: '[aria-label="TS 상태 필터"]', findText: "전체", label: "접수·진행·완료 단계 필터" },
      { n: 3, findText: "TS 목록", label: "기술지원 접수 목록" },
      { n: 4, findText: "엑셀 내보내기", label: "엑셀 내보내기" },
    ],
  },
  {
    n: 6, slug: "study", sectionId: "study", route: "#/study", name: "FABRIC STUDY",
    callouts: [
      { n: 1, findText: "자료 라이브러리", label: "학습 자료 라이브러리" },
      { n: 2, findText: "주차별 제출 현황", label: "팀원별 주차 제출 현황" },
    ],
  },
  {
    n: 7, slug: "rdda", sectionId: "rdda", route: "#/rdda", name: "RDDA REPORT",
    callouts: [
      { n: 1, findText: "월별 YTD 스냅샷 추이", label: "월별 YTD 추이" },
      { n: 2, findText: "원산지 분포", label: "원산지 분포" },
      { n: 3, findText: "고객별 Pickup", label: "고객별 Pickup" },
    ],
  },
  {
    n: 8, slug: "portfolio", sectionId: "portfolio", route: "#/trend/portfolio", name: "PORTFOLIO",
    callouts: [
      { n: 1, selector: '#portfolio-summary-title', findText: "전체 개발 현황", label: "포트폴리오 현황 KPI" },
      { n: 2, selector: '[aria-label="기능 카테고리 목록"]', findText: "기능 카테고리", label: "기능 카테고리 목록" },
      { n: 3, findText: "신규 등록", label: "웹 자산 신규 등록" },
    ],
  },
  {
    n: 9, slug: "calendar", sectionId: "calendar", route: "#/calendar", name: "CALENDAR",
    callouts: [
      { n: 1, selector: '[role="grid"]', findText: "월간 일정", label: "월 달력" },
      { n: 2, selector: '[aria-label="담당자 필터"]', findText: "전체 담당자", label: "담당자 필터" },
      { n: 3, selector: '[aria-label="일정 유형 범례"]', findText: "미팅", label: "일정 유형 범례" },
      { n: 4, findText: "선택 기간 상세", label: "선택 기간 일정 상세" },
    ],
  },
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runChrome(args, collectOutput = false) {
  const profile = await mkdtemp(join(tmpdir(), "fabric-rnd-capture-"))
  try {
    return await new Promise((resolvePromise, reject) => {
      const chrome = spawn(CHROME_PATH, [
        "--headless=new",
        "--disable-gpu",
        "--disable-gpu-sandbox",
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--disable-extensions",
        "--disable-background-networking",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profile}`,
        ...args,
      ], { stdio: ["ignore", collectOutput ? "pipe" : "ignore", "pipe"], windowsHide: true })
      const output = []
      const errors = []
      chrome.stdout?.on("data", (chunk) => output.push(chunk))
      chrome.stderr?.on("data", (chunk) => errors.push(chunk))
      chrome.once("error", reject)
      chrome.once("exit", (code) => {
        if (code === 0) resolvePromise(Buffer.concat(output).toString("utf8"))
        else reject(new Error(`시스템 Chrome 캡처 실패(exit ${code ?? "unknown"}): ${Buffer.concat(errors).toString("utf8").slice(-1200)}`))
      })
    })
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
}

async function createCliBrowser() {
  const frameUrl = "http://localhost:5175/-3-/scripts/capture-frame.html"
  return {
    engine: "system Chrome --screenshot fallback",
    async capture(screen, path) {
      const query = new URLSearchParams({ route: screen.route, callouts: JSON.stringify(screen.callouts) })
      const url = `${frameUrl}?${query}`
      const common = [
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        `--force-device-scale-factor=${VIEWPORT.deviceScaleFactor}`,
        "--virtual-time-budget=6500",
        "--run-all-compositor-stages-before-draw",
        "--force-prefers-reduced-motion=reduce",
      ]
      const dumped = await runChrome([...common, "--dump-dom", url], true)
      const encoded = dumped.match(/<meta[^>]*name="capture-result"[^>]*content="([^"]+)"/)?.[1]
        ?? dumped.match(/<meta[^>]*content="([^"]+)"[^>]*name="capture-result"/)?.[1]
      const result = encoded
        ? JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))
        : { drawn: [], nonZeroKpiLabels: 0, aliases: 0, replaced: 0 }
      await runChrome([...common, `--screenshot=${resolve(path)}`, url])
      return result
    },
    async close() {},
  }
}

async function createBrowser() {
  try {
    const { chromium } = await import("playwright-core")
    const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
    const context = await browser.newContext({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.deviceScaleFactor })
    const page = await context.newPage()
    return {
      engine: "playwright-core + system Chrome",
      async capture(screen, path) {
        await page.goto(`${BASE_URL}${screen.route}`, { waitUntil: "networkidle" })
        await delay(1800)
        const anonymized = await page.evaluate((source) => globalThis.eval(source), browserSetupExpression())
        const metrics = await page.evaluate((source) => globalThis.eval(source), metricsExpression())
        const drawn = await page.evaluate((source) => globalThis.eval(source), overlayExpression(screen.callouts))
        await page.screenshot({ path, fullPage: false })
        return { drawn, nonZeroKpiLabels: metrics.nonZeroKpiLabels, ...anonymized }
      },
      async close() { await browser.close() },
    }
  } catch (error) {
    console.warn(`[capture] playwright-core unavailable; using system Chrome screenshot fallback (${error instanceof Error ? error.code ?? error.name : "unknown"})`)
    return await createCliBrowser()
  }
}

function browserSetupExpression() {
  return String.raw`(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    const sourceUrl = new URL("src/data/schema.ts", location.href.split("#")[0]);
    let memberNames = [];
    try {
      const source = await fetch(sourceUrl).then((response) => response.text());
    const block = source.match(/export const MEMBERS\s*=\s*\[([\s\S]*?)\]\s*(?:as const)?\s*;?/)?.[1] ?? "";
      memberNames = [...block.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]);
    } catch {}
    const replacements = new Map(memberNames.map((name, index) => [name, "데모 사용자 " + (index + 1)]));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textNode;
    let replaced = 0;
    while ((textNode = walker.nextNode())) {
      let value = textNode.nodeValue ?? "";
      for (const [name, alias] of replacements) {
        if (!value.includes(name)) continue;
        value = value.split(name).join(alias);
        replaced += 1;
      }
      textNode.nodeValue = value;
    }
    for (const element of document.querySelectorAll("[aria-label], [title]")) {
      for (const attribute of ["aria-label", "title"]) {
        let value = element.getAttribute(attribute) ?? "";
        for (const [name, alias] of replacements) value = value.split(name).join(alias);
        element.setAttribute(attribute, value);
      }
    }
    return { aliases: replacements.size, replaced };
  })()`
}

function overlayExpression(callouts) {
  return `(() => {
    const callouts = ${JSON.stringify(callouts)};
    document.getElementById("manual-capture-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "manual-capture-overlay";
    Object.assign(overlay.style, { position: "absolute", inset: "0", width: "100%", height: Math.max(document.documentElement.scrollHeight, window.innerHeight) + "px", pointerEvents: "none", zIndex: "2147483647" });
    document.body.appendChild(overlay);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 5 && rect.height > 5 && style.display !== "none" && style.visibility !== "hidden";
    };
    const findText = (text) => {
      if (!text) return null;
      const matches = [...document.body.querySelectorAll("h1,h2,h3,h4,button,[role=button],[role=tab],[aria-label],section,article,div")]
        .filter((element) => element.id !== overlay.id && visible(element) && ((element.getAttribute("aria-label") ?? "").includes(text) || (element.textContent ?? "").trim().includes(text)))
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (ar.width * ar.height) - (br.width * br.height);
        });
      const match = matches[0];
      if (!match) return null;
      const card = match.closest("article,section,[class*='card'],[class*='Card'],header");
      if (!card || card === document.body) return match;
      const mr = match.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      return cr.width * cr.height <= mr.width * mr.height * 18 && cr.height <= innerHeight * 0.78 ? card : match;
    };
    const drawn = [];
    for (const callout of callouts) {
      let target = null;
      if (callout.selector) {
        try { target = document.querySelector(callout.selector); } catch {}
      }
      if (!target || !visible(target)) target = findText(callout.findText);
      if (!target || !visible(target)) continue;
      const rect = target.getBoundingClientRect();
      const clipped = {
        left: Math.max(6, rect.left),
        top: Math.max(6, rect.top),
        right: Math.min(innerWidth - 6, rect.right),
        bottom: Math.min(innerHeight - 6, rect.bottom),
      };
      if (clipped.right <= clipped.left || clipped.bottom <= clipped.top || clipped.top >= innerHeight || clipped.bottom <= 0) continue;
      const box = document.createElement("div");
      Object.assign(box.style, {
        position: "absolute", left: (scrollX + clipped.left - 4) + "px", top: (scrollY + clipped.top - 4) + "px",
        width: (clipped.right - clipped.left + 8) + "px", height: (clipped.bottom - clipped.top + 8) + "px",
        border: "2.5px solid #0D9488", borderRadius: "10px", boxShadow: "0 0 0 4px rgba(13,148,136,.16), 0 8px 24px rgba(13,148,136,.25)",
      });
      const badge = document.createElement("span");
      badge.textContent = String(callout.n);
      Object.assign(badge.style, {
        position: "absolute", left: "-15px", top: "-15px", width: "34px", height: "34px", borderRadius: "50%",
        display: "grid", placeItems: "center", background: "#0D9488", color: "white", border: "2px solid white",
        font: "700 20px/1 'IBM Plex Mono', ui-monospace, sans-serif", boxShadow: "0 5px 14px rgba(15,23,42,.3)",
      });
      box.appendChild(badge);
      overlay.appendChild(box);
      drawn.push({ n: callout.n, label: callout.label });
    }
    return drawn;
  })()`
}

function metricsExpression() {
  return `(() => {
    const labels = [...document.querySelectorAll("[aria-label]")].map((element) => element.getAttribute("aria-label") ?? "");
    const numeric = labels.filter((label) => /(?:KPI|누적|현황|도달률|완료율|분포)/i.test(label) && /[1-9][0-9]*(?:[,.][0-9]+)?(?:%|건|개)?/.test(label));
    return { nonZeroKpiLabels: numeric.length, title: document.querySelector("h1")?.textContent?.trim() ?? document.title };
  })()`
}

const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

async function buildManual(results) {
  let html = await readFile("docs/manual/manual.base.html", "utf8")
  html = html
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.(?:googleapis|gstatic)\.com"(?: crossorigin)?>\r?\n?/g, "")
    .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^\"]+">\r?\n?/g, "")
  const css = `
/* 캡처 화면 미리보기 */
.screen-preview{margin:0;padding:22px 24px 24px;border-bottom:1px solid var(--border-soft);background:var(--card-2)}
.screen-preview img{display:block;width:100%;max-width:100%;height:auto;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-lg);background:var(--card)}
.screen-preview figcaption{margin-top:16px}
.screen-preview .preview-label{font-family:"IBM Plex Mono",monospace;font-size:11.5px;letter-spacing:.04em;font-weight:600;text-transform:uppercase;color:var(--faint)}
.screen-preview ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 18px;list-style:none;margin:12px 0 0;padding:0}
.screen-preview li{display:flex;align-items:flex-start;gap:9px;color:var(--muted);font-size:.9rem;line-height:1.55}
.screen-preview .preview-num{display:inline-grid;place-items:center;flex:none;width:24px;height:24px;border-radius:50%;background:var(--teal-bright);color:#fff;font-family:"IBM Plex Mono",monospace;font-size:12px;font-weight:600}
@media (max-width:720px){.screen-preview{padding:18px}.screen-preview ol{grid-template-columns:1fr}}
`
  html = html.replace("</style>", `${css}</style>`)

  for (const result of results) {
    const image = await readFile(join(SHOTS_DIR, result.file))
    const legend = result.callouts.map((callout) => `<li><span class="preview-num">${callout.n}</span><span>${escapeHtml(callout.label)}</span></li>`).join("")
    const figure = `<figure class="screen-preview"><img src="data:image/png;base64,${image.toString("base64")}" alt="${escapeHtml(result.name)} 화면 미리보기 — 번호 주석 ${result.callouts.length}개" loading="lazy"><figcaption><div class="preview-label">화면 미리보기 · Point out</div><ol>${legend}</ol></figcaption></figure>`
    const sectionPattern = new RegExp(`(<section id="${result.sectionId}">[\\s\\S]*?<p class="lead">[\\s\\S]*?</p>)`)
    if (!sectionPattern.test(html)) throw new Error(`매뉴얼 섹션을 찾지 못했습니다: ${result.sectionId}`)
    html = html.replace(sectionPattern, `$1\n        ${figure}`)
  }
  await writeFile("docs/manual/manual.html", html, "utf8")
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true })
  if (process.argv.includes("--build-only")) {
    const results = JSON.parse(await readFile(join(SHOTS_DIR, "callouts.json"), "utf8"))
    if (results.length !== screens.length) throw new Error(`매뉴얼 결과가 부족합니다: ${results.length}/${screens.length}`)
    await buildManual(results)
    console.log("[capture] output=docs/manual/manual.html")
    return
  }
  const browser = await createBrowser()
  console.log(`[capture] engine=${browser.engine}`)
  const onlySlug = process.argv.find((value) => value.startsWith("--only="))?.slice("--only=".length)
  const selectedScreens = onlySlug ? screens.filter((screen) => screen.slug === onlySlug) : screens
  if (!selectedScreens.length) throw new Error(`캡처 화면을 찾지 못했습니다: ${onlySlug}`)
  let previous = []
  if (onlySlug) {
    try { previous = JSON.parse(await readFile(join(SHOTS_DIR, "callouts.json"), "utf8")) } catch {}
  }
  const resultMap = new Map(previous.map((result) => [result.slug, result]))
  try {
    for (const screen of selectedScreens) {
      const file = `${screen.n}-${screen.slug}.png`
      const captured = await browser.capture(screen, join(SHOTS_DIR, file))
      resultMap.set(screen.slug, { n: screen.n, slug: screen.slug, sectionId: screen.sectionId, route: screen.route, name: screen.name, file, callouts: captured.drawn })
      console.log(`[capture] ${screen.n}/9 ${screen.name}: callouts=${captured.drawn.length}, nonZeroKpiLabels=${captured.nonZeroKpiLabels}, aliases=${captured.aliases}, replacements=${captured.replaced}`)
    }
  } finally {
    await browser.close()
  }
  const results = screens.map((screen) => resultMap.get(screen.slug)).filter(Boolean)
  if (results.length !== screens.length) throw new Error(`매뉴얼 결과가 부족합니다: ${results.length}/${screens.length}`)
  await writeFile(join(SHOTS_DIR, "callouts.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8")
  await buildManual(results)
  console.log("[capture] output=docs/manual/manual.html")
}

await main()
