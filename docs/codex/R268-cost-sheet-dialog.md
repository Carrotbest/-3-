# R268 원가계산서 저장과 팝업

상태: **미착수.** R267(계산 코어)은 구현·검증 완료다. `src/data/fabric-cost.ts`의
`computeFabricCost`와 `src/data/yarn-blend.ts`의 `composeBlend`, `parseYarnSpec`를 그대로 쓴다.
**그 두 파일의 계산 로직을 고치지 마라.** 기준값 15건이 통과한 상태다.

COST SHEET 목록 화면, 원사 시세표, 엑셀 내보내기는 **R269**다. 이번 범위가 아니다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/cost-sheets.ts` | 신규. `costSheets` 컬렉션 읽기·쓰기, 버전 체인, 경과 판정, 버전 비교 |
| `src/components/dd/CostSheetDialog.tsx` | 신규. 원가계산 팝업 |
| `src/data/schema.ts` | `DevTechnical.cost`를 `costRef` 포인터로 교체 |
| `src/routes/DevelopmentMasterSheet.tsx` | 우클릭 항목, `COST` 열 그룹, 팝업 렌더 |
| `firestore.rules` | `costSheets` 규칙 |

이 다섯 개 외에는 수정하지 마라.

---

## 1. 왜 별도 컬렉션인가

`state/{key}` 문서는 값 하나만 바뀌어도 **배열 전체를 다시 올린다.** 원가계산서는 버전이
계속 쌓이는 이력이라 `records` 안에 넣으면 DD 한 셀 고칠 때마다 원가 이력 전부가 재업로드된다.
`completed`가 이미 4.4MB이고 커밋 요청 한도가 10MiB다.

`src/data/audit.ts`가 같은 이유로 `auditLog` 별도 컬렉션을 쓴다. **그 파일을 먼저 읽고
같은 구조로 만들어라.** 컬렉션 상수, `addDoc` 사용, `isApproved` 전제, 조회 쿼리 형태를 맞춘다.

**`CACHE_KEYS`에 `costSheets`를 넣지 마라.** 동기화 구독 대상이 아니다.
`src/data/storage-claims.ts` 파일 머리 주석에 같은 경고가 있다.

---

## 2. `src/data/cost-sheets.ts`

### 2-1. 타입

```ts
import type { FabricCostSheet } from "./fabric-cost"
import type { BlendEntry } from "./yarn-blend"

/** 계산서 한 버전. Firestore 문서 하나다. */
export interface CostSheetDoc {
  id: string
  /** 같은 원단의 버전을 묶는 키. 첫 버전을 저장할 때 만든다. */
  groupId: string
  /** 1 부터. 같은 groupId 안에서 이어진다. */
  version: number
  /** 이 계산서가 붙은 DD 행 식별자. */
  rowKey: string
  /**
   * 검색 키. **저장 시점의 DD 값을 박아 둔다.**
   * DD 가 나중에 바뀌어도 이 계산서의 근거는 계산한 그날의 값이다.
   */
  flNo: string
  styleNo: string
  project: string
  buyer: string
  season: string
  construction: string
  color: string
  owner: string
  /** 계산 입력과 결과. R267 타입 그대로. */
  sheet: FabricCostSheet
  /** 혼용율 결과. 라벨 문자열까지 같이 남긴다. */
  blend?: { labelText: string; label: BlendEntry[] }
  /** 작성자 이메일. firestore.rules 가 이 값을 본다. */
  by: string
  /** 저장 시각 epoch ms. */
  at: number
  note?: string
}

/** 계산일이 이 날수를 넘으면 시세가 낡은 것으로 본다. */
export const COST_STALE_DAYS = 180
```

### 2-2. 함수

```ts
/** 새 버전을 만든다. 같은 groupId 의 최대 version + 1 을 붙인다. */
export async function saveCostSheet(
  draft: Omit<CostSheetDoc, "id" | "version" | "by" | "at">,
): Promise<CostSheetDoc>

