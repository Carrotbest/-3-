// FABRIC REQUEST의 garment 사진 전용 저장소.
// 원본을 그대로 올리면 목록 로딩이 느려지므로 원본·썸네일 두 벌로 줄여 올린다.
// 화학 첨부(attachments.ts)는 IndexedDB 로컬 저장이라 팀 공유가 안 된다. 여기는 Firebase Storage를 쓴다.
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"

import { appStorage } from "./firebase"

/** 원본. 긴 변 1200px */
const FULL_EDGE = 1200
const FULL_QUALITY = 0.82
/** 목록 썸네일. 긴 변 400px */
const THUMB_EDGE = 400
const THUMB_QUALITY = 0.75
/** storage.rules의 상한과 같은 값이다. 함께 고친다. */
const MAX_SOURCE_SIZE = 3 * 1024 * 1024

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

/** 다운로드 URL 캐시. 목록이 같은 경로를 행마다 반복 호출한다. */
const urlCache = new Map<string, string>()

const fullPathOf = (reqId: string): string => `requests/${reqId}/full.webp`
const thumbPathOf = (reqId: string): string => `requests/${reqId}/thumb.webp`

/** 통과하면 null, 막히면 사용자에게 보일 문구를 돌려준다. */
export function validateRequestImage(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type.toLocaleLowerCase("en-US"))) return "JPG, PNG, WEBP 이미지만 첨부할 수 있습니다."
  if (file.size > MAX_SOURCE_SIZE) return "사진은 3MB 이하여야 합니다."
  return null
}

/** 비율을 유지한 축소 크기. 긴 변이 목표보다 작으면 확대하지 않는다. */
function scaledSize(width: number, height: number, edge: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= edge) return { width, height }
  const ratio = edge / longest
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

/** OffscreenCanvas가 없으면 일반 canvas로 떨어진다. 어느 쪽도 안 되면 null. */
async function drawToBlob(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob | null> {
  const size = scaledSize(bitmap.width, bitmap.height, edge)
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(size.width, size.height)
      const context = canvas.getContext("2d")
      if (!context) return null
      context.drawImage(bitmap, 0, 0, size.width, size.height)
      return await canvas.convertToBlob({ type: "image/webp", quality })
    } catch {
      return null
    }
  }
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext("2d")
  if (!context) return null
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", quality)
  })
}

/** 리사이즈 후 원본·썸네일을 올리고 레코드에 저장할 경로 두 개를 돌려준다. */
export async function uploadRequestImage(reqId: string, file: File): Promise<{ imagePath: string; imageThumbPath: string }> {
  const invalid = validateRequestImage(file)
  if (invalid) throw new Error(invalid)

  const imagePath = fullPathOf(reqId)
  const imageThumbPath = thumbPathOf(reqId)
  // 리사이즈가 불가능한 환경에서는 원본을 그대로 올린다. 사진이 빠지는 것보다 낫다.
  let full: Blob = file
  let thumb: Blob = file

  if (typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      bitmap = null
    }
    if (bitmap) {
      try {
        full = (await drawToBlob(bitmap, FULL_EDGE, FULL_QUALITY)) ?? file
        thumb = (await drawToBlob(bitmap, THUMB_EDGE, THUMB_QUALITY)) ?? file
      } finally {
        bitmap.close()
      }
    }
  }

  await uploadBytes(ref(appStorage(), imagePath), full, { contentType: full.type || file.type })
  await uploadBytes(ref(appStorage(), imageThumbPath), thumb, { contentType: thumb.type || file.type })
  // 스타일당 사진 1장이라 같은 경로에 덮어쓴다. 낡은 URL을 버린다.
  urlCache.delete(imagePath)
  urlCache.delete(imageThumbPath)
  return { imagePath, imageThumbPath }
}

/** Storage 경로를 화면에서 쓸 다운로드 URL로 바꾼다. 없거나 권한이 없으면 null. */
export async function requestImageUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path)
  if (cached) return cached
  try {
    const url = await getDownloadURL(ref(appStorage(), path))
    urlCache.set(path, url)
    return url
  } catch {
    return null
  }
}

/** 스타일 삭제 시 원본·썸네일을 함께 지운다. 없는 파일은 조용히 넘어간다. */
export async function deleteRequestImage(reqId: string): Promise<void> {
  for (const path of [fullPathOf(reqId), thumbPathOf(reqId)]) {
    urlCache.delete(path)
    try {
      await deleteObject(ref(appStorage(), path))
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "storage/object-not-found") throw error
    }
  }
}
