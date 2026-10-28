# R361 — 분석 사진을 그대로 쓴다

**상태: 미착수.** R352~R360은 구현과 빌드를 마쳤다.

## 무엇이 잘못됐나

2026-10-28에 박향근이 분석에서 넘겨 온 스타일의 사진 칸이 전부 비어 있는 것을 확인했다. R352가 사진을 **바이트째 복사**하게 만들었는데 그 복사가 돌지 않는다.

지금 `copyAnalysisPhotos`는 이렇게 한다.

```
getDownloadURL → fetch(url) → blob → File → uploadRequestImage
```

**이 저장소에서 Storage 다운로드 URL을 `fetch`하는 곳은 여기 하나뿐이다.** 나머지 호출처(분석 상세, 인쇄 덱, 의뢰 표, 분석 의뢰 창)는 전부 `<img src>`로 쓴다. `<img>`는 CORS가 없어도 뜨지만 `fetch`는 버킷에 CORS 설정이 있어야 한다. 저장소에 `cors.json`이 없고 설정한 기록도 없다. 복사가 거기서 막혔을 가능성이 가장 크다.

**복사를 고치려면 버킷에 CORS를 걸어야 하는데 그것은 외부 자격증명이 필요한 작업이다.** 그리고 성공해도 같은 사진을 두 벌 저장하게 된다.

## 어떻게 바꾸나

**복사하지 않고 분석 사진 경로를 그대로 가리킨다.** 박향근의 말 그대로 "분석에 있는 사진을 그대로" 쓰는 것이다. 즉시 뜨고, CORS가 필요 없고, 다시 압축하지 않아 분석 원본 화질 그대로 보인다.

### 지워도 안전한 이유

의뢰 화면의 사진 삭제는 **경로가 아니라 `reqId`로 지운다.**

```ts
// request-image.ts
const fullPathOf = (reqId: string) => `requests/${reqId}/full.webp`
export async function deleteRequestImage(reqId: string)   // requests/{reqId}/... 만 지운다
```

분석 사진은 `requests/analysis-{분석id}/full.webp`에 있다. 의뢰 쪽에서 `deleteRequestImage(style.reqId)`를 불러도 **그 경로는 건드리지 않는다.** 없는 파일이라 조용히 넘어간다.

그래서 `removeImage`와 스타일 삭제(`removeStyles`)는 **고칠 것이 없다.** 손대지 마라. 지금 그대로가 맞다.

사람이 의뢰 화면에서 사진을 새로 올리면 `requests/{reqId}/...`에 쓰이고 경로가 그쪽으로 바뀐다. 분석 원본은 그대로 남는다.

## 1. 빌려 쓰는 사진임을 표시한다

`src/data/schema.ts`의 `RequestStyle`에 더한다. `analysisAnNo` 아래가 좋다.

```ts
  /**
   * 사진이 분석 건에서 빌려 온 것인가(R361). 경로가 `requests/analysis-{분석id}/...`를 가리킨다.
   * 의뢰 화면에서 사진을 새로 올리면 이 값을 뗀다. 삭제는 `reqId` 기준이라 이 값과 무관하다.
   */
  imageFrom?: "analysis"
```

## 2. 넘길 때 경로를 물려준다

`src/data/analysis-to-request.ts`의 `buildRequestStyleFromAnalysis`다. 지금은 사진을 넣지 않는다는 긴 주석과 함께 비워 두었다. **그 주석을 지우고** 아래로 바꾼다.

```ts
    /*
     * 사진은 분석 경로를 그대로 가리킨다(R361). 바이트를 복사하지 않는다.
     * 복사는 Storage 다운로드 URL을 `fetch`해야 하는데 이 버킷에는 CORS 설정이 없다.
     * 삭제는 `reqId` 기준(`requests/{reqId}/...`)이라 의뢰 쪽에서 지워도 분석 원본은 멀쩡하다.
     * Firestore는 값이 undefined인 키를 싫어하므로 사진이 있을 때만 키를 만든다.
     */
    ...(item.imagePath ? { imagePath: item.imagePath, imageFrom: "analysis" as const } : {}),
    ...(item.imageThumbPath ? { imageThumbPath: item.imageThumbPath } : {}),
```

