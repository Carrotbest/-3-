import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { DatabaseBackup, FileSpreadsheet, RefreshCw, RotateCcw } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { Button } from "@/components/ui/button"
import { backupFileName, buildJsonBackup } from "@/data/backup-export"
import { CACHE_KEYS, clearSyncedCache } from "@/data/cache"
import { downloadBlob } from "@/data/dd-export"
import { parseFabric1LedgerFile } from "@/data/fabric1-ledger-import"
import { getFailingSyncKeys, readStateMetas, syncModeOf } from "@/data/firestore-sync"
import { fmtDateFull, fmtTime } from "@/data/format"
import { FABRIC1_INTAKE_SHEET } from "@/data/schema"
import { replaceFabric1Ledger, useAppStore, type Fabric1IntakeInput } from "@/store/useAppStore"

/** Firestore 커밋 한 번의 요청 크기 한도. 한 키가 이것을 넘으면 서버에 저장할 수 없다. */
const COMMIT_LIMIT_BYTES = 10 * 1024 * 1024

const KEY_LABELS: Record<string, string> = {
  records: "DD MASTER",
  completed: "샘플대장(1팀 입고 포함)",
  fabricOverrides: "창고 상태",
  fabricEvents: "창고 이력",
  disposalRounds: "폐기 라운드",
  requests: "DEVELOPMENT REQUEST",
  requestBoards: "REQUEST 보드",
  requestArchive: "REQUEST 보관함",
  ts: "TROUBLE SHOOTING",
  study: "STUDY",
  studyFiles: "STUDY 자료",
  events: "캘린더",
  rdda: "RDDA 데이터셋",
  rddaSnapshots: "RDDA 주간 스냅샷",
  rddaReports: "RDDA 월 보고",
  analysisRequests: "FABRIC ANALYSIS 의뢰",
  fabricAnalysis: "FABRIC ANALYSIS",
  materials: "자료 목록",
  materialsManual: "자료 목록(수기)",
  materialDiagnostics: "자료 목록 점검",
  chemical: "기능성 개발",
  chemicalManual: "기능성 개발(수기)",
  chemicalLinks: "기능성 연결",
  orgMembers: "조직도",
  meta: "데이터 메타",
}

const labelOf = (key: string) => KEY_LABELS[key] ?? key

type ServerMeta = Record<string, { n: number; updatedAt: string; updatedBy: string } | null>
type Fabric1Preview = {
  fileName: string
  inputs: Fabric1IntakeInput[]
  warnings: string[]
  previousCount: number
}

/**
 * SETTING 데이터 보호 탭(R241). 키별 저장 방식과 크기, 서버 마지막 저장, 저장 실패, 백업과 캐시를 한곳에서 본다.
 * 서버 값은 meta 문서만 읽는다. 청크까지 읽으면 샘플대장 한 번에 4MB가 넘는다.
 */
