import { useEffect, useState } from "react"
import { collection, onSnapshot } from "firebase/firestore"

import { useScreenAccess } from "./auth"
import { db } from "./firebase"

/**
 * 바이어 시험 기준 매트릭스(R332). 원본은 팀 취합본 엑셀이고 Firestore `protocolMatrix`에 개정본 단위로 산다.
 * 소유자만 읽는다(firestore.rules). 실데이터라 저장소에 넣지 않는다.
 */

export type ProtocolGroupId = "physical" | "colorfastness" | "safety" | "performance"

export interface ProtocolGroup { id: ProtocolGroupId; label: string; korean: string }

export interface ProtocolCell { method: string; requirement: string }

export interface ProtocolTest {
  id: string
  /** 시험군 번호.순번, 예 "1.03" */
  no: string
  group: ProtocolGroupId
  name: string
  korean: string
  /** 바이어 id별 조건 목록. 대부분 1개, 세탁 치수변화처럼 소재별로 갈리면 여러 개 */
  cells: Record<string, ProtocolCell[]>
}

export interface ProtocolBuyer {
  id: string
  name: string
  /** 1차, 2차 판정 광원 */
  lightSources: string[]
  /** buyerProtocols 원문 문서의 topic. 원문이 없으면 비어 있다 */
  manualTopic?: string
  notes?: { q: string; a: string }[]
  /** 바이어 시그니처 색(hex). 공개 저장소에 바이어별 색을 두지 않으려고 데이터에 싣는다 */
  color?: string
  /** web: 로고 색을 웹에서 확인, brand: 브랜드 이미지 기반 지정 */
  colorBasis?: "web" | "brand"
  colorName?: string
}

export interface ProtocolVerification {
  testId: string
  buyerId: string
  field: "method" | "requirement" | "both"
  /** 취합본 값 */
  sheet: string
  /** 원문 값 */
  source: string
  doc: string
}

export interface ProtocolDiff {
  testId: string
  buyerId: string
  variant: number
  field: "method" | "requirement"
  base: string
  value: string
}

export interface ProtocolChange extends ProtocolDiff { fromRev: string }

export interface ProtocolRevision {
  id: string
  revDate: string
  kind: "master" | "buyer-copy"
  /** 기준표 버전("1.0", "1.1"). master만 갖는다 */
  version?: string
  /** master: current 최신, superseded 과거 버전. buyer-copy: merged 반영됨, pending 미반영 */
  status: "current" | "superseded" | "baseline" | "merged" | "pending"
  /** buyer-copy가 반영된 기준표 버전 */
  mergedVersion?: string
  /** master만 갖는다. 직전 버전 대비 바뀐 칸 */
  changes?: ProtocolChange[]
  label: string
  sourceFile: string
  /** 기준본만 갖는다 */
  groups?: ProtocolGroup[]
  buyers?: ProtocolBuyer[]
  tests?: ProtocolTest[]
  verification?: ProtocolVerification[]
  pendingBuyers?: { name: string; note: string; answers?: { q: string; a: string }[] }[]
  /** 바이어 수정본만 갖는다. 담당 바이어 칸 중 기준본과 다른 칸 */
  buyerScope?: string
  diffs?: ProtocolDiff[]
}

type State = { revisions: ProtocolRevision[]; loading: boolean; error: string }

const VERSION_PREF_KEY = "protocol-matrix-version-v1"

const versionOrder = (value?: string) => (value ?? "0").split(".").map(Number)
export const compareVersion = (a?: string, b?: string) => {
  const [x, y] = [versionOrder(a), versionOrder(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff) return diff
  }
  return 0
}

function readVersionPref(): string {
  try { return localStorage.getItem(VERSION_PREF_KEY) ?? "" } catch { return "" }
}

/**
 * 보는 버전은 개인 브라우저 설정이다(localStorage). 비어 있거나 없는 버전이면 최신을 본다.
 * 데이터의 최신 버전은 관리자가 유지한다.
 */
export function useProtocolMatrix(): State & {
  versions: ProtocolRevision[]
  latest: ProtocolRevision | null
  master: ProtocolRevision | null
  viewingLatest: boolean
  selectVersion: (version: string | null) => void
} {
  const [pref, setPref] = useState(readVersionPref)
  // 소유자 전용이 아니라 화면 권한으로 본다(R342). 읽기만 있어도 기준표는 보인다.
  const access = useScreenAccess("/protocol")
  const canView = access === "read" || access === "edit"
  const [state, setState] = useState<State>({ revisions: [], loading: false, error: "" })

  useEffect(() => {
    if (!canView) {
      setState({ revisions: [], loading: false, error: "" })
      return
    }
    setState((current) => ({ ...current, loading: true, error: "" }))
    return onSnapshot(collection(db, "protocolMatrix"), (snapshot) => {
      const revisions = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }) as ProtocolRevision)
        .sort((a, b) => b.revDate.localeCompare(a.revDate) || compareVersion(b.version, a.version) || a.id.localeCompare(b.id))
      setState({ revisions, loading: false, error: "" })
    }, () => setState({ revisions: [], loading: false, error: "기준표를 불러오지 못했습니다." }))
  }, [canView])

  const versions = state.revisions.filter((revision) => revision.kind === "master").sort((a, b) => compareVersion(b.version, a.version))
  const latest = versions[0] ?? null
  const master = versions.find((revision) => revision.version === pref) ?? latest
  const selectVersion = (version: string | null) => {
    const next = !version || version === latest?.version ? "" : version
    try { if (next) localStorage.setItem(VERSION_PREF_KEY, next); else localStorage.removeItem(VERSION_PREF_KEY) } catch { /* 저장 불가 브라우저는 이번 화면에서만 */ }
    setPref(next)
  }
  return { ...state, versions, latest, master, viewingLatest: !master || master.id === latest?.id, selectVersion }
}

/** 시험 방법 문자열에서 규격 코드 앞부분만 뽑아 분포를 센다. "AATCC 135 (3 cycles)" -> "AATCC 135" */
export function methodKey(method: string): string {
  const match = method.match(/(AATCC|ASTM|ISO|JIS|GB\/?T?|GB|CNS|FTTS)[\s/A-Z-]*?\s?[A-Z]?\d+(\.\d+)?/i)
  return (match ? match[0] : method.split(/[\n(]/)[0]).replace(/\s+/g, " ").trim().toUpperCase()
}

export function isNotApplicable(value: string): boolean {
  return /^(n\/?a|n\.a|-)?$/i.test(value.trim())
}
