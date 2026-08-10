import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distDir = path.join(projectRoot, "dist")
const outputDir = path.join(projectRoot, "share")
const outputPath = path.join(outputDir, "FABRIC_RND_0807.html")

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

await mkdir(outputDir, { recursive: true })
await writeFile(outputPath, html, "utf8")

console.log(outputPath)