export function DataProtectionPanel({ isOwner }: { isOwner: boolean }) {
  const state = useAppStore()
  const [serverMeta, setServerMeta] = useState<ServerMeta | null>(null)
  const [metaError, setMetaError] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [failing, setFailing] = useState<string[]>(() => getFailingSyncKeys())
  const [backupMessage, setBackupMessage] = useState("")
  const fabric1InputRef = useRef<HTMLInputElement>(null)
  const [fabric1Preview, setFabric1Preview] = useState<Fabric1Preview | null>(null)
  const [fabric1Message, setFabric1Message] = useState("")
  const [replacingFabric1, setReplacingFabric1] = useState(false)

  const refreshMeta = useCallback(async () => {
    setLoadingMeta(true)
    setMetaError(false)
    try {
      setServerMeta(await readStateMetas(CACHE_KEYS))
    } catch {
      setMetaError(true)
    } finally {
      setLoadingMeta(false)
    }
  }, [])

  useEffect(() => { void refreshMeta() }, [refreshMeta])

  useEffect(() => {
    const update = () => setFailing(getFailingSyncKeys())
    window.addEventListener("fabric:sync-failed", update)
    window.addEventListener("fabric:sync-recovered", update)
    return () => {
      window.removeEventListener("fabric:sync-failed", update)
      window.removeEventListener("fabric:sync-recovered", update)
    }
  }, [])

  const values = CACHE_KEYS.map((key) => (state as unknown as Record<string, unknown>)[key])
  const rows = useMemo(() => {
    const encoder = new TextEncoder()
    return CACHE_KEYS.map((key, index) => {
      const value = values[index]
      const bytes = encoder.encode(JSON.stringify(value ?? null)).length
      return {
        key,
        label: labelOf(key),
        mode: syncModeOf(key),
        count: Array.isArray(value) ? value.length : null,
        bytes,
        ratio: Math.round((bytes / COMMIT_LIMIT_BYTES) * 100),
      }
    })
    // 스토어 값이 바뀔 때만 다시 잰다. 샘플대장 직렬화가 가볍지 않다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, values)

  const exportJsonBackup = async () => {
    try {
      downloadBlob(await buildJsonBackup(), backupFileName("json"))
      setBackupMessage("JSON 백업을 내려받았습니다.")
    } catch {
      setBackupMessage("JSON 백업에 실패했습니다.")
    }
  }

  const resetLocalCache = async () => {
    const ok = window.confirm("이 브라우저에 저장된 동기화 캐시를 비우고 새로 고칩니다. 서버 데이터는 그대로이며 새로 고친 뒤 다시 내려받습니다. 진행할까요?")
    if (!ok) return
    try {
      // 스토어를 예시 데이터로 바꾸지 않는다. 그 상태로 저장이 나가면 병합이 서버 행을 삭제로 읽는다.
      await clearSyncedCache()
      window.location.reload()
    } catch {
      setBackupMessage("캐시를 비우지 못했습니다.")
    }
  }

  const selectFabric1Ledger = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setFabric1Message("")
    setFabric1Preview(null)
    try {
      const parsed = await parseFabric1LedgerFile(file)
      setFabric1Preview({
        fileName: file.name,
        ...parsed,
        previousCount: useAppStore.getState().completed.filter((sample) => sample.sourceSheet === FABRIC1_INTAKE_SHEET).length,
      })
    } catch (error) {
      setFabric1Message(error instanceof Error ? error.message : "파일을 읽지 못했습니다.")
    }
  }

  const executeFabric1Replace = async () => {
    if (!fabric1Preview) return
    setReplacingFabric1(true)
    setFabric1Message("")
    try {
      await replaceFabric1Ledger(fabric1Preview.inputs)
      setFabric1Message(`1팀 창고 데이터를 ${fabric1Preview.inputs.length.toLocaleString("ko-KR")}건으로 교체했습니다.`)
      setFabric1Preview(null)
    } catch (error) {
      setFabric1Message(error instanceof Error ? error.message : "1팀 창고 데이터를 교체하지 못했습니다.")
    } finally {
      setReplacingFabric1(false)
    }
  }

  const when = (value: string) => value ? `${fmtDateFull(value)} ${fmtTime(value)}` : "-"

  return <div className="space-y-4">
    <SectionCard
      title="저장 상태"
      subtitle="데이터마다 저장 방식, 크기, 서버에 마지막으로 저장된 시각을 봅니다."
      actions={<Button type="button" size="sm" variant="outline" disabled={loadingMeta} onClick={() => void refreshMeta()}><RefreshCw className={loadingMeta ? "animate-spin" : ""} aria-hidden="true" />새로 고침</Button>}
      contentClassName="p-0"
    >
      {metaError ? <p role="alert" className="px-4 pt-3 text-sm text-[var(--destructive)]">서버 저장 상태를 읽지 못했습니다.</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-4 py-2 font-medium">데이터</th>
              <th className="px-3 py-2 font-medium">저장 방식</th>
              <th className="px-3 py-2 text-right font-medium">항목 수</th>
              <th className="px-3 py-2 text-right font-medium">크기</th>
              <th className="px-3 py-2 text-right font-medium">한도 대비</th>
              <th className="px-3 py-2 font-medium">서버 마지막 저장</th>
              <th className="px-4 py-2 font-medium">저장한 사람</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = serverMeta?.[row.key] ?? null
              const ratioClass = row.ratio >= 90 ? "font-semibold text-[var(--destructive)]" : row.ratio >= 70 ? "font-semibold text-amber-600" : ""
              return <tr key={row.key} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium text-[var(--foreground)]">{row.label}</td>
                <td className="px-3 py-2">
                  {row.mode === "merge"
                    ? <span title="여러 명이 동시에 저장해도 항목이 빠지지 않습니다">병합 저장</span>
                    : <span className="text-[var(--muted-foreground)]" title="여러 명이 동시에 저장하면 마지막 저장이 이깁니다">마지막 저장 우선</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.count === null ? "-" : row.count.toLocaleString("ko-KR")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(row.bytes / 1024 / 1024).toFixed(2)}MB</td>
                <td className={`px-3 py-2 text-right tabular-nums ${ratioClass}`}>{row.ratio}%</td>
                <td className="px-3 py-2 tabular-nums">{serverMeta ? (meta ? when(meta.updatedAt) : "-") : "…"}</td>
                <td className="px-4 py-2 text-[var(--muted-foreground)]">{serverMeta ? (meta?.updatedBy || "-") : "…"}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-[var(--muted-foreground)]">한 데이터의 크기가 10 MiB를 넘으면 서버에 저장할 수 없습니다. 샘플대장은 1팀 입고가 쌓일수록 커집니다.</p>
    </SectionCard>

    <SectionCard title="저장 실패" subtitle="서버에 아직 반영되지 않은 저장을 보여 줍니다.">
      {failing.length === 0
        ? <p className="flex items-center gap-2 text-sm text-[var(--foreground)]"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />서버에 반영되지 않은 저장이 없습니다.</p>
        : <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--destructive)]">{failing.map(labelOf).join(", ")}</p>
          <p className="text-xs text-[var(--muted-foreground)]">창을 닫거나 새로 고치지 마세요. 자동으로 다시 보냅니다.</p>
        </div>}
    </SectionCard>

    {isOwner ? <SectionCard title="1팀 창고 데이터 일괄 교체" subtitle="새 파일로 현재 1팀 창고 데이터를 전부 바꿉니다. 되돌릴 수 없습니다.">
      <div className="space-y-3">
        <input
          ref={fabric1InputRef}
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(event) => void selectFabric1Ledger(event)}
        />
        <Button type="button" variant="outline" disabled={replacingFabric1} onClick={() => fabric1InputRef.current?.click()}>
          <FileSpreadsheet aria-hidden="true" />원장 파일 선택
        </Button>
        {fabric1Preview ? <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3">
          <p className="text-sm font-medium text-[var(--foreground)]">{fabric1Preview.fileName}</p>
          <p className="text-sm text-[var(--foreground)]">
            기존 {fabric1Preview.previousCount.toLocaleString("ko-KR")}건을 지우고 새 {fabric1Preview.inputs.length.toLocaleString("ko-KR")}건으로 교체합니다.
          </p>
          {fabric1Preview.warnings.length ? <div role="alert" className="space-y-1 text-xs text-amber-700">
            <p className="font-semibold">경고 {fabric1Preview.warnings.length.toLocaleString("ko-KR")}건</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {fabric1Preview.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}
            </ul>
          </div> : null}
          <Button type="button" variant="destructive" disabled={replacingFabric1} onClick={() => void executeFabric1Replace()}>
            {replacingFabric1 ? "교체 중…" : "교체 실행"}
          </Button>
        </div> : null}
        {fabric1Message ? <p role="status" aria-live="polite" className="text-xs text-[var(--foreground)]">{fabric1Message}</p> : null}
      </div>
    </SectionCard> : null}

    {isOwner ? <SectionCard title="백업과 캐시" subtitle="소유자만 볼 수 있습니다.">
      <div className="space-y-4">
        <div>
          <Button type="button" variant="outline" onClick={() => void exportJsonBackup()}><DatabaseBackup aria-hidden="true" />JSON 백업 내려받기</Button>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">전체 데이터를 복원용 JSON 한 파일로 내려받습니다. 주간 자동 백업은 이 PC 작업 스케줄러가 따로 돌립니다.</p>
        </div>
        <div>
          <Button type="button" variant="outline" onClick={() => void resetLocalCache()}><RotateCcw aria-hidden="true" />이 PC 캐시 비우고 새로 고침</Button>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">이 브라우저의 동기화 캐시만 비웁니다. 서버 데이터와 화학 첨부파일은 지우지 않습니다.</p>
        </div>
        {backupMessage ? <p aria-live="polite" className="text-xs text-[var(--foreground)]">{backupMessage}</p> : null}
      </div>
    </SectionCard> : null}
  </div>
}
