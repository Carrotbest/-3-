# R142 DD MASTER 신규 작지 접수에서 FABRIC REQUEST 불러오기와 연결

상태: 미착수. R141(FABRIC REQUEST 편집 기능)이 끝난 뒤 한다.

## 사용자 결정 (2026-09-14)
- **자동 추천, 사람 확인.** 조용히 자동 연결하지 않는다.
- Garment No.와 Style No.는 기본적으로 같지만 예외가 있다. 추천에 쓰되, 불러온 뒤 Style No.는 사람이 고칠 수 있다.
- **차트명은 반영하지 않는다.** Category, Season을 차트명에서 추측하지 않는다.
- 대응 칸 (나머지는 사용자 확인 완료):

| FABRIC REQUEST | DD |
|---|---|
| `garmentNo` | `styleNo`(기본값, 수정 가능) |
| `brand` | `buyer` |
| `developer`(개발 담당) | `owner`(담당) |
| `requester`(의뢰자) | `planner` |
| 옵션 `color` | `color` |
| 옵션 `dyeingMethod` | `dyeing` |
| 옵션 `remark` | `note` |
| 옵션 `yarnDetail` | `tech.yarnDetail` |

- 이번 범위는 **신규 등록 흐름**이다. 기존 데이터 연결 도우미는 뒤 단계다. FABRIC REQUEST에 DD 진행·완료 상태와 FL#을 표시하는 것도 뒤 단계다(아래 "다음 단계").

## 확인된 사실
- `src/data/schema.ts` 150~168행 `RequestOption`에 `ddLink?: { styleNo; opt }`가 있지만 **코드 어디에서도 쓰지 않는다**(연결 미구현).
- `optId`는 `${reqId}#${no}`이고 옵션을 지우면 `renumber`가 번호를 다시 매겨 **바뀐다**(`FabricRequest.tsx` 183~189행). **연결 키로 쓰면 안 된다.**
- 엑셀 재업로드 병합 `mergeRequestStyles`(`src/data/request-template.ts` 340~369행)는 기존 스타일의 옵션을 **엑셀 옵션으로 통째로 교체**한다. 새 고유 ID를 그대로 두면 재업로드마다 연결이 끊긴다.
- 옵션 생성은 `readOption`(`request-template.ts` 313~327행)과 `FabricRequest.tsx`의 `blankOption`이다.
- `DevTechnical`(`schema.ts` 10행~)에 `intakeSource?: { kind: "zaji"; requestKey; optionKey }`가 있다.
- 접수 중복 검사: `src/store/useAppStore.ts` 375행 `intakeSourceKey(record)`는 `tech.intakeSource`만 본다. 541행 `saveDevelopmentIntakeRecords`가 이 키로 중복을 막는다.
- DD MASTER 접수 창(`src/routes/DevelopmentMasterSheet.tsx`):
  - 2183행 `openNew`, 2185행 `closeIntake`, 2188~2217행 `sharedDraft`·`changeShared(applySharedFields)`·`changeOptionAt`·옵션 추가/삭제.
  - 2219행 `onAttachFile`(작지 첨부가 `setIntake(recs)`로 접수 목록을 통째로 바꾼다).
  - 2233행 `saveIntake`.
  - 2779~2821행 접수 대화상자. 2790~2794행에 "작업지시서 첨부" 버튼 줄이 있다.
  - 978행 `records` 셀렉터가 있고, `requests`는 아직 읽지 않는다.
- DD 칸 id: 178행 owner, 180 styleNo, 188 buyer, 190 planner, 210 yarnDetail(`tech.yarnDetail`), 213 color, 214 dyeing, 219 remark(`note`).

## 설계
### 1. 안정적인 옵션 고유 ID
- `RequestOption`에 `lineId?: string`을 더한다. 주석은 "번호가 바뀌어도 변하지 않는 옵션 고유 ID. DD 연결 키."로 단다. 기존 `ddLink`는 지우지 않고 주석에 "미사용. requestLink(DD 쪽)로 대체"를 단다.
- `blankOption`(FabricRequest.tsx)과 `readOption`(request-template.ts)은 `lineId: crypto.randomUUID()`를 넣는다.
- `renumber`는 `...option` 전개라 `lineId`가 유지된다. 유지되는지 확인만 한다.
- `mergeRequestStyles`: 갱신할 때 옵션마다 `lineId: previous.options[index]?.lineId ?? option.lineId`로 **같은 위치 기존 ID를 이어받는다.** 주석으로 이유(재업로드 시 DD 연결 유지)와 한계(엑셀에서 옵션 순서를 바꾸면 연결이 다른 옵션으로 옮겨감)를 적는다.

