# R223 · 창고 권한 쪼개기 (3팀 / 1팀 / 출고 요청)

상태: **미착수.** R221(데이터 계약, 채번 분리) 완료. R222(1팀 입고 등록, 붙여넣기 이관)는 별도 지시서이며 순서는 상관없다.

## 무엇을 하는가

창고 권한 하나(`warehouse`)를 셋으로 쪼갠다.

| 권한 키 | 지배 범위 | 성격 |
|---|---|---|
| `warehouse` | 창고 화면 **3팀 원단** 스코프 | 화면 권한(none/read/edit). 라우팅도 이 키가 본다 |
| `warehouseFabric1` | 창고 화면 **1팀 원단** 스코프 | **신규.** 화면 권한(none/read/edit). 경로 없음 |
| `warehouseOutbound` | 출고 요청 메일 버튼 | **신규.** 기능 권한(차단/허용). 경로 없음 |

목표는 이것이다. **1팀은 3팀 화면에서 출고 요청만, 1팀 화면에서는 입출고 전부 편집.**

`excelBackup`이 이미 경로 없는 기능 권한이라 그 패턴을 그대로 쓴다. 라우팅은 건드리지 않는다.

## 사용자가 정한 것 (2026-09-18)

1. **출고 요청은 1팀, 3팀, 창고팀만 허용한다.** 2팀, 사업부서, 유관부서는 차단이다. 그래서 읽기 권한에 묶지 않고 별도 기능 권한(`warehouseOutbound`)으로 뗀다. 나중에 사업부를 열 때는 관리 화면에서 부서별로 켠다.
2. **창고팀(정산관리팀)은 두 팀 모두 편집한다.** 두 팀 입출고를 한 화면에서 같은 로직으로 관리하는 것이 이번 작업의 목표다. Rack 관리도 창고팀이 맡는다.

## 왜 출고 요청을 따로 떼는가

`OutboundRequestMailDialog`는 **데이터를 저장하지 않는다.** `.eml` 초안만 만들고 사람이 보낸다. 실제 출고 기록은 창고팀 회신 뒤 출고 버튼으로 남긴다. 그래서 편집 권한에 묶으면 1팀이 3팀 화면에서 요청을 못 하고, 읽기 권한에 묶으면 사업부서까지 열린다. 어느 쪽도 맞지 않아 기능 권한으로 뗀다.

## 파일별 조치

### 1. `src/data/screen-permissions.ts`

`SCREEN_PERMISSION_OPTIONS` 배열에서 `warehouse` 항목 바로 아래에 두 개를 넣는다. **`paths`와 `prefixes`를 주지 마라.** 주면 라우팅 키가 되어 `permissionKeyForPath`가 잘못 잡는다.

```ts
  // 창고 화면 안에서 1팀 원단 스코프만 지배한다. 경로가 없어 라우팅에는 영향을 주지 않는다.
  { key: "warehouseFabric1", label: "WAREHOUSE (1팀)" },
  // 출고 요청 메일은 데이터를 저장하지 않는 기능이라 편집 권한과 따로 둔다.
  { key: "warehouseOutbound", label: "출고 요청 메일" },
```

71행 `FEATURE_KEYS`에 `warehouseOutbound`만 더한다. **`warehouseFabric1`은 넣지 마라.** 세 단계가 필요하다.

```ts
export const FEATURE_KEYS: readonly ScreenPermissionKey[] = ["excelBackup", "warehouseOutbound"]
```

`ACCESS_GROUPS`의 `업무` 묶음에서 `warehouse` 다음에 `warehouseFabric1`을 넣고, `기능` 묶음에 `warehouseOutbound`를 더한다.

```ts
  { label: "업무", keys: ["home", "fabricRequest", "development", "ddMaster", "warehouse", "warehouseFabric1", "calendar"] },
  ...
  { label: "기능", keys: ["excelBackup", "warehouseOutbound"] },
```

`CACHE_KEY_SCREENS`에서 창고 세 키에 `warehouseFabric1`을 더한다. **`disposalRounds`에는 더하지 마라.** 폐기 라운드는 3팀 업무다.

```ts
  completed: ["warehouse", "ddMaster", "warehouseFabric1"],
  fabricOverrides: ["warehouse", "ddMaster", "warehouseFabric1"],
  fabricEvents: ["warehouse", "ddMaster", "warehouseFabric1"],
  disposalRounds: ["warehouse"],
```

