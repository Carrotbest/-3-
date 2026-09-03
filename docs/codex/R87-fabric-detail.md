# R87 — 원단 상세 화면과 양방향 링크

상태: 미착수.

DD MASTER와 WAREHOUSE가 서로 못 넘어가서 같은 원단인데 화면을 옮기면 맥락이 끊긴다.
두 화면을 합치지 않는다. 성격이 다르다. 대신 가운데에 공통 화면을 하나 만든다.

    DD MASTER (목록)        WAREHOUSE (목록)
            \                  /
             원단 상세 /fabric/:key

두 표는 목록이고 새 화면은 개체다. 지금 없는 것이 이것이다.

---

## 0. 이미 있는 것

새로 만들 배관이 없다. 아래를 그대로 쓴다.

`src/data/fabric-ledger.ts`

    buildFabricLedger(records, samples, overrides, fabricEvents): FabricLedgerItem[]

`FabricLedgerItem`(15행)이 한 원단의 모든 것을 이미 들고 있다.

    key, styleNo, flNo, storageNo, status, sourceSheet
    season, category, buyer, owner, planner, construction, weight, color, dyeing
    requestDate, dueDate, completedAt
    yds, outbound[], outboundTotal, balance, note, updatedAt, updatedBy
    record: DevRecord | null      DD 원본
    sample: CompletedSample | null 샘플관리대장 원본

`FabricLedgerOutbound`(9행)는 `{ to, qty, date }` 세 칸이다.
사업부 칸은 아직 없다. **이번 작업에서 만들지 마라.** 다음 단계다.

스토어 셀렉터는 `Warehouse.tsx` 211~215행과 똑같이 쓴다.

    records = useAppStore((s) => s.records)
    samples = useAppStore((s) => s.completed)
    overrides = useAppStore((s) => s.fabricOverrides)
    fabricEvents = useAppStore((s) => s.fabricEvents)

---

## 1. 새 화면 `src/routes/FabricDetail.tsx`

경로는 `/fabric/:key` 다. 해시 라우터이므로 실제 주소는 `#/fabric/...` 가 된다.

`buildFabricLedger` 결과에서 `key` 가 일치하는 항목 하나를 찾아 그린다.
못 찾으면 "해당 원단을 찾을 수 없습니다"와 창고로 돌아가는 링크를 보여준다.

**key 는 URL 에 그대로 넣지 마라.** FL 번호와 Style 을 정규화해 만든 값이라
슬래시나 공백이 섞일 수 있다. 링크를 만들 때 `encodeURIComponent`,
읽을 때 `decodeURIComponent` 를 반드시 써라. 이걸 빠뜨리면 일부 원단만 404 가 된다.

### 화면 구성

머리글에 FL#, Style No., R&D No., 상태 배지를 한 줄로 놓는다.
상태 라벨과 색은 `FABRIC_STATUS_META`(45행)를 그대로 쓴다. 새로 정의하지 마라.

그 아래 네 구역이다.

**개발**
  담당, Season, Buyer, Category, Planner, 조직(construction), 중량, Color, Dyeing,
  접수일(requestDate), 납기(dueDate), 완료일(completedAt)

**공정**
  원사, 편직, 염색, 가공 네 단계의 업체와 완료일.
  `record` 가 있으면 `record.tech.mills` 와 `record.tech.processDates` 에서 가져온다.
  `record` 가 없으면 `sample.process` (yarn, knit, dye, finish, remark)에서 가져온다.

**창고**
  R&D No., 보유(yds), 반출 합계(outboundTotal), 잔량(balance).
  그 아래 반출 이력을 표로 나열한다. 날짜, 반출처(to), 수량(qty).
  반출이 없으면 "반출 이력이 없습니다"를 표시한다.

**이력**
  `fabricEvents` 중 이 원단의 것만 시간 역순으로 나열한다.
  Warehouse.tsx 가 이벤트를 어떻게 이 원단과 잇는지 먼저 읽고 같은 방식을 써라.
  새 매칭 규칙을 만들지 마라.

### 반드시 처리할 것: 아카이브 행

**2026년 7월 이전 건은 `record` 가 null 이다.** `emptyFromSample`(135행)이 그렇게 만든다.
DD 는 7월부터 시작했고 그 앞은 전부 샘플관리대장 이력이다. 5,190건 규모다.

`CompletedSample` 에는 다음 네 칸이 아예 없다. 확인한 사실이다.

    color, dyeing, planner, dueDate

그래서 아카이브 건을 열면 개발 구역이 군데군데 빈다. 사용자가 고장으로 오해한다.

**`record` 가 null 이면 화면 위쪽에 안내 한 줄을 띄워라.**

    "샘플관리대장 이력입니다. 개발 상세 일부는 기록되어 있지 않습니다."

빈 칸은 빈 칸으로 두고 "—" 를 넣지 마라. DD MASTER 에서 대쉬를 걷어낸 것과 같은 방침이다.

### 편집은 넣지 마라