### 2. DD 쪽 연결 저장 (한쪽에만 저장)
- `DevTechnical`에 `requestLink?: { reqId: string; lineId: string }`을 더한다. 연결은 **DD 행에만** 저장한다. FABRIC REQUEST 쪽 상태는 나중에 `records`를 훑어 계산한다(양쪽 저장은 동기화 중 어긋난다).
- `intakeSourceKey`: `intakeSource`가 없고 `tech.requestLink`가 있으면 `["request", reqId, lineId]`를 같은 방식으로 정규화해 돌린다. 같은 요청 옵션을 두 번 등록하지 못한다.

### 3. 새 모듈 `src/data/request-link.ts`
```ts
export const normalizeStyleKey = (value: string) => value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "")
export function linkedLineIds(records: readonly DevRecord[]): Set<string>        // tech.requestLink.lineId 모음
export function ensureRequestLineIds(requests: readonly RequestStyle[]): { next: RequestStyle[]; changed: boolean } // lineId 없는 옵션에 randomUUID
export interface RequestCandidate { style: RequestStyle; total: number; unlinked: number; exact: boolean }
export function requestCandidates(requests, records, styleNo: string, query: string, includeLinked: boolean): RequestCandidate[]
export function requestToIntakeRecords(style: RequestStyle, options: readonly RequestOption[]): DevRecord[]
```
- `requestCandidates`
  - `exact`는 `normalizeStyleKey(garmentNo) === normalizeStyleKey(styleNo)`(styleNo가 비면 false)다.
  - `query`는 garmentNo·brand·chart·developer 부분 일치(대소문자 무시)다.
  - `includeLinked`가 false면 `unlinked === 0`인 스타일은 뺀다.
  - 정렬은 `exact` 먼저, 그다음 `updatedAt` 내림차순이다.
  - `lineId`가 없는 옵션은 미연결로 센다.
- `requestToIntakeRecords`
  - 옵션마다 `createBlankDevRecord(style.developer)`(`@/data/dd-workflow`)에서 시작한다.
  - `styleNo = garmentNo`, `buyer = brand`, `planner = requester`, `color`, `dyeing = dyeingMethod`, `note = remark`, `tech.yarnDetail`, `tech.requestLink = { reqId, lineId }`를 채운다.
  - 옵션이 0개면 빈 배열이다.
  - **season, category, dueDate 등 차트나 요청에 없는 값은 채우지 않는다**(필수 검사로 사람이 채운다).

### 4. DD MASTER 접수 창 연결
- `const requests = useAppStore((state) => state.requests)`, `saveRequests`를 가져온다(스토어의 기존 저장 함수 이름을 확인해 쓴다).
- state: `requestPickerOpen: boolean`, `intakeRequest: { reqId: string; chart: string; garmentNo: string } | null`. `openNew`와 `closeIntake`에서 `intakeRequest`를 null로 되돌린다.
- 2790~2794행 버튼 줄 "작업지시서 첨부" 옆에 `Button size="sm" variant="outline"` **"FABRIC REQUEST에서 불러오기"**(아이콘 `ClipboardList`)를 두고 누르면 `requestPickerOpen`을 연다.
- 추천 줄: `intakeRequest`가 없고 `sharedDraft.styleNo`와 `exact`인 후보 중 `unlinked > 0`인 첫 후보가 있으면, 버튼 줄 아래에 한 줄을 보인다. 모양은 `rounded-md bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-2 py-1 text-xs`이고 내용은 `FABRIC REQUEST에 같은 Garment No.가 있습니다 · {chart} · {garmentNo} · 미연결 옵션 {n}건`이다. `[불러오기]` 버튼은 피커를 그 스타일이 선택된 상태로 연다.
- `intakeRequest`가 있으면 제목 옆 배지로 `REQUEST · {chart} · {garmentNo}`와 `연결 해제` 작은 버튼을 둔다. 해제하면 `intake` 모든 행의 `tech.requestLink`를 지우고 `intakeRequest = null`로 한다. 값은 남긴다.
- 작지 첨부(`onAttachFile`)가 성공하면 `intakeRequest`를 null로 하고, 알림 `작업지시서를 첨부해 FABRIC REQUEST 연결을 해제했습니다.`를 `setIntakeError` 자리에 보인다.
- `applySharedFields`(옵션 공통 값 복사)가 **`tech.requestLink`를 공통 값으로 덮지 않는지 확인**한다. 덮는다면 `requestLink`는 행마다 자기 값을 유지하도록 그 함수만 고친다.