`normalizeScreenAccess`, `createScreenAccess`, `accessToScreenPermissions`는 `SCREEN_PERMISSION_OPTIONS`를 돌기 때문에 **고치지 않아도 새 키를 자동으로 포함한다.** 손대지 마라.

기존 사용자 문서에는 새 키가 없다. `normalizeScreenAccess`의 `fallback`이 `"edit"`이라 값이 없으면 편집으로 읽힌다. 기존 승인 사용자는 전부 우리 팀이라 문제가 없지만, 아래 부서 기본값은 명시해 둔다.

### 2. `src/data/departments.ts`

`preset(base, overrides)`가 `createScreenAccess(base)`로 **모든 키를 base로** 채우므로, 새 키도 base를 물려받는다. 의도한 값이 아닌 부서는 명시해야 한다.

목표 표는 이렇다.

| 부서 | warehouse | warehouseFabric1 | warehouseOutbound |
|---|---|---|---|
| fabric3 (우리 팀) | edit | edit | 허용 |
| fabric1 (디자인·마케팅 소싱) | read | **edit** | **허용** |
| settlement (창고팀) | edit | **edit** | **허용** |
| fabric2 | read | **none** | **차단** |
| business (사업부서) | read | none | 차단 |
| related (유관부서) | none | none | 차단 |

고쳐야 하는 항목은 셋이다.

```ts
  {
    id: "fabric1", label: "통합원단부 1팀(디자인·마케팅 소싱)", short: "1팀", hint: "소싱 의뢰(REQUEST) 편집, 1팀 창고 편집, 3팀 창고는 읽기+출고 요청",
    access: preset("read", { fabricRequest: "edit", excelBackup: "none", warehouseFabric1: "edit", warehouseOutbound: "edit" }),
  },
  {
    id: "fabric2", label: "통합원단부 2팀", short: "2팀", hint: "요청 편집, HOME 블러, 나머지 읽기",
    access: preset("read", { fabricRequest: "edit", excelBackup: "none", warehouseFabric1: "none", warehouseOutbound: "none" }),
  },
  {
    id: "settlement", label: "정산관리팀(창고팀)", short: "창고", hint: "3팀·1팀 창고 편집, HOME 블러, 캘린더 읽기",
    access: preset("none", { warehouse: "edit", warehouseFabric1: "edit", warehouseOutbound: "edit", home: "read", calendar: "read" }),
  },
```

`fabric3`은 `preset("edit", {})`라 새 키도 edit이 된다. 고치지 마라.
`business`와 `related`는 base가 `"none"`이라 새 키도 none이 된다. 고치지 마라.

### 3. `src/data/auth.ts` — 전역 읽기 가드가 1팀 편집을 막는 문제

121행이 지금 이렇다.

```ts
  return useAuthStore((state) => state.isOwner ? "edit" : accessForPath(pathname, state.access))
```

`/warehouse`는 `warehouse` 키로 풀린다. 1팀은 `warehouse: "read"`라 `ReadOnlyGuard`(`src/components/layout/ReadOnlyGuard.tsx`, App.tsx 160행에서 전역 마운트)가 **1팀 스코프의 셀 편집까지 통째로 막는다.** 더블클릭, 붙여넣기, Delete가 전부 차단된다.

전역 가드는 화면 단위라 페이지 안 상태(`teamScope`)를 모른다. 그래서 `/warehouse`에서는 두 키 중 높은 쪽을 돌려주고, **정밀한 판정은 `Warehouse.tsx`가 한다.**

`useScreenAccess`를 이렇게 바꾼다.

```ts
const ACCESS_RANK: Record<ScreenAccess, number> = { none: 0, read: 1, edit: 2 }

/**
 * 창고는 화면 하나에 3팀·1팀 두 스코프가 산다. 전역 ReadOnlyGuard 는 화면 단위라
 * 스코프를 모르므로 둘 중 높은 쪽을 돌려준다. 스코프별 편집 가능 판정은 Warehouse.tsx 가 한다.
 * 여기서 낮은 쪽을 돌려주면 1팀이 자기 원단도 못 고친다.
 */
export function useScreenAccess(pathname: string): ScreenAccess | null {
  return useAuthStore((state) => {
    if (state.isOwner) return "edit"
    const base = accessForPath(pathname, state.access)
    if (permissionKeyForPath(pathname) !== "warehouse") return base
    const fabric1 = state.access.warehouseFabric1
    return ACCESS_RANK[fabric1] > ACCESS_RANK[base ?? "none"] ? fabric1 : base
  })
}
```

