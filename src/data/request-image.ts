// FABRIC REQUEST의 garment 사진과 FABRIC ANALYSIS의 의뢰·분석 사진 저장소.
// 원본·썸네일 두 벌을 올린다. 목록은 썸네일만 받아야 행마다 원본을 끌어오지 않는다.
// REQUEST는 원본도 1200px로 줄이고, ANALYSIS는 3MB 아래면 원본 그대로 올린다(아래 참조).
// 화학 첨부(attachments.ts)는 IndexedDB 로컬 저장이라 팀 공유가 안 된다. 여기는 Firebase Storage를 쓴다.
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"

import { appStorage } from "./firebase"

/** 원본. 긴 변 1200px */
const FULL_EDGE = 1200
const FULL_QUALITY = 0.82
/** 목록 썸네일. 긴 변 400px */
const THUMB_EDGE = 400
const THUMB_QUALITY = 0.75
/*
 * 분석 사진은 압축하지 않는다(2026-10-21 박향근 지시). 원본 바이트 그대로 올린다.
 * 예전에는 긴 변 900px, 품질 0.4까지 내려 150KB 안으로 쥐어짰다. 그 저장본이 의뢰서
 * 출력의 참고 사진으로 그대로 나가는데, 원단 조직처럼 결이 고운 부분이 뭉개졌다.
 *
 * 줄이는 경우는 하나뿐이다. `storage.rules`가 3MB 미만만 받으므로 그보다 큰 원본은
 * 올라가지 않는다. 그때만 3MB 아래로 내리고, 목표 용량을 더 낮게 잡지 않는다.
 * 규칙이 `< 3MB`라 딱 맞추면 경계에서 튕긴다. 2.8MB를 목표로 둔다.
 */
const ANALYSIS_FULL_LIMIT = Math.round(2.8 * 1024 * 1024)
const ANALYSIS_SHRINK_STEPS = [
  { edge: 2400, quality: 0.92 },
  { edge: 1800, quality: 0.86 },
  { edge: 1400, quality: 0.8 },
  { edge: 1100, quality: 0.7 },
] as const
/** 목록 썸네일은 그대로 줄인다. 행마다 받는 그림이라 원본을 쓰면 목록이 느려진다. */
const ANALYSIS_THUMB_EDGE = 240
const ANALYSIS_THUMB_QUALITY = 0.6
/** storage.rules의 상한과 같은 값이다. 함께 고친다. */
const MAX_SOURCE_SIZE = 3 * 1024 * 1024

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

/** 다운로드 URL 캐시. 목록이 같은 경로를 행마다 반복 호출한다. */
const urlCache = new Map<string, string>()

const fullPathOf = (reqId: string): string => `requests/${reqId}/full.webp`
const thumbPathOf = (reqId: string): string => `requests/${reqId}/thumb.webp`

/** 통과하면 null, 막히면 사용자에게 보일 문구를 돌려준다. */
export function validateRequestImage(file: File, maxSourceBytes = MAX_SOURCE_SIZE): string | null {
  if (!ALLOWED_TYPES.has(file.type.toLocaleLowerCase("en-US"))) return "JPG, PNG, WEBP 이미지만 첨부할 수 있습니다."
  if (file.size > maxSourceBytes) return `사진은 ${Math.round(maxSourceBytes / 1024 / 1024)}MB 이하여야 합니다.`
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
export async function uploadRequestImage(reqId: string, file: File, options?: { maxSourceBytes?: number; profile?: "request" | "analysis" }): Promise<{ imagePath: string; imageThumbPath: string }> {
  const invalid = validateRequestImage(file, options?.maxSourceBytes)
  if (invalid) throw new Error(invalid)

  const imagePath = fullPathOf(reqId)
  const imageThumbPath = thumbPathOf(reqId)
  const profile = options?.profile ?? "request"
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
        if (profile === "analysis") {
          // 3MB 아래면 손대지 않는다. 넘을 때만 그 아래로 내린다.
          if (file.size > ANALYSIS_FULL_LIMIT) {
            for (const step of ANALYSIS_SHRINK_STEPS) {
              full = (await drawToBlob(bitmap, step.edge, step.quality)) ?? file
              if (full.size <= ANALYSIS_FULL_LIMIT) break
            }
          }
          thumb = (await drawToBlob(bitmap, ANALYSIS_THUMB_EDGE, ANALYSIS_THUMB_QUALITY)) ?? file
        } else {
          full = (await drawToBlob(bitmap, FULL_EDGE, FULL_QUALITY)) ?? file
          thumb = (await drawToBlob(bitmap, THUMB_EDGE, THUMB_QUALITY)) ?? file
        }
      } finally {
        bitmap.close()
      }
    }
  }

  // storage.rules 가 3MB 미만만 받는다. 줄이기에 실패했거나 리사이즈가 없는 환경이면
  // 여기서 막는다. 그냥 보내면 서버가 거부하고 화면에는 원인 모를 실패만 남는다.
  if (full.size >= MAX_SOURCE_SIZE || thumb.size >= MAX_SOURCE_SIZE) {
    throw new Error("사진을 3MB 아래로 줄이지 못했습니다. 더 작은 사진을 올려 주세요.")
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

/** 엑셀에 박을 사진 한 장. exceljs는 webp를 모르므로 jpeg로 바꿔 넘긴다. */
export interface ExportImage {
  data: ArrayBuffer
  extension: "jpeg"
  width: number
  height: number
}

/** 내려받기 한 번 동안만 사진을 읽는다. 한 장 실패해도 나머지는 내보낸다(R371). */
export async function loadExportImages(
  entries: readonly { key: string; path: string }[],
): Promise<Map<string, ExportImage>> {
  const out = new Map<string, ExportImage>()
  const queue = [...entries]
  const worker = async () => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      try {
        const url = await requestImageUrl(item.path)
        if (!url) continue
        const response = await fetch(url)
        if (!response.ok) continue
        const blob = await response.blob()
        const converted = await toJpegForExcel(blob)
        if (converted) out.set(item.key, converted)
      } catch {
        // 한 장 실패가 내려받기를 막지 않는다.
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return out
}

/** webp/png를 jpeg로 바꾼다. 투명 부분은 흰색으로 채운다. */
async function toJpegForExcel(blob: Blob): Promise<ExportImage | null> {
  if (typeof createImageBitmap !== "function") return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  const width = bitmap.width
  const height = bitmap.height
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) { bitmap.close(); return null }
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/jpeg", 0.82))
  if (!jpeg) return null
  return { data: await jpeg.arrayBuffer(), extension: "jpeg", width, height }
}
