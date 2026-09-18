# R222 · 1팀 입고 등록과 기존 대장 이관

상태: **미착수.** 앞 단계 R221(데이터 계약, 채번 분리, FL 집계 배제)은 완료·빌드 통과다.

## 무엇이 없어서 이걸 하는가

R221로 창고 화면에 `3팀 원단 / 1팀 원단` 세그먼트가 생겼다. 그런데 1팀 스코프에 **데이터를 넣을 문이 없다.** 지금은 빈 표만 보인다.

3팀 흐름은 DD MASTER에서 개발이 끝나 입고 대기로 올라온 것을 창고가 받는다. 1팀은 앞단이 없다. 실물이 오면 그 자리에서 등록한다. 그래서 등록 버튼을 1팀 스코프에 직접 달아야 한다.

## 확정 규칙 (R221에서 1팀 확인을 거쳐 정해졌다)

1. 입고 대기 단계가 없다. **등록이 곧 창고 보관이다.**
2. R&D No.는 8000부터 상한 없이 순증한다. 등록 시점에 자동으로 붙는다.
3. **Rack No.는 받지 않는다.** 창고팀이 나중에 채운다.
4. 잔량이 없으면 `yds`를 `null`로 둔다. **0을 넣지 마라.** 0은 소진을 뜻한다.
5. Price는 필수가 아니다.
6. 공급처는 완사입만이 아니다. GD 자체 공장도 들어간다.
7. 1팀은 같은 FL에 컬러별로 R&D No.를 따로 매긴다. FL 중복은 정상이다.

## 입력 항목과 저장 위치

1팀 엑셀 15열 중 사람이 넣는 것은 12개다. R&D No.는 자동, 위치와 폐기는 받지 않는다.

| 화면 라벨 | 저장 위치 | 비고 |
|---|---|---|
| FL (Ref. No) | `sample.flNo` | 필수 |
| Color | `sample.ledger.color` | 필수 |
| Construction | `sample.construction` | `CONSTRUCTIONS` 목록 드롭다운 |
| Content | `override.fields.content` | |
| Width (INCH) | `override.fields.actualWidth` | **문자열이다.** `53/55` 형태 |
| Weight (G/M2) | `override.fields.actualWeight` | 숫자 문자열 |
| Price ($/YD) | `override.fields.priceYd` | 선택 |
| Price ($/LB) | `override.fields.priceLb` | 선택 |
| 공급처 | `override.fields.supplier` | 선택 |
| 잔량 (YDS) | `override.yds` | 비면 `null` |
| 입고담당자 | `sample.owner` | 필수. 기본값은 로그인 표시 이름 |
| 입고 요청일 | `sample.requestDate` | 필수. 기본값은 오늘 |
| R&D No. | `override.storageNo` | 자동 채번, 고칠 수 있음 |

**Width와 Weight에 새 필드를 만들지 마라.** `actualWidth`, `actualWeight`가 이미 `FABRIC_FIELD_IDS`에 있고, `buildFabricLedger` 611행이 `fields: { ...deriveFields(stocked), ...(override?.fields ?? {}) }`로 override를 나중에 얹으므로 문자열이 그대로 살아남는다.

## 파일별 조치

### 1. `src/data/fabric-ledger.ts` — 등록 즉시 창고 보관

284행 `statusFromSample`은 지금 이렇다.

```ts
export function statusFromSample(sample: CompletedSample): FabricLedgerStatus {
  const sheet = normalized(sample.sourceSheet ?? "")
  if (sheet.includes("폐기")) return "DISPOSED"
  if (sheet.includes("소진완료") || sheet.includes("소진")) return "EXHAUSTED"
  if (sheet.includes("창고보관") || sheet.includes("창고")) return "WAREHOUSE"
```

`FABRIC1_INTAKE_SHEET`는 `"1팀 입고"`라 어느 조건에도 안 걸려 `DEVELOPING`으로 떨어진다. 그러면 창고 보관 탭에 안 보인다.

`if (sheet.includes("폐기"))` **앞에** 한 줄 넣는다.

```ts
  // 1팀은 실물이 온 뒤에 등록한다. 등록이 곧 창고 보관이다(입고 대기 단계가 없다).
  if (sample.sourceSheet === FABRIC1_INTAKE_SHEET) return "WAREHOUSE"
```

폐기·소진 판정보다 앞에 두는 이유는 시트 이름이 고정 상수라 부분 일치 검사에 걸릴 일이 없기 때문이다. 상태 전이는 override가 덮는다.

305행 `sampleFallback`을 1팀도 `sample.id`를 쓰게 바꾼다.

