# R88 — WAREHOUSE 표를 C 모델로 재구성

상태: 미착수. R87(원단 상세)이 끝난 상태에서 이어서 한다.

목표는 하나다. **자주 하는 일이 가로 스크롤 없이 끝나게 한다.**
지금은 R&D No. 를 찾은 뒤 잔량을 보려면 표를 옆으로 밀어야 한다.
창고 화면에서 가장 잦은 동작인데 가장 불편하다.

핵심 열을 좁게 고정하고, 개발 정보와 사양은 접어 둔다.
DD MASTER 의 그룹 접기와 같은 방식이다. 팀이 이미 그 조작을 안다.

---

## 0. 지금 상태

`src/routes/Warehouse.tsx` 668줄.

  45행   CORE_HEADERS  11개 열 정의
  73행   COLUMN_WIDTHS 퍼센트 클래스 11개
  445행  coreCell(item, id)  열별 셀 렌더
  580행  colgroup
  586행  단일 헤더 행
  619행  본문 셀

`FabricLedgerItem`(fabric-ledger.ts:15)이 표시할 값을 이미 다 들고 있다.
`buildFabricLedger`(190행)가 만든다.

`FabricLedgerAction`(schema.ts:212)은 일곱 가지다.
COMPLETE, RECEIVE, OUTBOUND, EXHAUST, DISPOSE, RESTORE, NOTE.
**RECEIVE 가 입고다.**

---

## 1. 저장 구조에 사업부를 더한다

부장님이 8월에 요청한 항목이다. 반출자와 야드는 있는데 사업부가 없다.

`src/data/schema.ts` 의 `FabricLedgerEvent`(226행)에 한 줄 더한다.

    division?: string

`src/data/fabric-ledger.ts` 의 `FabricLedgerOutbound`(9행)에도 더한다.

    division?: string

**반드시 optional 이어야 한다.** 이 이벤트는 IndexedDB 와 Firestore 에 이미 쌓여 있다.
기존 기록에는 이 칸이 없다. 필수로 만들면 옛 기록을 읽을 때 깨진다.

**기존 이벤트를 고쳐 쓰지 마라.** 마이그레이션이나 일괄 갱신 코드를 만들지 마라.
값이 없으면 빈 칸으로 보여주면 된다.

`applyFabricAction`(src/store/useAppStore.ts)이 `division` 을 받아 이벤트에 넣도록 한다.
기존 인자를 지우거나 순서를 바꾸지 마라. 선택 인자로 더한다.

---

## 2. 출고 등록에 사업부 입력을 넣는다

`Warehouse.tsx` 410~418행의 OUTBOUND 분기다. 지금은 수령자, 수량, 날짜를 받는다.
사업부 입력을 하나 더한다.

  - 수령자와 달리 **필수로 만들지 마라.** 모르는 경우가 있다.
    비어 있으면 그대로 저장한다.
  - `applyFabricAction` 호출에 `division` 을 넘긴다.

**사업부 목록을 코드에 적지 마라.** 이 저장소는 공개다.
자유 입력으로 두되, 지금까지 입력된 값을 모아 datalist 로 제안해라.
DD MASTER 의 `suggest` 열이 쓰는 방식과 같다. 값이 쌓일수록 목록이 자란다.

---

## 3. 파생값 세 가지를 원장에 더한다

`buildFabricLedger` 안에서 계산해 `FabricLedgerItem` 에 담는다.
화면에서 매번 계산하지 마라.

    intakeAt: string                          입고일
    lastMovedAt: string                       최종 이동일
    lastOutbound: FabricLedgerOutbound | null 최근 반출

규칙이다.

  - `intakeAt` 은 그 원단의 **RECEIVE 이벤트 중 가장 마지막**의 `occurredAt` 이다.
    없으면 빈 문자열이다. 아카이브 건은 대부분 없다.
  - `lastMovedAt` 은 마지막 OUTBOUND 의 날짜다. 반출이 없으면 `intakeAt` 을 쓴다.
    둘 다 없으면 빈 문자열이다.
  - `lastOutbound` 는 날짜가 가장 늦은 반출 한 건이다. 없으면 null 이다.

`lastMovedAt` 의 쓸모는 폐기 검토다. 오래 안 움직인 재고를 찾는 기준이 된다.

이벤트를 원단과 잇는 방법은 이미 `buildFabricLedger` 안에 있다(217행 부근 outboundMap).
같은 방식을 써라. 새 매칭 규칙을 만들지 마라.

---

## 4. 표를 그룹 구조로 바꾼다

`CORE_HEADERS` 를 그룹 배열로 바꾼다. DD MASTER 의 `GROUPS` 와 같은 모양이면 된다.

    고정   (항상 보임)  storageNo  styleNo  owner  status
    재고   (기본 열림)  yds  outboundTotal  balance  lastMovedAt
    입출고 (기본 열림)  intakeAt  lastOutbound.to  lastOutbound.division
    개발   (기본 닫힘)  flNo  season  category  buyer  completedAt
    사양   (기본 닫힘)  construction  weight  color  dyeing

