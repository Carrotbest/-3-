# R341 — 사이드바 신규 뱃지와 UPDATED 라벨

상태: **미착수**. 신규 기능이다. 고칠 버그가 아니다.

## 목적

사이드바 메뉴 이름 옆에 아이폰 뱃지처럼 작은 표시를 단다. 두 종류다.

- **숫자 뱃지**: 의뢰가 쌓이는 화면. 내가 마지막으로 그 화면을 본 뒤에 새로 등록된 건수를 센다.
- **UPDATED 라벨**: 수집·보고 자료 화면. 건수가 의미 없으므로 숫자 없이 갱신 여부만 보인다.

읽음 표시는 **사용자 계정별로 그 브라우저에** 남는다. 그 화면에 들어가 3초 머물면 사라진다.

**튀지 않아야 한다.** 빨강을 쓰지 않고, 깜빡임이나 펄스 애니메이션을 넣지 않는다. 사이드바 구역 강조색(`--nav-accent`)을 옅게 깐 작은 알약이다.

## 대상 여섯 화면

| 화면 | 경로 | 종류 | 신규 판정 원본 |
|---|---|---|---|
| DEVELOPMENT REQUEST | `/request` | 숫자 | `state.requests[].createdAt` |
| FABRIC ANALYSIS | `/fabric-analysis` | 숫자 | `state.analysisRequests[].createdAt` |
| TROUBLE SHOOTING | `/ts` | 숫자 | `state.ts[].createdAt` (이번에 새로 붙이는 선택 필드) |
| RDDA REPORT | `/rdda` | UPDATED | `state.rddaReports[].updatedAt` 중 최대값 |
| FABRIC TREND | `/trend/fabric` | UPDATED | `status.json`의 `generated_at` |
| MARKET PULSE | `/trend/macro` | UPDATED | `status.json`의 `generated_at` |

이 여섯 외의 화면에는 뱃지를 달지 않는다. DD MASTER, WAREHOUSE, COST SHEET, TECHNICAL REFERENCES는 2차다. **임의로 늘리지 마라.**

## 반드시 지킬 규칙

- **기준선이 없으면 "지금"으로 적고 뱃지 0이다.** 이 기능이 처음 깔리는 순간, 또는 처음 쓰는 브라우저에서 과거 데이터 전부가 신규로 잡히면 안 된다. 기록이 없는 화면은 조용히 현재 시각을 기준선으로 적고 아무것도 띄우지 않는다. 이것이 이 기능의 핵심 안전장치다.
- **로그인 전, 승인 전에는 뱃지를 전부 숨긴다.** uid가 없으면 저장할 곳도 없다.
- **`createdAt`을 과거 데이터에 추측해서 채우지 마라.** 값이 없는 행은 신규가 아니다. 빈 값을 그대로 둔다.
- **엑셀로 들여온 TS 행에 `createdAt`을 찍지 마라.** 웹 등록 폼 한 곳에서만 찍는다.
- 숫자는 99를 넘으면 `99+`로 줄인다.
- 뱃지에 `backdrop-filter`, `animate-*`, 번짐 그림자를 넣지 마라.

## 파일별 조치

### 1. `src/data/nav-badges.ts` — 신규 생성

zustand 스토어 하나와 순수 함수들을 담는다. 외부에서 쓰는 것은 아래 네 가지다.

```ts
export type NavBadgeKind = "count" | "updated"
export interface NavBadgeSource {
  key: string            // 저장 키. 경로가 아니라 짧은 식별자
  path: string           // 정확히 일치하는 라우트 경로
  kind: NavBadgeKind
}
export const NAV_BADGE_SOURCES: NavBadgeSource[]
export function initNavSeen(uid: string | null): void
export function markNavSeen(path: string): void
export function useNavBadges(): Record<string, { kind: NavBadgeKind; count: number }>
```

`NAV_BADGE_SOURCES`는 위 표 그대로 여섯 개다. `key`는 `request`, `analysis`, `ts`, `rdda`, `trendFabric`, `trendMacro`.

