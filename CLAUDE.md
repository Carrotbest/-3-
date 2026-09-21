# Fabric R&D — 인수인계 (간결본)

한솔섬유 통합원단부 1팀(원단 R&D팀) 업무 플랫폼 MVP. 문서·앱 문구에 옛 명칭 "통원부 3팀"이 남아 있다.
상세 배경·의사결정은 사용자 메모리(`fabric-rnd-*`) 참조.

## 스택·실행
- React18 · TS · Vite · Zustand · Recharts · Tailwind v4 · SheetJS. 위치 `C:\Users\hkpark\Desktop\fabric-rnd`.
- 실행 `npm run dev`, 검증 `npm run build`(=`tsc --noEmit && vite build`). base `/-3-/`, **해시 라우터**.
- 미리보기는 `fabric-rnd-vite`(5175)만. Desktop `.claude/launch.json`의 파이썬 정적서버는 .tsx octet-stream 서빙으로 깨짐 → 금지.

## 방향
- DD MASTER = 현황 관리 중심. **DD MASTER와 창고는 엑셀을 파싱하지 않고 웹에서 직접 작성·관리한다(2026-09-14).** 엑셀은 백업과 문서 내보내기만. 샘플관리대장 업로드는 창고팀과 웹 이관 협의·교육 뒤 결정할 때까지 유지.
- 로그인/권한: 역할별 화면 노출(향후). Firebase 실시간 공유 도입됨(`fabric-rnd-firebase`).

## DD MASTER (`src/routes/DevelopmentMasterSheet.tsx`)
- `/development/workspace` = 살아있는 현황판(64열·7그룹, 담당·Status·Style 좌측 고정). 이 라우트만 `App.tsx`에서 폭 제약 해제.
- 인라인 편집(셀 더블클릭, 타입별). 수식·대장연결 열은 수정 불가. 담당 칸 ⤢ → 64열 수정 모달.
- 신규 작지 접수 팝업: REQUEST·ORIGINAL·담당·Style=옵션 공통(`changeShared`), DETAIL·SCHEDULE=옵션별(`changeOption`). 저장=옵션 수만큼 행(`saveIntake`, `_src.sheet="웹 접수"`).
- 신규 접수 창의 "FABRIC REQUEST에서 불러오기"는 요청 스타일의 옵션을 DD 접수 행으로 채운다. 연결은 DD 행 `tech.requestLink { reqId, lineId }`에만 저장한다. `optId`는 삭제 시 번호가 바뀌므로 연결 키로 쓰지 않고 `RequestOption.lineId`를 쓰며, 엑셀 재업로드 병합은 같은 위치의 `lineId`를 이어받는다. 차트명으로 Category·Season을 채우지 않으며, Garment No.=Style No. 일치를 추천하되 예외가 있어 사람이 선택한다.
- 접수 필수 항목=`INTAKE_REQUIRED_IDS`(담당·Style No.·Season·Category·Buyer·Planner·**Due Date**). 라벨 `*`·빈 칸 붉은 테두리·저장 차단이 모두 이 목록을 본다. Due Date가 비면 HOME 스케줄에서 그 건이 통째로 빠지므로 접수에서 막는다. 엑셀 업로드는 과거 시트를 그대로 들여오는 길목이라 걸지 않는다.
- FDS/YDS 요청 팝업(`src/data/fds-yds-request.ts`): **진행중인 GD 원단 중 `Received date`가 있고 FDS 또는 YDS가 빈 건.** 진행중 판정은 `isInProgress` 하나를 쓴다. **Received date가 없으면 올리지 않는다.** 원단을 받은 뒤에 FDS를 따라가는 순서라 아직 안 받은 건은 요청할 것이 없다. FL#이 유효한 건도 제외한다(FDS를 이미 받았다는 뜻).
  **STYLE#(GD#/SA#)과 ARRANGE#가 비어도 올린다.** 예전에는 둘 다 있어야 올렸는데 그러면 번호를 안 채운 건이 화면에서 조용히 사라져 요청 자체가 누락됐다. 지금은 올리고 `missing`으로 표시해 맨 위에 세우고 붉은 "미기재"를 찍는다. 비어 있으면 GD가 작지를 못 찾아 접수가 안 되니 보내기 전에 채워야 한다. 그 판단은 사람이 한다. 표 복사와 엑셀 내려받기는 `rows`로 만들어서 "미기재" 글자는 화면에만 남고 파일에는 빈 칸으로 나간다.
  담당 칸은 `ownerDisplayName`을 거친다. GD로 나가는 자료라 퇴사자 실명을 싣지 않는다.
  **FDS·YDS 날짜는 웹에서만 산다.** `xlsx-parsers.ts`가 그 두 열을 읽지 않고 `dd-export.ts`도 내보내지 않는다. 엑셀에 적은 날짜는 업로드해도 안 들어오고, 웹에 적은 날짜는 내보내도 안 나간다. 그래서 업로드로만 들어온 행은 날짜를 채워 두었어도 미수취로 보인다. 열 이름을 확인한 뒤 양쪽에 더해야 한다(미착수).
  **FL 등록·FDS 미수취도 별도 분기로 요청한다.** GD·Style No.·Received date가 있고 유효한 FL#이 있으면서 FDS가 비고 Status가 DROP/HOLD/REJECT가 아닌 건 중, FL 등록월이 이번 달 또는 지난달인 건만 표 아래에 모은다. FL# 등록 시 Status가 자동 완료되어 진행중 판정에서 빠지므로 별도 분기가 필요하다. FDS 날짜는 웹 전용이라 과거 업로드 건이 섞이지 않도록 등록월을 2개월로 제한하며, REMARK 앞에는 `{FL#} 등록, FDS 미수취`를 붙인다.
  REQUEST 열은 **일부러 비워 보낸다**. 메일 쓰는 날에 맞춰 손으로 적는 값이라 접수일(requestDate)과 다르다.
- 경고 아이콘(`ddWarnings`)의 FL 경고는 **Style History에 뭐라도 적혀 있으면 끈다.** "Matching RIB으로 등록 불필요"처럼 FL을 안 딴 사유를 남긴 건이라, 계속 띄우면 진짜 누락 건과 구분이 안 된다. FL# 열의 붉은 "FL 미입력" 표기도 같은 판정을 쓰므로 함께 사라진다.
- 작지 첨부 자동 채움: `src/data/zaji.ts`(GD `Fabric sample request report.xlsx`만, 국내 2종 미지원). 회귀규칙(조직명 최장일치·Part+Color dedup·시즌변환) 유지.
  **옵션 단위는 Part+Color 다.** 색상 번호(No)로 접으면 BODY 6개 x 2색이 2건으로 줄어든다(R114). 원본 `zaji/parser.py` 와 다르게 만들지 말 것.
