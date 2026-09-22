# R238 1팀 신규 입고: 한 건 폼을 여러 줄 입력표로

상태: 미착수. R237(1팀 신규 입고 한 건 폼, `addFabric1Intake`)은 구현, 빌드 통과. 1팀 302건 이관 완료(웹 데이터).

## 요구 (2026-09-22 사용자)

1. 신규 입고 팝업을 **줄 단위 입력표**로 바꾼다. 여러 원단을 한 번에 적고 한 번에 입고한다. 화면은 넓게 쓴다.
2. 필수/선택 소제목과 설명을 없앤다. 필수 열 머리에 붉은 `*`만 단다.
3. R&D No.는 줄마다 자동으로 채우되 사람이 칸을 눌러 고칠 수 있다.
4. 채번 예약은 3팀 입고와 같은 방식이다(`Warehouse.tsx` 약 960~995행, `claimStorageNumbers` → 저장 → `releaseStorageNumbers`).

## 대상 파일

- `src/components/warehouse/Fabric1IntakeDialog.tsx`: 전면 재작성. props(`open`, `onOpenChange`, `ledger`, `defaultOwner`, `suggestNumbers`, `onSaved`)는 유지한다. `Warehouse.tsx` 1863행 호출부는 바꾸지 않아도 되게 한다.
- `src/store/useAppStore.ts`: 건드리지 않는다. `addFabric1Intake(inputs)`가 이미 배열을 받는다. `fields`에 `supplier`를 넣으면 그대로 저장된다.

## 화면

- `DialogContent` 폭 `w-[min(96vw,1680px)] max-w-none`, 높이 `max-h-[88vh]`. 표 영역만 가로·세로 스크롤한다. 머리 줄은 sticky.
- 제목 `1팀 신규 입고`. 설명 한 줄: `Rack No.는 창고팀이 입고 확인 때 입력합니다.` 그 외 안내문 없음.
- 표 열(1팀 창고 표와 같은 순서). `*`는 필수.

| 열 | 입력 | 폭(px) |
|---|---|---|
| (줄 번호) | 읽기 | 36 |
| R&D No. | 입력, 아래 규칙 | 84 |
| 입고 수량 (YDS) * | 숫자 + `미상` 체크박스 한 칸 안에 | 120 |
| 롤 | 체크박스 | 44 |
| FL No. * | 텍스트 | 120 |
| Mill Ref. | 텍스트 | 110 |
| Color * | 텍스트 | 110 |
| Construction * | 텍스트 + `CONSTRUCTIONS` datalist | 130 |
| Content * | 텍스트 | 180 |
| Width (INCH) * | 텍스트, placeholder `53/55` | 90 |
| Weight (G/M2) * | 텍스트 | 90 |
| Price ($/YD) | 텍스트 | 84 |
| Price ($/LB) | 텍스트 | 84 |
| 입고담당자 * | 텍스트 | 96 |
| 입고 요청일 * | date | 130 |
| Remark | 텍스트 | 180 |
| 완사입 업체 | 텍스트 → `fields.supplier` | 140 |
| (동작) | `복제`, `삭제` 아이콘 버튼 | 64 |

- 칸은 테두리 얇은 `Input`(`h-8 text-xs`), 가운데 정렬(1팀 표와 맞춤). 필수 칸이 비어 저장이 막히면 붉은 테두리.
- 표 아래 줄: `+ 줄 추가` 버튼, 오른쪽에 `N건 입고 예정`. 푸터: `취소`, `입고 (N건)`. 기존 `입고하고 계속` 버튼과 큰 번호 배너는 없앤다.
- 처음 열면 빈 줄 1개. `줄 추가`는 바로 위 줄의 입고담당자, 입고 요청일, Construction을 물려받는다. `복제`는 그 줄의 모든 값을 복사하되 R&D No.는 자동으로, Color와 입고 수량은 비운다(같은 원단 다른 컬러 입고가 흔하다).
- 마지막 줄 마지막 입력칸에서 Tab을 누르면 줄을 하나 더한다.
- **엑셀 붙여넣기**: 어느 칸에서든 여러 줄 또는 탭이 든 텍스트를 붙여넣으면 그 칸부터 오른쪽·아래로 채우고 모자란 줄을 만든다. 열 순서는 위 표에서 R&D No.부터다(줄 번호·동작 열 제외, 체크박스 열은 `Y`, `O`, `1`, `true`, `R`, `ROLL`이면 체크). 한 줄짜리 탭 없는 텍스트는 일반 붙여넣기로 둔다. 파일 파서는 만들지 않는다.
- 모든 칸이 비었거나 기본값(입고담당자, 입고 요청일, Construction 물려받은 값)만 있는 줄은 빈 줄로 보고 저장·검증·채번에서 뺀다.