**저장.** `localStorage`에 `fabric.nav-seen.v1.<uid>` 키 하나로 `Record<string, string>`(키 → ISO 시각)을 JSON으로 넣는다. 읽기와 쓰기를 전부 `try/catch`로 감싼다. 시크릿 창에서 접근 자체가 예외를 던진다.

**`initNavSeen(uid)`.** uid가 null이면 스토어를 비우고 끝낸다. uid가 있으면 저장된 값을 읽고, `NAV_BADGE_SOURCES` 중 기록이 없는 키를 **현재 시각으로 채워 다시 저장한 뒤** 스토어에 넣는다. 이것이 "처음이면 뱃지 0" 규칙의 구현이다.

**`markNavSeen(path)`.** 경로에 해당하는 소스를 찾아 그 키를 현재 시각으로 올리고 저장한다. 없는 경로면 아무것도 하지 않는다.

**`useNavBadges()`.** `useAppStore`에서 `requests`, `analysisRequests`, `ts`, `rddaReports`를 읽고, 스토어의 기준선과 비교해 결과를 만든다.

- 숫자형: `createdAt`이 있고 `Date.parse`가 성공하며 기준선보다 **큰** 건수를 센다. 0이면 그 키를 결과에서 뺀다.
- UPDATED형: 원본 갱신 시각이 기준선보다 크면 `{ kind: "updated", count: 0 }`, 아니면 결과에서 뺀다.
- 로그인/승인 전(`useAuthStore`의 `status !== "signed-in"`, 또는 소유자가 아니면서 `approval !== "approved"`)이면 **빈 객체**를 돌려준다.

**TREND 갱신 시각.** `./trend`의 기존 `loadTrendStatus()`를 쓴다. 모듈 수준 플래그로 **앱 수명 동안 딱 한 번만** 호출하고 결과의 `generated_at`을 스토어에 넣는다. 실패하면 null로 두고 두 TREND 화면의 뱃지를 띄우지 않는다. **`loadTrendFeed()`나 `loadTrendKpi()`를 부르지 마라.** `feed.json`이 2.7MB다. 뱃지 하나 때문에 그걸 받으면 안 된다. `status.json`은 10KB다.

### 2. `src/components/layout/NavBadge.tsx` — 신규 생성

```tsx
interface NavBadgeProps {
  kind: NavBadgeKind
  count: number
  /** 접힌 사이드바에서는 글자 대신 점만 찍는다. */
  dot?: boolean
  /** 색 토큰. 사이드바는 var(--nav-accent), 상단바는 var(--primary). */
  tone?: string
}
```

- `dot`이면 `size-[7px] rounded-full`에 `background: <tone>` 하나만 그린다. 글자 없음.
- `kind === "count"`이면 알약에 숫자. `inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums leading-none`.
- `kind === "updated"`이면 알약에 `UPDATED`. `h-[16px] px-1.5 text-[9px] font-semibold tracking-[0.06em] leading-none`.
- 두 알약 모두 색은 인라인 스타일로 준다. 배경 `color-mix(in srgb, <tone> 14%, transparent)`, 글자 `<tone>`. `tone` 기본값은 `var(--nav-accent)`.
- 바깥 `<span>`에 `aria-label`을 붙인다. 숫자형은 `신규 ${count}건`, UPDATED형은 `자료가 갱신되었습니다`. 안쪽 글자 span에는 `aria-hidden="true"`.
- **애니메이션, 전환 효과, 그림자를 넣지 마라.**

### 3. `src/components/layout/AppSidebar.tsx` — 수정

`SidebarLink`에 `badge?: { kind: NavBadgeKind; count: number }` prop을 더한다.

