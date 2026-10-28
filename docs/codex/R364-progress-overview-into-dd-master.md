# R364 — PROGRESS OVERVIEW를 DD MASTER 하위 첫 항목으로 옮긴다

상태: 미착수. 조사는 끝났고 고칠 자리와 줄 번호를 아래에 적었다.

## 할 일

사이드바 최상위에 있는 `PROGRESS OVERVIEW`를 빼고 `DD MASTER` 하위 메뉴의 **첫 번째** 항목으로 넣는다. 지금 하위는 EU, SEASON, CORE, PROJECT 넷이고 PROGRESS OVERVIEW가 그 넷보다 위에 선다.

라우트 경로 `/development`는 그대로 둔다. 다른 화면이 `?focus=`로 이 경로를 부르므로 경로를 바꾸면 링크가 끊긴다. 화면 권한 키와 라우팅 판정도 건드리지 않는다. **사이드바에 보이는 위치만 바꾸는 일이다.**

## 조사로 확인한 것

- `/development`에는 사이드바 뱃지가 없다(`src/data/nav-badges.ts`의 `NAV_BADGE_SOURCES`에 없음). 하위로 내려도 잃을 뱃지가 없다.
- 하위 메뉴 `NavLink`에는 이미 `end`가 붙어 있다(`AppSidebar.tsx` 216행). `/development`가 `/development/eu`의 접두사지만 정확히 일치할 때만 활성이 된다. **이 `end`를 빼지 말 것.** 빼면 DD MASTER 하위 어느 화면에 있어도 PROGRESS OVERVIEW가 활성으로 보인다.
- `tsconfig.json`에 `noUnusedLocals`가 없어서 쓰지 않는 import가 빌드를 깨지는 않는다. 그래도 정리한다.
- **권한 키가 상위와 다르다.** `src/data/screen-permissions.ts` 기준으로 `/development`는 `development` 키이고, `/development/`로 시작하는 DD MASTER 하위는 전부 `ddMaster` 키다. 그런데 `AppSidebar`의 권한 거르기(`visibleNavigationGroups`, 86행)는 **상위 항목만 거르고 `children`은 거르지 않는다.** 지금까지는 하위 넷이 상위와 같은 `ddMaster` 키라 거를 일이 없었다. 그대로 옮기면 `development` 권한이 없는 사람에게도 링크가 보이고, 눌러야 라우팅에서 막힌다. 그래서 하위에도 같은 거르기를 건다(아래 2번).

## 파일별 조치

### 1. `src/routes/route-config.ts`

`navigationGroups`의 "샘플 관리" 그룹.

93행을 지운다.

```ts
      { label: "PROGRESS OVERVIEW", path: "/development", icon: FlaskConical },
```

DD MASTER의 `children` 맨 앞에 넣는다(85~90행).

```ts
        children: [
          { label: "PROGRESS OVERVIEW", path: "/development" },
          { label: "EU", path: "/development/eu" },
          { label: "SEASON", path: "/development/season" },
          { label: "CORE", path: "/development/core" },
          { label: "PROJECT", path: "/development/project" },
        ],
```

`FlaskConical`은 이 파일에서 93행 한 곳에만 쓰였다. 8행 import 목록에서 뺀다.

`routeDefinitions`(43~65행)는 손대지 않는다. 경로와 화면 제목은 그대로다.

### 2. `src/components/layout/AppSidebar.tsx`

(a) 34행. `/development`가 더 이상 최상위 항목이 아니라 이 조건은 죽은 줄이다.

```ts
      end={item.path === "/" || item.path === "/development"}
```

를

```ts
      end={item.path === "/"}
```

로 바꾼다. DD MASTER 상위 경로는 `/development/workspace`이고 그 아래로 더 뻗는 라우트가 없어서 `end` 없이도 활성 판정이 맞다.

(b) 82~88행 `visibleNavigationGroups`. 하위 메뉴에도 같은 권한 거르기를 건다. 지금은 이렇다.

