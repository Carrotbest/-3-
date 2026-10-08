import { useEffect, useState } from "react"
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore"

import { useAuthStore } from "./auth"
import { db } from "./firebase"
import { categoryOf, displaySummaryOf, formatSize, titleOf, type ReferenceItem } from "./reference-schema"
import type { MaterialDetailRow, MaterialItem } from "./schema"

const COLLECTION = "referenceItems"

type ReferenceItemsState = {
  items: ReferenceItem[]
  loading: boolean
  error: string
}

function useReferenceSubscription(count?: number): ReferenceItemsState {
  const approval = useAuthStore((state) => state.approval)
  const isOwner = useAuthStore((state) => state.isOwner)
  const [state, setState] = useState<ReferenceItemsState>({ items: [], loading: false, error: "" })
  const approved = isOwner || approval === "approved"

  useEffect(() => {
    if (!approved) {
      setState({ items: [], loading: false, error: "" })
      return
    }

    setState((current) => ({ ...current, loading: true, error: "" }))
    const source = count === undefined
      ? collection(db, COLLECTION)
      : query(collection(db, COLLECTION), orderBy("modifiedAt", "desc"), limit(count))

    return onSnapshot(source, (snapshot) => {
      const items = snapshot.docs.map((document) => {
        const data = document.data()
        const item = { id: document.id, ...data } as ReferenceItem
        return { ...item, tags: Array.isArray(data.tags) ? data.tags : [] }
      })
      setState({ items, loading: false, error: "" })
    }, () => setState({ items: [], loading: false, error: "자료를 불러오지 못했습니다." }))
  }, [approved, count])

  return state
}

export function useReferenceItems(): ReferenceItemsState {
  return useReferenceSubscription()
}

export function useRecentReferences(count: number): ReferenceItemsState {
  return useReferenceSubscription(count)
}

export function referenceToMaterial(item: ReferenceItem): MaterialItem {
  const detail = [
    categoryOf(item.category)?.label ? { label: "카테고리", value: categoryOf(item.category)!.label } : null,
    item.format ? { label: "형식", value: item.format.toUpperCase() } : null,
    item.sizeBytes ? { label: "크기", value: formatSize(item.sizeBytes) } : null,
  ].filter((row): row is MaterialDetailRow => row !== null)

  return {
    id: item.id,
    kind: "STUDY",
    title: titleOf(item),
    summary: displaySummaryOf(item) || undefined,
    date: item.documentDate || item.modifiedAt.slice(0, 10),
    tags: item.tags,
    link: item.webUrl,
    owner: item.owner,
    source: "study",
    readOnly: true,
    detail,
  }
}
