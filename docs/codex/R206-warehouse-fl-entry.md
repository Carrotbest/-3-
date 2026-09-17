# R206 · 창고 FL 입력 규칙: DD 원단은 DD에서, 창고 직접 추가 원단만 창고에서

상태: 미착수

## 배경 (확인됨)

- 창고 원장은 `buildFabricLedger`(`src/data/fabric-ledger.ts`)가 DD `records`와 대장 `completed`를 읽을 때마다 합쳐 만든다. DD의 변경은 이미 실시간으로 창고에 반영된다.
- 창고 "직접 추가" 행은 `completed`의 `sourceSheet === WEB_INTAKE_SHEET`("웹 등록") 샘플이다. DD 행과 연결 고리가 없다.
- 사고: 직접 추가 행 FL 칸에 FL을 적었는데 DD에는 반영되지 않았다. 정상 동작이다. 어느 DD 행인지 알 수 없다.
- 시뮬레이션으로 확인: 직접 추가 행(R&D No. 있음)과 DD 행에 **같은 FL**이 있으면 원장에서 한 원단(`rnd:` key, record와 sample 모두 보유)으로 합쳐진다. DD FL이 비면 두 항목으로 따로 나온다.
- `mergedFlRegistrations`(`src/data/derive.ts`)는 `completed`의 FL을 먼저 넣고 같은 FL의 DD 행은 건너뛴다. 창고 전용 FL도 FL 등록 집계에 들어가며, 같은 FL이 DD에 생겨도 이중 집계되지 않는다.

## 확정 규칙 (사용자 결정 2026-09-17)

| 원단 | FL 입력 위치 |
|---|---|
| DD 행이 있는 원단(`item.record` 있음) | **DD MASTER에서만.** 창고 화면에서 읽기 전용 |
| 창고 직접 추가 원단(웹 등록 샘플, `item.record` 없음) | 창고에서 입력. 저장 전 아래 검사 |
| 대장 원본 행(웹 등록 아님, `item.record` 없음) | 이번 범위 밖. 지금 동작 유지 |

"현황에 없는 추가 옵션"은 DD에 행을 추가하는 것이 팀 규칙이다. 시스템으로 막지 않는다.

## 저장 전 검사 (창고 직접 추가 행 FL 입력)

새 파일 `src/data/warehouse-fl-check.ts`에 순수 함수:

```ts
export interface WarehouseFlCheck {
  fl: string                          // 정리된 값(trim)
  formatWarning: boolean              // /^FL\d{8}$/i 가 아니면 true. 저장은 막지 않는다
  mergeRecords: DevRecord[]           // 같은 FL을 가진 DD 행
  sameStyleNoFl: DevRecord[]          // 같은 Style No.이고 FL이 빈 DD 행 (mergeRecords가 있으면 비운다)
  duplicateItems: FabricLedgerItem[]  // 같은 FL을 가진 다른 창고 원장 항목(자기 자신, mergeRecords와 합쳐진 항목 제외)
}
export function checkWarehouseFlEntry(value: string, item: FabricLedgerItem, records: readonly DevRecord[], ledger: readonly FabricLedgerItem[]): WarehouseFlCheck
export function needsFlConfirm(check: WarehouseFlCheck): boolean  // 네 경고 중 하나라도 있으면 true
```

- FL 비교는 공백 제거 + 대문자(`derive.ts` 1270행 `normalizeFlKey`와 같은 규칙. export 해서 재사용해도 된다).
- Style No. 비교는 trim + 대문자. `item.styleNo`가 비면 `sameStyleNoFl`은 빈 배열.
- 값을 비우는 입력(빈 문자열)은 검사 없이 저장한다.
- 값이 기존과 같으면 아무것도 하지 않는다.

## 확인 창 `src/components/warehouse/FlEntryCheckDialog.tsx` (신규)

`needsFlConfirm`이 true일 때만 연다. 경고마다 한 블록:

1. `mergeRecords` 있음: `DD MASTER의 같은 FL 행과 한 원단으로 합쳐집니다.` + 행 목록(담당, Style No., Season, Cons.)
2. `sameStyleNoFl` 있음: `DD MASTER에 같은 Style No.이면서 FL이 빈 행이 있습니다. DD에 있는 원단이면 DD MASTER에서 FL을 입력하세요.` + 행 목록(담당, Style No., 옵션, Cons., Yarn Detail 앞 40자)
3. `duplicateItems` 있음: `다른 창고 원단이 이미 이 FL을 쓰고 있습니다.` + R&D No., Style No.
4. `formatWarning`: `FL 형식(FL+연월 4자리+번호 4자리)과 다릅니다. 국내 SA 등 다른 형식이면 그대로 저장하세요.`

버튼:
- `취소` (저장 안 함)
- 2번 경고가 있으면 주 버튼 문구 `DD에 없는 원단입니다. 저장`, 없으면 `저장`. 경고만 하고 막지 않는다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/warehouse-fl-check.ts` | 신규. 위 함수 |
| `src/components/warehouse/FlEntryCheckDialog.tsx` | 신규. 위 확인 창 |
| `src/routes/Warehouse.tsx` | 1248행 근처 인라인 편집 `onBlur`: `column.id === "flNo"`이면 `updateManualIntake`를 바로 부르지 말고 검사 → 필요 시 확인 창 → 확인하면 `updateManualIntake(manualId, "flNo", value)`. 다른 열은 지금 그대로. 창 상태는 `{ item, manualId, check } | null` 하나 |
| `src/routes/FabricDetail.tsx` | (a) `item.record`가 있으면 FL# 칸(284행 `cell("flNo", ...)`)을 편집 모드에서도 입력칸 대신 값 + 작은 안내 `DD MASTER에서 입력`으로 보인다. (b) `item.record`가 없고 `item.sample?.sourceSheet === WEB_INTAKE_SHEET`인데 `flNo`가 바뀌었으면: `confirmEdit`(219행)에서 검사·확인 창을 거친 뒤 **`saveFabricFields`가 아니라 `updateManualIntake(item.sample.id, "flNo", value)`로 저장**하고, `dataPatch`에서 `flNo`를 뺀다. 지금은 `override.fields.flNo`로만 저장돼 원장 key와 FL 집계가 샘플의 옛 FL을 계속 쓴다(DD와 합쳐지지 않음) |
| `CLAUDE.md` | 창고 섹션에 한 줄: FL 입력 규칙(DD 원단은 DD에서만, 직접 추가 원단만 창고에서 `checkWarehouseFlEntry` 검사 후 `updateManualIntake`), 같은 FL이면 원장에서 자동으로 합쳐진다는 사실, "추가 옵션은 DD 행 추가가 팀 규칙" |

## 하지 말 것

- 창고에서 DD 레코드에 FL을 쓰는 경로를 만들지 마라. 흐름은 DD에서 창고 한 방향이다.
- DD 행을 자동으로 골라 연결하지 마라.
- 형식 경고로 저장을 막지 마라. 국내 SA 등 다른 형식이 실재한다.
- `buildFabricLedger`, `mergedFlRegistrations`의 병합 규칙을 바꾸지 마라.
- 대장 원본 행(웹 등록 아닌 샘플)의 FL 편집 경로는 건드리지 마라.
- 기존 `override.fields.flNo` 데이터를 옮기거나 지우는 마이그레이션을 하지 마라.

## 검증

`npm run build` 통과.
