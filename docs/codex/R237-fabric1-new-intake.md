# R237 1팀 신규 입고, 열 정리, 롤 표시 버튼 제거

상태: 미착수. R236(1팀 채번 8000~9999 순환, 1팀 열 구성, 반출 이력 팝업)은 구현, 빌드 통과.

## 배경

R222(1팀 입고 등록)는 설계만 있고 구현되지 않았다. `addFabric1Intake`, `Fabric1IntakeDialog`, `statusFromSample`의 1팀 분기 모두 없다. 이번에 R222의 데이터 경로(1~3번)를 가져오되 화면은 아래 새 결정대로 만든다. **R222의 붙여넣기 창(Fabric1PasteDialog)과 인라인 편집(7번)은 이번에 만들지 않는다.**

## 확정 사항 (2026-09-22 사용자)

1. 1팀 엑셀의 `Ref. No` 열에는 실제로 FL 번호가 들어 있다. 제목을 잘못 쓴 것이다. 화면 이름은 **`FL No.`** 이다. 그 오른쪽에 새 항목 **`Mill Ref.`**(업체가 쓰는 원단 번호)를 둔다.
2. 1팀 화면에서 **공급처 열을 뺀다.** 위치, 폐기 열은 이미 없다(R236).
3. **`롤 표시` 버튼을 두 팀 모두에서 없앤다.** 롤 원단은 입고할 때 체크박스로만 정하고 R&D No. 뒤 `R` 표기로만 보인다. 3팀 입고 창에는 이미 롤 체크박스가 있다.
4. 1팀 범위에서 `입고 대기로` 버튼과 `미확인 N건` 토글을 숨긴다.
5. 1팀은 입고 대기가 없다. 원단을 받으면 바로 입고한다. **1팀 창고보관 탭에 `신규 입고` 버튼과 팝업**을 둔다. 저장하는 순간 창고 보관이 되고 R&D No.가 자동 채번된다.
6. 실물 확인은 지금처럼 창고팀이 `입고 확인` 버튼으로 한다. 신규 입고 팝업에 Rack No. 칸을 두지 않는다.

## 입력 항목 (1팀 엑셀 302행 실측으로 필수/선택을 나눴다)

| 순서 | 화면 라벨 | 필수 | 저장 위치 | 비고 |
|---|---|---|---|---|
| 1 | FL No. | 필수 | `sample.flNo` | `FL\d{8}`이 아니면 노란 경고만, 저장은 막지 않는다. **FL 중복 경고를 띄우지 마라**(같은 FL에 컬러별로 따로 입고한다) |
| 2 | Mill Ref. | 선택 | `override.fields.millRef` | 새 필드 |
| 3 | Color | 필수 | `sample.ledger.color` | |
| 4 | Construction | 필수 | `sample.construction` | `src/data/constructions.ts`의 `CONSTRUCTIONS`로 입력+추천 목록. 목록에 없는 값도 받는다 |
| 5 | Content | 필수 | `override.fields.content` | |
| 6 | Width (INCH) | 필수 | `override.fields.actualWidth` | 문자열. `53/55` 형태 |
| 7 | Weight (G/M2) | 필수 | `override.fields.actualWeight` | 숫자 문자열 |
| 8 | Price ($/YD) | 선택 | `override.fields.priceYd` | `0`은 빈 값으로 저장(가격 미확인) |
| 9 | Price ($/LB) | 선택 | `override.fields.priceLb` | 같음 |
| 10 | 입고 수량 (YDS) | 필수 | `override.yds` | 옆에 `수량 미상` 체크박스. 체크하면 칸이 비활성, `yds`는 저장하지 않는다(**0을 넣지 마라.** 0은 소진으로 읽힌다) |
| 11 | 입고담당자 | 필수 | `sample.owner` | 기본값은 로그인 표시 이름 |
| 12 | 입고 요청일 | 필수 | `sample.requestDate` | 기본값은 오늘, `yyyy-mm-dd` |
| 13 | 롤 원단 | 선택 | override `roll` 플래그 | 3팀 입고 창의 `receiveRolls`와 같은 방식 |
| 14 | Remark | 선택 | `sample.note` | |

R&D No.는 입력칸이 아니다. 팝업 맨 위에 `이번 입고 번호 8980` 처럼 **예정 번호를 크게 보여 준다**(`nextStorageNumbers(ledger, 1, "team1")[0]`, 원장이 바뀌면 다시 계산). 롤 체크 시 `8980R`로 보인다(`storageNoLabel`과 같은 규칙).

## 파일별 조치

### 1. `src/data/fabric-ledger.ts`

- 334행 `statusFromSample`의 `if (sheet.includes("폐기"))` **앞에** 넣는다.
  ```ts
  // 1팀은 실물이 온 뒤에 등록한다. 등록이 곧 창고 보관이다(입고 대기 단계가 없다).
  if (sample.sourceSheet === FABRIC1_INTAKE_SHEET) return "WAREHOUSE"
  ```
