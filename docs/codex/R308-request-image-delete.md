# R308 — FABRIC REQUEST 사진 칸에 삭제 버튼

상태: 미착수.

대상 파일은 `src/routes/FabricRequest.tsx` 하나다. 다른 파일은 열지 않는다.

**R305, R306, R307을 적용한 워킹트리 위에서 한다.** 커밋 전 변경이 `FabricRequest.tsx`와
`DevelopmentMasterSheet.tsx`에 있다. **되돌리지 마라.**

## 왜

R306으로 사진을 끌어다 놓을 수 있게 되면서 잘못 놓기도 쉬워졌다. 지금은 사진을 지우는 길이
없다. "교체"로 다른 사진을 덮는 것뿐이다. 사진 칸에 마우스를 올렸을 때만 보이는 삭제 버튼을
단다.

같은 저장소에 쓸 조각이 이미 다 있다.

- `deleteRequestImage`는 44행에서 이미 들여온다. 922행 근처 `remove`가 스타일을 지울 때 쓴다.
- 기록에서 사진 경로를 떼는 방법은 `imagePath: undefined`, `imageThumbPath: undefined`다.
  `src/components/analysis/AnalysisDetailDialog.tsx` 124행이 같은 저장 경로에서 그렇게 한다.
  **그 파일을 열지 마라.** 필요한 건 이 한 줄이 전부다.
- 확인 창은 `askConfirm`(805행)이다. 옵션 삭제와 스타일 삭제가 쓰는 그것이다.
- `Trash2` 아이콘은 13행에서 이미 들여온다.

## 틀렸던 가설

없다. 위 사실은 코드에서 확인했다. 다시 조사하지 말고 바로 고쳐라.

## 지금 코드

**275~282행**
```ts
interface ImageCellProps {
  style: RequestStyle
  readOnly: boolean
  onUploaded: (paths: { imagePath: string; imageThumbPath: string }) => void
  onOpen: () => void
}

function ImageCell({ style, readOnly, onUploaded, onOpen }: ImageCellProps) {
```

**338~345행** — R306이 만든 바깥 `div`
```tsx
    <div
      onDragOver={dragOver}
      onDragEnter={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
      className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded ${dropping ? "outline outline-2 outline-[var(--primary)] -outline-offset-2 bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" : ""}`}
    >
```

**358~360행** — 썸네일 분기의 시작
```tsx
      ) : thumbUrl ? (
        <>
          <button type="button" className="min-h-0 flex-1" title="크게 보기" onClick={onOpen}>
```

**917~927행** — `remove`. 새 함수를 이 아래에 둔다.
```ts
  const remove = (style: RequestStyle, anchor: { x: number; y: number }) => {
    setRowMenu(null)
    askConfirm(anchor, `${style.garmentNo || "이 의뢰"} 건을 삭제할까요?\n옵션 ${style.options.length}건이 함께 지워집니다.`, () => {
      commitRequests(requests.filter((item) => item.reqId !== style.reqId))
      // 사진은 없으면 조용히 넘어간다. 실패해도 원장 삭제는 그대로 둔다.
      void deleteRequestImage(style.reqId).catch(() => undefined)
    }, { confirmLabel: "삭제", danger: true })
  }
```

**1613행** — 호출부 한 줄
```tsx
          return <ImageCell style={style} readOnly={readOnly} onUploaded={(paths) => patchStyle(style.reqId, paths)} onOpen={() => setPreview(style)} />
```

## 할 일

### 1. props에 `onDelete`를 더한다

```ts
interface ImageCellProps {
  style: RequestStyle
  readOnly: boolean
  onUploaded: (paths: { imagePath: string; imageThumbPath: string }) => void
  onOpen: () => void
  onDelete: (anchor: { x: number; y: number }) => void
}

function ImageCell({ style, readOnly, onUploaded, onOpen, onDelete }: ImageCellProps) {
```

### 2. 바깥 `div`에 `group relative`를 더한다

className 맨 앞에 `group relative `를 붙인다. **나머지 클래스와 네 개의 드래그 핸들러는 그대로 둔다.**

```tsx
      className={`group relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded ${dropping ? "outline outline-2 outline-[var(--primary)] -outline-offset-2 bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" : ""}`}
```

`relative`가 있어야 삭제 버튼이 사진 칸 안에 선다. 없으면 바깥 `TableCell`을 기준으로 서서
행 높이가 큰 블럭에서 엉뚱한 자리에 뜬다.

### 3. 삭제 버튼

358~360행의 썸네일 분기 안, `크게 보기` 버튼 **바로 위**에 넣는다.

```tsx
      ) : thumbUrl ? (
        <>
          {!readOnly ? (
            <button
              type="button"
              aria-label="사진 삭제"
              title="사진 삭제"
              onMouseDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onDelete({ x: event.clientX, y: event.clientY }) }}
              className="absolute right-0.5 top-0.5 z-20 inline-flex size-4 items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--destructive)] hover:text-white group-hover:opacity-100"
            >
              <Trash2 className="size-2.5" />
            </button>
          ) : null}
          <button type="button" className="min-h-0 flex-1" title="크게 보기" onClick={onOpen}>