## R&D No. 규칙

- 줄 상태에 `storageNo`(사람이 친 값, 빈 문자열이면 자동)를 둔다.
- 자동 번호: 빈 줄이 아닌 자동 줄에 위에서부터 순서대로 배정한다. 후보는 `suggestNumbers(자동 줄 수 + 수동 줄 수 + 30)`에서 **수동 번호와 겹치는 것을 뺀** 순서다. 자동 칸은 회색 글씨로 배정 번호를 값처럼 보인다(placeholder가 아니라 표시값). 칸을 누르면 편집되고, 내용을 고치면 수동 줄이 된다. 내용을 모두 지우면 자동으로 돌아간다.
- 롤 체크 시 표시만 `8980R`(`storageNoLabel`). 저장 값은 숫자.
- 수동 번호 검사(입력 즉시 칸 아래에 작은 붉은 글씨, 저장 차단): 4자리, 8000~9999(`FABRIC1_STORAGE_NO_MIN`, `FABRIC1_STORAGE_NO_MAX`), 표 안 중복 없음, 1팀 창고보관 중인 번호와 겹치지 않음(`ledger`에서 `isFabric1Item && status === "WAREHOUSE"`의 `storageNumberOf`). 소진·폐기 번호는 다시 써도 된다(3팀 규칙과 같음).

## 저장 (3팀 입고와 같은 예약 절차)

1. 빈 줄을 뺀다. 0줄이면 버튼 비활성.
2. 필수 칸 검사. 입고 수량은 `미상` 체크면 통과, 아니면 0보다 큰 숫자. 가격은 비었거나 0 이상 숫자. 실패하면 칸 표시 + 상단 붉은 한 줄 `필수 칸 N개가 비어 있습니다.`
3. `assigned` = 줄마다 화면에 보이는 번호(수동은 그 값, 자동은 배정 값).
4. `spare` = `suggestNumbers(줄 수 + 30)` 문자열.
5. `claimed = await claimStorageNumbers([...assigned, ...spare], 줄 수)`. 실패 메시지는 3팀과 같게.
6. **수동 줄이 다른 사람에게 잡혀 번호가 바뀌면 안 된다.** `claimed[i] !== assigned[i]`인 줄이 수동 줄이면 저장하지 말고 `releaseStorageNumbers(claimed)` 후 `R&D No. 8985는 다른 사람이 입고 중입니다. 다른 번호를 쓰세요.`로 멈춘다. 자동 줄이 바뀐 것은 그대로 진행하고 저장 뒤 알린다(`예정 8980, 실제 8981`).
   - `claimStorageNumbers`는 후보 순서대로 살아 있는 예약을 건너뛰며 고른다. 그래서 `claimed[i]`와 줄 i가 일대일로 맞지 않을 수 있다. 줄별 판단은 "assigned 중 claimed에 없는 번호"로 한다. 수동 번호가 claimed에 없으면 위처럼 멈춘다. 자동 줄은 claimed에서 수동 번호를 뺀 나머지를 위에서부터 다시 배정한다.
7. `addFabric1Intake(inputs)` **한 번**. input은 R237 한 건 폼이 만들던 모양 그대로, `fields`에 `millRef`, `content`, `actualWidth`, `actualWeight`, `priceYd`, `priceLb`, `supplier`(빈 값 제외, 가격 `0`은 빈 값), `yds`는 미상이면 `null`, `roll`, `note`.
8. `finally`에서 `releaseStorageNumbers(claimed)`.
9. 성공하면 닫고 `onSaved(첫 번호, notice)`. notice는 `R&D No. 8980~8984 5건 입고했습니다.`(연속이 아니면 쉼표로 나열) + 번호가 바뀐 줄 안내.

## 하지 말 것

- `addFabric1Intake`, `storage-claims.ts`, `nextStorageNumbers` 로직을 고치지 마라.
- Rack No. 칸을 넣지 마라.
- 수량에 0을 저장하지 마라. 미상은 `null`.
- 엑셀 파일 입력칸·드롭존을 만들지 마라.
- 3팀 화면을 바꾸지 마라.

## 공통 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 공개 저장소다. 실데이터를 코드나 문서에 넣지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만.
- public/data, legacy/, legacy-vanilla/, backup/은 열지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 검증 결과, 판단이 필요한 지점만.

## 성공 기준

- `npm run build` 통과. 바뀐 파일은 `Fabric1IntakeDialog.tsx`(필요하면 `Warehouse.tsx` 호출부 한두 줄)뿐.