- 355행 `sampleFallback`을 1팀도 `sample.id`를 쓰게 바꾼다.
  ```ts
  return (sample.sourceSheet === WEB_INTAKE_SHEET || sample.sourceSheet === FABRIC1_INTAKE_SHEET) && sample.id ? sample.id : `${sample.sourceSheet ?? "sample"}::${index}`
  ```
- 149행 `FABRIC_FIELD_IDS`에 `"millRef"`를 더한다.

### 2. `src/store/useAppStore.ts` — `addFabric1Intake`

725행 `addManualIntake` 아래에 새 함수를 만든다. **`addManualIntake`, `applyFabricAction`은 고치지 마라.**

```ts
export interface Fabric1IntakeInput {
  storageNo: string
  flNo: string
  color: string
  construction: string
  owner: string
  requestDate: string
  note: string
  yds: number | null
  roll: boolean
  /** millRef, content, actualWidth, actualWeight, priceYd, priceLb */
  fields: Record<string, string>
}
export async function addFabric1Intake(inputs: readonly Fabric1IntakeInput[]): Promise<void>
```

배열을 받는다(나중에 이관 붙여넣기가 같은 함수를 쓴다). 순서:
1. 입력마다 `CompletedSample`을 만든다. `id`는 `f1:${Date.now()}:${랜덤}`, `sourceSheet: FABRIC1_INTAKE_SHEET`, `storageNo`, `flNo`, `ledger: { color }`, `construction`, `owner`, `requestDate`, `completedAt = requestDate`, `note`. `process`와 `inhouse`는 `addManualIntake`와 같은 빈 모양.
2. `completed`에 모두 더하고 저장을 **한 번** 부른다(`addManualIntake`가 쓰는 방식 그대로).
3. 새 `completed`로 `buildFabricLedger`를 돌려 방금 만든 행의 `key`를 `storageNo`로 찾는다.
4. key마다 `FabricLedgerOverride`: `status: "WAREHOUSE"`, `storageNo`, `yds`(null이면 필드를 빼라), `roll`(true일 때만), `fields`, `updatedAt`, `updatedBy`. 저장 **한 번**.
5. `FabricLedgerEvent`: `action: "RECEIVE"`, `fromStatus: "READY"`, `toStatus: "WAREHOUSE"`, **`occurredAt`은 지금 시각 ISO**(R236 채번 프론티어가 `intakeAt`=RECEIVE `occurredAt`으로 마지막 입고를 찾는다. 날짜만 넣으면 같은 날 입고가 모두 동점이 된다), `recordedAt` 지금, `storageNo`, `qty: yds ?? undefined`, `note: "1팀 신규 입고"`. 저장 **한 번**.

override·event의 정확한 필드 이름과 저장 함수는 같은 파일의 `applyFabricActions`와 `saveFabricFields`(914행)가 쓰는 것을 그대로 따른다. `rackNo`는 넣지 않는다.

### 3. `src/routes/Warehouse.tsx` — 값 읽기와 열

- `WarehouseColumnId`(66행)에 `"millRef"`를 더한다.
- `cellValue`와 `coreCell`(열 값을 그리는 곳) 두 곳 모두:
  - `millRef`: `item.fields.millRef ?? ""`
  - `actualWidth`, `actualWeight`: 지금 식 뒤에 `|| (item.fields.actualWidth ?? "")`, `|| (item.fields.actualWeight ?? "")`를 붙인다. 3팀은 앞 출처가 먼저라 동작이 안 바뀐다.
  - `content`, `priceYd`, `priceLb`가 `item.fields`를 읽는지 본다. 안 읽으면 같은 방식으로 붙인다.
- `FABRIC1_ONLY_COLUMNS`(160행 근처)에 `"millRef"`를 더한다(3팀 표에 안 나오게).
- `TEAM1_COLUMN_GROUPS`(R236에서 추가) 대장 그룹을 이렇게 바꾼다:
  `flNo "FL No."`, `millRef "Mill Ref." (width 120)`, `color`, `construction`, `content`, `actualWidth`, `actualWeight`, `priceYd`, `priceLb`, `owner "입고담당자"`, `requestDate "입고 요청일"`, `note "Remark"`. **`supplier` 줄을 지운다.**
- 반출 이력 팝업·FL 더블클릭 동작(R236)은 그대로 둔다. 1팀 셀 인라인 편집은 이번에 만들지 않는다.

### 4. `src/routes/Warehouse.tsx` — 툴바

- **롤 표시 버튼 제거(두 팀).** 1813행 `롤 표시` 버튼을 지우고, 다른 곳에서 안 쓰게 되면 1384행 `toggleRollMark`도 지운다. 3팀 입고 창의 롤 체크박스(`receiveRolls`)와 `storageNoLabel`은 **그대로 둔다.**
- **1팀 숨김.** `teamScope === "team1"`이면 다음을 그리지 않는다.
  - 1828행 창고보관 탭 `입고 대기로`(UNRECEIVE)
  - 1832행 이력 탭 `입고 대기로`(RESTORE READY). 이력 탭의 `창고 보관으로`는 남긴다.
  - 1834행 `미확인 N건` 토글. 1팀으로 바꿀 때 `unconfirmedOnly`가 켜져 있으면 끈다(`changeTeamScope`에서 `setUnconfirmedOnly(false)`).
  - `입고 확인`, `확인 취소`, 출고, 소진, 폐기, 출고 요청 메일은 1팀에서도 그대로 둔다.
