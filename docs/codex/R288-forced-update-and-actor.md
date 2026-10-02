# R288 — 새 버전 강제 새로고침과 창고 기록자 실명

추론 강도: **medium**. 파일 4개. 두 작업은 서로 독립이다.

## 상태

미착수. 워킹트리에 R282~R286 변경이 있다. **되돌리지 마라.** R287은 커밋됐다.

## 왜

2026-10-02 창고 사고 뒤 정리 작업을 하는 동안 옛 코드가 열린 창이 다시 데이터를 오염시킬 수 있었다. 세 부서가 같은 데이터를 쓰므로 새 버전이 나오면 모두 즉시 새 코드로 넘어와야 한다. 지금 알림은 화면 아래 배너이고 "나중에"로 10분씩 미룰 수 있으며 5분마다 확인한다.

또 창고 이력 1,710건 중 1,403건, 상태 기록 1,014건 중 1,013건의 기록자가 `관리자`다. 누가 처리했는지 알 수 없다. 권한 규칙(다음 작업)의 전제다.

## A. 강제 새로고침

### `src/data/app-version.ts`

- `CHECK_INTERVAL_MS`를 `60 * 1000`으로 바꾼다.
- 미루기를 없앤다. `SNOOZE_DURATION_MS`, `SNOOZE_KEY`, `readSnoozeUntil`, `isSnoozed`, `snooze`, `snoozeUntilRef`를 지운다. 반환형은 `{ available: boolean }`이다.
- 한 번 `available`이 true가 되면 다시 false로 돌리지 않는다.
- `visibilitychange`에 더해 `window`의 `focus` 이벤트에서도 `checkForUpdate`를 부른다. 정리 함수에서 리스너를 뗀다.
- DEV에서는 지금처럼 검사하지 않는다.

### `src/components/layout/UpdateBanner.tsx` 통째 교체

- `available`이면 `createPortal`(react-dom)로 `document.body`에 전체 화면 차단층을 그린다. `fixed inset-0 z-[1000]`, 배경 `bg-black/55 backdrop-blur-sm`, 가운데 카드 하나.
- 카드 문구:
  - 제목 `새 버전이 배포되었습니다`
  - 본문 `여러 부서가 같은 데이터를 쓰고 있어 새로고침한 뒤에 계속 사용할 수 있습니다. 작업 중이던 내용은 저장하고 새로고침합니다.`
  - 버튼 하나 `새로고침`. 닫기와 나중에 버튼은 없다.
- `role="alertdialog"`, `aria-modal="true"`, 제목에 `aria-labelledby`. 열릴 때 버튼에 포커스.
- 열려 있는 동안:
  - `document.getElementById("root")`에 `inert` 속성을 붙인다. 닫히는 일은 없지만 언마운트 정리에서 뗀다.
  - `window.addEventListener("keydown", handler, true)`(캡처). 대상이 카드 밖이면 `event.preventDefault(); event.stopImmediatePropagation()`. 창고 화면의 Delete 단축키 같은 전역 키 처리가 뒤에서 돌지 않게 하는 것이다.
- 버튼을 누르면 버튼을 비활성화하고 `저장 중…`으로 바꾼다. `await flushDevelopmentRecords()`(`@/store/useAppStore`)를 try/catch로 감싼 뒤 결과와 상관없이 `window.location.reload()`.
- 색은 기존 토큰(`--card`, `--foreground`, `--muted-foreground`, `--border`, `--radius`)과 `@/components/ui/button`의 `Button`을 쓴다.

`src/App.tsx`의 `<UpdateBanner />` 마운트는 그대로 둔다.

## B. 창고 기록자 실명

### `src/data/schema.ts`

- `FabricLedgerOverride`에 `updatedByEmail?: string`을 `updatedBy` 바로 아래에 더한다. 주석 `/** 저장한 계정 메일. 권한 판단과 감사에 쓴다. 화면에는 이름(updatedBy)을 보인다. */`
- `FabricLedgerEvent`에 `actorEmail?: string`을 `actor` 바로 아래에 더한다. 주석 `/** 처리한 계정 메일. 권한 판단과 감사에 쓴다. 화면에는 이름(actor)을 보인다. */`

### `src/store/useAppStore.ts`

1. import 줄에 `import { auth } from "@/data/firebase"`를 더한다.
2. `recordIdentity` 정의(425행 근처) 바로 위에 도우미 둘을 둔다.

```ts
/** 지금 로그인한 사람 이름. 창고 이력과 상태 기록의 기록자다. 로그인 전이면 예전처럼 '관리자'. */
function currentActorName(): string {
  const user = auth.currentUser
  return user?.displayName?.trim() || user?.email?.split("@")[0] || "관리자"
}
function currentActorEmail(): string | undefined {
  return auth.currentUser?.email ?? undefined
}
```

3. 기록자 기본값 `"관리자"`를 `currentActorName()`으로 바꾼다. 대상(현재 줄 번호):
   - 795 `confirmWarehouseBaseline(..., actor = "관리자")` 기본 인자
   - 832 `options.actor.trim() || "관리자"`
   - 955, 1031, 1082, 1310 `updatedBy: "관리자"`
   - 1355 `input.actor?.trim() || "관리자"`
   - 1509 `removeFabricRows(..., actor = "관리자")` 기본 인자
   1팀 입고(1168, 1183, 1259, 1274)의 `input.owner.trim() || "관리자"`는 **그대로 둔다.** 1팀 입고 담당자 이름이다.
4. 이 파일에서 만드는 **모든** `FabricLedgerOverride` 객체 리터럴(`updatedBy:`가 있는 곳)에 `updatedByEmail: currentActorEmail(),`를, **모든** `FabricLedgerEvent` 객체 리터럴(`actor`가 있는 곳)에 `actorEmail: currentActorEmail(),`를 더한다. 1팀 입고 함수도 포함한다. 기존 객체를 펼쳐 recordId만 붙이는 `backfillFabricRecordIds`의 `{ ...entry, recordId }`, `{ ...event, recordId }`에는 더하지 않는다. 남이 한 기록의 기록자를 바꾸면 안 된다.

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 공개 저장소다. 실데이터, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `src/data/auth.ts`의 쓰기 권한 함수, `firestore-sync.ts`는 건드리지 마라.
- `buildFabricLedger`, `applyFabricActions`의 상태 판단 로직은 건드리지 마라. 기록자 필드만 더한다.
- public/data 아래 JSON을 열지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만 돌려라. 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 통과. `grep -n '"관리자"' src/store/useAppStore.ts` 결과가 1팀 입고 4곳과 `currentActorName` 안 1곳만 남는다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