기본 상태에서 11열이다. **지금과 같은 개수라 화면이 갑자기 낯설어지지 않는다.**
전부 펼치면 20열이다.

### 헤더는 두 줄이다

윗줄에 그룹 이름, 아랫줄에 열 이름이다.
"고정" 그룹은 이름 대신 `rowSpan={2}` 로 두 줄을 합쳐라.
DD MASTER 헤더(2056~2065행)가 같은 구조다. 먼저 읽고 같은 방식으로 해라.

**colSpan 불변식을 지켜라.** 윗줄 그룹 colSpan 합, 아랫줄 열 개수, 본문 셀 개수가
접힘과 펼침 **양쪽 모두에서** 같아야 한다. 하나만 어긋나도 표가 통째로 밀린다.
걸러진 열 목록을 하나 만들어 세 곳이 모두 그것을 참조하게 해라.

기존 체크박스 열과 동작 버튼 열은 지금 자리 그대로 둔다.
빈 상태 행의 `colSpan`(622행)도 새 열 개수에 맞춰라.

### 접기 버튼

"개발"과 "사양" 그룹 헤더 우측 끝에 `+` / `-` 버튼을 둔다.
DD MASTER 의 Finishing 토글(2057행)과 같은 모양이다.
상태는 `useState` 로 두고 localStorage 에 저장하지 마라.

### 너비

`COLUMN_WIDTHS`(73행)의 퍼센트 방식을 버려라. 열 개수가 바뀌면 퍼센트가 무너진다.
열마다 px 너비를 정하고, 표를 가로 스크롤 컨테이너로 감싸라.
전부 펼쳤을 때 가로 스크롤이 생기는 것은 정상이다.

날짜 열은 좁아도 된다. DD MASTER 와 같은 월-일 표기를 쓰려면
`fmtDateMd`(data/format.ts)를 써라. 다만 **창고는 과거 이력 조회가 주 용도이므로
연도가 보여야 한다.** `fmtDateFull` 을 그대로 써라. 월-일로 바꾸지 마라.

---

## 5. 검색에 반출 정보를 넣는다

240행의 검색 필터에 세 가지를 더한다.

    lastOutbound?.to        반출처
    lastOutbound?.division  사업부
    note                    비고

창고팀이 "어느 사업부가 가져갔지"로 찾는다. 지금은 안 된다.

기존 검색 대상(storageNo, styleNo, flNo, season, category, buyer, owner, construction)은
그대로 둔다.

---

## 6. 원단 상세에도 사업부를 보여준다

`src/routes/FabricDetail.tsx` 의 반출 이력 표에 사업부 칸을 더한다.
값이 없으면 빈 칸이다. R87 에서 만든 화면이다.

`Warehouse.tsx` 644행의 상세 다이얼로그 출고 이력 표에도 같은 칸을 더한다.

---

## 하지 말 것

- 상태 전이 규칙(READY, WAREHOUSE, EXHAUSTED, DISPOSED)을 바꾸지 마라.
- 채번 로직을 건드리지 마라. 채번 취소는 다음 단계다.
- 기존 이벤트 기록을 고치거나 옮기는 코드를 만들지 마라.
- 사업부를 필수 입력으로 만들지 마라.
- 사업부 목록을 코드에 하드코딩하지 마라. 저장소가 공개다.
- 탭 네 개(입고 대기, 창고 보관, 소진 완료, 폐기) 구성을 바꾸지 마라.
- DD MASTER 를 건드리지 마라. R83~R87 로 확정됐다.
- Firestore 동기화 코드를 건드리지 마라.
- 새 패키지를 설치하지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 이 저장소는 공개다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- public/data 아래 JSON을 열지 마라. archive.json은 2.5MB다.
- npm run build 는 모든 수정을 마친 뒤 한 번만 돌려라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라. 세 번째 시도를 하지 마라.

## 검증

- npm run build 를 통과시켜라.
- colSpan 불변식을 코드로 확인해라. 두 그룹이 각각 열렸을 때와 닫혔을 때
  네 가지 조합 모두에서 헤더와 본문 열 수가 같아야 한다.
- `division` 이 optional 이고, 값이 없는 기존 이벤트를 읽어도 깨지지 않는지 확인해라.
- `lastMovedAt` 이 반출 없는 항목에서 `intakeAt` 으로 떨어지는지,
  둘 다 없으면 빈 문자열인지 주석으로 남겨라.

## 보고

수정 파일, 빌드 결과, 판단이 필요한 지점만 한국어로 간결히 써라.
바꾼 코드를 다시 붙이지 마라.