**`resultImages`(분석 결과 사진)는 가져오지 마라**(2026-10-28 박향근 확정). 의뢰서에 필요한 것은 의류 사진 한 장이다.

## 3. 복사 코드를 걷어낸다

`src/routes/FabricRequest.tsx`.

- `copyAnalysisPhotos` 함수를 통째로 지운다.
- `importFromAnalysis` 끝의 `await copyAnalysisPhotos(pairs)` 한 줄을 지운다.
- 그 줄이 사라지면 `pairs`의 `analysis` 쪽은 `linkById`를 만드는 데만 쓰인다. 구조는 그대로 둬도 된다. 억지로 줄이지 마라.
- 이 파일에서 더 쓰이지 않게 되는 import만 지운다. **세고 나서 지워라.** `requestImageUrl`은 293행에서, `uploadRequestImage`와 `validateRequestImage`는 사진 칸에서 아직 쓴다. `AnalysisRequest` 타입도 아직 쓴다.
- `analysisBusy` 상태는 그대로 둔다. 저장 중에 버튼을 막는 값이다.

## 4. 사진을 새로 올리면 표시를 뗀다

같은 파일, `ImageCell`에 넘기는 콜백이다(1809행 근처).

```tsx
onUploaded={(paths) => patchStyle(style.reqId, paths)}
```

```tsx
onUploaded={(paths) => patchStyle(style.reqId, { ...paths, imageFrom: undefined })}
```

`requests`는 `state/{key}` 청크에 `JSON.stringify`로 저장되므로 값이 `undefined`인 키는 저장 전에 사라진다. 이 자리에서는 안전하다. **별도 컬렉션(`costSheets`, `auditLog`, `referenceItems`, `presence`)에 쓸 때는 그렇지 않다. 그쪽에 같은 수법을 쓰지 마라.**

## 5. 안내 문구를 고친다

`src/components/request/AnalysisImportDialog.tsx`의 사진 안내다.

```tsx
<p className="mt-2 text-[11px] text-[var(--muted-foreground)]">사진 {withPhoto}건은 스타일을 만든 뒤 의뢰 규격으로 다시 올립니다. 분석 쪽 원본은 그대로 남습니다.</p>
```

```tsx
<p className="mt-2 text-[11px] text-[var(--muted-foreground)]">사진 {withPhoto}건은 분석 사진을 그대로 씁니다. 의뢰 화면에서 따로 올리면 그 사진으로 바뀝니다.</p>
```

## 하지 말 것

- **`removeImage`와 `removeStyles`를 고치지 마라.** 삭제는 `reqId` 기준이라 분석 원본에 닿지 않는다. "안전하게 만든다"며 조건을 더하면 사람이 올린 사진이 안 지워진다.
- `resultImages`를 가져오지 마라.
- `request-image.ts`의 경로 규칙과 압축 프로필을 고치지 마라. 분석 사진을 압축하지 않는 것은 2026-10-21 확정이다.
- 분석 화면에서 사진을 지우면 의뢰 쪽 칸이 빈다. **그것을 막으려고 복사를 되살리지 마라.** 같은 사진 한 장을 두 화면이 보는 것이 이번 결정이다.
- 버킷 CORS를 설정하는 명령을 돌리지 마라. 외부 자격증명이 필요하다.
- 엑셀 양식에 사진 열을 만들지 마라.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라. 빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

고칠 파일은 넷이다. `src/data/schema.ts`, `src/data/analysis-to-request.ts`, `src/routes/FabricRequest.tsx`, `src/components/request/AnalysisImportDialog.tsx`.

화면 확인은 박향근이 한다. 분석 완료 건을 의뢰로 넘겨 사진이 바로 보이는지, 의뢰 쪽에서 사진을 지워도 분석 화면 사진이 멀쩡한지 본다.