`permissionKeyForPath`와 `ScreenAccess` 타입을 `./screen-permissions`에서 import 한다. 기존 함수 이름과 시그니처는 그대로 둔다.

**이 완화 때문에 `Warehouse.tsx`의 스코프 게이팅이 유일한 방어가 된다.** 아래 4번을 빠뜨리면 1팀이 3팀 원단을 고칠 수 있다.

### 4. `src/routes/Warehouse.tsx` — 스코프별 게이팅

`export function Warehouse()` 안, `teamScope` 선언 근처에 판정을 모아 둔다.

```ts
  const access = useAuthStore((state) => state.access)
  const scopeAccess = teamScope === "team1" ? access.warehouseFabric1 : access.warehouse
  /** 지금 보고 있는 스코프를 고칠 수 있는가. 버튼과 셀 편집이 모두 이 값을 본다. */
  const canEditScope = isOwner || scopeAccess === "edit"
  /** 출고 요청 메일은 데이터를 저장하지 않는 기능이라 편집과 따로 본다. */
  const canRequestOutbound = isOwner || access.warehouseOutbound !== "none"
  const canSeeTeam3 = isOwner || access.warehouse !== "none"
  const canSeeTeam1 = isOwner || access.warehouseFabric1 !== "none"
```

**기존 `canWrite`(438행)를 지우지 마라.** 로그인·승인 여부를 보는 값이라 성격이 다르다. `canEditScope`와 `and`로 묶어 쓴다.

#### 4-1. 팀 세그먼트

R221에서 넣은 세그먼트(`3팀 원단 / 1팀 원단`)를 권한으로 거른다.

- 둘 다 볼 수 있으면 지금처럼 버튼 두 개.
- 하나만 볼 수 있으면 **세그먼트 자체를 숨기고** 그 스코프로 고정한다. 버튼 하나만 남은 세그먼트는 군더더기다.
- `teamScope` 초기값은 `canSeeTeam3 ? "team3" : "team1"`이다.
- `canSeeTeam3`가 false인데 `teamScope`가 `team3`이면 `team1`로 옮기는 effect를 둔다. 권한이 나중에 로드되기 때문이다.

#### 4-2. 툴바 버튼

1483행 툴바에서, **데이터를 바꾸는 버튼 전부**에 `canEditScope`를 더한다.

대상은 이렇다. 선택 입고(RECEIVE), 직접 추가, 선택 삭제(REMOVE), 입고 확인(CONFIRM), 입고 확인 취소(UNCONFIRM), 출고(OUTBOUND), 소진(EXHAUST), 폐기(DISPOSE), 입고 대기로(UNRECEIVE), 창고 보관으로·입고 대기로(RESTORE), 전체 확인 처리.

**출고 요청 메일만 `canRequestOutbound`를 본다.**

```tsx
        {tab === "WAREHOUSE" && canRequestOutbound ? <Button ... onClick={() => setOutboundMailOpen(true)}><Mail />출고 요청 메일</Button> : null}
```

R222에서 만드는 1팀 버튼(입고 등록, 엑셀에서 붙여넣기)도 `canEditScope`를 본다. R222가 아직 안 들어갔으면 이 항목은 건너뛰고 보고에 한 줄 남겨라.

검색, 미확인 N건 토글, 배치도 보기, 엑셀 내보내기는 읽기 동작이라 막지 않는다.

폐기 라운드 버튼은 3팀 업무다. `teamScope === "team3" && (isOwner || access.warehouse === "edit")`일 때만 보인다.

#### 4-3. 셀 편집

1358행 근처에서 `manualId`로 인라인 편집 가능 여부를 정한다. 여기에 `canEditScope`를 더한다.

```ts
                    const manualId = canEditScope && (…기존 판정…) ? item.sample?.id : undefined
```

Rack No. 편집(`rackEditable`)도 같다. 1팀 Rack은 창고팀이 관리하지만, 창고팀은 `warehouseFabric1: "edit"`이라 자연히 열린다.

#### 4-4. 읽기 표시

전역 `ReadOnlyGuard`의 "읽기 권한 화면" 배지는 이제 `/warehouse`에서 안 뜬다(3번에서 완화했다). 대신 `scopeAccess === "read"`일 때 툴바 오른쪽에 같은 모양의 작은 배지를 둔다.

```tsx
        {!canEditScope && scopeAccess === "read" ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/95 px-2.5 py-1 text-xs font-semibold text-sky-700"><Eye className="size-3.5" aria-hidden="true" />읽기 전용</span> : null}
```

