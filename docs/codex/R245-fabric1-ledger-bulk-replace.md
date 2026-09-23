# R245 1팀 창고 데이터 일괄 교체(관리자 전용, 일회성)

상태: 미착수.

## 배경

1팀(통합원단부 1팀) 창고보관 데이터가 지금까지 실제 재고와 어긋나 있었다. 박향근이 최신 원장 엑셀(`8000번대&19층 디자인부 원단 리스트 (25.08.06).xlsx`, 304건)을 직접 웹에서 업로드해 **현재 웹에 있는 1팀 창고 데이터를 전부 지우고 이 304건으로 통째로 교체**하려 한다. 이 저장소에는 1팀 데이터를 한 번에 넣는 기존 경로가 없다(`addFabric1Intake`는 신규 입고 팝업에서 한 번에 여러 줄을 등록하는 용도이고, 기존 데이터를 지우는 기능은 없다).

## 사용자 결정 사항 (확인 완료, 다시 묻지 말 것)

- **백업 없이 완전 삭제한다.** 기존 1팀 완료 샘플(`completed`의 `sourceSheet === FABRIC1_INTAKE_SHEET`)과 그에 딸린 창고 상태(`fabricOverrides`)·이력(`fabricEvents`)을 진짜로 지운다(REMOVED 오버라이드로 숨기지 않는다). 별도 백업 다운로드를 만들지 않는다.
- **실행은 앱 안의 일회성 관리자 기능으로 한다.** Firestore를 스크립트로 직접 건드리지 않는다. 로그인한 소유자가 브라우저에서 파일을 올리고 버튼을 눌러 실행한다.
- **입고 수량(YDS)은 파일에 별도 열이 없다.** `Remark` 열 문자열에서 규칙대로 뽑는다(아래 "수량 추출 규칙" 참조).

## 파일 구조 (실제로 열어서 확인한 값)

파일: `8000번대&19층 디자인부 원단 리스트 (25.08.06).xlsx`, 시트 `지하창고 - 26.08.20 이후`, 헤더는 1행, 데이터 304행(2~305행), 빈 행 없음.

헤더(줄바꿈은 실제로 `\r\n`이 섞여 있음, 비교 시 공백류를 하나로 접어서 비교할 것):

```
No. | Ref. No | R&D Number | Color | 완사입 업체 | Construction | Content | Width(INCH) | Weight(G/M2) | Price($/YD) | Price($/LB) | 위치 | 입고담당자 | 입고 요청일 | 폐기 | Remark
```

실측 결과:

- `R&D Number` 304건 전부 채워짐, 중복 없음, `FABRIC1_STORAGE_NO_MIN`~`MAX`(`src/data/fabric-ledger.ts`) 범위 안에 든다(실측 확인함).
- `Ref. No` 304건 전부 채워짐(FL+숫자 8자리 형식).
- `폐기` 열은 304건 전부 빈 칸이다. **이 열은 안 쓴다(사용할 값이 없다).**
- `Remark`는 301건 채워짐. 이 열이 사실상 입고 수량 메모다(아래 참조).

## 열 매핑 (한 번만 쓰는 마이그레이션이라 이 표대로 하드코딩해도 된다)

| 엑셀 열 | 웹 필드(`Fabric1IntakeInput`) | 비고 |
|---|---|---|
| R&D Number | `storageNo` | 그대로 4자리 문자열. 새로 채번하지 않는다 |
| Ref. No | `flNo` | |
| Color | `color` | |
| 완사입 업체 | `fields.supplier` | Mill |
| Construction | `construction` | |
| Content | `fields.content` | |
| Weight(G/M2) | `fields.actualWeight` | 숫자 그대로 문자열로(기존 신규입고 팝업과 동일하게 문자열 저장) |
| 입고담당자 | `owner` | |
| 입고 요청일 | `requestDate`, `occurredAt` | 날짜 파싱은 `XLSX.SSF.format("yyyy-mm-dd", value)` 또는 이미 `yy.mm.dd`/`yyyy-mm-dd` 형식이면 정규화. 하루 밀림 방지 규칙은 CLAUDE.md 참고 |
| Remark | `note` | 원문 그대로 보존(추출 성공 여부와 무관) |
| (매핑 없음) | — | No., Width, Price($/YD), Price($/LB), 위치, 폐기는 버린다 |
| (없음) | `season`, `buyer` | 파일에 대응 열이 없다. 빈 문자열로 둔다 |

## 수량(YDS) 추출 규칙

