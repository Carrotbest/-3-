import { useEffect, useState } from "react"
import { collection, doc, onSnapshot, runTransaction, updateDoc } from "firebase/firestore"

import { useAuthStore } from "./auth"
import { db } from "./firebase"
import { type ProtocolChange, type ProtocolRevision } from "./protocol-matrix"

/**
 * 바이어 원문 매뉴얼에서 뽑은 변경 후보(R334). Firestore `protocolReview`, 소유자 전용.
 *
 * 흐름: 추출(지금은 Claude Code 세션이나 로컬 스크립트, 나중에 API 버튼) -> 이 컬렉션에 배치 1건
 *  -> 웹 검토 탭에서 칸마다 승인/거절 -> applyApprovedReviews()가 승인 칸만 모아 protocolMatrix 새 버전을 만든다.
 * 추출 경로가 바뀌어도 이 문서 형식은 그대로 둔다.
 */

export type ReviewDecision = "pending" | "approved" | "rejected"

export interface ReviewItem {
  id: string
  testId: string
  /** 조건 순번. 세탁 치수변화처럼 한 칸에 조건이 여러 개면 0부터 */
  variant: number
  field: "method" | "requirement"
  /** 추출 당시 기준 버전의 값 */
  current: string
  /** 원문에서 뽑은 값 */
  proposed: string
  /** 원문 쪽수(1부터)와 근거 문장 */
  page?: number
  quote?: string
  confidence: "high" | "medium" | "low"
  note?: string
  decision: ReviewDecision
  /** 승인할 때 사람이 고친 값. 있으면 proposed 대신 쓴다 */
  editedValue?: string
  decidedAt?: string
}

export interface ReviewBatch {
  id: string
  buyerId: string
  sourceFile: string
  /** 원문 문서의 개정일(문서에 적힌 날짜). 모르면 비움 */
  sourceDate?: string
  extractedAt: string
  /** claude-code | api | manual */
  extractedBy: string
  /** 추출 때 비교한 기준 버전 */
  baseVersion: string
  /** open 검토 중, applied 새 버전에 반영됨, dismissed 버림 */
  status: "open" | "applied" | "dismissed"
  appliedVersion?: string
  items: ReviewItem[]
}

export function useProtocolReviews() {
  const isOwner = useAuthStore((state) => state.isOwner)
  const [state, setState] = useState<{ batches: ReviewBatch[]; loading: boolean; error: string }>({ batches: [], loading: false, error: "" })

  useEffect(() => {
    if (!isOwner) {
      setState({ batches: [], loading: false, error: "" })
      return
    }
    setState((current) => ({ ...current, loading: true, error: "" }))
    return onSnapshot(collection(db, "protocolReview"), (snapshot) => {
      const batches = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }) as ReviewBatch)
        .sort((a, b) => b.extractedAt.localeCompare(a.extractedAt))
      setState({ batches, loading: false, error: "" })
    }, () => setState({ batches: [], loading: false, error: "검토 목록을 불러오지 못했습니다." }))
  }, [isOwner])

  return state
}

/** 최신 기준표에서 그 칸의 지금 값 */
export function liveValue(latest: ProtocolRevision | null, buyerId: string, item: Pick<ReviewItem, "testId" | "variant" | "field">): string {
  const test = latest?.tests?.find((candidate) => candidate.id === item.testId)
  return test?.cells[buyerId]?.[item.variant]?.[item.field] ?? ""
}

/** 추출 이후 기준표가 바뀌어 비교가 낡은 칸. 이런 칸은 승인할 수 없다(다시 추출하거나 거절) */
export function isStale(latest: ProtocolRevision | null, batch: ReviewBatch, item: ReviewItem): boolean {
  return liveValue(latest, batch.buyerId, item).trim() !== item.current.trim()
}

export async function setReviewDecision(batch: ReviewBatch, itemId: string, decision: ReviewDecision, editedValue?: string) {
  const items = batch.items.map((item) => item.id === itemId
    ? { ...item, decision, decidedAt: new Date().toISOString(), ...(editedValue !== undefined ? { editedValue } : {}) }
    : item)
  await updateDoc(doc(db, "protocolReview", batch.id), { items })
}

export async function dismissReviewBatch(batch: ReviewBatch) {
  await updateDoc(doc(db, "protocolReview", batch.id), { status: "dismissed" })
}

function nextVersion(version?: string): string {
  const [major = 1, minor = 0] = (version ?? "1.0").split(".").map(Number)
  return `${major}.${minor + 1}`
}

function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/**
 * 열린 배치들의 승인 칸을 모아 새 버전을 만든다. 한 트랜잭션에서
 *  1) 최신 버전 문서를 다시 읽어 아직 최신(current)인지 확인하고
 *  2) 칸의 지금 값이 추출 당시 값(current)과 다르면 그 칸은 건너뛰고(낡은 비교)
 *  3) 새 master 문서 ver-{next} 를 쓰고 이전 최신을 superseded 로 내리고
 *  4) 반영 칸이 있었던 배치를 applied 로 닫는다.
 * 반영할 칸이 없으면 null.
 */
export async function applyApprovedReviews(latestId: string, batchIds: string[], label: string): Promise<{ version: string; applied: number; skipped: number } | null> {
  return runTransaction(db, async (transaction) => {
    const latestRef = doc(db, "protocolMatrix", latestId)
    const latestSnapshot = await transaction.get(latestRef)
    if (!latestSnapshot.exists()) throw new Error("최신 기준표를 찾지 못했습니다.")
    const latest = { id: latestSnapshot.id, ...latestSnapshot.data() } as ProtocolRevision
    if (latest.status !== "current") throw new Error("그사이 기준표가 새 버전으로 바뀌었습니다. 화면을 새로 고친 뒤 다시 반영하십시오.")

    const batches = (await Promise.all(batchIds.map((id) => transaction.get(doc(db, "protocolReview", id)))))
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as ReviewBatch)
      .filter((batch) => batch.status === "open")

    const tests = structuredClone(latest.tests ?? [])
    const changes: ProtocolChange[] = []
    const touched = new Set<string>()
    let skipped = 0
    batches.forEach((batch) => {
      batch.items.filter((item) => item.decision === "approved").forEach((item) => {
        const test = tests.find((candidate) => candidate.id === item.testId)
        if (!test) { skipped += 1; return }
        const cells = test.cells[batch.buyerId] ?? (test.cells[batch.buyerId] = [])
        while (cells.length <= item.variant) cells.push({ method: "", requirement: "" })
        const before = cells[item.variant][item.field]
        if (before.trim() !== item.current.trim()) { skipped += 1; return }
        const value = item.editedValue ?? item.proposed
        cells[item.variant][item.field] = value
        changes.push({ testId: item.testId, buyerId: batch.buyerId, variant: item.variant, field: item.field, base: before, value, fromRev: batch.id })
        touched.add(batch.id)
      })
    })
    if (!changes.length) return null

    const version = nextVersion(latest.version)
    const { id: _ignored, ...fields } = latest
    void _ignored
    transaction.set(doc(db, "protocolMatrix", `ver-${version}`), {
      ...fields,
      version,
      revDate: today(),
      label,
      status: "current",
      sourceFile: `Ver. ${latest.version} + 원문 매뉴얼 검토 반영`,
      tests,
      changes,
    })
    transaction.update(latestRef, { status: "superseded" })
    batches.filter((batch) => touched.has(batch.id)).forEach((batch) => {
      transaction.update(doc(db, "protocolReview", batch.id), { status: "applied", appliedVersion: version })
    })
    return { version, applied: changes.length, skipped }
  })
}
