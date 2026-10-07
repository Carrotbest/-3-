# R306 — FABRIC REQUEST 사진 칸에 끌어 놓기로 올리기

상태: 미착수.

대상 파일은 `src/routes/FabricRequest.tsx` 하나다. 다른 파일은 열지 않는다.

**R305를 먼저 적용한 워킹트리 위에서 한다.** R305는 같은 파일의 776행대와 1000행대, 1140행대,
1325행대, 1528행과 1557행을 고친다. 이 작업이 건드리는 `ImageCell`(255~345행 구간)과는 겹치지
않지만, 아래 7단계의 호출부 행 번호는 R305 뒤에 밀린다. **행 번호를 믿지 말고 코드 조각으로 찾아라.**

## 왜

사진 칸은 지금 버튼을 눌러 파일 선택 창을 띄우는 길 하나뿐이다. 사진을 끌어다 놓는 편이 빠르다.
같은 저장소에 이미 같은 패턴이 두 곳 있다.

- `src/components/analysis/AnalysisRequestDialog.tsx` 122~123행 (`onDragOver`, `onDrop` 한 쌍)
- `src/components/upload/DataUpload.tsx` 47~50행 (끌고 들어온 동안 테두리 강조)

**그 두 파일을 열지 마라.** 필요한 내용은 아래에 다 옮겨 적었다.

## 틀렸던 가설

없다. 아래 사실은 코드에서 확인했다. 다시 조사하지 말고 바로 고쳐라.

- `ImageCell`은 281행에 있고 `readOnly`를 받지 않는다. 그래서 전체 탭과 보관함(보기 전용)에서도
  "사진 추가"와 "교체" 버튼이 눌린다. 올리기는 성공하고 그 다음 `patchStyle`이 `commitRequests`에서
  거부되어 기록에만 안 남는다. Storage에는 파일이 올라간다. 이번에 같이 막는다.
- 읽기 **권한** 화면은 `ReadOnlyGuard`(`src/components/layout/ReadOnlyGuard.tsx` 44행)가 `drop`을
  capture 단계에서 이미 막는다. 그건 그대로 두면 된다. 위의 보기 전용(`readOnly`)은 그것과 다른
  것이라 컴포넌트에서 막아야 한다.
- `validateRequestImage`는 JPG, PNG, WEBP와 3MB 상한만 본다. 파일 1장만 받는다.

## 지금 코드

**275~281행** — props와 함수 머리
```ts
interface ImageCellProps {
  style: RequestStyle
  onUploaded: (paths: { imagePath: string; imageThumbPath: string }) => void
  onOpen: () => void
}

function ImageCell({ style, onUploaded, onOpen }: ImageCellProps) {
  const thumbUrl = useRequestImageUrl(style.imageThumbPath)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
```

**286~287행** — `pick`의 시작
```ts
  const pick = async (file: File | undefined) => {
    if (!file) return
```

**305~306행** — 바깥 `div`
```tsx
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5">
```

**322~335행** — 썸네일이 있을 때의 "교체" 버튼과 없을 때의 "사진 추가" 버튼
```tsx
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[9px] text-[var(--muted-foreground)] underline-offset-2 hover:underline"
          >
            교체
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          <ImagePlus className="size-3.5" />
          사진 추가
        </button>
```

**호출부** — 한 줄이다. R305 뒤에 1571행 근처로 밀린다.
```tsx
          return <ImageCell style={style} onUploaded={(paths) => patchStyle(style.reqId, paths)} onOpen={() => setPreview(style)} />
```

## 할 일

### 1. props에 `readOnly`를 더한다

```ts
interface ImageCellProps {
  style: RequestStyle
  readOnly: boolean
  onUploaded: (paths: { imagePath: string; imageThumbPath: string }) => void
  onOpen: () => void
}

function ImageCell({ style, readOnly, onUploaded, onOpen }: ImageCellProps) {
```

### 2. 끌고 들어온 상태

`const [error, setError] = useState<string | null>(null)` 아래에 더한다.

```ts
  const [dropping, setDropping] = useState(false)
```

### 3. `pick`에서 보기 전용을 막는다

`pick`의 `if (!file) return` 바로 아래에 더한다.

```ts
    if (readOnly) {
      // 보기 전용에서는 올려도 기록이 거부된다. Storage에 파일만 남기지 않는다.
      setError("보기 전용입니다. 보드 탭을 골라 주세요.")
      return
    }
```

### 4. 끌어 놓기 핸들러

`pick` 아래, `return (` 위에 더한다.