```ts
function sampleFallback(sample: CompletedSample, index: number): string {
  return (sample.sourceSheet === WEB_INTAKE_SHEET || sample.sourceSheet === FABRIC1_INTAKE_SHEET) && sample.id
    ? sample.id
    : `${sample.sourceSheet ?? "sample"}::${index}`
}
```

### 2. `src/store/useAppStore.ts` — 등록 액션

712행 `addManualIntake` 바로 아래에 새 함수를 만든다. 기존 함수는 고치지 마라(3팀 직접 추가가 쓴다).

```ts
export interface Fabric1IntakeInput {
  storageNo: string
  flNo: string
  color: string
  construction: string
  owner: string
  requestDate: string
  yds: number | null
  /** content, actualWidth, actualWeight, priceYd, priceLb, supplier */
  fields: Record<string, string>
}

/**
 * 1팀 입고 등록. 등록이 곧 창고 보관이라 샘플·override·이력을 한 번에 쓴다.
 * 3팀 직접 추가(addManualIntake)와 달리 입고 대기를 거치지 않는다.
 */
export async function addFabric1Intake(inputs: readonly Fabric1IntakeInput[]): Promise<void> {
```

동작 순서는 이렇다.

1. 입력마다 `CompletedSample`을 만든다. `id`는 `f1:${Date.now()}:${랜덤}` 형식이고 `sourceSheet: FABRIC1_INTAKE_SHEET`, `storageNo`는 입력값, `ledger: { color }`, `construction`, `flNo`, `owner`, `requestDate`, `completedAt`은 `requestDate`와 같게 둔다. `process`와 `inhouse`는 `addManualIntake`와 같은 빈 모양으로 채운다.
2. `completed`에 모두 더하고 `setAppState` + `saveCache("completed", ...)`를 **한 번만** 부른다.
3. 새 `completed`로 `buildFabricLedger`를 돌려 방금 만든 행의 `key`를 찾는다(`fabricLedgerKey`가 `rnd:<storageNo>`를 돌려주므로 storageNo로 찾으면 된다).
4. 그 key로 `FabricLedgerOverride`를 만든다. `status: "WAREHOUSE"`, `storageNo`, `yds`(null이면 필드 자체를 빼라, `yds?: number`다), `fields`, `updatedAt`, `updatedBy`. `fabricOverrides`에 모두 더하고 저장을 **한 번만** 부른다.
5. `FabricLedgerEvent`를 입력마다 만든다. `action: "RECEIVE"`, `fromStatus: "READY"`, `toStatus: "WAREHOUSE"`, `occurredAt`은 `requestDate`, `recordedAt`은 지금, `storageNo`, `qty`는 `yds ?? undefined`, `note`는 `"1팀 입고 등록"`. `fabricEvents`에 더하고 저장을 한 번만 부른다.

**건마다 저장을 부르지 마라.** 302행 이관에서 저장이 302번 일어난다.

기존 `applyFabricAction`을 재사용하려 하지 마라. 그 함수는 이전 상태가 있는 행을 전이시키는 용도라 새 행 생성 경로와 맞지 않는다.

739행 `updateManualIntake`의 가드를 1팀도 받게 넓힌다.

```ts
    if (sample.id !== id) return sample
    if (sample.sourceSheet !== WEB_INTAKE_SHEET && sample.sourceSheet !== FABRIC1_INTAKE_SHEET) return sample
```

switch 문에는 case를 더하지 마라. `content`, `priceYd`, `priceLb`, `supplier`, `actualWidth`, `actualWeight`는 override.fields에 살아서 `saveFabricFields`가 처리한다.

### 3. `src/routes/Warehouse.tsx` — 열 값 읽기 보강

354~355행이 지금 이렇다.

```ts
    case "actualWidth": return first(record?.tech?.actual?.width, sam?.inhouse.widthCm)
    case "actualWeight": return first(record?.tech?.actual?.weight, sam?.inhouse.weightGsm)
```

1팀 값은 `override.fields`에 있어 이대로면 빈 칸으로 보인다. 직접 출처가 비었을 때만 `fields`를 본다.

```ts
    case "actualWidth": return first(record?.tech?.actual?.width, sam?.inhouse.widthCm) || (item.fields.actualWidth ?? "")
    case "actualWeight": return first(record?.tech?.actual?.weight, sam?.inhouse.weightGsm) || (item.fields.actualWeight ?? "")
```

3팀은 직접 출처가 먼저라 동작이 안 바뀐다.

### 4. `src/routes/Warehouse.tsx` — 툴바 버튼 두 개

1483행 툴바에서 `tab === "READY"` 조건으로 걸린 3팀 버튼들 뒤에, 1팀 전용 버튼 두 개를 넣는다.

