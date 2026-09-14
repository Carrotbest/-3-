# R145 DD MASTER 요청 연결 도우미 (기존 데이터 일괄 연결)

상태: 미착수. R144(`defaultLinkPairs`, `applyRequestLinks`, 피커 link 모드, REQ 표시)가 끝난 뒤 한다.

## 요구 (사용자)
기존 DD 현황을 FABRIC REQUEST에 한 번에 연결하는 도우미가 필요하다. 자동 추천을 쓰고, 사람이 확인한 뒤 연결한다.

## 전제
- 연결 저장은 DD 행 `tech.requestLink`에만 한다. 짝 규칙과 쓰기 함수는 R144의 `request-link.ts`를 **그대로 재사용**한다. 짝을 짓는 새 규칙을 따로 만들지 않는다.
- Garment No.=Style No.는 기본 관행이지만 예외가 있다(사용자). 자동 체크는 확실한 경우만 한다.
- 여러 행을 한 번에 쓰는 작업이다. 실행 직전 알림으로 JSON 백업을 권한다.

## 설계
### 1. 후보 계산 `src/data/request-link.ts`
```ts
export type HelperStatus = "auto" | "review" | "none"
export interface HelperGroup {
  styleKey: string                 // normalizeStyleKey(styleNo)
  styleNo: string                  // 대표 표기(첫 행)
  rows: DevRecord[]                // 이 Style No.의 미연결 DD 행(requestLink 없음), opt 순
  candidates: RequestStyle[]       // normalizeStyleKey(garmentNo) === styleKey
  status: HelperStatus
  reason: string                   // 사람이 읽는 한 줄
}
export function buildLinkHelperGroups(records: readonly DevRecord[], requests: readonly RequestStyle[]): HelperGroup[]
```
- 대상 행 조건은 세 가지를 모두 만족하는 행이다.
  - `styleNo.trim()`이 비어 있지 않다.
  - `tech.requestLink`가 없다.
  - Status가 DROP·REJECT가 아니다(HOLD는 포함).
- 묶음 키는 `normalizeStyleKey(styleNo)`다.
- 상태 판정

| 상태 | 조건 | reason |
|---|---|---|
| `auto` | 후보가 정확히 1개이고, 그 후보의 **다른 DD 행에 연결되지 않은** 옵션 수 = 이 묶음 행 수 | `옵션 수 일치` |
| `review` | 후보가 2개 이상 | `요청 후보 {n}개` |
| `review` | 후보 1개이고 개수가 다름 | `요청 옵션 {a}개 · DD 행 {b}개` |
| `none` | 후보 0개 | `같은 Garment No. 요청 없음` |

- 정렬은 `auto`, `review`, `none` 순이고, 같은 상태 안에서는 styleNo를 ko-KR numeric으로 정렬한다.

### 2. 도우미 대화상자 `src/components/dd/RequestLinkHelperDialog.tsx` (신규)
Props: `{ open, onOpenChange, records, requests, editEnabled, onLinkAuto: (groups: HelperGroup[]) => Promise<void>, onReview: (group: HelperGroup) => void }`
- 크기 `w-[94vw] max-w-5xl`.
- 머리
  - 제목 `요청 연결 도우미`.
  - 요약 `자동 {a} · 확인 필요 {r} · 후보 없음 {n} · 미연결 DD 행 {rows}`.
  - 안내 한 줄 `여러 행을 한 번에 연결합니다. 실행 전에 SETTING에서 JSON 백업을 내려받아 두세요.`(warning 톤).
- 탭 세 개(`자동`, `확인 필요`, `후보 없음`, 건수 배지). 본문은 표이고 `max-h-[60vh] overflow-y-auto`다.
  - **자동 탭**
    - 열: 체크, Style No., DD 행 수, 요청(`{chart} · #{seq} · {brand}`), 짝 미리보기
    - 짝 미리보기는 `defaultLinkPairs` 결과를 `Opt 1→1, 2→2` 식으로 짧게 적는다.
    - 기본은 전부 체크다. 머리에 `모두 선택`이 있다.
    - 푸터 버튼 `선택 {n}개 스타일 연결`(DD 행 합계를 괄호로 붙인다).
  - **확인 필요 탭**
    - 열: Style No., DD 행 수, reason, 버튼 `짝 확인…`
    - 누르면 `onReview(group)`을 부른다. 부모가 R144 피커 link 모드를 그 행들로 연다. 후보가 1개면 그 `reqId`를 `initialReqId`로 넘긴다.
  - **후보 없음 탭**: 열은 Style No., DD 행 수, 담당, `직접 연결…` 버튼(피커 link 모드, `initialReqId` 없음)이다.
- `editEnabled`가 거짓이면 실행 버튼을 비활성하고 `EDIT_DISABLED_MESSAGE`와 같은 문구를 보인다.
- 연결 뒤 목록은 `records`가 바뀌면 다시 계산된다(useMemo).

### 3. DD MASTER 연결
- 툴바 "엑셀 내보내기" 버튼 옆(엑셀 백업 버튼 앞)에 `Button size="sm" variant="outline"` `요청 연결 도우미`(아이콘 `Link2`)를 둔다. 미연결 대상 행이 있으면 건수 배지를 붙인다.
- `onLinkAuto(groups)`는 네 단계로 처리한다.
  1. `ensureRequestLineIds(requests)`를 부른다. `changed`면 `saveRequests(next)`를 **한 번** 한다.
  2. `pushUndoSnapshot(records)`를 **한 번** 한다.
  3. 선택 그룹마다 새 `requests`에서 후보 스타일을 다시 찾는다. `blockedLineIds`(그룹 행이 아닌 행의 연결)로 `defaultLinkPairs`를 만들고 `applyRequestLinks(acc, style, pairs, false)`를 **누적 배열에** 적용한다. 앞 그룹 결과가 뒤 그룹의 blocked에 반영되도록 매 그룹마다 누적 배열로 blocked를 다시 계산한다.
  4. `writeDevelopmentRecords(acc, false, R144에서 쓴 AuditKind)`를 **한 번** 하고 알림 `{g}개 스타일 · {n}행을 연결했습니다.`를 띄운다.
- 자동 연결은 **값을 채우지 않는다**(`fillEmpty = false`). 값 채우기는 확인 필요 흐름(피커)에서만 한다.
- `onReview`: R144의 link 모드 피커를 `linkRows = group.rows`로 연다. 연결이 끝나면 도우미로 돌아온다(도우미를 닫지 않고 피커를 위에 띄운다).

## CLAUDE.md
"## DD MASTER" 절에 한 줄을 더한다. "요청 연결 도우미: Style No. 묶음마다 Garment No. 일치 후보를 auto·review·none으로 가른다. auto(후보 1개·미연결 옵션 수=행 수)만 일괄 연결하고 값은 채우지 않는다. 짝 규칙은 R144 `defaultLinkPairs` 하나를 쓴다."

## 하지 말 것
- 새 짝 규칙을 만들지 않는다. R144 함수를 쓴다.
- 자동 연결에서 값을 채우지 않는다. `styleNo`·`owner`는 어느 경우에도 바꾸지 않는다.
- 그룹마다 따로 저장하지 않는다. 스냅샷 한 번, write 한 번이다.
- 요청 쪽에 연결 상태를 저장하지 않는다.
- R144 이전 코드를 되돌리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `request-link.ts`, `RequestLinkHelperDialog.tsx`(신규), `DevelopmentMasterSheet.tsx`, `CLAUDE.md`, 이 문서만 더해진다.
