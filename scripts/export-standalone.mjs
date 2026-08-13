import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distDir = path.join(projectRoot, "dist")
const outputDir = path.join(projectRoot, "share")
const requestedName = process.argv[2] ?? "FABRIC_RND_0807.html"
const developmentArg = process.argv.find((value) => value.startsWith("--development="))?.slice("--development=".length)
const samplesArg = process.argv.find((value) => value.startsWith("--samples="))?.slice("--samples=".length)
const outputName = path.basename(requestedName)
if (!outputName.toLowerCase().endsWith(".html")) {
  throw new Error("출력 파일명은 .html로 끝나야 합니다.")
}
const outputPath = path.join(outputDir, outputName)

let html = await readFile(path.join(distDir, "index.html"), "utf8")

const stylesheetMatch = html.match(/<link rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/)
const scriptMatch = html.match(/<script type="module"[^>]+src="([^"]+)"[^>]*><\/script>/)

if (!stylesheetMatch || !scriptMatch) {
  throw new Error("빌드 결과에서 CSS 또는 JavaScript 파일을 찾지 못했습니다.")
}

const resolveAsset = (assetUrl) => path.join(distDir, assetUrl.replace(/^\.\//, ""))
const css = await readFile(resolveAsset(stylesheetMatch[1]), "utf8")
const javascript = await readFile(resolveAsset(scriptMatch[1]), "utf8")

html = html
  .replace(stylesheetMatch[0], () => `<style>\n${css}\n</style>`)
  .replace(
    scriptMatch[0],
    () => `<script type="module">\n${javascript.replace(/<\/script/gi, "<\\/script")}\n</script>`,
  )

if (developmentArg || samplesArg) {
  if (!developmentArg || !samplesArg) throw new Error("실제 데이터 포함 시 DD와 샘플관리대장 경로가 모두 필요합니다.")
  const [developmentBytes, sampleBytes] = await Promise.all([readFile(developmentArg), readFile(samplesArg)])
  const signature = createHash("sha256").update(developmentBytes).update(sampleBytes).digest("hex")
  const manifest = {
    signature,
    generatedAt: new Date().toISOString(),
    development: { name: path.basename(developmentArg), base64: developmentBytes.toString("base64") },
    samples: { name: path.basename(samplesArg), base64: sampleBytes.toString("base64") },
  }
  // 번들 안의 Excel HTML 파서 문자열에도 </head>가 있으므로 실제 문서의 마지막 닫는 태그에만 삽입한다.
  const headCloseIndex = html.toLowerCase().lastIndexOf("</head>")
  if (headCloseIndex < 0) throw new Error("공유 HTML에서 문서 head 종료 지점을 찾지 못했습니다.")
  const embeddedTag = `<script id="fabric-rnd-embedded-workbooks" type="application/json">${JSON.stringify(manifest)}</script>\n`
  html = `${html.slice(0, headCloseIndex)}${embeddedTag}${html.slice(headCloseIndex)}`
}

await mkdir(outputDir, { recursive: true })
await writeFile(outputPath, html, "utf8")

console.log(outputPath)