/** 기존 버전을 고친다. 가격과 loss 를 수기로 바로잡는 경로다. */
export async function updateCostSheet(
  id: string,
  patch: Partial<Pick<CostSheetDoc, "sheet" | "blend" | "note">>,
): Promise<void>

/** 조회. 인자를 하나도 주지 않으면 최근 것부터 상한까지 돌려준다. */
export async function listCostSheets(filter?: {
  flNo?: string
  styleNo?: string
  rowKey?: string
  groupId?: string
  limit?: number
}): Promise<CostSheetDoc[]>

/** groupId 마다 최신 버전 하나만 남긴다. */
export function latestByGroup(docs: readonly CostSheetDoc[]): CostSheetDoc[]

/** 계산일이 COST_STALE_DAYS 를 넘었는가. */
export function isCostSheetStale(doc: CostSheetDoc, now?: number): boolean

/** 두 버전의 차이. 화면 표에 그대로 쓴다. */
export function compareCostSheets(prev: CostSheetDoc, next: CostSheetDoc): {
  label: string
  prev: number
  next: number
  diff: number
  diffPct: number
}[]
```

`saveCostSheet`의 version 계산은 `listCostSheets({ groupId })`로 기존 버전을 읽어
최대값 + 1 을 쓴다. `groupId`가 빈 문자열이면 새로 만든다
(`globalThis.crypto?.randomUUID?.()` 우선, 없으면 `${Date.now()}-${난수}`).

`by`는 `auth.currentUser?.email`에서 채운다. `at`은 `Date.now()`다.

`compareCostSheets`가 비교할 항목은 원사 각 줄, 공정 각 줄, `netPerKg`, `netKrwPerYd`다.
`prev`에 없고 `next`에만 있는 줄은 `prev: 0`으로 넣는다. `diffPct`는 `prev`가 0이면 0으로 둔다.

`updateCostSheet`은 `version`, `groupId`, `by`, `at`을 바꾸지 않는다. 그 필드를 `patch`에 받지 마라.

---

## 3. `src/data/schema.ts`

R267에서 넣은 줄을 교체한다. 현재 코드:

```ts
  styleHistory?: string
  /** 국내 원단 사전 원가계산 결과. 입력값까지 같이 남긴다(R267). */
  cost?: FabricCostSheet
}
```

바꾼 뒤:

```ts
  styleHistory?: string
  /**
   * 원가계산서 포인터와 열 표시용 요약(R268).
   * 계산서 본문은 `costSheets` 컬렉션에 있다. 여기에 본문을 넣지 마라.
   * `records`는 배열 통째로 재업로드되는 구조라 이력을 담으면 편집 비용이 계속 커진다.
   */
  costRef?: {
    sheetId: string
    groupId: string
    version: number
    /** 계산 시각 epoch ms. */
    at: number
    netKrwPerYd: number
    netPerYd: number
  }
}
```

`import type { FabricCostSheet } from "./fabric-cost"` 줄은 더 쓰이지 않으면 지운다.
`cost-sheets.ts`가 `schema.ts`를 import 하는 것은 괜찮다. 그 반대만 안 된다.

---

## 4. `src/components/dd/CostSheetDialog.tsx`

`src/components/analysis/AnalysisRequestDialog.tsx`를 먼저 읽고 그 구조와 스타일을 따른다.
새 디자인을 만들지 마라.

### 4-1. Props

```ts
interface CostSheetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 대상 DD 행. 여러 행이면 위쪽에 BODY 탭으로 가른다. */
  rows: DevRecord[]
  /** 저장 가능 여부. false 면 입력칸을 읽기 전용으로 두고 저장 버튼을 막는다. */
  canEdit: boolean
  onSaved: (rowKey: string, ref: NonNullable<DevTechnical["costRef"]>) => void
}
```

### 4-2. 구역 네 개

위에서 아래로 이 순서다.

**머리.** Style No., Project, Buyer, Season, Color, 조직을 읽기 전용으로 보인다.
환율(`fxRate`), 완성 중량(`gsm`), 완성 폭(`widthInch`)은 입력칸이다.
`gsm`은 `tech.actual.weight`가 있으면 그 값, 없으면 `weight`(T.Weight)에서 채운다.
`widthInch`는 `tech.actual.width`에서 채운다. `fxRate` 기본값은 1300이다.
오른쪽에 `grPerYd`를 계산 결과로 보인다.

**원사.** 행을 더하고 지울 수 있는 표다. 열은 이렇다.

| 열 | 내용 |
|---|---|
| 표기 | 자유 입력. `parseYarnSpec`로 해석을 시도한다 |
| 해석 | 파싱 결과를 사람이 읽는 문장으로. 실패하면 `직접 입력` |
| 투입% | `ratio` |
| 단가 | `price` |
| 단위 | `USD/kg`, `USD/lb`, `USD/bale`, `KRW/kg` 중 선택 |
| 선염 | 체크박스(`yarnDyed`) |

표기를 고칠 때마다 `parseYarnSpec`를 다시 부른다. 성공하면 성분을 아래에 접히는 줄로 보이고
드래프트 배수와 오버피드를 고칠 수 있게 한다. 실패하면 성분을 직접 넣는 칸을 준다.

**파싱 결과를 자동으로 확정하지 마라.** 해석 문장을 보여 주고 사람이 그대로 두거나 고친다.
DD 작지 파싱에서 Garment No. 추천을 사람이 고르게 한 것과 같은 방식이다.

표 아래에 `composeBlend` 결과를 보인다. `labelText`를 크게, 그 아래에 정확값과 `warnings`를
작게 붙인다. `warnings`가 있으면 노란 색, 5% 미만 섬유가 있으면 그 줄에 표시를 남긴다.

**공정.** 행을 더하고 지울 수 있는 표다. 열은 `group`, 항목명, 업체, 단가, 단위, loss %다.
`group`은 `yarnDye`, `knitting`, `dyeing`, `other` 중 선택이다.
**배열 순서가 공정 순서다.** 행을 위아래로 옮기는 버튼을 둔다.
`yarnDye`가 맨 앞이 아니면 `computeFabricCost`가 경고를 돌려주니 그 경고를 그대로 띄운다.

단위는 `KRW/kg`, `KRW/yd`, `USD/kg`, `USD/yd` 중 선택이다.
**기본값은 `KRW/kg`이다.** 검사료와 프린트처럼 yd 로 받는 항목만 사람이 `KRW/yd`로 바꾼다.

`mills`에서 업체 기본값을 채운다. `yarnDye`는 `tech.mills.yarn`, `knitting`은
`tech.mills.knitting`, `dyeing`은 `tech.mills.dyeing`, `other`는 `tech.mills.finishing`이다.

**결과.** `computeFabricCost` 결과를 표로 보인다. `lines`를 그대로 줄로 깔고
`sharePct`를 옆에 붙인다. 아래에 `netPerKg`, `netPerYd`, `netKrwPerYd`를 크게 보인다.

이익률(`profitPct`) 칸을 두고 **기본값은 0**이다. 0이면 이익 줄을 감춘다.
칸 옆에 `팀 산출물은 Net price 까지입니다` 를 작게 적는다.

`warnings`는 결과 위에 모아서 띄운다.

### 4-3. 저장

`저장` 버튼은 새 버전을 만든다(`saveCostSheet`). 기존 계산서를 열었으면
`새 버전으로 저장`과 `이 버전 고치기`(`updateCostSheet`) 두 버튼을 둔다.

저장이 끝나면 `onSaved(rowKey, ref)`를 부른다. `ref`는 방금 저장한 문서에서 만든다.

기존 계산서가 있는 행을 열면 최신 버전을 불러 입력칸을 채운다.
버전이 둘 이상이면 위쪽에 버전 선택을 두고, 고른 버전과 그 앞 버전의 차이를
`compareCostSheets`로 표에 보인다.

`isCostSheetStale`이 true 면 머리에 `계산일이 N일 지났습니다` 배지를 띄운다.

### 4-4. 계산은 입력이 바뀔 때마다 즉시 다시 한다

`computeFabricCost`와 `composeBlend`는 순수 함수다. `useMemo`로 감싸고
입력 상태가 바뀌면 다시 계산한다. 버튼을 눌러야 계산되는 방식으로 만들지 마라.

---

## 5. `src/routes/DevelopmentMasterSheet.tsx`

### 5-1. 열 그룹

**92행** `type GroupKey`에 `"cost"`를 더한다.

```ts
type GroupKey = "request" | "original" | "detail" | "schedule" | "result" | "data" | "history" | "ledger" | "cost"
```

**192행** `const GROUPS`의 마지막(`ledger` 그룹 뒤)에 그룹 하나를 더한다.

```ts
  {
    key: "cost", label: "COST", color: "var(--chart-3)", columns: [
      { id: "costKrwPerYd", label: "원/yd", width: 92, align: "right", number: true, value: (row) => row.tech?.costRef?.netKrwPerYd ?? null },
      { id: "costUsdPerYd", label: "$/yd", width: 84, align: "right", number: true, value: (row) => row.tech?.costRef?.netPerYd ?? null },
      { id: "costAt", label: "계산일", width: 84, value: (row) => row.tech?.costRef?.at ? new Date(row.tech.costRef.at).toISOString().slice(0, 10) : "" },
    ],
  },
