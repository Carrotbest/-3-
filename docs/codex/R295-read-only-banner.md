# R295 — 보기 전용 화면을 한눈에 알아보게 한다

추론 강도: **medium**. 새 파일 1개 + 수정 2개. 공용 띠 컴포넌트를 만들어 두 화면에 꽂고, 보기 전용일 때 확인 상자를 띄우지 않게 바꾼다.

## 상태

미착수.

## 왜

2026-10-06에 박향근이 두 가지를 지적했다.

1. **보기 전용에서 확인 상자가 먼저 뜬다.** DEVELOPMENT REQUEST 전체 탭에서 옵션 추가를 누르면 R293·R294가 만든 확인 상자가 멀쩡히 뜨고, "추가"를 눌러야 그제서야 "전체 탭은 보기 전용입니다" 안내가 나온다. 물어보기 전에 막아야 한다.
2. **보기 전용 화면인 줄 모르고 계속 수정하려 한다.** DEVELOPMENT REQUEST는 전체 탭이 처음 화면이고, DD MASTER도 전체 미리보기에서 같은 일이 생긴다. 지금 표시는 약하다. REQUEST는 탭 칩 안의 10px "보기 전용" 글자뿐이고, DD MASTER는 배경을 아주 옅게 깔아 둔 것(`bg-[color-mix(in_srgb,var(--muted)_35%,transparent)]`)과 클릭했을 때 뜨는 안내뿐이다.

표 위에 **접히지 않는 띠**를 하나 두고, 왜 못 고치는지와 어떻게 하면 고칠 수 있는지를 한 줄로 적는다. 효과는 단순하게 간다. 표를 흐리게 덮거나 클릭을 막는 투명막을 씌우지 않는다. 읽기와 복사와 스크롤은 그대로 돼야 한다.

## 1. 새 파일 `src/components/layout/ReadOnlyBanner.tsx`

두 화면이 같은 모양을 쓰도록 한 곳에 둔다.

```tsx
import { Lock } from "lucide-react"

/**
 * 보기 전용 화면임을 표 위에 상시로 알리는 띠(R295).
 *
 * 표를 덮거나 흐리게 하지 않는다. 읽기·복사·스크롤은 그대로 두고 띠로만 알린다.
 * `hint`에는 무엇을 해야 고칠 수 있는지를 적는다. 이유만 적으면 사용자가 다음 행동을 모른다.
 */
export function ReadOnlyBanner({ reason, hint }: { reason: string; hint: string }) {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-y border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] border-l-[3px] border-l-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--card))] px-3 py-1.5 text-xs"
    >
      <Lock className="size-3.5 shrink-0 text-[var(--warning)]" />
      <span className="font-semibold text-[var(--foreground)]">{reason}</span>
      <span className="truncate text-[var(--muted-foreground)]">{hint}</span>
    </div>
  )
}
```

`lucide-react`의 `Lock` 아이콘을 쓴다. 이 저장소는 이미 lucide 아이콘을 쓰고 있다.

## 2. `src/routes/FabricRequest.tsx`

### 2-1. 보기 전용이면 확인 상자를 띄우지 않는다

`askConfirm`(757행대) 한 곳만 고치면 네 동작 모두 걸린다. 현재 코드:

```ts
  const askConfirm = (anchor: { x: number; y: number }, message: string, run: () => void, options?: { confirmLabel?: string; danger?: boolean }) =>
    setConfirmPrompt({ x: anchor.x, y: anchor.y, message, run, confirmLabel: options?.confirmLabel ?? "확인", danger: options?.danger ?? false })
```

이렇게 바꾼다.

```ts
  // 보기 전용이면 묻지 않고 바로 알린다. 확인까지 받아 놓고 저장에서 막으면 두 번 헛걸음이다(R295).
  const askConfirm = (anchor: { x: number; y: number }, message: string, run: () => void, options?: { confirmLabel?: string; danger?: boolean }) => {
    if (readOnly) { setNotice({ kind: "error", text: READ_ONLY_HINT }); return }
    setConfirmPrompt({ x: anchor.x, y: anchor.y, message, run, confirmLabel: options?.confirmLabel ?? "확인", danger: options?.danger ?? false })
  }
```

`readOnly`는 783행에서 선언된다. `askConfirm`은 757행이라 **선언보다 앞선다.** `const readOnly = ...` 줄을 `askConfirm`보다 위로 옮겨라. 옮길 때 `activeBoard`, `ALL_BOARDS`, `ARCHIVE_VIEW`가 이미 선언돼 있는 자리인지 확인하고, `const [confirmPrompt, ...]` 바로 위에 둔다. 그 자리가 안 되면 `askConfirm`을 `readOnly` 선언 아래로 옮겨도 된다. 둘 중 빌드가 통과하는 쪽을 택하고 다른 코드는 건드리지 마라.