### 5. 피커 대화상자 (`src/components/dd/RequestPickerDialog.tsx` 신규)
Props: `{ open, onOpenChange, requests, records, styleNo, initialReqId?: string, onConfirm: (style: RequestStyle, options: RequestOption[]) => void }`
- 크기 `w-[92vw] max-w-4xl`, 좌우 2단(`grid grid-cols-[1.1fr_1fr]`).
- **왼쪽**: 검색 `Input h-8`(Garment No., Brand, 차트, 개발 담당), 토글 버튼 `연결된 스타일도 보기`, 후보 목록(스크롤 `max-h-[60vh]`). 행마다 Garment No.(굵게), `exact`면 `같은 Style No.` 배지(primary 톤), 아래 작은 글씨로 `{chart} · #{seq} · {brand} · 개발 {developer}`, 오른쪽에 `미연결 {unlinked}/{total}`을 둔다. 선택 행은 `bg-[var(--accent)]`.
- **오른쪽**: 선택 스타일의 옵션 체크 목록. 옵션마다 `Opt {no} · {color} · {dyeingMethod}`, 아래 줄에 `yarnDetail` 한 줄 말줄임을 보인다. 이미 연결된 옵션(`linkedLineIds`에 있음)은 체크 비활성과 `연결됨` 표시다. 미연결은 기본 체크다. 상단에 `모두 선택` 체크박스를 둔다.
- 푸터: `취소`, `{n}건 불러오기`(0이면 비활성)다.
- 확인 시 부모가 처리한다.
  1. `ensureRequestLineIds(requests)`를 부르고 `changed`면 `saveRequests(next)`를 **한 번** 한다. 선택 옵션은 `next`의 같은 스타일에서 `lineId`가 채워진 옵션으로 다시 찾는다.
  2. `requestToIntakeRecords`로 행을 만들어 `setIntake(recs)`, `setIntakeOpt(0)`, `setIntakeError(null)`, `resetAttach()`를 한다.
  3. `intakeRequest = { reqId, chart, garmentNo }`로 둔다.
- 실데이터 이미지를 불러오지 않는다(Storage 호출 없음).

## CLAUDE.md
"## DD MASTER" 절에 한 문단을 더한다. 내용은 네 가지다.
- 신규 접수 창의 "FABRIC REQUEST에서 불러오기"는 요청 스타일의 옵션을 DD 접수 행으로 채운다.
- 연결은 DD 행 `tech.requestLink { reqId, lineId }`에만 저장한다.
- `optId`는 삭제 시 번호가 바뀌어 연결 키로 쓰지 않는다. 대신 `RequestOption.lineId`를 쓰고, 엑셀 재업로드 병합은 같은 위치의 `lineId`를 이어받는다.
- 차트명으로 Category·Season을 채우지 않는다. 추천은 Garment No.=Style No. 일치지만 예외가 있어 사람이 고른다.

"## FABRIC REQUEST" 절에도 `lineId` 한 줄을 더한다.

## 다음 단계 (이번에 하지 않음)
- FABRIC REQUEST 옵션 줄에 DD 상태 칸: 미연결, 진행중(공정), 원단 수취(Received date), FL#(DD 행 링크).
- 기존 데이터 연결 도우미.
- DD MASTER Style No. 칸 REQ 표시.

## 하지 말 것
- 차트명을 파싱해 Category·Season을 채우지 않는다.
- FABRIC REQUEST 쪽에 DD 상태나 연결을 저장하지 않는다.
- `optId` 형식과 `renumber` 규칙을 바꾸지 않는다.
- 작지(zaji) 파서와 `saveDevelopmentIntakeRecords`의 기존 중복 규칙을 바꾸지 않는다. `intakeSourceKey`에 요청 키 분기만 더한다.
- R141 편집 기능과 R135~R140 미커밋 변경을 되돌리지 않는다.
- 공개 저장소에 실데이터를 넣지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `schema.ts`, `request-template.ts`, `FabricRequest.tsx`(blankOption만), `useAppStore.ts`, `DevelopmentMasterSheet.tsx`, 신규 `request-link.ts`·`RequestPickerDialog.tsx`, `CLAUDE.md`, 이 문서만 더해진다.
