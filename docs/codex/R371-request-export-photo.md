# R371 — 의뢰 양식에 사진을 넣고 단계 열을 뺀다

상태: **구현 완료, 화면 실물 확인 미완.** 2026-10-29 박향근 확정.
빌드 통과(`npm run build`). 받은 엑셀에 사진이 실제로 박혀 나오는지는 사람이 열어 봐야 한다.

둘이다. 내려받는 엑셀에 garment 사진을 셀에 붙여 넣고, 기본 묶음의 `단계` 열을 없앤다.

## 먼저 알아 둘 것

**워킹트리에 R369 미커밋 변경이 있다**(`src/data/schema.ts`, `src/data/dd-schedule.ts`,
`src/routes/DevelopmentMasterSheet.tsx`). **열지도 고치지도 되돌리지도 마라.** 다른 작업 건이다.

### 깨진 가설 하나를 먼저 정정한다

`CLAUDE.md`와 R361에 **"이 버킷에 CORS 설정이 없어 Storage URL을 `fetch` 할 수 없다"**
고 적혀 있다. **그 전제는 틀렸다.** 2026-10-29에 실제로 확인했다.

```
GET  https://firebasestorage.googleapis.com/v0/b/fabric-rnd-20a6b.firebasestorage.app/o/...
     Origin: https://carrotbest.github.io
  → HTTP 403 (토큰 없이 쐈으니 당연하다)
     Access-Control-Allow-Origin: *

OPTIONS 같은 URL, Access-Control-Request-Method: GET
  → HTTP 200
     Access-Control-Allow-Origin: *
     Access-Control-Allow-Methods: POST, GET, HEAD, DELETE, PATCH
```

`getDownloadURL`이 주는 주소가 바로 이 `firebasestorage.googleapis.com` 엔드포인트이고
거기에는 `Access-Control-Allow-Origin: *`가 붙어 나온다. 버킷 CORS 설정이 필요한 쪽은
`storage.googleapis.com` 직접 접근이지 이쪽이 아니다.

**그렇다고 R361 결정을 뒤집지 마라.** 분석 사진을 의뢰로 **복사하지 않고 경로를 가리키는**
방식은 그대로 둔다. 여기서 쓰는 것은 내려받기 한 번 동안 메모리로 읽어 오는 것뿐이고
Storage에 새 파일을 만들지 않는다.

**다만 실패를 전제로 짜라.** 권한 만료, 파일 없음, 네트워크 끊김은 언제든 난다.
사진 한 장을 못 받으면 **그 장만 건너뛰고 나머지는 그대로 내보낸다.** 내려받기 전체를
실패시키지 마라.

---

## 1. 사진 바이트를 읽어 오는 도우미 (`src/data/request-image.ts`)

파일 맨 아래에 더한다. Storage와 canvas를 이미 들고 있는 파일이라 여기가 제자리다.

```ts
/** 엑셀에 박을 사진 한 장. exceljs는 webp를 모르므로 jpeg로 바꿔 넘긴다. */
export interface ExportImage {
  data: ArrayBuffer
  extension: "jpeg"
  width: number
  height: number
}

/**
 * 내려받기 한 번 동안만 쓰는 사진 바이트를 읽는다(R371).
 *
 * `getDownloadURL`이 주는 주소는 `firebasestorage.googleapis.com`이고
 * `Access-Control-Allow-Origin: *`가 붙어 나온다. 2026-10-29 확인했다.
 * CLAUDE.md의 "CORS 없음" 문장은 `storage.googleapis.com` 직접 접근 이야기다.
 *
 * 한 장이라도 실패하면 그 장만 건너뛴다. 지도에 없는 스타일은 사진 없이 나간다.
 */
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
  // 네 줄까지만 동시에 받는다. 더 늘리면 스타일이 많은 보드에서 브라우저가 묶인다.
  await Promise.all(Array.from({ length: 4 }, worker))
  return out
}

/** webp/png를 jpeg 바이트로 바꾼다. 흰 바탕을 깔아야 투명 부분이 검게 나오지 않는다. */
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
```

**`OffscreenCanvas`로 바꾸지 마라.** 이 파일 위쪽 압축 함수가 쓰는 것과 달리 여기는
`toBlob`의 jpeg 경로가 필요하고, 섞어 두면 분기가 둘이 된다. 성능 문제가 아니다.

---

## 2. 양식에 사진 열을 더하고 단계 열을 뺀다 (`src/data/request-template.ts`)

### 2-1. `TemplateColumn`에 플래그 하나 (22~43행 인터페이스)

