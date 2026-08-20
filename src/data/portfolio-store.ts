import {
  deleteAttachment, getAttachmentUrl, putAttachment,
} from "./attachments"
import { loadCache, saveCache } from "./cache"
import type { ChemicalAttachment, ChemicalItem } from "./chemical"

export interface PortfolioStore {
  listManual(): Promise<ChemicalItem[]>
  saveManual(item: ChemicalItem): Promise<void>
  deleteManual(id: string): Promise<void>
  putAttachment(file: File): Promise<ChemicalAttachment>
  getAttachmentUrl(id: string): Promise<string | null>
  deleteAttachment(id: string): Promise<void>
  subscribe(listener: (items: ChemicalItem[]) => void): () => void
}

export { MAX_ATTACHMENTS_PER_ITEM, MAX_ATTACHMENT_SIZE, validateAttachment } from "./attachments"

export function createLocalPortfolioStore(): PortfolioStore {
  const listeners = new Set<(items: ChemicalItem[]) => void>()
  let writeQueue: Promise<void> = Promise.resolve()

  const listManual = async (): Promise<ChemicalItem[]> => {
    const items = await loadCache("chemicalManual")
    return Array.isArray(items) ? items.filter((item) => item.source === "web") : []
  }
  const notify = (items: ChemicalItem[]) => listeners.forEach((listener) => listener(items))
  const enqueue = (work: () => Promise<ChemicalItem[]>): Promise<void> => {
    const operation = writeQueue.then(async () => notify(await work()))
    writeQueue = operation.catch(() => undefined)
    return operation
  }

  return {
    listManual,
    saveManual: (item) => enqueue(async () => {
      const current = await listManual()
      const next = [item, ...current.filter((entry) => entry.id !== item.id)]
      await saveCache("chemicalManual", next)
      return next
    }),
    deleteManual: (id) => enqueue(async () => {
      const next = (await listManual()).filter((item) => item.id !== id)
      await saveCache("chemicalManual", next)
      return next
    }),
    putAttachment,
    getAttachmentUrl,
    deleteAttachment,
    subscribe: (listener) => {
      let active = true
      listeners.add(listener)
      void listManual().then((items) => { if (active) listener(items) }).catch(() => { if (active) listener([]) })
      return () => {
        active = false
        listeners.delete(listener)
      }
    },
  }
}

export const portfolioStore: PortfolioStore = createLocalPortfolioStore()