`Remark` 텍스트에서 다음 규칙으로 뽑는다. 실제 301건의 값을 직접 열어 아래 패턴을 확인했다(`"10YDS"`, `"7YDS"`, `"20yds"`, `"1ROLL"`, `"10YDS ROLL"`, `"8YDS/ 26.02.20 잔량 확인:5YDS 미만"`, `"전량"`, `"GD 자체 개발"`, `"SPR25 EU SAMPLE DEVELOP / HMP125033"` 등).

```ts
function extractFabric1Qty(remark: string): { yds: number | null; roll: boolean } {
  const roll = /ROLL/i.test(remark)
  if (remark.includes("전량")) return { yds: null, roll }
  const match = remark.match(/(\d+(?:\.\d+)?)\s*(?:YDS?|yards?)\b/i)
  if (!match) return { yds: null, roll }
  return { yds: Number(match[1]), roll }
}
```

- `roll`은 "ROLL" 단어가 있으면 켠다(수량 값과 별개로 항상 검사).
- `전량`이 포함되면 수량은 무조건 "미상"(`yds: null`)이다. 정규식 검사보다 먼저 본다.
- YDS/yd/yard 뒤에 붙는 숫자 중 **첫 번째 것만** 쓴다(`"8YDS/ ... 5YDS 미만"`은 8을 쓴다. 앞이 입고 당시 수량이고 뒤는 나중에 확인한 잔량 메모라서 그렇다).
- 숫자에 YDS류 단위가 안 붙어 있으면(예: 순수 참고 코드 `SPR25`, `HMP125033`) 수량은 뽑지 않는다. **"숫자가 있으면 아무거나 가져오기"가 아니다. 반드시 YDS/yd/yard 단위가 붙은 숫자만 수량으로 본다.**
- `note`(Remark 원문)는 추출 성공 여부와 무관하게 항상 원문 그대로 저장한다.
- 이 규칙으로도 애매한 줄(예: `"4YDSX2 8YDS"`처럼 숫자가 여러 개고 뜻이 겹칠 수 있는 줄)이 있을 수 있다. 정규식이 뽑은 첫 번째 값을 그대로 쓰고 별도 경고 표시는 하지 않는다(사람이 나중에 원문 Remark를 보고 고칠 수 있다).

## 구현

### 1. 새 스토어 함수 `src/store/useAppStore.ts`

`addFabric1Intake` 바로 아래에 새 함수 `replaceFabric1Ledger(inputs: readonly Fabric1IntakeInput[]): Promise<void>` 를 추가한다. `addFabric1Intake`를 복붙해 고치되, 저장 전에 기존 1팀 데이터를 실제로 제거하는 단계를 추가한다.

- `state.completed`에서 `sourceSheet === FABRIC1_INTAKE_SHEET`인 항목을 **배열에서 제거**한다(REMOVED 처리 아님, 배열 자체에서 뺀다). 남은 항목과 새로 만든 304건 샘플을 합쳐 `completed`로 저장한다.
- `state.fabricOverrides`에서 지워진 완료 샘플들의 `key`(= `fabricRecordIdOf`로 만드는 원장 키, `buildFabricLedger`가 만드는 것과 같은 규칙)에 해당하는 항목을 제거한다. 정확한 key 계산 로직은 `addFabric1Intake`가 이미 하는 방식(먼저 `completed`를 갱신하고 `buildFabricLedger`로 새 key를 찾는 방식)을 그대로 따르되, **제거할 옛 key는 교체 전 상태에서 미리 계산**해 둔다(옛 `completed`가 사라지면 옛 key를 다시 찾을 수 없다).
- `state.fabricEvents`에서 같은 옛 key에 해당하는 이력도 제거한다.
- 그 다음은 `addFabric1Intake`와 같은 흐름으로 새 304건을 추가한다: `completed`에 append, `buildFabricLedger`로 새 key 찾기, `fabricOverrides`에 `status: "WAREHOUSE"`로 반영, `fabricEvents`에 `action: "RECEIVE"`, `note: "1팀 창고 데이터 일괄 교체(R245)"`로 append.
- `occurredAt`은 각 행의 `requestDate`(입고 요청일)를 넣는다(오늘 날짜로 넣지 않는다. 기존 대장 이관이라 이번 주 창고 보고에 새 입고로 잡히면 안 된다. `Fabric1IntakeInput.occurredAt` 주석에 이미 이 용도가 적혀 있다).
- `completed`, `fabricOverrides`, `fabricEvents` 세 키 모두 저장한 뒤(`setAppState` + `saveCache`) 끝낸다. 저장 순서는 `addFabric1Intake`와 동일하게 completed → fabricOverrides → fabricEvents.
- storageNo 중복 검사나 `claimStorageNumbers` 트랜잭션은 **쓰지 않는다**(동시 사용자 경합을 막는 장치인데, 이번은 전체 교체라 대상 번호가 파일에 이미 다 정해져 있고 한 사람이 한 번 실행한다). 다만 파일 안에서 R&D Number가 중복되면 안 되므로, 함수 시작 시 `inputs`의 `storageNo` 중복을 확인해 있으면 에러를 던진다.

