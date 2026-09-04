# R92 — WAREHOUSE 표를 대장식 그리드로 전면 개편

상태: 미착수. R87~R91 이 끝난 상태에서 이어서 한다.

목표는 하나다. **엑셀 샘플관리대장을 쓰던 사람이 이질감 없이 옮겨오게 한다.**
줄줄이 늘어선 카드형 목록이 아니라 DD MASTER 와 같은 결의 그리드로 만든다.

---

## 0. 지금 상태

`src/routes/Warehouse.tsx` 는 R88 에서 그룹 구조로 한 번 손봤다.
`COLUMN_GROUPS`, `visibleColumns`, 두 줄 헤더, `+/-` 토글이 이미 있다.
**그 뼈대를 버리지 말고 확장해라.** 처음부터 다시 짜지 마라.

`FabricLedgerItem`(src/data/fabric-ledger.ts:15)이 값을 들고 있다.
`record: DevRecord | null` 로 DD 원본에, `sample: CompletedSample | null` 로 대장 원본에 닿는다.

**알아야 할 제약이다.** `CompletedSample` 은 대장의 일부 열만 보관한다.
Original Ref#, Requester, Yarn, Target wt', Color, Dyeing Side, Due Date,
공정 업체명, Knitting Data, Greige 는 담지 않는다.
DD 레코드가 붙은 건은 `record.tech` 에서 나오지만 **과거 아카이브 건은 빈다.**
이건 정상이다. 파서를 고쳐서 채우려 하지 마라. 별도 작업이다.

---

## 1. 열 구성

대장(38열)의 순서를 따르되 접이식 그룹으로 묶는다.

    고정 (항상 보임, 좌측 sticky)
      R&D No.(storageNo)  Style/#(styleNo)  FL.#(flNo)  Developer(owner)  재고

    기본 (열림)
      Season  Buyer  Category  Request Date(requestDate)  Finish Date(completedAt)

    개발 (닫힘)
      Original Ref#  Requester(planner)  Yarn  Cons.(construction)
      Target wt'(weight)  Color  Dyeing Side(dyeing)  Due Date(dueDate)

    공정 (닫힘)
      Yarn in-fac  Knitting  Dyeing  Finishing   각각 업체와 완료일 두 칸

    실측 (닫힘)
      Final Data 폭·중량   Shrinkage L·W   Knitting Data   Greige 폭·중량

    비고 (닫힘)
      Remark/Issue(note)

기본 상태 10열이다. 가로 스크롤 없이 보여야 한다.

값이 없으면 빈 칸으로 둔다. 대쉬를 넣지 마라. DD MASTER 와 같은 방침이다.

`record` 에서 가져오는 열은 `record.tech` 경로를 쓴다.
DD MASTER 의 `GROUPS` 정의(src/routes/DevelopmentMasterSheet.tsx:151 부근)에
같은 값들이 이미 매핑되어 있다. **그 파일을 먼저 읽고 같은 경로를 써라.**
새로 추측하지 마라.

---

## 2. 재고를 한 칸으로

지금 R88 에서 보유·반출 합계·잔량 세 칸으로 나뉘어 있다. **한 칸으로 합친다.**

표기는 `잔량/보유yds` 다. 예를 들어 보유 30, 반출 0 이면 `30/30yds`.
보유 30, 반출 25 면 `5/30yds`.

  - 보유(yds)가 없으면 빈 칸이다.
  - 잔량이 0 이면 숫자를 흐리게 처리해 소진됐음을 보인다.
  - 이 칸을 누르면 **반출 이력 팝업**이 뜬다. 표 하나면 된다.

        날짜        반출처            사업부        수량
        2026-08-22  통합원단부 1팀     니트          5 yds

    `item.outbound` 를 최신순으로 나열한다. R88 에서 이미 최신순 정렬돼 있다.
    이력이 없으면 "반출 이력이 없습니다" 를 표시한다.
    팝업에서는 읽기만 한다. 등록·수정 버튼을 넣지 마라. 기존 출고 등록 경로를 쓴다.

한 원단이 여러 번에 걸쳐 나눠 출고될 수 있다. 전량 한 번에 나갈 수도 있다.
지금 구조가 이미 그렇게 되어 있으니 계산식을 바꾸지 마라.

---

## 3. 탭을 셋으로 줄인다

지금 넷이다. 입고 대기 / 창고 보관 / 소진 완료 / 폐기.