- 열 머리 ▼ 메뉴(`ColumnFilterMenu`)는 엑셀식 값 필터와 정렬이다. 머리 클릭 정렬은 그대로며 필터는 저장하지 않는다. Portal 안 이벤트가 `th`로 버블링되므로 `stopPropagation`을 빼지 말 것.
- 드롭다운=정규목록 ∪ 실데이터. Season `SS'26`.
- 주간 보고 버튼(`src/data/weekly-report.ts`): 보고 양식 `1. Total Sample Status Summary` 문장을 만들어 팝업에 띄운다. 손질해서 복사만 한다. 엑셀로 내보내지 않는다.
  **여기서만 완료 기준이 화면과 다르다. 보고 완료는 `Received date`고 화면 완료는 FL#이다.** 리뷰용 원단 받는 날과 FL 등록에 필요한 FDS 받는 날 간격이 커서, 이번 주에 원단 받아 리뷰까지 끝냈는데 FDS가 늦어 FL은 다음 주에 등록되는 일이 흔하다. 팀은 실물 기준으로 보고한다. **두 기준을 하나로 합치지 말 것.** 합치면 화면 현황이나 보고 숫자 중 하나가 반드시 틀어진다.
  팝업은 전체 탭과 담당 탭, 그리고 요약·상세 토글로 갈린다. 담당 탭은 요약 아래에 데이터가 있는 카테고리를 2번부터 번호를 달아 잇는다. **요약은 개발 건 이름(Style No.)으로 묶는다. FL#으로 묶지 말 것.** FL#은 스타일과 조직 조합마다 따로 나가서 그것으로 묶으면 같은 개발 건이 열 줄로 흩어진다(Purepress 5줄, 우리에프씨 4줄). 상세는 FL#과 조직까지 상태마다 한 줄씩 적는다. 요약은 카테고리 안에서 **완료 묶음을 진행 묶음과 갈라 앞에 세운다.** 한 줄에 섞으면 그 주에 끝낸 것과 남은 것이 붙어 버린다. 완료 줄은 상태가 하나뿐이라 건수만 적는다. 한쪽만 있으면 `[완료]`·`[진행]` 머리를 붙이지 않는다. 상태 문장은 공정일로 만든다. 지나간 날짜는 완료, 미래 날짜는 예정이다. **협의 내용과 판단(재가공 요청, as is ok 등)은 DD에 없어 만들 수 없다.** 뼈대만 뽑고 나머지는 사람이 채운다.
  보고 기준 진행 중 = `Received date`가 빈 건. 신규 = 그중 구간 안에 접수된 건, 공정 중 = 나머지. 그래서 `전체 진행 = 신규 + 공정 중`이 항상 맞는다.
  카테고리 분류는 `normalizeCategory`를 거친다. 네 값에 안 맞는 건은 "분류 미기재"로 따로 적는다. 그 줄이 0이 아니면 카테고리 합이 전체와 안 맞으므로 DD Category를 손봐야 한다.
- Style No. 칸 호버는 `StyleHoverLayer`가 스크롤 영역 위 오버레이로 같은 스타일 행 묶음(연속 구간마다 하나)을 그린다. 색은 `styleTimeline` 상태 톤이다. 호버를 부모 state로 올리지 말 것(64열 전체 재렌더). 행·셀에 transform을 걸지 말 것(sticky 깨짐).
- Style No. 칸 `REQ`는 `tech.requestLink`를 요청에서 찾은 표시다. 누르면 `/request?focus=reqId`로 가며, 대상을 찾지 못하면 `REQ?`로 표시한다.
- 우클릭 `FABRIC REQUEST 연결…`은 선택 행(Style No. 한 칸이면 같은 스타일 전체)을 요청 옵션과 짝 표로 연결한다. 기본은 연결만 하고 값을 덮지 않으며, 빈 칸 채우기에서도 `styleNo`·`owner`는 제외한다.
- 다른 DD 행에 연결된 요청 옵션은 선택할 수 없다. 연결·해제는 스냅샷 뒤 `writeDevelopmentRecords` 한 번으로 저장해 Ctrl+Z로 되돌린다.
- 다중 선택: Ctrl(⌘)+클릭·드래그로 영역을 더한다(`extraRanges`, 활성은 `range`). `setRange` 래퍼가 새 선택마다 추가 영역을 비우고, 넓히기(`extendTo`)와 Ctrl 추가만 `setRangeState`를 직접 쓴다. Ctrl+mousedown 뒤 셀 click이 선택을 다시 잡지 않게 `additiveClickRef`로 한 번 건너뛴다. 지우기·아래로 채우기·Ctrl+Enter·한 칸 붙여넣기는 모든 영역에 적용하고, 복사는 `range-tsv.ts` `combineRangeTsv`(같은 열은 위아래, 같은 행은 좌우, 아니면 막음) 규칙이다. 잘라내기·행 삽입/삭제·요청 연결은 활성 영역만. 두 칸 이상 선택하면 오른쪽 아래에 개수·합계·평균을 보인다. WAREHOUSE도 같은 규칙이다(`extraCellRanges`).
- `?focus=rowId`(FABRIC REQUEST DD 상태 칩에서 진입)는 검색·Status·열 필터·완료 제외를 풀고, 닫힌 행이면 그 담당 탭으로 연 뒤 그 행 전체를 선택(`selectWholeRow`)하고 Style No. 칸 기준으로 스크롤한 다음 파라미터를 지운다. 행이 아직 동기화 전이면 기다린다.
- 사이드바 하위 메뉴(DD MASTER의 EU·SEASON·CORE·PROJECT)는 화살표를 눌렀을 때만 연다. 현재 경로로 자동 펼치지 않는다(`AppSidebar` `openMap ?? false`).
- 요청 연결 도우미(`RequestLinkHelperDialog`, `buildLinkHelperGroups`): 미연결 DD 행을 Style No.로 묶어 Garment No. 일치 후보로 auto·review·none을 가른다. auto는 후보 1개이고 미연결 옵션 수=행 수일 때만이며 값을 채우지 않는다. 짝 규칙은 `defaultLinkPairs` 하나다. 일괄 연결은 그룹 결과를 누적해 앞 그룹이 연결한 옵션을 막고, 스냅샷·쓰기는 한 번이다.