이 화면은 **읽기 전용**이다. 입고, 반출, 폐기 같은 동작 버튼을 만들지 마라.
그건 WAREHOUSE 화면이 한다. 이번 작업은 보여 주는 것까지다.

---

## 2. 라우트 등록

`src/App.tsx` 의 `<Routes>` 안에 넣는다. 155~175행 사이에 다른 Route 들이 있다.

    <Route path="/fabric/:key" element={<FabricDetail />} />

**주의할 것이 하나 있다.** App.tsx 는 `routeDefinitions` 중
`IMPLEMENTED_ROUTES` 에 없는 경로를 자동으로 PlaceholderPage 로 만든다.
`route-config.ts` 에 `/fabric/:key` 를 넣을 거라면 `IMPLEMENTED_ROUTES` 에도 반드시 넣어라.
안 넣으면 준비 중 화면이 겹쳐 뜬다.

이 화면은 **좌측 메뉴에 넣지 마라.** 클릭으로만 들어오는 화면이다.
`navigationSections` 에 추가하지 않는다.

`canViewCurrentPath` 로 접근을 막는 구조가 있다. `/fabric/:key` 가 그 판정에서
막히지 않는지 확인해라. 막히면 WAREHOUSE 와 같은 권한으로 열리게 맞춰라.

---

## 3. WAREHOUSE 에서 넘어가기

`src/routes/Warehouse.tsx` 의 표에서 **R&D No.(storageNo) 칸을 링크로 만든다.**
`CORE_HEADERS`(45행 부근)의 첫 열이다.

  - 값이 있을 때만 링크다. 비어 있으면 지금처럼 그냥 빈 칸이다.
  - 행 선택 체크박스와 기존 동작 버튼을 건드리지 마라.
  - 링크 클릭이 행 선택으로 번지지 않게 `event.stopPropagation()` 을 걸어라.

R&D No. 가 없는 입고 대기 건은 Style No. 를 링크로 쓴다.
아직 채번 전이라 R&D No. 로는 못 들어간다.

---

## 4. DD MASTER 에서 넘어가기

`src/routes/DevelopmentMasterSheet.tsx` 의 샘플관리대장 연결 그룹에
`storageNo` 열이 있다(245행 부근).

**여기가 이번 작업에서 가장 위험한 지점이다.**

이 화면은 엑셀식 그리드다. 셀을 누르면 선택되고 두 번 누르면 편집된다.
셀 전체를 링크로 만들면 **셀 선택과 범위 드래그가 망가진다.** 절대 그렇게 하지 마라.

담당 열의 확장/삭제 버튼과 같은 방식을 써라. 2163행 부근을 먼저 읽어라.

  - 값 옆에 작은 아이콘 버튼 하나만 둔다. 링크는 그 아이콘뿐이다.
  - 평소에는 `opacity-0`, 행에 마우스를 올리면 `group-hover:opacity-100`.
  - 안 보일 때는 `pointer-events-none`, 보일 때만 `pointer-events-auto`.
    이걸 빠뜨리면 셀 선택이 막힌다. 담당 열에서 똑같은 함정을 이미 겪었다.
  - 버튼에 `event.stopPropagation()` 을 걸어 셀 선택으로 번지지 않게 한다.
  - 열 너비를 늘리지 마라. 아이콘은 겹쳐 띄운다.

`storageNo` 가 빈 행에는 버튼을 아예 그리지 마라. 갈 곳이 없다.

---

## 하지 말 것

- 두 목록 화면의 열 구성이나 너비를 바꾸지 마라. C 모델 재구성은 다음 단계다.
- `FabricLedgerOutbound` 에 사업부 칸을 만들지 마라. 다음 단계다.
- 상세 화면에 편집이나 상태 변경 기능을 넣지 마라.
- `buildFabricLedger` 와 `FABRIC_STATUS_META` 를 고치지 마라. 읽어서 쓰기만 한다.
- 저장 구조와 동기화 코드를 건드리지 마라. 웹에 들어간 데이터를 읽기만 한다.
- 새 패키지를 설치하지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 이 저장소는 공개다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- public/data 아래 JSON을 열지 마라. archive.json은 2.5MB다.
- npm run build 는 모든 수정을 마친 뒤 한 번만 돌려라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라. 세 번째 시도를 하지 마라.

## 검증

- npm run build 를 통과시켜라.
- key 인코딩을 코드로 확인해라. 슬래시나 공백이 든 key 로 링크를 만들었을 때
  주소가 깨지지 않아야 한다. 이게 깨지면 일부 원단만 조용히 404 가 된다.
- DD MASTER 의 새 아이콘 버튼이 안 보일 때 pointer-events 가 꺼져 있는지 확인해라.
  셀 선택이 막히면 표 편집을 못 쓴다.
- record 가 null 인 경우의 분기를 주석으로 남겨라.

## 보고

수정·추가 파일, 빌드 결과, 판단이 필요한 지점만 한국어로 간결히 써라.
바꾼 코드를 다시 붙이지 마라.
