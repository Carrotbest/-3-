import type { ChemicalAttachment } from "./chemical"
import { ATTACHMENT_STORE_NAME, openCacheDatabase, transactionDone } from "./cache"

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_ITEM = 6

const attachmentType = (file: File): { type: string; kind: ChemicalAttachment["kind"] } | null => {
  const mime = file.type.toLocaleLowerCase("en-US")
  if (mime === "image/jpeg" || mime === "image/jpg") return { type: "image/jpeg", kind: "image" }
  if (mime === "image/png") return { type: mime, kind: "image" }
  if (mime === "image/webp") return { type: mime, kind: "image" }
  if (mime === "application/pdf") return { type: mime, kind: "pdf" }
  return null
}

export function validateAttachment(file: File): string | null {
  if (!attachmentType(file)) return "JPG, PNG, WEBP 이미지 또는 PDF 파일만 첨부할 수 있습니다."
  if (file.size > MAX_ATTACHMENT_SIZE) return "첨부 파일은 하나당 10MB 이하여야 합니다."
  return null
}

export async function putAttachment(file: File): Promise<ChemicalAttachment> {
  const validation = validateAttachment(file)
  if (validation) throw new Error(validation)
  const resolved = attachmentType(file)
  if (!resolved) throw new Error("지원하지 않는 첨부 형식입니다.")
  const attachment: ChemicalAttachment = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    type: resolved.type,
    size: file.size,
    kind: resolved.kind,
    addedAt: new Date().toISOString(),
  }
  const database = await openCacheDatabase()
  try {
    const transaction = database.transaction(ATTACHMENT_STORE_NAME, "readwrite")
    transaction.objectStore(ATTACHMENT_STORE_NAME).put(file, attachment.id)
    await transactionDone(transaction)
    return attachment
  } finally {
    database.close()
  }
}

export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  const database = await openCacheDatabase()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = database.transaction(ATTACHMENT_STORE_NAME, "readonly").objectStore(ATTACHMENT_STORE_NAME).get(id)
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
      request.onerror = () => reject(request.error ?? new Error("첨부 파일을 읽을 수 없습니다."))
    })
  } finally {
    database.close()
  }
}

export async function getAttachmentUrl(id: string): Promise<string | null> {
  const blob = await getAttachmentBlob(id)
  return blob ? URL.createObjectURL(blob) : null
}

export async function deleteAttachment(id: string): Promise<void> {
  const database = await openCacheDatabase()
  try {
    const transaction = database.transaction(ATTACHMENT_STORE_NAME, "readwrite")
    transaction.objectStore(ATTACHMENT_STORE_NAME).delete(id)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}