파일 상단 상수 자리(`const ACTION_WIDTH = 72` 근처)에 문구를 둔다. 띠와 안내가 같은 문장을 쓰게 한다.

```ts
/** 보기 전용 안내 문구. 띠와 알림이 같은 문장을 쓴다(R295). */
const READ_ONLY_HINT = "전체 탭은 보기 전용입니다. 고치려면 위에서 보드 탭을 고르십시오."
```

821행 `commitRequests`의 기존 문구도 이 상수로 바꾼다.

```ts
    if (readOnly) { setNotice({ kind: "error", text: READ_ONLY_HINT }); return false }
```

### 2-2. 표 위에 띠

1715행 `<div ref={scrollRef} ...>` **바로 앞**에 넣는다. 스크롤 상자 바깥이라 표를 굴려도 띠는 남는다.

```tsx
        {readOnly ? <ReadOnlyBanner reason="보기 전용" hint={activeBoard === ARCHIVE_VIEW ? "종결된 보드의 기록입니다. 고칠 수 없습니다." : "고치려면 위에서 보드 탭을 고르십시오."} /> : null}
```

import을 파일 상단에 더한다.

```ts
import { ReadOnlyBanner } from "@/components/layout/ReadOnlyBanner"
```

경로 별칭은 이 파일의 다른 import이 쓰는 방식을 그대로 따른다.

### 2-3. 보기 전용이면 셀 커서를 바꾼다

`renderDataCell`의 `TableCell` className 끝에 `cursor-cell`이 박혀 있다. 보기 전용에서도 칸마다 편집 커서가 떠서 고칠 수 있다는 착각을 준다. DD MASTER는 이미 보기 전용일 때 `cursor-cell`을 빼고 있다. 같게 맞춘다.

className 문자열 끝의

```
cursor-cell
```

을

```
${readOnly ? "cursor-default" : "cursor-cell"}
```

로 바꾼다. 같은 문자열 안의 다른 부분은 건드리지 마라.

## 3. `src/routes/DevelopmentMasterSheet.tsx`

### 3-1. 표 위에 띠

2988행 `<div ref={gridScrollRef} data-route-scroll-root onContextMenu={(event) => {` **바로 앞**에 넣는다. 그 위의 빈 줄 자리다.

```tsx
      {editEnabled ? null : <ReadOnlyBanner reason="전체 미리보기 · 보기 전용" hint="고치려면 위에서 담당을 고르십시오. 담당 칸이 비었거나 명단 밖인 행은 담당 드롭다운에서 그 값을 고르면 됩니다." />}
```

import을 파일 상단에 더한다.

```ts
import { ReadOnlyBanner } from "@/components/layout/ReadOnlyBanner"
```

### 3-2. 배경 틴트는 그대로 둔다

2994행의 `${editEnabled ? "" : "bg-[color-mix(in_srgb,var(--muted)_35%,transparent)]"}`는 **지우지 마라.** 띠와 함께 두 겹으로 알리는 것이 이번 목적이다.

## 하지 말 것

- 표를 반투명 막으로 덮거나 `pointer-events: none`을 걸지 마라. 읽기, 드래그 선택, 복사, 스크롤은 보기 전용에서도 돼야 한다.
- `filter: blur`나 `opacity`로 표 전체를 흐리게 하지 마라. 숫자를 읽는 화면이다.
- 띠를 접거나 닫는 버튼을 만들지 마라. 닫으면 다시 같은 착각이 생긴다.
- 띠를 `SectionCard`로 감싸지 마라(이 저장소의 알려진 함정. `Reveal`의 IntersectionObserver 때문에 안 보일 수 있다).
- 띠를 스크롤 상자 **안에** 넣지 마라. 표 머리글의 sticky와 겹친다.
- `EDIT_DISABLED_MESSAGE`(DD MASTER 39행)와 `ReadOnlyGuard`(`src/components/layout/ReadOnlyGuard.tsx`)의 동작을 바꾸지 마라. 권한 기반 방어는 그대로 둔다. 이번 건은 화면 안 상태(전체 탭, 전체 미리보기) 표시다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라. 다른 파일에 검증 대기 중인 수정이 많다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 수정을 마친 뒤 한 번만 돌려라.
- `legacy/`, `legacy-vanilla/`, `backup/`, `public/data`는 읽지 마라.

## 검증

```
npm run build
```

오류 0이면 성공이다. `readOnly`를 선언보다 먼저 쓰면 `Block-scoped variable 'readOnly' used before its declaration`이 뜬다. 2-1의 선언 순서를 다시 보라.

```
git status --short
```

이번 작업으로 바뀌는 파일은 셋이다.

- `src/components/layout/ReadOnlyBanner.tsx` (새 파일)
- `src/routes/FabricRequest.tsx`
- `src/routes/DevelopmentMasterSheet.tsx`

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