```

사진이 없을 때는 지울 것이 없으므로 이 버튼은 썸네일 분기에만 둔다. "사진 추가" 분기에는 넣지 마라.

### 4. `removeImage`

`remove`(917~927행) **바로 아래**에 더한다.

```ts
  /**
   * 사진만 지운다. 스타일과 옵션은 그대로 둔다. 잘못 올린 사진을 되돌리는 길이다.
   * 기록에서 경로를 떼고 Storage 파일도 지운다. 파일이 이미 없으면 조용히 넘어간다.
   */
  const removeImage = (style: RequestStyle, anchor: { x: number; y: number }) => {
    if (readOnly) { setNotice({ kind: "error", text: READ_ONLY_HINT }); return }
    askConfirm(anchor, `${style.garmentNo || "이 의뢰"}의 사진을 지울까요?`, () => {
      patchStyle(style.reqId, { imagePath: undefined, imageThumbPath: undefined })
      void deleteRequestImage(style.reqId).catch(() => undefined)
    }, { confirmLabel: "삭제", danger: true })
  }
```

`READ_ONLY_HINT`와 `setNotice`는 이 파일에 이미 있다. `commitRequests`도 보기 전용을 막지만,
확인 창을 띄운 뒤에 막으면 눌러 놓고 안 지워지는 꼴이라 앞에서 끊는다.

### 5. 호출부

1613행에 `onDelete`를 더한다.

```tsx
          return <ImageCell style={style} readOnly={readOnly} onUploaded={(paths) => patchStyle(style.reqId, paths)} onOpen={() => setPreview(style)} onDelete={(anchor) => removeImage(style, anchor)} />
```

## 하지 말 것

- **확인 창 없이 바로 지우지 마라.** 좁은 칸의 작은 버튼이라 잘못 누르기 쉽다. 옵션 삭제(R293)와 같은 이유로 `askConfirm`을 쓴다.
- **사진이 없는 칸("사진 추가")에 삭제 버튼을 넣지 마라.**
- **R306이 넣은 드래그 핸들러 네 개(`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`)와 `dropping` 상태를 건드리지 마라.**
- **`deleteRequestImage`를 `await`해서 그 결과로 기록 정리를 막지 마라.** Storage 삭제가 실패해도 기록은 비워야 한다. 같은 경로에 다시 올리면 덮어쓰므로 파일이 쌓이지 않는다. 917행 `remove`가 쓰는 방식 그대로다.
- **`src/data/request-image.ts`를 고치지 마라.**
- **`src/components/analysis/*`를 열지 마라.**
- `TableCell`의 `onMouseDown`, `onDoubleClick`, `onContextMenu`, `onMouseEnter`를 손대지 마라.
- `FillHandle` 위치를 바꾸지 마라. 오른쪽 아래에 있고 삭제 버튼은 오른쪽 위라 겹치지 않는다.
- `src/routes/DevelopmentMasterSheet.tsx`, `src/routes/Warehouse.tsx`는 열지 않는다. 커밋 전 변경이 들어 있다.
- 새 패키지를 넣지 마라. 새 import 도 넣지 마라. `Trash2`, `deleteRequestImage`는 이미 들여온다.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다. 로컬 dev 서버가 5175에서 돌고 있다. 끄지 마라.

그리고 세어라.
- `src/routes/FabricRequest.tsx`에서 `removeImage`가 **2번** 나와야 한다(선언 1회, 호출부 1회).
- `onDelete`가 **3번** 나와야 한다(props 타입 1회, 매개변수 1회, 호출부 1회).
- `git status --short`에 `src/routes/FabricRequest.tsx`와 `src/routes/DevelopmentMasterSheet.tsx`가 둘 다 `M`으로 남아 있어야 한다.

## 보고

수정한 파일, `npm run build` 결과, 위 세 가지, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