- **신규 입고 버튼.** `teamScope === "team1" && tab === "WAREHOUSE" && canEditScope`일 때 검색칸 옆 툴바 맨 앞에 `<Button size="sm"><Plus />신규 입고</Button>`을 둔다. 누르면 `Fabric1IntakeDialog`를 연다.

### 5. 새 파일 `src/components/warehouse/Fabric1IntakeDialog.tsx`

- props: `open`, `onOpenChange`, `ledger: readonly FabricLedgerItem[]`, `defaultOwner: string`, `onSaved(storageNo: string)`.
- Dialog·Label·Input 사용 방식은 `src/components/warehouse/InboundRequestMailDialog.tsx`를 따른다. 팝업 흰 배경은 `src/components/ui/dialog.tsx`의 기존 스타일을 쓴다.
- 레이아웃: 맨 위 예정 번호 배너. 그 아래 **`필수` 묶음**(FL No., Color, Construction, Content, Width, Weight, 입고 수량+수량 미상, 입고담당자, 입고 요청일)과 **`선택` 묶음**(Mill Ref., Price YD, Price LB, 롤 원단, Remark)을 소제목으로 나눠 2열 그리드로 그린다. 필수 라벨 뒤에 붉은 `*`.
- 저장 누르면 필수 빈 칸에 붉은 테두리를 주고 막는다. 입고 수량은 `수량 미상`이 체크되어 있으면 통과, 아니면 0보다 큰 숫자여야 한다.
- **채번과 동시 입고 방지.** 저장할 때 번호를 다시 계산하고 `src/data/storage-claims.ts`의 `claimStorageNumbers`로 예약한 뒤 저장, 끝나면 `releaseStorageNumbers`. 방식은 `Warehouse.tsx` 974~984행(3팀 입고)과 같게 한다. 이 팝업에 채번 함수가 필요하므로 `nextStorageNumbers`를 `Warehouse.tsx`에서 export하거나 props로 `suggestNo: () => number | null`을 받는다. 파일 사이 순환 import가 생기면 props 방식으로 한다. 예약 번호가 배너 번호와 다르면 저장 후 알림에 `예정 8980 → 실제 8981` 식으로 알린다(문구에 화살표 대신 "예정 8980, 실제 8981").
- 저장은 `addFabric1Intake([input])` 한 번.
- 버튼 셋: `취소`, `입고하고 계속`, `입고`. `입고하고 계속`은 FL No., Mill Ref., Color, Content, Width, Weight, Price, 입고 수량, 수량 미상, 롤, Remark를 비우고 Construction, 입고담당자, 입고 요청일은 남긴 채 새 예정 번호를 보여 준다.
- 저장 뒤 `onSaved`로 부모가 검색·열 필터를 비우고 알림 줄에 `R&D No. 8980 입고했습니다.`를 띄운다.

### 6. `CLAUDE.md` 창고 절

끝에 한 줄 더한다.
"- 1팀 신규 입고(R237): 1팀은 입고 대기가 없다. 창고보관 탭 `신규 입고` 팝업에서 저장하는 순간 `FABRIC1_INTAKE_SHEET` 샘플, WAREHOUSE override, RECEIVE 이력(occurredAt=저장 시각)이 한 번에 생기고 R&D No.가 자동 채번된다(`addFabric1Intake`). 1팀 엑셀의 `Ref. No` 열은 실제로 FL No.다. 업체 번호는 `millRef` 필드다. 롤 표시는 입고할 때만 정하고 사후 토글 버튼은 없앴다."

## 하지 말 것

- 엑셀 파일 파서, 파일 입력칸, 드롭존을 만들지 마라(2026-09-14 결정).
- 신규 입고 팝업에 Rack No. 칸을 넣지 마라. 창고팀이 입고 확인 때 적는다.
- 잔량·수량에 0을 쓰지 마라. 미상은 필드 없음이다.
- `CompletedSample`, `DevRecord` 타입을 넓히지 마라. Mill Ref., Content, Price, Width, Weight는 `override.fields`에만 산다.
- 저장을 건마다 부르지 마라.
- 1팀 행을 FL 원장, RDDA 집계에 넣지 마라.
- 3팀 화면과 채번을 바꾸지 마라. 3팀에서 달라지는 것은 `롤 표시` 버튼이 사라지는 것뿐이다.
- R236의 채번 함수 로직을 고치지 마라.

## 공통 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만 돌려라.
- public/data 아래 JSON을 열지 마라. legacy/, legacy-vanilla/, backup/은 읽지 마라.
- 외부 자격증명이 필요한 명령은 돌리지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 검증 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.

## 성공 기준

- `npm run build` 통과.
- `git status --short`에 `CLAUDE.md`, `fabric-ledger.ts`, `useAppStore.ts`, `Warehouse.tsx`, 새 `Fabric1IntakeDialog.tsx`, 이 지시서 외 변경이 없다.