### 2. 파일 파서 `src/data/fabric1-ledger-import.ts` (새 파일)

- `xlsx`(SheetJS, 이미 `package.json`에 있음. `zaji.ts`/`xlsx-parsers.ts`와 같은 방식) 로 읽는다. `cellDates: true`.
- 첫 시트, 1행을 헤더로 보고 위 표대로 컬럼을 찾는다. 헤더 비교는 개행·연속 공백을 하나의 공백으로 접고 앞뒤 트림한 뒤 비교한다.
- 데이터 행(2행부터 끝까지)마다 `Fabric1IntakeInput`을 만들어 배열로 반환한다. `owner`, `flNo` 등 필수 값이 빈 칸이면 그 행 번호와 함께 경고 문자열을 같이 반환한다(막지는 않는다. 실제 데이터는 다 채워져 있었다).
- `extractFabric1Qty`도 이 파일에 둔다.
- export: `parseFabric1LedgerFile(file: File): Promise<{ inputs: Fabric1IntakeInput[]; warnings: string[] }>`

### 3. 관리자 UI `src/components/settings/DataProtectionPanel.tsx`

`isOwner` prop이 이미 있다(소유자만 이 패널을 채워서 볼 수 있다). 그 안에 새 섹션을 하나 추가한다.

- 섹션 제목 "1팀 창고 데이터 일괄 교체" + 설명 한 줄: "새 파일로 현재 1팀 창고 데이터를 전부 바꿉니다. 되돌릴 수 없습니다."
- `isOwner`가 아니면 이 섹션 자체를 렌더링하지 않는다.
- 파일 선택 버튼(`.xlsx`) → `parseFabric1LedgerFile` 호출 → 파싱 결과를 미리보기로 보여준다: 파싱된 건수, 경고 목록(있으면), 그리고 **지금 지워질 기존 건수**(`useAppStore.getState().completed.filter(s => s.sourceSheet === FABRIC1_INTAKE_SHEET).length`)를 같이 보인다. 예: "기존 187건을 지우고 새 304건으로 교체합니다."
- 확인 버튼을 눌러야 실행한다(브라우저 `confirm()`이 아니라 화면 안 버튼 두 번 - 업로드 후 미리보기, 미리보기에서 "교체 실행" 버튼). 실행 중에는 버튼을 비활성화하고 "교체 중…" 표시.
- 실행 후 결과 메시지: "1팀 창고 데이터를 304건으로 교체했습니다." 실패 시 에러 메시지를 그대로 보여준다.
- 아이콘은 `lucide-react`에서 이미 쓰는 것과 톤을 맞춘다(`DatabaseBackup` 근처에 배치해도 된다).

## 하지 말 것

- Firestore에 직접 쓰는 별도 Node/Python 스크립트를 만들지 마라. 반드시 브라우저 앱 안에서, `saveCache`를 통해 저장한다(병합 키 트랜잭션 규칙을 지키기 위해서다. CLAUDE.md의 "병합 키 저장은 트랜잭션이다" 항목 참고).
- `writeBatch`를 직접 부르지 마라.
- 옛 데이터를 REMOVED 오버라이드로 숨기지 마라. 배열에서 실제로 제거한다(사용자가 명시적으로 백업 없이 완전 삭제를 선택했다).
- `위치`, `폐기`, `Price` 열은 어떤 필드로도 옮기지 마라(대응하는 웹 필드가 없다).
- `claimStorageNumbers`/`storage-claims.ts`를 이 경로에 끌어들이지 마라.
- 신규 입고 팝업(`Fabric1IntakeDialog.tsx`)의 동작을 바꾸지 마라. 이번 건은 SETTING 데이터 보호 탭에만 새로 만든다.

## 검증

- `npm run build` 통과.
- `git status --short`가 아래 범위 안.

| 파일 | 조치 |
|---|---|
| `src/store/useAppStore.ts` | `replaceFabric1Ledger` 추가 |
| `src/data/fabric1-ledger-import.ts` | 새 파일 |
| `src/components/settings/DataProtectionPanel.tsx` | 소유자 전용 섹션 추가 |

- 실제 실행 결과(304건 제대로 들어갔는지, 수량 추출이 맞는지)는 로그인 후 박향근이 직접 확인한다. 화면을 대신 열어보려 하지 마라.