```tsx
        {teamScope === "team1" && tab === "WAREHOUSE" ? <Button type="button" size="sm" onClick={() => setIntakeOpen(true)}><Plus />입고 등록</Button> : null}
        {teamScope === "team1" && tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" onClick={() => setPasteOpen(true)}><ClipboardPaste />엑셀에서 붙여넣기</Button> : null}
```

**기존 3팀 버튼 조건에 `teamScope`를 더해야 한다.** 1팀 스코프에서는 입고 확인, 출고, 소진, 폐기, 출고 요청 메일은 그대로 쓰고, `입고 대기로`(UNRECEIVE)와 `창고 보관으로`·`입고 대기로`(RESTORE 중 READY)는 숨긴다. 1팀에 입고 대기가 없기 때문이다. 이력 탭의 `창고 보관으로`는 남긴다.

아이콘은 `lucide-react`에서 가져온다. `Plus`는 이미 다른 화면에서 쓰고 있고 `ClipboardPaste`도 같은 패키지에 있다.

### 5. 새 파일 `src/components/warehouse/Fabric1IntakeDialog.tsx`

한 건 등록 폼이다. 위 "입력 항목과 저장 위치" 표의 12개 칸을 그린다.

- 레이아웃은 2열 그리드다. 참고할 기존 폼은 `src/components/warehouse/InboundRequestMailDialog.tsx`다. 그 파일의 Dialog·Label·Input 사용 방식을 따른다.
- R&D No. 칸은 맨 위에 두고 기본값으로 자동 채번 값을 넣는다. 사람이 고칠 수 있다.
- Construction은 `src/data/constructions.ts`의 `CONSTRUCTIONS`로 Select를 만든다.
- 필수는 FL, Color, 입고담당자, 입고 요청일, R&D No.다. 빈 칸은 붉은 테두리를 주고 저장을 막는다. DD MASTER 접수 팝업과 같은 방식이다.
- FL 형식이 `FL\d{8}`이 아니면 경고만 띄우고 저장은 막지 않는다. `matching rib` 접미사가 붙은 실제 사례가 3건 있다.
- **FL 중복 경고를 띄우지 마라.** 1팀은 같은 FL에 컬러별로 따로 등록한다.
- 저장은 `addFabric1Intake([input])` 한 번이다. 저장 뒤 팝업을 닫고 검색·필터를 비워 새 행이 보이게 한다.
- 연속 등록이 잦으므로 `저장하고 계속`을 하나 더 둔다. 누르면 FL, Color, Content, Width, Weight, Price, 잔량만 비우고 입고담당자와 입고 요청일은 남긴다.

### 6. 새 파일 `src/components/warehouse/Fabric1PasteDialog.tsx`

기존 302행 이관과, 엑셀에 먼저 적는 습관을 그대로 받는 창이다.

- 큰 `textarea` 하나에 엑셀 범위를 붙여넣는다. 탭 구분 TSV다.
- 열 순서는 1팀 엑셀 그대로다. `No.`, `Ref. No`, `R&D Number`, `Color`, `공급처`, `Construction`, `Content`, `Width`, `Weight`, `Price($/YD)`, `Price($/LB)`, `위치`, `입고담당자`, `입고 요청일`, `폐기`, `Remark`.
  - `No.`, `위치`, `폐기`는 읽고 버린다.
  - `R&D Number`가 있으면 그 값을 쓰고, 비면 자동 채번한다.
  - `Remark`에서 잔량을 읽는다. `10YDS`, `7 yds`, `20 yard`는 숫자로, `전량`은 `null`로 둔다. 숫자를 못 읽으면 `null`로 두고 원문을 `note`에 남긴다.
  - `Price`가 `0`이면 빈 문자열로 바꾼다. **가격 미확인이라는 뜻이라 0을 저장하지 마라.**
- 붙여넣으면 아래에 파싱 결과 표를 미리 보인다. 행마다 상태를 `등록`, `번호 중복`, `필수 누락`으로 표시한다. 중복과 누락은 체크를 풀어 두고 사람이 판단한다.
- 표 위에 요약을 한 줄 적는다. `총 N행, 등록 N건, 잔량 미상 N건, 번호 중복 N건`.
- 저장은 체크된 행만 모아 `addFabric1Intake(inputs)` 한 번이다.
- **엑셀 파일을 읽는 기능을 만들지 마라.** 파일 입력칸도 드롭존도 만들지 마라. 2026-09-14에 창고는 엑셀을 파싱하지 않기로 정했다. 붙여넣기가 그 결정 안에서 같은 편의를 준다.

### 7. `src/routes/Warehouse.tsx` — 인라인 편집

1358행이 지금 이렇다.

```ts
                    const manualId = item.sample?.sourceSheet === WEB_INTAKE_SHEET ? item.sample.id : undefined
```