- 펼친 상태: 라벨 `<span>`과 `ArrowRight` **사이**에 `<NavBadge ... />`를 넣는다. 화살표의 `ml-auto`는 그대로 두고, 뱃지에 `ml-auto`를 주고 화살표의 `ml-auto`를 빼서 뱃지가 오른쪽으로 밀리고 화살표가 그 뒤에 붙게 한다. 뱃지가 없을 때 현재 모양이 지금과 똑같아야 한다.
- 접힌 상태(`collapsed === true`): 아이콘을 감싼 `<span className="nav-glass-icon ...">`에 `relative`를 더하고 그 안에 `<NavBadge dot ... className 없이 absolute 배치>`를 넣는다. 아이콘 우상단(`absolute -right-0.5 -top-0.5`)이다. 툴팁 내용은 건드리지 않는다.
- `AppSidebar` 본문에서 `const badges = useNavBadges()`를 한 번 부르고, `SidebarLink`를 그릴 때 `badges[keyForPath(item.path)]`를 넘긴다. 경로 → 키는 `NAV_BADGE_SOURCES`에서 찾는다. 하위 메뉴(children)에는 뱃지를 달지 않는다.
- 뱃지 색은 각 구역의 `--nav-accent`를 그대로 쓴다. 이미 `<section>`에 `style={{ "--nav-accent": group.accent }}`가 걸려 있으므로 기본값으로 상속된다.

### 4. `src/components/layout/Topbar.tsx` — 수정

`<h1>{currentRoute?.title}</h1>` **바로 뒤**, 구분선 `<span>` 앞에 현재 경로의 뱃지를 넣는다. `tone="var(--primary)"`를 준다. 뱃지가 없으면 아무것도 그리지 않는다.

들어간 화면은 3초 뒤 읽음 처리되므로 이 뱃지는 3초만 보인다. 그것이 의도다. 사용자가 무엇 때문에 들어왔는지 확인하는 용도다.

### 5. `src/App.tsx` — 수정

`AppLayout` 안에 effect 두 개를 더한다. 기존 effect들 아래, `hydrated` 블록과 섞지 마라.

1. 로그인 상태가 바뀌면 `initNavSeen(user?.uid ?? null)`을 부른다. 의존성은 uid 하나다.
2. `pathname`이 바뀌면 3초 타이머를 걸고 `markNavSeen(pathname)`을 부른다. **cleanup에서 반드시 `clearTimeout` 한다.** 3초 안에 다른 화면으로 가면 그 화면은 읽음 처리되지 않는다. 잠깐 스쳐 간 화면의 뱃지를 지우지 않으려는 것이다.

### 6. `src/data/sample.ts` — 수정

`TsRecord`(256행)에 선택 필드를 더한다. 기존 필드 순서를 바꾸지 마라.

```ts
  /** 웹 등록 시각(ISO). 신규 뱃지 판정에만 쓴다. 엑셀로 들여온 옛 행에는 없다. */
  createdAt?: string
```

### 7. `src/routes/TS.tsx` — 수정

`submit` 함수(541행 근처) 안 `newRow` 객체에 한 줄만 더한다. `source: "web",` 바로 다음이다.

```ts
      createdAt: new Date().toISOString(),
```

`mergeTsRecords`(엑셀 들여오기)와 편집 경로(507, 514, 522행)는 **건드리지 마라.** 들여온 행이 신규로 잡히면 뱃지가 수백이 된다.

## 하지 말 것

- `firestore.rules`를 고치지 마라. 이번 저장은 전부 브라우저 안이다.
- `src/data/view-prefs.ts`에 키를 더하지 마라. 그 파일은 열 너비와 펼침 상태 전용이다.
- `CACHE_KEYS`에 키를 더하지 마라. 이 값은 Firestore로 올리지 않는다.
- 표 안이나 행에 NEW 표시를 넣지 마라. 2차 작업이다.
- `public/data/trend/feed.json`과 `archive.json`을 열지 마라. 각각 2.7MB, 2.5MB다.

## 검증

`npm run build`가 통과하면 된다(`tsc --noEmit` 포함). 그 외 검증은 하지 마라.

빌드가 실패하면 고치고 다시 돌려라. 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