```

**295행** `DEFAULT_OPEN`에 `cost: false`를 더한다. 기본 접힘이다.

**`COMPUTED_COLUMN_IDS`에 `costKrwPerYd`, `costUsdPerYd`, `costAt` 세 개를 더한다.**
같은 파일 안에 있다. 이걸 빼면 인라인 편집과 붙여넣기로 값이 들어가 버린다.
`isFixedColumn`이 이 집합을 본다.

`costAt`의 경과 판정은 `COST_STALE_DAYS`를 넘으면 `render`에서 글자를 `var(--warning)`으로 칠한다.

### 5-2. 우클릭 항목

**3038행** `요청 연결 해제` 버튼 바로 뒤, `되돌리기` 앞의 구분선(`3039행`) 앞에
구분선 하나와 버튼 하나를 넣는다. 기존 버튼들의 클래스와 구조를 그대로 복사한다.

```
<div className="my-1 h-px bg-[var(--border)]" />
<button ... onClick={() => { setMenu(null); openCostSheet() }} ...>
  <span className="text-[var(--muted-foreground)]"><Calculator className="size-3.5" /></span>
  <span className="flex-1">사전 원가계산…</span>
  <span className="text-[11px] text-[var(--muted-foreground)]">국내 건</span>
</button>
```

`Calculator`는 `lucide-react`에서 import 한다.

`disabled` 조건은 **국내 건이 하나도 없을 때**다. `editEnabled`와 묶지 마라.
읽기 권한만 있는 사람도 계산서를 열어 볼 수 있어야 한다. 저장만 막는다.

```
const costTargetRows = (): DevRecord[] =>
  linkTargetRows().filter((row) => {
    const co = String(row.tech?.development?.co || row.devType || "").trim()
    return co === "국내" || co === "생산"
  })
