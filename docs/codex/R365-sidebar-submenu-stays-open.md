# R365 — 하위 메뉴가 항목 선택으로 접히지 않게 한다

상태: 미착수. 조사는 끝났고 고칠 자리와 줄 번호를 아래에 적었다.

## 할 일

DD MASTER 하위 메뉴를 펼쳐 EU 같은 항목을 고르면 메뉴가 바로 접힌다. 고른 뒤에도 열려 있어야 한다.

접히는 경우는 둘로 못 박는다.

1. 화살표를 다시 누를 때
2. 그 묶음 밖으로 옮길 때(다른 상위 항목이나 다른 구역)

마우스가 사이드바에서 벗어나는 것은 접는 이유가 아니다.

## 조사로 확인한 것

접는 길이 **두 군데**다. 둘 다 `src/components/layout/AppSidebar.tsx`의 `closeReveal`(98~101행)을 지나고, 그 함수가 `setOpenMap({})`로 열린 것을 전부 버린다.

```ts
  const closeReveal = () => {
    setRevealed(false)
    setOpenMap({})
  }
  const handleNavigate = () => {
    onMobileClose()
    closeReveal()
  }
```

- `handleNavigate`는 상위 항목과 하위 항목 링크 양쪽의 `onClick`이다(174행, 185행, 223행). 그래서 **무엇을 고르든 접힌다.**
- `closeReveal`은 `aside`의 `onMouseLeave`(122행)와 `onBlurCapture`(124~126행)에도 붙어 있다. 그래서 **마우스를 사이드바 밖으로 옮기기만 해도 접힌다.**

`revealed`는 접힌 사이드바에 마우스를 올렸을 때 임시로 펴 보이는 상태다(121행). 이것과 `openMap`은 별개인데 지금 한 함수에 묶여 있다. 갈라 놓는 것이 이 작업이다.

접힌 상태(`showCollapsed`)에서는 하위 메뉴 자체가 그려지지 않으므로(203행 `!showCollapsed` 가드) `openMap`이 남아 있어도 보이는 것이 달라지지 않는다.

## 파일별 조치

### 1. `src/components/layout/AppSidebar.tsx`

(a) 98~105행을 아래로 바꾼다. `closeReveal`은 이제 `revealed`만 만진다.

```ts
  const closeReveal = () => {
    setRevealed(false)
  }
  const handleNavigate = (path: string) => {
    onMobileClose()
    setRevealed(false)
    // 고른 항목이 속한 묶음은 열어 둔다. 그 밖으로 옮길 때만 접는다(R365).
    const keep = parentPathForNavigation(path)
    setOpenMap((current) => (keep && current[keep] ? { [keep]: true } : {}))
  }
```

(b) 컴포넌트 **밖**(파일 위쪽, `SidebarLink` 아래 아무 곳)에 도우미를 둔다. 렌더마다 다시 만들 이유가 없다.

```ts
/** 그 경로를 품은 상위 항목의 path. 상위 자신이거나 하위 중 하나면 그 묶음이다. */
function parentPathForNavigation(path: string): string | null {
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (!item.children) continue
      if (item.path === path || item.children.some((child) => child.path === path)) return item.path
    }
  }
  return null
}
```

(c) `SidebarLinkProps`의 `onNavigate`가 경로를 받게 한다(25행).

```ts
  onNavigate: (path: string) => void
```

그리고 `SidebarLink` 안 `NavLink`의 `onClick`을 바꾼다(35행).

```ts
      onClick={() => onNavigate(item.path)}
```

(d) 하위 항목 `NavLink`의 `onClick`을 바꾼다(223행).

```ts
                                  onClick={() => handleNavigate(child.path)}
```

(e) 174행과 185행의 `onNavigate={handleNavigate}`는 그대로 둔다. `SidebarLink`가 자기 `item.path`를 넣어 부른다.

(f) 화살표 버튼(192행)은 **건드리지 않는다.** 지금 그대로 토글이다.

### 2. `CLAUDE.md`

DD MASTER 절의 사이드바 하위 메뉴 줄 끝에 한 문장을 더한다. 지금 줄은 이렇게 시작한다.

`- 사이드바 하위 메뉴(DD MASTER의 PROGRESS OVERVIEW·EU·SEASON·CORE·PROJECT)는 화살표를 눌렀을 때만 연다.`

그 줄 맨 끝에 이어 붙인다.

`**펼친 뒤에는 그 묶음 안의 항목을 골라도 접히지 않는다**(R365). 접는 것은 화살표를 다시 누를 때와 그 묶음 밖으로 옮길 때 둘뿐이다. 마우스가 사이드바를 벗어나는 것은 접는 이유가 아니다. `closeReveal`은 접힌 사이드바의 임시 펴 보기(`revealed`)만 만지고 `openMap`을 비우지 않는다. 둘을 다시 한 함수로 묶지 말 것.`

## 하지 말 것

- 현재 경로로 하위 메뉴를 **자동으로 펼치지 말 것.** 여는 것은 화살표뿐이다. 기존 결정이다.
- 화살표 토글(`setOpenMap((current) => ({ ...current, [item.path]: !isOpen }))`)을 고치지 말 것.
- `isParentActive`와 `isOpen` 계산을 고치지 말 것.
- 라우트, 권한 키, `ReadOnlyGuard`를 고치지 말 것.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 말 것.

## 검증

`npm run build`(= `tsc --noEmit && vite build`)가 통과하면 된다. 수정을 다 마친 뒤 한 번만 돌린다.

화면 확인은 박향근이 한다. DD MASTER 화살표를 눌러 펼치고 EU를 고른 뒤에도 메뉴가 열려 있는지, 마우스를 사이드바 밖으로 옮겨도 열려 있는지, 화살표를 다시 누르면 접히는지, COST SHEET로 옮기면 접히는지 본다.
