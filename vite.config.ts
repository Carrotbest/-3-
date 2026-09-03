import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const BUILD_ID = new Date().toISOString()

export default defineConfig({
  base: "/-3-/",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
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
          source: JSON.stringify({ buildId: BUILD_ID }),
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