```

`linkTargetRows()`는 **2173행**에 이미 있다. 그것을 쓴다. 새로 만들지 마라.
GD 건은 GD 가 견적을 주므로 대상이 아니다. 대상이 0건이면 버튼을 `disabled`로 두고
`title`에 `국내 또는 생산 건을 선택하십시오`를 넣는다.

### 5-3. 팝업 렌더

**12행** 근처 import 구역에 `import { CostSheetDialog } from "@/components/dd/CostSheetDialog"`를 더한다.

상태를 하나 둔다. `const [costRows, setCostRows] = useState<DevRecord[]>([])`

`openCostSheet`는 `costTargetRows()`를 `setCostRows`에 넣는다.

**3243행** `RequestBrowseDialog` 렌더 옆에 같은 방식으로 붙인다.

```
<CostSheetDialog open={costRows.length > 0} onOpenChange={(open) => { if (!open) setCostRows([]) }}
  rows={costRows} canEdit={editEnabled} onSaved={(rowKey, ref) => void applyCostRef(rowKey, ref)} />
```

`applyCostRef`는 해당 행의 `tech.costRef`를 갈아 끼우고 `writeDevelopmentRecords`로 한 번 저장한다.
**스냅샷을 먼저 잡아 Ctrl+Z 로 되돌릴 수 있게 한다.** 요청 연결·해제(`unlinkSelectedRequests`)가
쓰는 방식과 같게 맞춘다. 그 함수를 읽고 따라라.

---

## 6. `firestore.rules`

`auditLog` 블록(50~55행) 뒤에 넣는다.

```
    // 원가계산서. 버전이 쌓이는 이력이라 state 가 아니라 별도 컬렉션이다.
    // 수정은 허용한다. 가격과 loss 를 수기로 바로잡는 경로이고, 고친 이력은 auditLog 가 받는다.
    match /costSheets/{docId} {
      allow read: if isApproved();
      allow create: if isApproved()
                    && request.resource.data.by == request.auth.token.email;
      allow update: if isApproved();
      allow delete: if isOwner();
    }
