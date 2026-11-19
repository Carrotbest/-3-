import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const BUILD_ID = new Date().toISOString()

/**
 * `release-notes.json` 맨 앞 항목의 `items` 를 읽는다. 빌드할 때 한 번만 읽고
 * `version.json` 과 번들 양쪽에 같은 값을 심는다.
 * **파일이 없거나 깨져도 빌드를 멈추지 않는다.** 안내문은 있으면 좋은 것이지
 * 없다고 배포를 막을 값이 아니다. 그때는 빈 배열이고 팝업은 예전 모습 그대로다.
 */
function readLatestNotes(): string[] {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, "release-notes.json"), "utf8")
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list) || !list.length) return []
    const first: unknown = list[0]
    if (typeof first !== "object" || first === null || !("items" in first)) return []
    const items = (first as { items: unknown }).items
    if (!Array.isArray(items)) return []
    return items.filter((item): item is string => typeof item === "string").slice(0, 5)
  } catch {
    return []
  }
}

const BUILD_NOTES = readLatestNotes()

export default defineConfig({
  base: "/-3-/",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __BUILD_NOTES__: JSON.stringify(BUILD_NOTES) },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "emit-version-json",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ buildId: BUILD_ID, notes: BUILD_NOTES }),
        })
      },
    },
  ],
  resolve: {
    // dev 사전번들링이 React 두 번째 사본을 만들어 "Invalid hook call"이 나는 것을 막는다.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "recharts"],
  },
})
