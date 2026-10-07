# R316 DEVELOPMENT REQUEST Link 열을 FL no. 로, HOLD·DROP·REJECT 원문 표기

상태: 구현 완료. 2026-10-07 박향근 확정. 클로드가 직접 시공했다. 코덱스를 거치지 않았다.

## 왜

Link 열이 연결 상태를 색 알약으로 말하고, 바로 옆 공정 칩이 같은 말을 또 했다. 게다가 진행이 `--chart-1`(연어빛 빨강)이라 정상 진행이 경고처럼 읽혔다.

**공정 상태가 보이면 그 자체로 연결된 것이다.** 그래서 Link 열에서 연결 표시를 없앴다. 그 열에 쓸모 있게 남은 것은 FL#뿐이라 열 이름을 `FL no.`로 바꿨다.

## 바꾼 것

| 파일 | 조치 |
|---|---|
| `src/routes/FabricRequest.tsx` | 열 이름 `FL no.`, `renderDdLink`에서 연결 칩 제거, `renderDdStage`에 미연결 표시, `DD_TONE_CLASS` 상수 삭제 |
| `src/data/request-process-stage.ts` | `halted` 값을 HOLD·DROP·REJECT로 |
| `src/components/request/ProcessStageChip.tsx` | 취소선 판정을 영문 값으로 |
| `src/components/request/RequestBoardHeader.tsx` | 분포 막대 색과 정렬 키를 영문 값으로 |
| `src/components/request/RequestArchiveView.tsx` | 옛 한글 스냅샷도 같이 인식 |
| `src/data/schema.ts` | 보관 스냅샷 `halted` 유니온을 영문과 한글 둘 다 받게 확장 |

### FL no. 열

`renderDdLink`는 `status.flNo`가 없으면 `null`을 돌려준다. 있으면 FL# 링크, `FlPerfMark`, `+N`만 보인다. 상태 문구는 FL# 툴팁에 남겼다.

### 미연결은 공정 열로

`renderDdStage`가 `stage.linked`가 아니면 테두리 없는 붉은 글자 "미연결"을 그린다. **더블클릭하면 연결할 DD 행 후보 창(`setDdPick`)이 열린다. REQUEST 화면의 유일한 연결 진입점이라 없애지 말 것.** 예전에는 이 진입점이 Link 열 미연결 칩에 있었다.

### HOLD·DROP·REJECT

DD 원문 그대로 적는다. 보류, 드롭, 반려 한글 표기를 버렸다. `ProcessStage.halted`가 `"HOLD" | "DROP" | "REJECT"`다. 공정 칩, 단계 팝업 배지, 보드 머리 분포 막대가 `halted` 하나를 보므로 같이 따라온다.

**취소선은 DROP과 REJECT에만 둔다.** HOLD는 멈춘 것이지 끝난 것이 아니다. 색은 앰버(`--warning`)로 남는다.

**종결 스냅샷(`requestArchive`)에는 오늘 이전에 저장된 한글 표기가 그대로 있다.** 지나간 기록이라 고치지 않았다. 대신 `schema.ts`의 유니온을 영문과 한글 둘 다 받게 넓히고, 보관함 화면이 `HOLD`와 `보류`를 같이 인식하게 했다. **옛 값을 지우거나 한 번에 바꾸는 이관을 만들지 말 것.** 스냅샷은 그때의 사실이다.

## 하지 말 것 (되돌린 시도)

같은 날 공정 칩과 Link 칩에 글라스 효과를 넣었다가 **화면이 깨져 전량 되돌렸다.** 표 전체가 떨리고 열이 어긋나며 내용이 비어 보였다.

원인은 `backdrop-blur`(`backdrop-filter`)로 본다. 이 표는 행이 수백 개이고 가상 스크롤이 없으며 좌측 2열이 `sticky`다. 칸마다 `backdrop-filter`를 걸면 칩 하나당 합성 레이어와 쌓임 맥락이 생기고, 스크롤할 때마다 재계산되면서 고정 열이 어긋난다.

**격자 칸 안에 `backdrop-filter`, 번짐 그림자, 상시 애니메이션을 넣지 말 것.** 글라스 효과가 필요하면 한 화면에 몇 개 안 뜨는 자리(보드 머리 카드, 공정 단계 팝업)에만 건다.

## 공정 칩 색은 그대로 둔다 (확정)

`stepColor`의 빨강에서 초록으로 가는 9색 그라데이션을 한 계열로 줄이자는 안이 있었다. **2026-10-07에 박향근이 그대로 두기로 확정했다. 다시 꺼내지 말 것.**

## 검증

`npm run build` 통과(`tsc --noEmit` 포함). 화면 확인은 박향근이 한다.