`Eye`는 `lucide-react`에서 가져온다.

### 5. `src/components/warehouse/DisposalRoundPanel.tsx` 호출부

이미 `team3Ledger`를 받고 `canWrite={currentUserCanEditKey("disposalRounds")}`를 쓴다. `disposalRounds`를 `CACHE_KEY_SCREENS`에서 `["warehouse"]`로 두었으므로 1팀은 자동으로 막힌다. **이 파일을 고치지 마라.**

### 6. `CLAUDE.md` 권한 절

"권한" 절 끝에 한 줄 더한다.

```
- R223: 창고 권한이 셋으로 갈린다. `warehouse`가 3팀 스코프와 라우팅, `warehouseFabric1`이 1팀 스코프, `warehouseOutbound`가 출고 요청 메일(데이터를 저장하지 않는 기능이라 따로 뗐다)이다. 1팀은 3팀 화면에서 읽기와 출고 요청만, 1팀 화면에서는 편집이다. 창고팀은 두 팀 모두 편집한다. **전역 `ReadOnlyGuard`는 `/warehouse`에서 두 키 중 높은 쪽을 보므로(`useScreenAccess`), 스코프별 방어는 `Warehouse.tsx`의 `canEditScope` 하나뿐이다.** 버튼이나 셀 편집을 새로 더할 때 이 값을 빠뜨리면 1팀이 3팀 원단을 고친다.
```

## 알려진 한계 (고치지 말고 그대로 두되, 보고에 적어라)

`canEditCacheKey`는 저장 키 단위다. 1팀이 `fabricOverrides` 배열을 저장할 수 있으면 기술적으로는 그 배열에 3팀 행을 담을 수 있다. **행 단위 제한은 화면에서만 걸린다.** Firestore 규칙은 아직 승인 여부만 본다(CLAUDE.md 권한 절에 이미 적혀 있다). 서버 측 강제는 별도 보안 작업이다. 이번에 손대지 마라.

## 하지 말 것

- **새 키에 `paths`나 `prefixes`를 주지 마라.** 라우팅이 깨진다.
- **`warehouseFabric1`을 `FEATURE_KEYS`에 넣지 마라.** 세 단계가 필요하다.
- **`disposalRounds`에 `warehouseFabric1`을 더하지 마라.**
- **`normalizeScreenAccess`, `createScreenAccess`, `accessToScreenPermissions`를 고치지 마라.** 옵션 배열을 돌기 때문에 새 키가 자동으로 들어간다.
- **`fabric3`, `business`, `related` 부서 기본값을 고치지 마라.** base 값으로 이미 맞다.
- **기존 `canWrite`를 지우거나 `canEditScope`로 바꾸지 마라.** 로그인·승인 판정이라 성격이 다르다.
- **`ReadOnlyGuard.tsx`를 고치지 마라.** `useScreenAccess` 한 곳만 바꾼다.
- **`firestore.rules`를 고치지 마라.**
- **3팀 동작을 바꾸지 마라.** 우리 팀은 `warehouse`와 `warehouseFabric1`이 모두 edit이라 화면이 지금과 완전히 같아야 한다.

## 검증

```bash
cd C:\Users\hkpark\Desktop\fabric-rnd
npm run build
git status --short
```

빌드가 통과하고 아래 파일만 바뀌면 된다.

```
 M CLAUDE.md
 M src/data/auth.ts
 M src/data/departments.ts
 M src/data/screen-permissions.ts
 M src/routes/Warehouse.tsx
```

`src/routes/Calendar.tsx`, `src/routes/Home.tsx`, `src/components/cards/MaterialDeck.tsx`, `src/routes/FabricRequest.tsx`에 사용자가 만든 변경이 있다. **건드리지 마라.** index에 스테이징된 것도 그대로 둬라.

`src/components/settings/UserApprovalPanel.tsx`는 `ACCESS_GROUPS`와 `FEATURE_KEYS`를 돌기 때문에 고치지 않아도 새 권한 두 개가 관리 화면에 나온다. 안 나오면 그때만 손대고 보고에 적어라.

## R224에서 할 것 (이번에 하지 마라)

- Rack 배치도에 두 팀 같이 표시. 창고팀 통합 뷰.
- 폐기 라운드 팀 분리(지금은 3팀만 넘긴다).
- Firestore 규칙에 화면 권한 반영. 행 단위 강제.
- FL 입력 시 3팀 원장·DD 자동 채움, FABRIC REQUEST 연결.