```

3팀만 편집하도록 하는 것은 화면 쪽(`screen-permissions.ts`)에서 R269 에 붙인다.
규칙에 팀 정보가 없어 여기서는 가를 수 없다. 규칙에 팀 판정을 새로 만들지 마라.

---

## 7. 하지 말 것

- `fabric-cost.ts`와 `yarn-blend.ts`의 **계산 로직을 고치지 마라.** 기준값 15건이 통과한 상태다.
  타입을 더 export 해야 하면 더하기만 하라.
- `costSheets`를 `CACHE_KEYS`에 넣지 마라. 동기화 구독 대상이 아니다.
- 계산서 본문을 `tech`에 넣지 마라. 포인터와 요약만이다.
- **`DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라.** tailwind-merge 가 기본
  `fixed`를 지워 팝업이 문서 흐름으로 떨어진다. 안쪽 absolute 요소의 기준은 `fixed`로 이미 선다.
- **긴 목록을 `SectionCard`로 감싸지 마라.** `Reveal`의 IntersectionObserver 임계값이 0.12 라
  카드가 뷰포트보다 길면 영영 안 보인다. `Card`를 직접 쓴다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 무한 렌더로 화면이 백지가 된다(R119 사고).
  크기를 재야 하면 `ResizeObserver`나 layout effect 를 쓴다.
- 우클릭 항목을 `editEnabled`로 막지 마라. 읽기 권한도 열어 볼 수 있다. 저장만 막는다.
- `COMPUTED_COLUMN_IDS`에 세 열을 넣는 것을 빼먹지 마라.
- `dd-export.ts`를 건드리지 마라. COST 열은 엑셀로 내보내지 않는다.
- COST SHEET 목록 화면, 라우트, 사이드바, 원사 시세표, 엑셀 내보내기를 만들지 마라. R269 다.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라. 이번 작업에 삭제는 없다.

## 8. 검증

```
npm run build
git status --short
```

빌드는 모든 수정을 마친 뒤 한 번만 돌린다. `git status --short`에 위 표의 다섯 파일과
이 문서만 보여야 한다.

화면 확인은 박향근이 한다. 보고에 아래 두 줄이 되는지만 적어라.

- DD MASTER 에서 국내 건 행을 우클릭했을 때 `사전 원가계산…`이 활성인가
- GD 건만 선택했을 때 그 항목이 `disabled`인가

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