```ts
  const visibleNavigationGroups = navigationGroups
    .map((group) => ({
      ...group,
      // ownerOnly 항목은 화면 권한을 주더라도 소유자에게만 보인다.
      items: group.items.filter((item) => item.ownerOnly ? isOwner : isOwner || canAccessScreenPath(item.path, screenPermissions)),
    }))
    .filter((group) => group.items.length > 0)
```

이렇게 바꾼다.

```ts
  const visibleNavigationGroups = navigationGroups
    .map((group) => ({
      ...group,
      // ownerOnly 항목은 화면 권한을 주더라도 소유자에게만 보인다.
      items: group.items
        .filter((item) => item.ownerOnly ? isOwner : isOwner || canAccessScreenPath(item.path, screenPermissions))
        // 하위 메뉴도 같은 판정을 받는다. PROGRESS OVERVIEW는 상위 DD MASTER와 권한 키가 다르다(R364).
        .map((item) => item.children
          ? { ...item, children: item.children.filter((child) => isOwner || canAccessScreenPath(child.path, screenPermissions)) }
          : item),
    }))
    .filter((group) => group.items.length > 0)
```

하위가 전부 걸러져 빈 배열이 되어도 상위 항목은 그대로 둔다. DD MASTER 자체는 눌러서 들어가는 화면이다.

(c) 그 밖에는 손대지 않는다. 특히 174행 `const isOpen = openMap[item.path] ?? false`를 **바꾸지 말 것.** 하위 메뉴는 화살표를 눌렀을 때만 열고 현재 경로로 자동으로 펼치지 않는다. `CLAUDE.md`에 적힌 결정이다.

### 3. `CLAUDE.md`

두 줄을 사실에 맞게 고친다.

- "FABRIC REQUEST" 절 첫 줄(65행)의 `네비 순서: HOME, FABRIC ANALYSIS, DEVELOPMENT REQUEST, DD MASTER, PROGRESS OVERVIEW, WAREHOUSE.`를 `네비 순서: HOME, FABRIC ANALYSIS, DEVELOPMENT REQUEST, DD MASTER, COST SHEET, WAREHOUSE. PROGRESS OVERVIEW는 2026-10-28부터 최상위가 아니라 DD MASTER 하위 첫 항목이다(R364).`로 바꾼다.
- DD MASTER 절의 `- 사이드바 하위 메뉴(DD MASTER의 EU·SEASON·CORE·PROJECT)는 화살표를 눌렀을 때만 연다. 현재 경로로 자동 펼치지 않는다(\`AppSidebar\` \`openMap ?? false\`).` 줄을 `- 사이드바 하위 메뉴(DD MASTER의 PROGRESS OVERVIEW·EU·SEASON·CORE·PROJECT)는 화살표를 눌렀을 때만 연다. 현재 경로로 자동 펼치지 않는다(\`AppSidebar\` \`openMap ?? false\`). 하위 메뉴도 상위와 같은 권한 거르기를 받는다. PROGRESS OVERVIEW만 권한 키가 \`development\`이고 나머지는 \`ddMaster\`다(R364).`로 바꾼다.

## 하지 말 것

- 라우트 경로 `/development`를 바꾸지 말 것. `?focus=` 링크가 끊긴다.
- `src/data/screen-permissions.ts`를 고치지 말 것. 키와 경로 대응은 그대로다.
- `ReadOnlyGuard`와 `App.tsx` 라우팅을 고치지 말 것.
- 하위 `NavLink`의 `end`를 빼지 말 것.
- `openMap[item.path] ?? false`를 자동 펼침으로 바꾸지 말 것.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 말 것.

## 검증

`npm run build`(= `tsc --noEmit && vite build`)가 통과하면 된다. 수정을 다 마친 뒤 한 번만 돌린다.

화면 확인은 박향근이 한다. 사이드바 최상위에 PROGRESS OVERVIEW가 없고, DD MASTER 화살표를 누르면 맨 위에 그것이 서고, `/development`로 바로 들어가도 화면이 그대로 뜨는지 본다.