```ts
  /**
   * 끌어 놓기로 사진을 받는다. 파일 여러 개를 놓으면 첫 장만 쓴다.
   * `onDragOver`에서 `preventDefault`를 해야 브라우저가 놓기를 허용한다. 안 하면 파일이 새 탭으로 열린다.
   */
  const dragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (readOnly || busy || !event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
    if (!dropping) setDropping(true)
  }
  const dragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // 자식 요소로 들어갈 때도 leave가 오므로 칸 밖으로 나간 경우만 끈다.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDropping(false)
  }
  const drop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    event.stopPropagation()
    setDropping(false)
    if (busy) return
    void pick(event.dataTransfer.files?.[0])
  }
```

`React.DragEvent` 타입은 11행의 `import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"`를
건드리지 않고 `React.DragEvent`로 쓴다. 파일 안에 `React.MouseEvent`, `React.KeyboardEvent`를 이미
그렇게 쓰는 자리가 있다(`onCellMouseDown`, `CellEditor`). 같은 방식으로 맞춘다. 새 import를 넣지 마라.

### 5. 바깥 `div`를 놓기 대상으로

```tsx
  return (
    <div
      onDragOver={dragOver}
      onDragEnter={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
      className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded ${dropping ? "outline outline-2 outline-[var(--primary)] -outline-offset-2 bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" : ""}`}
    >
```

### 6. 버튼도 보기 전용에서 막는다

"교체" 버튼과 "사진 추가" 버튼에 `disabled={readOnly}`를 더하고, "사진 추가" 쪽 문구만 바꾼다.
끌어 놓기가 가능하다는 것을 알 수 있어야 한다. 좁은 칸이라 글자는 늘리지 않고 `title`로 적는다.

교체 버튼
```tsx
          <button
            type="button"
            disabled={readOnly}
            title={readOnly ? "보기 전용입니다." : "눌러서 고르거나 사진을 끌어다 놓으세요"}
            onClick={() => inputRef.current?.click()}
            className="text-[9px] text-[var(--muted-foreground)] underline-offset-2 hover:underline disabled:opacity-50"
          >
            교체
          </button>
```

사진 추가 버튼
```tsx
        <button
          type="button"
          disabled={readOnly}
          title={readOnly ? "보기 전용입니다." : "눌러서 고르거나 사진을 끌어다 놓으세요"}
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <ImagePlus className="size-3.5" />
          {dropping ? "놓으세요" : "사진 추가"}
        </button>
```

### 7. 호출부에 `readOnly`를 넘긴다

```tsx
          return <ImageCell style={style} readOnly={readOnly} onUploaded={(paths) => patchStyle(style.reqId, paths)} onOpen={() => setPreview(style)} />
```

`readOnly`는 `FabricRequest` 본문 750행대의 `const readOnly = activeBoard === ALL_BOARDS || activeBoard === ARCHIVE_VIEW`다.
`renderDataCell`과 `cellValue`가 같은 함수 안에 있어 그대로 쓸 수 있다. 새로 만들지 마라.

## 하지 말 것

- **`ReadOnlyGuard`를 고치지 마라.** 읽기 권한 화면의 `drop` 차단은 지금 동작이 맞다.
- **`src/data/request-image.ts`를 고치지 마라.** 검사와 올리기 규칙은 그대로 쓴다. 3MB 상한은 `storage.rules`와 짝이라 함께 고쳐야 하는 값이다.
- **`TableCell`의 `onMouseDown`, `onDoubleClick`, `onContextMenu`, `onMouseEnter`를 손대지 마라.** 셀 범위 선택과 더블클릭 편집이 거기 있다. 끌어 놓기는 OS 파일 드래그라 `mousedown`이 오지 않아 서로 부딪히지 않는다. 그 가정을 지키려면 `ImageCell` 안에만 핸들러를 달고 `td`에는 달지 마라.
- **`onDrop`에서 `stopPropagation`을 빼지 마라.** 빼면 상위로 올라가 다른 놓기 대상이 같은 파일을 또 받는다.
- **`onDragOver`에서 `preventDefault`를 빼지 마라.** 빼면 놓기가 아예 안 되고 브라우저가 사진을 새 탭으로 연다.
- `window`나 `document`에 `dragover`, `drop` 리스너를 새로 달지 마라. 엑셀 업로드(`DataUpload`)와 분석 의뢰 창의 놓기 대상을 가로챈다.
- 파일 여러 장을 한 번에 올리는 기능을 만들지 마라. 스타일당 사진 1장이고 같은 경로에 덮어쓴다.
- `src/routes/DevelopmentMasterSheet.tsx`, `src/routes/Warehouse.tsx`, `src/components/data-table/`는 열지 않는다.
- 새 패키지를 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라. **R305 변경이 워킹트리에 있다. 반드시 보존해라.**
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다.

그리고 `git status --short`로 `src/routes/FabricRequest.tsx` 하나만 수정돼 있는지 본다.
R305가 만든 `docs/codex/R305-*.md`와 `.codex-runs/`는 그대로 있어야 한다.

## 보고

수정한 파일, `npm run build` 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