```ts
  /** 내려받기 전용 열. 값이 셀에 들어가지 않는다. 사진이 그렇다(R371). */
  exportOnly?: boolean
```

### 2-2. `TEMPLATE_COLUMNS` (49~74행)

- **`단계` 줄을 지운다.** 지울 줄은 이것 하나다.
  ```ts
  { band: "기본", head: "단계", width: 7, scope: "style", key: "stage", derivable: true },
  ```
- **`Garment Number` 줄 바로 앞에 사진 줄을 넣는다.** 밴드는 `ORIGINAL`이다.
  그래야 Garment Number 바로 왼쪽에 서고 화면 차례와 같아진다.
  ```ts
  { band: "ORIGINAL", head: "사진", width: 13, scope: "style", key: "image", optional: true, exportOnly: true, screenWidth: 88 },
  ```

`optional: true`가 없으면 이 열이 없는 **옛 양식 파일 업로드가 통째로 막힌다.**
파서가 "양식이 다릅니다"로 throw 한다.

### 2-3. `cellOf` (102행~)

`case "image"`를 더할 필요 없다. 아래 2-4에서 `exportOnly` 열은 셀 쓰기를 건너뛴다.

### 2-4. 행 쓰기 (191~220행 루프)

`columns.forEach` 안, `if (column.scope === "style" && offset > 0)` **앞에** 한 줄 넣는다.

```ts
        if (column.exportOnly) { /* 그림 레이어에만 그린다. 셀은 비워 둔다. */ }
        else if (column.scope === "style" && offset > 0) cell.value = null
```

테두리와 글꼴은 그대로 먹인다. 빈 칸에도 테두리가 있어야 표가 이어 보인다.

### 2-5. 사진을 셀에 박는다

`RequestWorkbookOptions`에 더한다.

```ts
  /** 스타일 `reqId` → 사진. 넘기지 않으면 사진 없이 만든다(R371). */
  images?: ReadonlyMap<string, { data: ArrayBuffer; extension: "jpeg"; width: number; height: number }>
```

루프 안에서 `endRow`를 구한 **뒤**, `mergeCells` 처리와 나란히 둔다.

```ts
    const picture = options.images?.get(style.reqId)
    const imageCol = columnIndex(columns, "image")
    if (picture && imageCol >= 0) {
      const imageId = workbook.addImage({ buffer: picture.data as ArrayBuffer, extension: picture.extension })
      // 칸 안쪽에 맞춰 줄인다. 엑셀 기본 행 높이는 20px, 열 폭 1은 7px이다.
      const boxW = widthOf(columns[imageCol]) * 7 - 8
      const boxH = (endRow - startRow + 1) * 20 - 8
      const scale = Math.min(boxW / picture.width, boxH / picture.height, 1)
      ws.addImage(imageId, {
        tl: { col: imageCol + 0.08, row: startRow - 1 + 0.08 },
        ext: { width: Math.round(picture.width * scale), height: Math.round(picture.height * scale) },
        editAs: "oneCell",
      })
    }
```

- **`editAs: "oneCell"`을 빼지 마라.** 빠지면 기본값 `twoCell`이라 행 높이를 바꿀 때
  사진이 같이 늘어나 찌그러진다. `absolute`는 반대로 행을 밀어도 사진이 제자리에 남아
  엉뚱한 줄 옆에 붙는다. 박향근 요구는 "셀에 귀속, 행이 움직여도 그대로"다.
- **`tl.row`는 0부터 센다.** `startRow`는 1부터 세는 엑셀 행 번호라 1을 뺀다.
  여기를 틀리면 사진이 한 줄씩 아래로 밀린다.
- `addImage`는 `workbook`에, `addImage`는 `ws`에. 이름이 같고 대상이 다르다.

### 2-6. 파서 (330~345행 머리글 훑기, 383행 스타일 생성)

- `stage` 열이 없어졌으므로 `stage: asText(at(row, "stage")) === "개발" ? "개발" : "분석"`은
  **늘 `"분석"`이 된다.** 줄을 지우지 말고 그대로 `stage: "분석",` 로 바꿔 적는다.
  스타일 객체에 `stage`는 있어야 한다(필수 필드다).
- `RequestParseResult.derivedColumns` 주석 "지금은 seq, chart, stage 셋이다"를
  "지금은 seq와 chart 둘이다"로 고친다.
- `exportOnly` 열은 머리글 훑기에서 값으로 읽지 않는다. `optional: true`라
  없으면 건너뛰고, 있어도 `at(row, "image")`를 아무도 부르지 않으니 그대로 둬도 된다.