## FABRIC REQUEST (`src/routes/FabricRequest.tsx`, `src/data/request-template.ts`, `src/data/request-image.ts`)
- 표 편집은 DD MASTER와 같은 선택·키보드·클립보드·되돌리기 단축키를 쓴다.
- 드래그 선택(셀, 행 머리, 채우기 핸들) 중 표 가장자리 가까이 가면 `scrollRef` 상자를 굴린다. 위쪽 기준은 sticky 머리글 아래 선이고, 행 머리 드래그는 세로로만 굴린다. 매 프레임 `elementFromPoint`로 포인터 아래 칸(`data-slot-index`, `data-col-id`, 행 머리 `data-row-start`)을 다시 찾아 선택을 넓히며, 같은 칸이면 setRange를 건너뛴다(프레임마다 재렌더 방지).
- 격자는 slot(블럭당 `max(1, 옵션 수)`) × `visibleColumns`다. style 열은 블럭 병합 셀이며 복사는 첫 slot에만 값을 쓰고, 붙여넣기는 옵션을 자동으로 늘리지 않는다.
- 여러 셀 작업은 새 `requests` 배열을 한 번 만든 뒤 `saveRequests`를 한 번만 부른다.
- 보드(R148, `src/data/request-board.ts`): 저장 키 `requestBoards`(병합 id `boardId`). **스타일 하나는 보드 하나에만 속하며 소속은 `RequestStyle.boardId`로만 표현한다.** 보드 쪽에 스타일 목록을 두지 않는다. Garment No.나 참조 FL이 같아도 담당별로 옵션과 설계가 달라 다른 스타일이다. 스타일 결과는 `result`(진행중, 완료, 드롭, 보류, 비면 진행중)와 `resultAt`. 보드는 이름, 종류, 소팀(자유 입력), 진행 또는 종결, `history`를 갖는다. 작업 이력(auditLog)은 90일 보관이라 장기 이력은 보드 `history`에 남긴다. 종결은 만든 사람과 소유자(`canManageBoard`), 삭제는 소유자이고 빈 보드일 때만(`canDeleteBoard`). 기존 `chart`는 쓰기 권한 사용자가 화면을 열 때 `migrateChartsToBoards`로 보드에 이관한다. id는 `legacy:{차트명}`(빈 차트는 `legacy:미분류`)으로 결정적이라 동시 이관이 병합으로 합쳐진다. randomUUID로 바꾸지 말 것. 이관 보드의 `createdBy`는 "이관"이라 종결은 소유자만 할 수 있다. `chart` 필드는 R149에서 업로드와 양식을 보드 기준으로 바꿀 때까지 지우지 않는다.
- 보드 화면(R149): 탭은 맨 앞 `전체`(`ALL_BOARDS`, 보기 전용)와 진행 중 보드다. 활성 보드는 localStorage `fabric.request.activeBoard`. **컴포넌트 안의 모든 요청 저장은 `commitRequests` 하나를 지난다.** 전체 탭이면 저장을 막고 안내하며, 저장 전 `appendRequestHistory`로 추가, 빼기, 옮기기, 결과 변경을 보드 `history`에 남긴다. `saveRequests`를 직접 부르는 길을 새로 만들지 말 것. 이력이 빠지고 전체 탭 편집이 뚫린다. 전체 탭은 보기 전용 `보드` 열을 끼우고 누르면 그 보드로 간다. 새 스타일, 업로드, 우클릭 추가는 활성 보드의 `boardId`와 `chart = 보드 이름`, `nextBoardSeq`를 넣는다. 보드 이름을 바꾸면 소속 스타일 `chart`도 따라 바꾼다. 업로드 병합 키는 `boardId + Garment No.`다. 결과 열(`result`)은 목록 네 값만 받는다. 보드 머리 카드(`RequestBoardHeader`)는 결과 건수와 옵션 공정 분포(`processStepColor`)를 보인다.
- 보드 종결과 보관함(R150): 종결은 `canManageBoard`만 하고, 결과가 진행중인 스타일은 종결 창에서 완료, 드롭, 보류 중 하나로 정리해야 버튼이 열린다. 처리 순서는 결과 채움, `appendRequestHistory`, `closeBoard`, `buildBoardArchive`, `saveRequestsAndBoards`, `saveRequestArchive`다. **종결은 `commitRequests`나 `saveMutation`을 거치지 않는다.** 거치면 이력이 두 번 붙고 되돌리기 스택에 들어간다. 종결 뒤 되돌리기 스택은 비운다. 스냅샷은 저장 키 `requestArchive`(병합 id `archiveId = boardId@closedAt`)에 스타일 깊은 복사와 옵션별 종결 시점 공정 단계, FL#을 담는다. 고치거나 지우는 기능을 만들지 않는다. **`saveRequestArchive`는 작업 이력(`logAction`)을 남기지 않는다.** 스냅샷이 변경점으로 펴져 문서가 수백 KB가 된다. 종결 기록은 보드 `history`에 있다. 종결 보드의 스타일은 `requests`에 남아 다시 열면 이어 쓴다. 보관함은 활성 보드 값 `ARCHIVE_VIEW`로 표 자리를 바꾸며 연도별 목록, 스냅샷 표, 이력(`actionText`, 조사 으로/로 처리)을 보인다. 다시 열기는 그 보드의 가장 최근 기록에서만, 만든 사람과 소유자만 한다. 주간 백업은 `requestArchive`를 JSON으로만 보관한다(엑셀 SHEETS 제외).
- `/request` = 통합원단부 1팀(유관부서) 소싱 의뢰 원장. **DD MASTER보다 먼저다.** 차트 작성 → 작지 → DD 행 생성 순서.
- 저장은 `requests` CACHE_KEY. 스타일 1건에 옵션 라인 N개. 옵션 라인 1개가 DD 행 1개와 짝이 될 예정(연결은 미구현).
- 옵션 연결 키는 번호 변경에도 유지되는 `RequestOption.lineId`다. DD 연결은 FABRIC REQUEST가 아니라 DD 행에만 저장한다.
- 옵션 그룹 끝 "공정" 열(`ddStage`, R147)은 `requestProcessStage`(`src/data/request-process-stage.ts`)로 연결 DD 행의 현재 단계를 한 단어로 보인다. 단계는 접수, 원사, 편직, 염색, 가공(공정일 오늘 이하), 수취(Received date), YDS(GD만), FDS, FL완료(유효 FL#)이고 뒤 단계가 도달하면 앞 단계는 날짜가 비어도 완료다. 색은 그 행 단계 수로 나눈 빨강에서 초록 그라데이션이며 HOLD, DROP, REJECT는 보류, 드롭, 반려로 한글 표기한다. 칩을 누르면 `ProcessStageDialog`가 단계를 위에서 아래로 보이고 현재 위치를 강조한다. 대표 행은 `requestDdStatus`와 같다. 이어지는 "Link" 열(`ddLink`)이 아래 DD 상태 규칙을 따른다.
- "Link" 열(`ddLink`)은 `records`의 `tech.requestLink`를 읽어 `requestDdStatus`로 계산하는 보기 전용 열이다. 요청 데이터에도 엑셀 양식(`TEMPLATE_COLUMNS`)에도 없다. 판정 순서는 DROP·REJECT, HOLD, 유효 FL#(완료), Received date(원단 수취), 지연, 진행이다. **FL# 완료와 원단 수취를 합치지 않고** 완료여도 수취일을 함께 적는다. 칩은 DD MASTER `?focus=rowId`로, FL#은 `/fabric/:key`(DD MASTER와 같은 원장 키)로 간다. 행 머리에 `DD 연결/옵션` 수를 보인다.
- 엑셀에서 한 셀에 "1./2./3."으로 눌러 담던 옵션을 라인으로 푼 것이 이 화면의 핵심이다.
- 스타일은 병합 블럭이다. style 열과 행 머리, 액션은 rowSpan으로 세로 병합하고, 옵션 칸만 옵션 수만큼 줄로 나눈다. 블럭은 최소 84px, 옵션 줄은 최소 28px이고 마지막에 24px "옵션 추가" 줄이 붙는다. 모든 셀은 줄바꿈하고 넘치면 세로 스크롤만 둔다(가로 스크롤 없음). 행 번호는 스타일 단위다. 옵션을 스타일과 분리된 행처럼 그리지 말 것.
- 톤앤매너는 WAREHOUSE(탭+상단 강조 카드)와 DD MASTER(헤더·칩·h-7 컨트롤)를 따른다.
- 셀 더블클릭 인라인 편집. 사진과 옵션 번호는 자동 값이라 편집 불가. URGENT는 더블클릭으로 바로 뒤집는다.
- 밴드 4개(ORIGINAL·분석·의뢰·옵션)는 상단 칩으로 접고 편다. 열 머리와 밴드 머리 오른쪽 끝을 끌어 너비를 조절한다.
  밴드 손잡이는 그 밴드 열을 비율대로 함께 조절한다. 저장은 localStorage `fabric.request.colWidths`, `fabric.request.openGroups`.
- 표의 `<colgroup>`을 지우지 말 것. 첫 헤더 줄이 병합 칸이라 없으면 개별 열 너비가 무시되고 전체 폭만 퍼진다.
- 행 머리 아래 손잡이로 블럭 높이를 조절하며 `fabric.request.rowHeights`에 저장한다. 더블클릭하면 초기화하고 기본 높이보다 작게 줄일 수 없다.
- 표 아래 빈 곳 우클릭 추가는 현재 차트·단계 필터 값을 넣고, 같은 차트의 최대 seq+1부터 매기며 빈 옵션 1개를 붙인다. 필터에 가려지지 않게 URGENT만 보기는 해제한다.
- **양식과 파서는 `request-template.ts`의 `TEMPLATE_COLUMNS` 하나를 공유한다.** 내려받기는 그 순서로 쓰고 파서는 2행 열 이름으로 위치를 찾는다. 필수 열 이름을 바꾸면 기존 양식 파일이 깨지고, 나중에 더한 열은 `optional`로 둬 옛 양식도 읽게 한다.
- 옵션 원단 사양은 YARN DETAIL(원사), CONS(조직), W'T(중량 g/m2) 세 칸이다(`RequestOption.construction`, `weight`, 분리 전 데이터에는 없음). CONS는 `src/data/constructions.ts` `CONSTRUCTIONS`(작지 파서와 공유) 목록에서만 고른다. 셀은 드롭다운 편집, 붙여넣기와 채우기는 `matchConstruction`(대소문자, 공백, 하이픈 무시)으로 목록 표기에 맞추고 없으면 건너뛴다. 엑셀 양식은 숨김 `LISTS` 시트를 참조하는 목록 검증을 걸고, 업로드에서 목록 밖 값은 버리지 않고 경고로 알린다. DD 불러오기와 연결의 빈 칸 채우기는 `construction`, `weight`를 DD 행 같은 필드로 넘긴다. 기존 YARN DETAIL에 섞인 조직과 중량은 자동으로 나누지 않는다.
- 업로드 병합 키는 `차트 + Garment No.`다. 기존 건은 `reqId`와 사진 경로를 지킨다. 안 지키면 재업로드마다 사진이 날아간다.
- 사진은 Firebase Storage(`requests/{reqId}/full.webp`, `thumb.webp`). 원본 1200px, 썸네일 400px webp로 줄여 올린다.
- `/request?focus=reqId`는 필터를 풀고 해당 스타일의 Garment No. 셀을 선택·스크롤·강조한 뒤 `focus` 파라미터를 지운다.
- **`getStorage`는 지연 초기화다**(`firebase.ts`의 `appStorage()`). 최상단에서 만들면 Storage 실패가 앱 전체 부팅을 막는다.
- 양식에 사진 열은 없다. 엑셀 이미지 셀은 원본 차트에서도 깨져 있었다. 사진은 웹에서만 올린다.

## 창고 (`src/routes/Warehouse.tsx`, `src/data/fabric-ledger.ts`)
- DD+대장 FL 우선·Style 보조 병합. 개발진행→입고대기(READY)→창고보관→소진/폐기. 입고 시 R&D No. 자동 채번. 웹상태=IDB `fabricOverrides`, 이력=`fabricEvents`.
- FL은 DD 원단이면 DD MASTER에서만 입력하고, 창고 직접 추가 원단만 창고에서 `checkWarehouseFlEntry` 검사 후 `updateManualIntake`로 저장한다. 현황에 없는 추가 옵션은 DD 행을 추가하는 것이 팀 규칙이다.
- **DD 행 하나는 원단 하나다. DD 행끼리는 어떤 경우에도 서로 흡수하지 않는다**(R229, `buildFabricLedger`). 예전에는 FL# 하나로 원장 항목을 찾아 같은 FL을 가진 DD 행이 첫 행으로 접혔고, 짝이 될 대장 행이 없는 행은 경고도 없이 사라졌다. 대장 행과는 1대1로만 붙는다(우선순위: 이미 입고 기록으로 연결된 R&D No. → Yarn Detail 일치 → 대장도 DD도 하나뿐일 때). 짝을 못 찾으면 제 항목으로 선다. **`resolveKey`를 DD 레코드에 다시 쓰지 말 것.**
- **FL#으로 인정하는 값은 `isCompletedFlNo`(`FL`+숫자 8자리)뿐이다**(R230). FL# 칸에는 `미등록`, `컬러 잘못염색됨` 같은 메모가 들어 있는 행이 많다. 그 글자를 식별자로 쓰면 뜻 없는 글자로 행이 묶이거나 갈라진다. 형식이 아닌 값은 R229 이전 경로를 그대로 탄다. 숨긴(`REMOVED`) 대장 행에는 DD 행을 붙이지 않는다. 붙으면 그 DD 행까지 화면에서 사라진다.
- **입고 대기 판정은 개발처로 갈린다**(`statusFromRecord`). GD는 YDS 수취일, 국내·생산은 Received date다. 국내는 YDS 공정이 없어 그 칸이 비활성이라 YDS만 보면 영영 안 올라온다. 대장 '현황' 시트는 READY로 올리지 않는다. 창고에서 '직접 추가'한 웹 등록 행만 예외.
- 목록에서 빼는 '선택 삭제'는 `REMOVED` 오버라이드로 감추는 것이다. 원본은 지우지 않는다. 폐기와 다르다. 감춘 행은 입고대기 탭 `숨긴 행 N건` 토글에서 보고 `되살리기`로 감추기 직전 상태로 돌린다(R231). DD MASTER 대장 상태 칸에는 `삭제됨`으로 뜬다. **사유가 남지 않으므로 개발을 접은 건은 감추지 말고 폐기(사유 `개발 중단`)로 보낸다**(2026-09-21). 번호를 받은 적 없는 건은 폐기해도 창고팀 자료에 안 잡힌다. R&D No.가 없는 기록은 집계에서 빠지기 때문이다.
- **채번 규칙(2026-09-21 확정, `nextStorageNumbers`).** 빈 번호를 남기지 않고 순서대로 나가는 것이 창고팀과의 약속이다. 번호가 왜 비었는지 다른 사람이 알 수 없으면 안 된다.
  1. 막는 것은 **지금 창고보관에 있는 번호뿐이다**(`occupiedStorageNumbers`). 소진·폐기로 이력에 간 번호는 다시 쓴다. 오래된 이력은 FL No.로 찾지 R&D No.로 찾지 않는다. **이력 번호를 점유로 세지 말 것.** 그렇게 하면 옛 폐기가 빽빽한 구간에서 건너뛰기가 잦아 오히려 번호가 띄엄띄엄해진다(R233에서 그렇게 했다가 R235에서 되돌렸다).
  2. 프론티어(마지막 채번)는 **원장 항목의 입고일(`intakeAt`)** 로 찾는다. 대장에서 이관된 옛 항목은 입고일이 없어 옛 주기에 남은 높은 번호에 끌려가지 않는다. `warehouseSequenceStart`를 쓰지 말 것. 그것은 폐기 라운드 정렬용이라 엉뚱한 값이 나온다.
  3. 현재 주기 밴드(프론티어에서 아래로, 기록 없는 번호가 20개 이어지면 끊김) 안의 **빈자리를 먼저 메우고**, 없으면 프론티어+1부터 올라간다. 7999를 넘기면 1부터 되감는다.
  4. **입고 취소(UNRECEIVE)는 번호를 푼다**(`applyFabricActions`에서 도착 상태가 READY면 `storageNo`를 비운다). 푼 번호는 3번 규칙이 바로 메운다. 취소와 재입고를 오가는 사이 번호가 다른 건에 붙을 수 있으니 대장 엑셀과 대조할 때 주의한다(2026-09-21 1316~1318 사례).
  5. 창고보관 탭에서 **R&D No. 칸 더블클릭으로 번호를 고친다**(편집 권한 필요, R232). 저장은 `applyFabricActions`의 `NOTE` 하나를 지나 이력과 되돌리기에 걸린다. 빈 값은 막는다. 번호를 없애는 길은 입고 취소뿐이다.
  6. **동시 채번은 `src/data/storage-claims.ts`의 트랜잭션 예약으로 막는다**(R234). 번호 대장이 아니라 10분짜리 락이다. 진실은 원장이고 예약 문서는 "지금 누가 집는 중"만 담는다. 입고 저장이 끝나면 바로 푼다. **`state/storageClaims`를 `CACHE_KEYS`에 넣지 말 것.** 화면에 보이던 번호와 실제로 나간 번호가 다르면 사용자에게 알린다.
- 롤 원단은 원단별 상태 `roll` 플래그이고 **표기할 때만** 번호 뒤에 `R`을 붙인다(`storageNoLabel`, R228). 채번·정렬·중복 검사에 이 함수를 쓰지 말 것. 저장 값은 숫자 그대로다. 메일 제목에는 붙이지 않는다(번호를 범위로 접는 `storageNoSummary`가 깨진다). `rackNo`와 같이 **override를 새로 만드는 곳마다 물려줘야 한다.**
- Rack No.(`src/data/warehouse-rack.ts`): 창고팀 선반배치도 기준 통합원단부 전용 rack은 K열 9개, L열 10개, rack당 3칸(위에서부터 1~3)이고 형식은 `K-1-1`이다. 원단을 입고 순서가 아니라 빈 칸에 넣기 위한 번호라 같은 칸을 여러 원단이 쓸 수 있다. 원단별 상태(`FabricLedgerOverride.rackNo`)에만 저장한다. `applyFabricAction`은 도착 상태가 창고보관이면 이전 값을 물려주고 창고를 떠나면(폐기, 소진, 입고 취소) 비운다. `saveFabricFields`도 값을 물려준다. **override를 새로 만드는 곳에 rackNo를 빠뜨리면 창고 동작마다 번호가 지워진다.** 창고보관 탭에서만 열이 보이고 더블클릭으로 입력한다. 지우기는 두 가지다. Rack No. 칸을 선택하고 Delete·Backspace(여러 영역 포함, `saveFabricRackNos`로 한 번에 저장), 또는 추천 목록 맨 위 `선택 안함`(`RACK_NONE_LABEL`)을 고르고 확정한다. 여러 원단을 원단마다 따로 저장하면 앞 저장을 뒤 저장이 덮어쓰므로 묶어서 저장한다. 실물 입고 확인 창에도 원단마다 Rack No. 칸이 있어 창고팀이 확인하면서 적는다. 형식이 틀린 칸이 있으면 확인 처리 전에 멈추고, 확인 처리(`applyFabricAction`)가 모두 끝난 뒤 체크한 원단의 번호를 `saveFabricRackNos`로 한 번에 저장한다. 순서를 바꾸면 확인 처리가 새 번호를 덮는다. 입고대기 탭은 R&D No., 재고, 입고확인 고정 열을 숨긴다.
- Rack 배치도(`src/components/warehouse/RackMap.tsx`): 탭 줄 오른쪽 "배치도" 버튼이 표 자리를 배치도로 바꾼다(1단계, 창고 화면 안). 칸마다 창고보관 원단 수와 잔량 yds를 색 농도로 보이고, 칸을 누르면 창고보관 탭에 Rack No. 열 필터(`columnFilters.rackNo`)를 걸어 넘어간다. 미지정은 빈 문자열 필터다. 위치는 `RACK_SLOTS`(열 순서 `RACK_ROW_ORDER`, rack, 위부터 층)만 읽고 화면 상태를 갖지 않는다. 3D 맵이나 다른 부서 rack으로 넓힐 때는 별도 경로 `/warehouse/rack`으로 옮기고 3D 라이브러리는 지연 로딩한다(2단계).
- 메일 초안은 `src/data/mail-draft.ts`의 `.eml`(`X-Unsent: 1`, HTML 본문)로 만든다. `mailto:`는 본문에 표를 못 넣어서 바꿨다. 파일을 열면 Outlook이 보내기 전 새 메일로 연다. **자동 발송이 아니다.** 표 복사 버튼은 대체 경로로 남긴다.
- 입고 요청 메일(`InboundRequestMailDialog`, `src/data/inbound-request-mail.ts`): 선택 입고 창의 "입고 등록 후 요청 메일"이 입고 등록을 마친 뒤 원장 값(R&D No.)으로 표를 채운다. Rack No. 열은 창고팀 회신용으로 비워 나간다. 받는 사람은 고정 목록이며 **주소와 이름을 코드에 넣지 않고 Firestore `state/mailRecipients`(`inbound`)에 둔다.** 동기화 구독은 `CACHE_KEYS`에 없는 문서를 건너뛰므로 이 문서 이름을 CACHE_KEYS에 넣지 말 것. 편집 화면은 소유자에게만 보인다.
- 출고 요청 메일(C형, `OutboundRequestMailDialog`, `src/data/outbound-request-mail.ts`): 창고보관 탭에서 체크한 원단의 요청 수량·사업부·요청자·희망 컷팅일로 표가 들어간 `.eml`을 만든다. 받는 사람은 비워 두고 사람이 입력한다. 요청 상태는 저장하지 않으며 실제 출고 기록은 정산관리팀 회신 뒤 기존 출고 버튼으로 남긴다. 회사 M365 메일 발송 권한(A안)은 2026-09-14 사내 보안 공지로 보류했다.
- 폐기 라운드(R151, `src/data/disposal-round.ts`, `DisposalRoundPanel`): 창고팀이 R&D No. 범위로 폐기를 요청하면 3팀이 라운드를 만든다. 저장 키 `disposalRounds`(병합 id `roundId`), **`saveDisposalRounds`는 작업 이력을 남기지 않고 라운드 `history`에 남긴다.** 후보는 범위 안 창고보관 원단이며 `warehouseOrderKey` 되감기 순서로 고른다(범위가 7999를 넘어 낮은 번호로 이어져도 된다). 번호 도우미(`storageNumberOf`, `warehouseSequenceStart`, `warehouseOrderKey`, `STORAGE_NO_MAX`)는 `fabric-ledger.ts`에 있다. FL 미기입과 FL 중복(두 번째 등장부터)은 자동 제외하되 사람이 포함으로 되돌릴 수 있다. 통합원단부 1팀은 RDDA 폴더로 검토하고 웹을 쓰지 않는다. R152부터 판정은 **보관과 폐기 둘뿐이고 기본은 폐기**다(`keep`, 보관 줄은 초록 채움). 옛 R151 필드(firstPass, teamKeep, decision)는 `isKept`, `isCut`가 호환으로만 읽는다. 미팅과 픽업은 한 칸 `M/P`(`parseMeetingPickup`, 예 `3/1`). `swatchLow`는 화면 이름 Cutting(1yd 컷팅 후 폐기)이며 폐기일 때만 체크할 수 있고 보관이면 비활성이다. 표 열은 R&D No., Rack No., FL#, Requester, Developer, Yarn Detail, Cons., 판정, M/P, Cutting, 메모다(Buyer, Style No., 지난 결과 없음). RDDA 파일은 라운드마다 여러 번 올린다(`src/data/rdda-files.ts`). RDDA 라이브러리 목록은 `FL NO`, `Meeting Count`, `Pickup Count` 세 열만 읽어 M/P를 덮어쓰고, RDDA 목록 내보내기(보관 목록, `.xls`)는 `Ref. No`의 FL만 읽어 **보관을 더한다(파일에 없는 보관은 지우지 않음).** **두 파일의 Price, Supplier 등 다른 열은 읽지도 저장하지도 말 것.** 폐기 라운드는 창고 표를 덮지 않는 전체 크기 팝업(`disposalView`)이다. **keeping은 다음 라운드에서 리셋되어 다시 후보가 된다. 자동 제외하지 말 것.** 최종 리스트 엑셀은 3팀이 창고팀에 보내던 틀(R&D Number, FL#, keeping, 폐기 원단, cutting)에 Rack No.를 더한다. 창고팀 작업 목록과 원장 폐기 반영은 R153.
- 웹 등록 행 key는 `sample.id` 기준이다. 배열 인덱스로 되돌리면 대장 재업로드 때 채번이 어긋난다.
- 창고팀(정산관리팀) 보고 자료 내보내기: `src/data/warehouse-export.ts`. 시트는 `요약` + `LIST` + `주차 집계` **셋뿐이다**(R228). 일자별 `MM.DD`와 `데이터`, `창고보관 현황`은 2026-09-21 창고팀 미팅에서 뺐다. 창고팀이 매일 집계하려고 두던 시트라 요약만 있으면 된다.
  **원본 양식을 행 단위로 재현한다.** 입고 목록과 출고완료 블록 사이 빈 줄은 1줄이다. 창고팀이 시트째 복사해 붙인다.
  입출고 시트 날짜는 날짜값+numFmt, LIST 요청일은 `8/31` 텍스트다. 서로 다르다.
  **LIST의 `Style No.` 열에는 `storageNo`(R&D No.)를 넣는다.** 원본 값이 그렇다. 실제 Style No.를 넣으면 창고팀 파일이 어긋난다.
  소진과 폐기는 `RND 소진/폐기 현황` 한 목록으로 합친다. **판정은 기록 이름이 아니라 도착 상태(`toStatus`)로 한다.** 출고로 잔량이 0이 되어 자동 소진된 건은 이름이 `OUTBOUND`인 채 상태만 `EXHAUSTED`가 되므로, 이름으로 세면 그 건이 집계에서 통째로 빠진다(2026-09-21 R&D No. 1242 사례).
  `주차 집계`는 전사 부서·팀 틀을 원본대로 만들되 **통합원단부 줄만 채우고 나머지는 0**이다. 다른 부서 숫자는 우리가 모른다. 창고팀이 합치는 자리다.
  요약 상단 표에는 건수 옆에 **입고 yds와 폐기 yds**가 붙는다. 폐기 수량은 상태가 폐기인 건만 세고 소진 건은 뺀다(다 써서 나간 원단이라 폐기 수량이 아니다).
  입고·소진/폐기 목록은 **R&D No.마다 최종 이력 1건만** 올리고, 그 위에 **현재 원장 상태와 대조**해 되돌리거나 취소한 건을 뺀다. 이력만 보면 입고했다 되돌린 건이 남는다. R&D No.가 없는 기록은 집계에서 빠진다.

## RDDA (`src/routes/Rdda.tsx`, `src/data/rdda-dataset.ts`, `src/data/rdda-sync.ts`, `src/data/fabric-performance.ts`)
- 수집: `/rdda` **RDDA 갱신**이 RDDA 창을 열고, 그 창에서 북마크 **RDDA 수집**(바탕화면 `RDDA_수집_v5.js`, 설치 `RDDA_수집_북마크설치.html`)을 누르면 postMessage로 데이터셋이 들어와 `state/rdda`에 저장된다. 수신은 origin `https://rdda.hansoll.com`과 연 창(source)만 받는다. **수집기에는 팀원 사번이 있어 저장소에 넣지 않는다.** JSON 업로드는 예비 경로다.
- 저장 형식은 12개월 집계가 아니라 전 기간 압축 데이터셋(`RddaDataset` v3, 약 1.7MB)이다. 화면은 사용자가 고른 기간으로 `buildRddaReport`를 즉석 계산하고 탭은 `RddaReportV2`만 받는다. 원장 기반 지표(`cumulative`)는 기간과 무관한 누적값이다. 개인 계정 조회라 미팅은 전사의 절반 정도만 잡힌다.
- 원단 성과(R210~R213): FL 원장 누적 제안·픽업·오더(폐기 리스트 미팅 차감)를 `buildPerformanceIndex`로 FL 색인해 창고 표·원단 상세·폐기 라운드·DD MASTER·REQUEST가 같은 값을 본다. 화면에서는 `usePerformanceIndex`/`useFabricPerformance`(`src/components/fabric/PerfBadge.tsx`)만 쓴다. 등급 기준은 `GRADE_RULES` 한 곳. 범위는 3팀 담당 FL뿐이다.
- 폐기 라운드는 오더·베스트 원단(`KEEP_GRADES`)을 `오더 원단`, `베스트 원단` 사유로 자동 제외한다. 사람이 포함으로 되돌릴 수 있고, 되돌린 건(included)은 `RDDA 성과 반영`이 다시 제외하지 않는다. 아래 창고 절의 "keeping 자동 제외 금지"는 지난 라운드 보관 판정 이야기라 이것과 다르다.

## TREND REPORT (`tools/trend`, `src/routes/TrendFabric.tsx`, `src/routes/TrendMacro.tsx`)
- 파이썬 수집기가 `public/data/trend/{feed,kpi,status}.json`을 만들고 두 화면이 그 파일만 fetch한다. 서버·DB·AI 호출 없다.
- 자동 실행, Secrets, 점수 튜닝, 제목 번역, 바이어 소스 등 **운영 상세는 전부 `tools/trend/README.md`에 있다.** 여기 옮겨 적지 말 것.

## 계정 설정 (`src/components/auth/AccountSettingsDialog.tsx`, `src/data/auth.ts`)
- 상단 바 계정 설정 버튼에서 비밀번호 변경과 로그인 이메일 변경을 한다. 둘 다 현재 비밀번호로 재인증(`reauthenticateWithCredential`)한 뒤 처리해 오래된 세션에서도 막히지 않는다.
- 로그인 이메일 변경은 `verifyBeforeUpdateEmail`로 새 주소에 확인 링크를 보내고, 링크를 누른 뒤에 바뀐다. uid가 그대로라 승인 상태와 화면 권한이 유지된다.
- 사내 보안 공지(2026-09-14, 외부 서비스는 개인 메일로 가입)에 따라 새 이메일로 회사 도메인은 막고, 회사 메일 계정 팀원에게 권고 문구와 알림 점을 띄운다. **소유자 계정은 이메일 변경을 잠근다.** 소유자 판정이 이메일 문자열(`OWNER_EMAIL`, firestore/storage rules)이라 바꾸면 소유자 권한이 사라진다.
- `firestore.rules`는 `users/{uid}` 수정을 소유자만 허용한다. 팀원이 이메일을 바꿔도 사용자 목록의 이메일 필드는 옛 값이 남으므로 소유자가 갱신한다. 규칙은 바꾸지 않았다.

## 권한 (`src/data/screen-permissions.ts`, `src/data/departments.ts`, `src/components/settings/UserApprovalPanel.tsx`)
- R217: 사용자 문서 `users/{uid}`에 화면별 `access`(none/read/edit)와 `department`를 둔다. 예전 `screenPermissions`(불리언)는 라우팅·사이드바 호환용으로 access에서 파생해 같이 저장한다. access가 없는 기존 사용자는 불리언 true를 편집으로 읽어 동작이 바뀌지 않는다.
- 부서 기본값은 `DEPARTMENTS` 한 곳(통합원단부 1·2·3팀, 정산관리팀, 사업부서). **3팀이 원단 R&D(우리 팀)다**(2026-09-17 사용자 확인). 1팀은 디자인·마케팅 성격의 소싱 위주 팀으로 FABRIC REQUEST를 쓰는 유관부서다. 가입 화면에서 부서를 골라 신청하면 그 부서 기본 권한이 문서에 들어가고, 승인하면 바로 적용된다. 승인 대기 중에는 신청 문서의 access를 믿지 않고 부서 기본값을 보인다(소유자가 손댄 뒤 `permissionsUpdatedAt`부터는 저장값). 승인은 권한이 하나 이상일 때만 된다.
- HOME은 우리 팀 KPI라 `HomeGate`가 `access.home === "read"`이면 블러로 가린다. 호버는 보이고 클릭·키 입력은 막는다. 관리 화면에서 HOME 단계 이름은 없음/블러/공개다. 가림일 뿐 데이터는 브라우저에 있으므로 전사 배포 전에는 HOME 구성을 따로 만든다.
- 읽기 권한 적용은 세 겹이다. `pushCache`가 `currentUserCanEditKey`로 중앙 저장을 막고 화면 값을 마지막 중앙 값으로 되돌린다. 키와 화면의 대응은 `CACHE_KEY_SCREENS`다. `ReadOnlyGuard`가 셀 더블클릭·붙여넣기·지우기·끌어놓기를 막는다. `logAction`도 같은 판정으로 이력을 남기지 않는다. 새 저장 키를 만들면 `CACHE_KEY_SCREENS`에 더해야 한다. 빠지면 소유자만 저장된다.
- **아직 Firestore 규칙에는 반영하지 않았다.** 서버는 승인 여부만 본다. 규칙 반영은 보안 점검 C 항목으로 남아 있다.
- R223: 창고 권한은 세 축으로 갈린다. `warehouse`가 3팀 스코프와 라우팅, `warehouseFabric1`이 1팀 스코프, `warehouseOutbound`가 출고 요청 메일(데이터를 저장하지 않는 기능이라 별도 축)이다. 1팀은 3팀 화면에서 읽기와 출고 요청만, 1팀 화면에서는 편집한다. 창고팀은 두 팀을 모두 편집한다. **라우팅 `ReadOnlyGuard`는 `/warehouse`에서 두 권한 중 높은 쪽을 보도록 `useScreenAccess`가 합치고, 스코프별 방어는 `Warehouse.tsx`의 `canEditScope` 하나로 한다.** 버튼이나 표 편집에 새 진입점을 만들 때 이 값을 빠뜨리면 1팀과 3팀 판단이 섞인다.

## 주간 백업 (`tools/backup`)
- PC 작업 스케줄러가 매주 Firestore `state`를 앱 로그인 계정(Firebase Auth REST, 비밀번호는 Windows 자격 증명 관리자)으로 읽어 저장소 밖 폴더에 JSON·엑셀·zip을 남기고 Outlook으로 메일을 보낸다.
- 서비스 계정 키 방식은 조직 정책 `iam.disableServiceAccountKeyCreation`으로 막혀 있다. 되살리지 말 것.
- `KEYS`는 `src/data/cache.ts`의 `CACHE_KEYS`와 같이 고친다. 운영 상세는 `tools/backup/README.md`.

## 주의(반복 실수 방지)
- **KPI가 0으로 보이면 버그 아닐 수 있음**: `NumberTicker`·`RadialKpi`는 rAF로만 오름 → 탭 비활성이면 0. 실값은 `aria-label`에서 확인.
- 데모 FL(`sample.ts` `FL-26xxx`)은 실제 형식(`FL+YY+MM+4자리`)과 달라 RDDA/개발처 집계가 0으로 보일 수 있음(실데이터는 정상). RDDA 집계 기준 미확정 — 손대기 전 확정(`fabric-rnd-fl-ledger`).
- 날짜 파싱 `XLSX.SSF.format("yyyy-mm-dd", value)`(하루 밀림 방지). zaji는 `cellDates:true`.
- 팝업 투명 버그: `bg-background` 미매핑 → `src/components/ui/dialog.tsx`는 `var(--card)` 명시 사용.
- **긴 목록을 `SectionCard`로 감싸지 말 것.** `Reveal`의 IntersectionObserver 임계값이 0.12라 카드가 뷰포트보다 훨씬 길면 영영 안 보인다. 기사 피드는 `Card`를 직접 쓴다.
- TREND의 HIT는 조회수가 아니라 같은 dedup_key를 다룬 매체 수다. RSS에 조회수가 없다.
- **인라인 편집기의 키 처리는 `stopPropagation`이 필수다**(`editorKeyHandler`). 표 단축키는 window 의 keydown 이 받고 "포커스가 입력칸이면 무시"로 편집 중을 피하는데, Enter·Tab 은 편집기가 먼저 편집기를 닫아 버려 window 에 닿을 때는 그 방어가 이미 무너져 있다. 막지 않으면 선택이 두 칸씩 건너뛴다. `preventDefault`로는 안 막힌다.
- 그리드 셀 드래그는 `mousedown`에서 `preventDefault`를 건다. 안 걸면 브라우저 기본 선택이 같이 시작돼 화면 전체가 반투명 사본으로 끌려다닌다. 버튼·입력칸 위에서는 걸지 않는다.
- **ref 콜백 안에서 setState 하지 말 것.** 인라인 ref 는 렌더마다 새 함수라 React 가 커밋마다 떼었다 붙인다. 그 안의 setState 는 무한 렌더가 되고 `Maximum update depth exceeded` 로 **화면 전체가 백지**가 된다. 값 비교로 막아도 소용없다(R119 창고 탭 전환 사고). 크기 측정은 `ResizeObserver` 나 layout effect 로 한다.
- **렌더 예외는 `RouteErrorBoundary` 가 잡는다**(`src/App.tsx`). 없애지 말 것. 없으면 백지만 남고 원인 단서가 사라진다.
- **실데이터·캐시 내용을 로그·git·공개 파일에 넣지 말 것.**
- **동기화 쓰기 경로에서 `mergeForKey`를 그대로 부르지 말 것.** 병합 대상이 아닌 키(`MERGE_IDS` 네 개 외 전부)는 `theirs`가 돌아오는데, 쓰기 방향에서 그건 원격 값이다. 방금 저장한 것이 빠진 옛 값을 다시 올리고 스냅샷이 화면을 덮어 저장이 사라진다(R121). `pushCacheNow`는 병합 키일 때만 원격과 합친다.
- **공정 도달 비율(`도달 ÷ 진행 중`)에 주간 증감을 붙이지 말 것.** 분모가 움직이는 집단이라 신규 접수가 들어오면 내려가고, 완료 건이 진행 중에서 빠질 때도 내려간다. 완료 건은 네 공정 모두 도달로 세어졌으므로 분자와 분모가 같이 1씩 줄고, 비율이 100%가 아닌 이상 `(a-1)/(b-1)`은 늘 `a/b`보다 작다. 결과적으로 **접수도 완료도 활발한 주에 지표가 나빠 보인다.** 신호가 반대다. 주간 변화는 `processWeeklyFlow`(그 주에 공정을 통과한 건수)와 `weeklyIntakeBalance`(접수 대비 완료)로 본다. 비율은 현황 스냅샷으로만 쓴다.
- TS 실시간공유 데이터 손실 이력 있음 — 동기화 손대기 전 `fabric-rnd-ts` 필독.

## 백업 (`src/data/backup-export.ts`)
- JSON은 SETTING(소유자 전용)에서 내려받고 복원의 원본이다.
- 엑셀은 `excelBackup` 권한이 있는 사람이 읽는 용도이며 복원에는 쓰지 않는다.
- 엑셀 셀은 32,000자에서 자르지만 JSON은 자르지 않는다.
- DD 업로드 진입점은 SETTING 비상용 하나뿐이며 DD MASTER·DEVELOPMENT·창고에는 두지 않는다.

## 보기 설정 (`src/data/view-prefs.ts`)
- 열 너비와 그룹 펼침/접힘은 **개인 브라우저(localStorage)에만** 남는다. `CACHE_KEYS`에 없어 Firestore로 안 올라간다. 한 사람이 바꿔도 팀원 화면은 그대로다.
- 계정이 아니라 브라우저에 붙는다. 공용 PC에서는 앞사람 설정이 보이고, 다른 PC로 가면 기본값에서 시작한다.
- 키: `dd-col-widths-v2`, `dd-open-groups-v1`, `dd-finishing-open-v1`, `warehouse-col-widths-v1`, `warehouse-open-groups-v1`, `fabric.request.colWidths`, `fabric.request.openGroups`, `fabric.request.rowHeights`, `fabric.request.activeBoard`, `home-today-briefing-hidden-v1`.
- 검색·필터·정렬·탭·선택은 일부러 저장하지 않는다. 남아 있으면 다음에 열었을 때 행이 왜 안 보이는지 헷갈린다.
- **예외: DD MASTER 행 드래그 순서(`sortOrder`)는 레코드에 저장돼 팀 전체가 공유한다.** 보기 설정이 아니다.

## 작업 이력·되돌리기 (`src/data/audit.ts`)
- 저장 위치는 `state/{key}`가 아니라 **별도 컬렉션 `auditLog`**다. `state`는 값 하나만 바뀌어도 배열 전체를 재업로드해서 쌓이는 로그를 두면 편집 비용이 계속 커진다. 여기는 덧붙이기 전용이라 편집당 쓰기 1회다.
- **셀이 아니라 작업 단위로 남긴다.** 붙여넣기 100셀 = 문서 1개. 셀마다 문서를 만들면 하루 수백 건이 수천 건이 된다. 실측: 작업 1건 300B, 붙여넣기 100셀 14KB, 90일 누적 11.5MB.
- 기록 지점은 `useAppStore`의 저장 길목 5곳뿐이다(`saveDevelopmentRecord`, `writeDevelopmentRecords`, `saveTsRecords`, `saveRequests`, `applyFabricAction`). 이전·이후 배열을 비교해 변경점을 뽑으므로 화면마다 계측할 필요가 없다.
- **되돌리기 전 충돌 검사는 필수다.** 현재 값이 그 작업의 `이후 값`과 다르면 건너뛴다. 그 사이 남이 고쳤다는 뜻이라 덮으면 그 사람 작업이 지워진다. 되돌린 사실도 이력에 남긴다.
- 되돌리기는 관리자만. 실제 값 복원은 DD MASTER만 한다. 창고는 이력이 곧 원장이라 반대 작업(입고 취소·폐기 복구)을 화면에서 하는 것이 맞다.
- `firestore.rules`의 `auditLog`는 `update`·`delete`를 막는다. 되돌리기의 근거라 사후 편집이 가능하면 의미가 없다.
- 보관 90일. 일자 스냅샷(전체 상태 복원)은 미구현이다.

## 데이터 소스 규칙
| 화면 | 원본 | 기준 |
|---|---|---|
| HOME 완료/접수 | DD | Received/Request Date + 기간 |
| 주간 보고 문장 | DD | **완료=Received date**(FL# 아님), 진행=Received date 빈 건, 최근 7일. DROP·HOLD·REJECT 제외 |
| HOME Overall status 주간 변화 | DD | 공정 통과는 월~일 주 기준(`processWeeklyFlow`), 접수·완료 균형은 **오늘에서 7일 전까지**(`weeklyIntakeBalance`, `recentWindow`). 창 기준이 서로 다르다. **공정 도달 비율의 주간 증감은 쓰지 않는다.** 아래 주의 항목 참조 |
| HOME 스케줄 임박·지연 | DD | Due Date로 계산, **완료 판정은 Received date**(`isScheduleOpen`). FL#은 등록 번호일 뿐이라 실물 도착 기준으로 본다. **Due Date가 비면 임박·지연 어느 쪽에도 안 뜬다**(`daysLeft`=null이라 필터에서 제거) |
| RDDA 등록 | ~2026-07 대장 FL.# YYMM / 08~ DD Received | 동일 FL 1건(대장 우선) `mergedFlRegistrations` |
| DEVELOPMENT | DD+대장 | `fabric-rnd-fl-ledger` |
| DEVELOPMENT 스타일 타임라인 | DD | Style No. 묶음, **완료=Received date**, HOLD·DROP·REJECT 제외, 스타일 상태=옵션 중 최악 |
| 창고 입고대기 | GD=DD YDS / 국내=Received date | 대장 현황 시트 제외 |
| STUDY/TS | 엑셀+웹입력 | 주차별 / 중복제외 |
| TREND | RSS 24곳, SEC 공시, World Bank, US Census | 사전 점수 채택, 공개 자료만 |
| RDDA ANALYSIS | RDDA 전 기간 데이터셋(북마크 수집) | 기간 선택 즉석 재집계, 원장 지표는 누적 |
| 원단 성과 배지 | RDDA FL 원장 누적 | 폐기 리스트 미팅 차감, 3팀 담당 FL만 |

## 코덱스 협업
기획·검토=Claude, 코딩=Codex, 최종확인=Claude. 절차·명령·함정은 `codex-handoff` 스킬에 있다. 지시서 `docs/codex/RNN-*.md`, 실행 파일 `.codex-runs/`(gitignore). **커밋은 사용자 요청 시에만.** `git reset --hard`/`checkout --`로 사용자 변경 되돌리기 금지.

## 잔여 작업
- 자료 라이브러리 OneDrive 링크 목록화.
- RDDA 월 재계산·KPI 대조, RDDA REPORT 파싱.
- DEVELOPMENT 담당자 process status 재배치(미결).
