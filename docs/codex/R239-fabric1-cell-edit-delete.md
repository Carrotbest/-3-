# R239 1팀 창고 표: 더블클릭 셀 편집, 셀 지우기, 반출 이력은 행 버튼만

상태: 미착수. R236~R238 구현. 1팀 302건 웹 이관 완료.

## 요구 (2026-09-22 사용자)

1. 1팀 창고 표의 각 셀은 **더블클릭으로 고친다.**
2. 반출 이력은 **행 머리 버튼으로만** 연다. R236에서 넣은 "FL 칸 더블클릭, 그 밖의 칸 더블클릭으로 반출 이력" 경로를 없앤다.
3. **셀 지우기.** 선택한 셀(범위, Ctrl+클릭 추가 영역 포함)을 Delete·Backspace로 비운다.

3팀 표 동작은 한 글자도 바꾸지 않는다.

## 1팀 편집 가능 열과 저장 위치

1팀 행 = `isFabric1Item(item)`이고 `item.sample?.sourceSheet === FABRIC1_INTAKE_SHEET`. 편집 권한은 기존 `canEditScope`.

| 열 id | 저장 | 비고 |
|---|---|---|
| flNo, color, construction, owner, requestDate, note | `updateManualIntake(sample.id, id, value)` | 샘플 필드 |
| millRef, content, actualWidth, actualWeight, priceYd, priceLb, supplier | `saveFabricFields(item, { [id]: value })` | override.fields |
| storageNo, rackNo | 지금 경로 그대로(`commitStorageNo`, `saveFabricRackNo`) | |
| stock | 지금대로 더블클릭 시 재고 조정 창 | |
| confirm | 편집 없음 | |

## 파일별 조치

### 1. `src/store/useAppStore.ts`

- `updateManualIntake`(752행 근처) 가드 `sample.sourceSheet !== WEB_INTAKE_SHEET`를 `WEB_INTAKE_SHEET`와 `FABRIC1_INTAKE_SHEET` 둘 다 받게 넓힌다. switch에 `case "requestDate": return { ...sample, requestDate: value, completedAt: sample.sourceSheet === FABRIC1_INTAKE_SHEET ? value : sample.completedAt }`를 더한다(1팀은 completedAt=requestDate로 만들었다). 3팀 웹 등록 행에 대한 기존 case 동작은 그대로다.
- 새 함수 `clearFabric1Cells(entries: ReadonlyArray<{ item: FabricLedgerItem; columnId: string }>): Promise<number>`. 여러 셀을 한 번에 비운다.
  - 샘플 필드(위 표 첫 줄) 대상은 `completed`를 한 번 map해서 모두 비우고 저장 **한 번**.
  - override.fields 대상은 키별로 모아 override를 한 번 만들고 저장 **한 번**. override를 만드는 모양은 `saveFabricFields`(914행)의 non-record 분기와 똑같이 한다. **`rackNo`, `roll`, `yds`, `note`, `status`, `storageNo`를 반드시 물려준다**(CLAUDE.md: override를 새로 만드는 곳에 rackNo를 빠뜨리면 번호가 지워진다). 빈 값은 필드 키를 지우지 말고 `""`로 둔다(`deriveFields` 값이 다시 올라오지 않게).
  - 실제로 바뀐 셀 수를 돌려준다.

### 2. `src/routes/Warehouse.tsx` — 편집 판정

- 셀 렌더 안 `editable` 계산(약 1620행, `const editable = rackEditable || storageEditable || ...`)에 1팀 편집을 더한다.
  ```ts
  const fabric1Id = canEditScope && teamScope === "team1" && item.sample?.sourceSheet === FABRIC1_INTAKE_SHEET ? item.sample.id : undefined
  const fabric1Editable = Boolean(fabric1Id) && FABRIC1_EDITABLE.has(column.id)
  ```
  `FABRIC1_EDITABLE`은 파일 상단 상수: 위 표 첫 두 줄의 열 id 13개.
- 편집기 저장(onBlur/Enter 분기, 약 1685~1702행)에서 1팀 분기를 **rack·storageNo 분기 다음, 기존 flNo 분기 앞**에 둔다.
  - 샘플 필드면 `updateManualIntake(fabric1Id, column.id, value)`. **1팀 flNo는 `checkWarehouseFlEntry`를 부르지 않는다**(같은 FL 다른 컬러가 정상).
  - override 필드면 `saveFabricFields(item, { [column.id]: value.trim() })`. 가격은 `0`이면 `""`로 저장.
  - 값이 그대로면 저장하지 않는다.
- 입고 요청일 편집기는 `type="date"` 입력으로 그린다(값 `yyyy-mm-dd`). 나머지는 기존 텍스트 편집기.
- Construction 편집기는 `CONSTRUCTIONS` datalist를 붙인다(`Fabric1IntakeDialog.tsx`와 같은 방식).

### 3. `src/routes/Warehouse.tsx` — 더블클릭

`onDoubleClick`(셀 TableCell)을 이렇게 정리한다.
- 재고 칸: 지금대로 재고 조정.
- `editable`(1팀 편집 포함): `setEditCell`.
- 그 밖: 3팀은 지금대로 `openDetail`. **1팀은 아무것도 하지 않는다.**
- R236에서 넣은 1팀 `flNo` → `openOutboundHistory`, 나머지 칸 → `openOutboundHistory` 분기를 지운다. 행 머리 `History` 아이콘 버튼과 `openOutboundHistory` 함수, 우클릭 메뉴 `원단 상세`는 남긴다.

### 4. `src/routes/Warehouse.tsx` — Delete·Backspace (약 1404행)

지금은 창고보관 탭에서 Rack No. 칸만 지운다. 1팀 범위에서는:
- 선택 영역(`allRangeRects`)이 걸친 모든 셀을 모은다.
- Rack No. 칸은 지금처럼 `saveFabricRackNos`로 한 번에 지운다.
- `FABRIC1_EDITABLE` 칸 중 값이 있는 칸은 `clearFabric1Cells`로 한 번에 지운다.
- R&D No., 재고, 입고확인 칸은 건너뛴다(R&D No.를 없애는 길은 입고 취소뿐이다. 1팀에는 그것도 없다).
- 두 저장을 순서대로 await하고 `셀 N개를 지웠습니다.`를 알린다. 건너뛴 칸이 있으면 `R&D No.·재고·입고확인 칸은 지우지 않습니다.`를 덧붙인다(가운뎃점 대신 쉼표로: `R&D No., 재고, 입고확인 칸은 지우지 않습니다.`).
- 편집 중(입력칸 포커스)이면 기존 방어대로 표 단축키가 동작하지 않는다. 그대로 둔다.
- 3팀 범위는 지금 동작 그대로(Rack No.만).

## 하지 말 것

- 3팀 편집·더블클릭·Delete 동작을 바꾸지 마라.
- `applyFabricAction`, `addFabric1Intake`, 채번 함수를 고치지 마라.
- `saveFabricFields`를 셀마다 반복 호출해서 여러 셀을 지우지 마라. 앞 저장을 뒤 저장이 덮는다.
- 인라인 편집기 키 처리에서 `stopPropagation`을 빼지 마라(CLAUDE.md 주의).

## 공통 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 공개 저장소다. 실데이터를 코드나 문서에 넣지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만.
- public/data, legacy/, legacy-vanilla/, backup/은 열지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 검증 결과, 판단이 필요한 지점만.

## 성공 기준

- `npm run build` 통과. 바뀐 파일은 `useAppStore.ts`, `Warehouse.tsx`뿐.