### 2-7. 단계를 웹 전용 값으로 만든다 (`mergeRequestStyles` 469~479행)

양식에서 빠졌으니 재업로드가 기존 값을 덮으면 안 된다. `result`·`resultAt` 바로 아래에
한 줄 더한다.

```ts
      // 단계는 R371에서 양식에서 뺐다. 물려받지 않으면 재업로드마다 전부 "분석"으로 돌아간다.
      stage: previous.stage,
```

**이 줄을 빼면 이미 "개발"로 올라간 스타일이 재업로드 한 번에 전부 "분석"이 된다.**

### 2-8. 작성 안내 시트 (224~250행 `lines` 배열)

- `"3. 단계는 분석 또는 개발만 씁니다. 비우면 분석으로 들어갑니다."` 줄을 지우고
  **그 아래 번호를 하나씩 당긴다**(4~8 → 3~7).
- 맨 뒤에 한 줄 더한다.
  ```
  "9. 사진과 결과 칸은 보기 전용입니다. 이 파일에서 고쳐도 웹에 올라가지 않습니다.",
  ```
  번호는 당긴 뒤의 마지막 번호 +1로 맞춘다.

---

## 3. 부르는 쪽 둘 (`FabricRequest.tsx`, `FabricAnalysis.tsx`)

### 3-1. `src/routes/FabricRequest.tsx` `downloadTemplate` (1851행 근처)

```ts
  const downloadTemplate = async () => {
    setNotice(null)
    try {
      const images = await loadExportImages(visible
        .filter((style) => style.imageThumbPath || style.imagePath)
        .map((style) => ({ key: style.reqId, path: (style.imageThumbPath ?? style.imagePath) as string })))
      downloadBlob(await buildRequestWorkbook(visible, { minOptionRows: 4, mergeStyleCells: true, matchScreenWidths: true, images }), requestTemplateFileName())
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "양식을 만들지 못했습니다." })
    }
  }
```

**원본(`imagePath`)이 아니라 썸네일(`imageThumbPath`)을 먼저 쓴다.** 원본은 1200px이라
스타일 50건이면 파일이 수십 MB가 된다. 썸네일은 400px이고 칸 안에서 충분하다.

`loadExportImages`를 `@/data/request-image`에서 가져온다.

보관함 내려받기(`downloadArchive`, 2052행 근처)도 같은 방식으로 사진을 넘긴다.

### 3-2. `src/routes/FabricAnalysis.tsx` `downloadRequestChart` (315행 근처)

`styles`를 만든 뒤 같은 식으로 `images`를 모아 `buildRequestWorkbook`에 넘긴다.
나머지 인자(`dropBasicBand`, `minOptionRows: 4`, `mergeStyleCells`, `matchScreenWidths`)는
그대로 둔다.

분석 스타일의 사진 경로는 `requests/analysis-{분석id}/...`를 그대로 가리키고 있다(R361).
경로만 넘기면 되고 그쪽을 손댈 일은 없다.

---

## 하지 말 것

- **R369 미커밋 파일 셋을 건드리지 마라.**
- **`optional: true` 없이 사진 열을 넣지 마라.** 옛 양식 업로드가 throw 한다.
- **`stage: previous.stage`를 빼지 마라.** 재업로드가 단계를 전부 "분석"으로 민다.
- **`editAs: "oneCell"`을 빼거나 `absolute`로 바꾸지 마라.**
- **원본 사진(`imagePath`)을 먼저 쓰지 마라.** 파일이 수십 MB가 된다.
- **사진 한 장 실패로 내려받기 전체를 실패시키지 마라.**
- **Storage에 새 파일을 만들거나 복사하지 마라.** 읽기만 한다. R361 결정은 그대로다.
- `exceljs`에 webp를 그대로 넘기지 마라. jpeg로 바꿔 넘긴다.
- 화면(`FabricRequest.tsx`의 `COLUMN_GROUPS`)의 단계 필터나 열을 건드리지 마라.
  이번 변경은 엑셀 양식 쪽뿐이다.
- 새 npm 의존성을 추가하지 마라.
- 커밋하거나 푸시하지 마라.

## 검증

```
npm run build
```

성공 기준.
- 빌드 통과.
- `git status --short`에 R369 파일 셋과 이번 파일 넷(`src/data/request-image.ts`,
  `src/data/request-template.ts`, `src/routes/FabricRequest.tsx`,
  `src/routes/FabricAnalysis.tsx`), 그리고 이 문서만 뜬다.