1팀 행도 포함한다.

```ts
                    const manualSheet = item.sample?.sourceSheet
                    const manualId = manualSheet === WEB_INTAKE_SHEET || manualSheet === FABRIC1_INTAKE_SHEET ? item.sample?.id : undefined
```

`FABRIC1_ONLY_COLUMNS`에 든 열과 `actualWidth`, `actualWeight`는 `updateManualIntake`가 아니라 `saveFabricFields(item, { [columnId]: value })`로 저장한다. `flSource`는 파생 값이라 편집 대상이 아니다(이미 `MANUAL_EDITABLE`에 없다).

1378행 `checkWarehouseFlEntry(value, item, records, ledger)`는 1팀 행에서는 부르지 마라. FL 중복이 정상이라 매번 경고가 뜬다. 1팀이면 검사를 건너뛰고 바로 `updateManualIntake`로 저장한다.

### 8. `CLAUDE.md` 첫 줄 정정

지금 첫 두 줄이 이렇다.

```
한솔섬유 통합원단부 1팀(원단 R&D팀) 업무 플랫폼 MVP. 문서·앱 문구에 옛 명칭 "통원부 3팀"이 남아 있다.
```

거꾸로다. 같은 문서의 "권한" 절에는 `**3팀이 원단 R&D(우리 팀)다**`로 제대로 적혀 있어 문서 안에서 어긋난다. 이렇게 바꾼다.

```
한솔섬유 통합원단부 3팀(원단 R&D팀) 업무 플랫폼 MVP. 통합원단부 1팀은 디자인·마케팅 성격의 소싱 위주 팀으로 FABRIC REQUEST를 쓰는 유관부서다. 앱 문구 일부에 옛 표기가 남아 있다.
```

"창고" 절 끝에 한 줄 더한다.

```
- 1팀 입고 대장(8000번대, R221·R222): 창고 화면 `3팀 원단 / 1팀 원단` 세그먼트로 갈린다. 1팀은 입고 대기가 없고 등록이 곧 창고 보관이다. 채번은 8000부터 상한 없이 순증하며 3팀 1~7999 순환과 분리돼 있다. 1팀 행은 FL 원장·RDDA 집계에서 빠지고(`mergedFlRegistrations`), 같은 FL에 컬러별로 R&D No.가 따로 붙어 `buildFabricLedger`에서 FL·Style 색인을 올리지 않는다.
```

## 하지 말 것

- **엑셀 파일 파서를 만들지 마라.** 붙여넣기만이다.
- **Rack No. 입력칸을 등록 창에 넣지 마라.** 창고팀이 관리한다.
- **잔량에 0을 쓰지 마라.** 미상은 `null`이다.
- **`addManualIntake`와 `applyFabricAction`을 고치지 마라.** 3팀 흐름이 걸려 있다.
- **`CompletedSample`이나 `DevRecord` 타입을 넓히지 마라.** Content, Price, 공급처, Width, Weight는 `override.fields`에만 산다.
- **저장을 건마다 부르지 마라.** 이관 한 번에 302행이 들어온다.
- **`departments.ts` 권한은 건드리지 마라.** R223에서 스코프 제한과 함께 연다. 지금은 소유자 계정으로만 등록한다.
- **`disposal-round.ts`와 `RackMap`은 건드리지 마라.** R223이다.
- **3팀 동작을 바꾸지 마라.** `teamScope`가 `team3`일 때 화면과 채번이 지금과 완전히 같아야 한다.

## 검증

```bash
cd C:\Users\hkpark\Desktop\fabric-rnd
npm run build
git status --short
```

빌드가 통과하고 아래 파일만 바뀌면 된다.

```
 M CLAUDE.md
 M src/data/fabric-ledger.ts
 M src/routes/Warehouse.tsx
 M src/store/useAppStore.ts
?? src/components/warehouse/Fabric1IntakeDialog.tsx
?? src/components/warehouse/Fabric1PasteDialog.tsx
```

`src/routes/Calendar.tsx`, `src/routes/Home.tsx`, `src/components/cards/MaterialDeck.tsx`, `src/routes/FabricRequest.tsx`에 사용자가 만든 변경이 있다. **건드리지 마라.** index에 스테이징된 것도 그대로 둬라.

## R223에서 할 것 (이번에 하지 마라)

- `departments.ts` 1팀 창고 편집 권한. 1팀 스코프만 고칠 수 있게 제한.
- 폐기 라운드 팀 분리. 지금은 3팀만 넘기고 있다(`team3Ledger`).
- Rack 배치도에 두 팀 같이 표시. 창고팀 통합 뷰.
- FL 입력 시 3팀 원장·DD에서 자동 채움.
- FABRIC REQUEST 연결.