**소진 완료와 폐기를 "이력" 하나로 합친다.**

    입고 대기   READY
    창고 보관   WAREHOUSE
    이력        EXHAUSTED + DISPOSED

사용자 판단이다. 웹에서는 둘을 나눌 이유가 없다. 과거 조회용이다.

구분은 상세에서 보여준다. 원단 상세 화면(`src/routes/FabricDetail.tsx`)의 창고 구역에
종료 사유를 한 줄 넣어라.

  - status 가 EXHAUSTED 면 "전량 소진"
  - DISPOSED 면 "폐기". `fabricEvents` 의 DISPOSE 이벤트에 `reason` 이 있으면 함께 보인다.

`FabricLedgerStatus` 타입과 `statusFromSample` 은 건드리지 마라.
탭이 두 상태를 함께 거르게만 한다.

---

## 4. 행을 누르면 원단 상세로

R87 에서 만든 `/fabric/:key` 로 보낸다. 새 팝업을 만들지 마라.

  - 재고 칸 클릭은 반출 이력 팝업이다(2번). 상세로 가지 않는다.
    `event.stopPropagation()` 으로 갈라라.
  - 체크박스와 기존 동작 버튼도 상세로 번지지 않게 막아라.
  - 링크는 `encodeURIComponent(item.key)` 를 쓴다. R87 과 같다.

---

## 5. 디자인은 DD MASTER 에 맞춘다

`src/routes/DevelopmentMasterSheet.tsx` 를 먼저 열어 보고 같은 결로 맞춰라.

  - 행 높이 h-8, 글자 text-xs, 셀 경계 border-b border-r
  - 헤더는 두 줄. 그룹 이름 위, 열 이름 아래. 고정 그룹은 rowSpan 으로 합친다
  - 좌측 고정 열은 sticky
  - 색은 전부 CSS 변수를 쓴다. Tailwind 색 이름을 직접 쓰지 마라
  - 그룹 헤더 우측 끝 `+/-` 토글은 R88 것을 그대로 쓴다

**colSpan 불변식을 지켜라.** 그룹 열림 조합이 늘어난다.
윗줄 그룹 colSpan 합, 아랫줄 열 개수, 본문 셀 개수, 빈 상태 행 colSpan 이
모든 조합에서 같아야 한다. 걸러진 열 목록 하나를 네 곳이 모두 참조하게 해라.

---

## 6. 정렬은 건드리지 마라

R91 에서 대장 행 순서와 완전히 일치시켰다. 창고보관 653건이 엑셀과 같다.
`buildFabricLedger` 의 정렬과 `sourceOrder` 를 건드리지 마라.
화면에서 다시 정렬하지도 마라. 원장이 준 순서 그대로 그린다.

R&D No. 로 숫자 정렬하는 코드를 넣지 마라. 번호가 두 번 되감겨 틀린다.

열 머리글 클릭 정렬 기능을 새로 만들지 마라. 이 화면은 고정 순서가 규칙이다.

---

## 하지 말 것

- 상태 전이 규칙과 채번 로직을 건드리지 마라. 드래그앤드롭 입고는 다음 단계다.
- 입고 확인(회색 처리) 상태를 만들지 마라. 다음 단계다.
- 검색 대상을 줄이지 마라. R88 에서 반출처·사업부·비고를 더했다.
- 파서와 CompletedSample 타입을 건드리지 마라.
- Firestore 동기화 코드를 건드리지 마라.
- DD MASTER 를 건드리지 마라. 읽어서 참고만 한다.
- 새 패키지를 설치하지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset 이나 git checkout 으로 되돌리지 마라.
- 이 저장소는 공개다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- public/data 아래 JSON 을 열지 마라. archive.json 은 2.5MB 다.
- npm run build 는 모든 수정을 마친 뒤 한 번만 돌려라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라. 세 번째 시도를 하지 마라.

## 검증

- npm run build 를 통과시켜라.
- colSpan 불변식을 그룹 열림 조합마다 확인하고 결과를 보고에 적어라.
- 재고 칸 클릭이 상세 이동으로 번지지 않는지 확인해라.
- `record` 가 없는 아카이브 항목에서 개발·공정·실측 열이 빈 칸으로 나오고
  오류가 나지 않는지 확인하고 주석으로 남겨라.

## 보고

수정 파일, 빌드 결과, 판단이 필요한 지점만 한국어로 간결히 써라.
바꾼 코드를 다시 붙이지 마라.
