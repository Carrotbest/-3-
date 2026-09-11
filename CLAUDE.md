# Fabric R&D — 인수인계 (간결본)

한솔섬유 통합원단부 1팀(원단 R&D팀) 업무 플랫폼 MVP. 문서·앱 문구에 옛 명칭 "통원부 3팀"이 남아 있다.
상세 배경·의사결정은 사용자 메모리(`fabric-rnd-*`) 참조.

## 스택·실행
- React18 · TS · Vite · Zustand · Recharts · Tailwind v4 · SheetJS. 위치 `C:\Users\hkpark\Desktop\fabric-rnd`.
- 실행 `npm run dev`, 검증 `npm run build`(=`tsc --noEmit && vite build`). base `/-3-/`, **해시 라우터**.
- 미리보기는 `fabric-rnd-vite`(5175)만. Desktop `.claude/launch.json`의 파이썬 정적서버는 .tsx octet-stream 서빙으로 깨짐 → 금지.

## 방향
- DD MASTER = 현황 관리 중심. 샘플관리대장 폐기 방향(넘버링만 창고 이관), 엑셀→웹 전환 진행 중.
- 로그인/권한: 역할별 화면 노출(향후). Firebase 실시간 공유 도입됨(`fabric-rnd-firebase`).

## DD MASTER (`src/routes/DevelopmentMasterSheet.tsx`)
- `/development/workspace` = 살아있는 현황판(64열·7그룹, 담당·Status·Style 좌측 고정). 이 라우트만 `App.tsx`에서 폭 제약 해제.
- 인라인 편집(셀 더블클릭, 타입별). 수식·대장연결 열은 수정 불가. 담당 칸 ⤢ → 64열 수정 모달.
- 신규 작지 접수 팝업: REQUEST·ORIGINAL·담당·Style=옵션 공통(`changeShared`), DETAIL·SCHEDULE=옵션별(`changeOption`). 저장=옵션 수만큼 행(`saveIntake`, `_src.sheet="웹 접수"`).
- 접수 필수 항목=`INTAKE_REQUIRED_IDS`(담당·Style No.·Season·Category·Buyer·Planner·**Due Date**). 라벨 `*`·빈 칸 붉은 테두리·저장 차단이 모두 이 목록을 본다. Due Date가 비면 HOME 스케줄에서 그 건이 통째로 빠지므로 접수에서 막는다. 엑셀 업로드는 과거 시트를 그대로 들여오는 길목이라 걸지 않는다.
- FDS/YDS 요청 팝업(`src/data/fds-yds-request.ts`): **진행중인 GD 원단 중 `Received date`가 있고 FDS 또는 YDS가 빈 건.** 진행중 판정은 `isInProgress` 하나를 쓴다. **Received date가 없으면 올리지 않는다.** 원단을 받은 뒤에 FDS를 따라가는 순서라 아직 안 받은 건은 요청할 것이 없다. FL#이 유효한 건도 제외한다(FDS를 이미 받았다는 뜻).
  **STYLE#(GD#/SA#)과 ARRANGE#가 비어도 올린다.** 예전에는 둘 다 있어야 올렸는데 그러면 번호를 안 채운 건이 화면에서 조용히 사라져 요청 자체가 누락됐다. 지금은 올리고 `missing`으로 표시해 맨 위에 세우고 붉은 "미기재"를 찍는다. 비어 있으면 GD가 작지를 못 찾아 접수가 안 되니 보내기 전에 채워야 한다. 그 판단은 사람이 한다. 표 복사와 엑셀 내려받기는 `rows`로 만들어서 "미기재" 글자는 화면에만 남고 파일에는 빈 칸으로 나간다.
  담당 칸은 `ownerDisplayName`을 거친다. GD로 나가는 자료라 퇴사자 실명을 싣지 않는다.
  **FDS·YDS 날짜는 웹에서만 산다.** `xlsx-parsers.ts`가 그 두 열을 읽지 않고 `dd-export.ts`도 내보내지 않는다. 엑셀에 적은 날짜는 업로드해도 안 들어오고, 웹에 적은 날짜는 내보내도 안 나간다. 그래서 업로드로만 들어온 행은 날짜를 채워 두었어도 미수취로 보인다. 열 이름을 확인한 뒤 양쪽에 더해야 한다(미착수).
  REQUEST 열은 **일부러 비워 보낸다**. 메일 쓰는 날에 맞춰 손으로 적는 값이라 접수일(requestDate)과 다르다.
- 경고 아이콘(`ddWarnings`)의 FL 경고는 **Style History에 뭐라도 적혀 있으면 끈다.** "Matching RIB으로 등록 불필요"처럼 FL을 안 딴 사유를 남긴 건이라, 계속 띄우면 진짜 누락 건과 구분이 안 된다. FL# 열의 붉은 "FL 미입력" 표기도 같은 판정을 쓰므로 함께 사라진다.
- 작지 첨부 자동 채움: `src/data/zaji.ts`(GD `Fabric sample request report.xlsx`만, 국내 2종 미지원). 회귀규칙(조직명 최장일치·Part+Color dedup·시즌변환) 유지.
  **옵션 단위는 Part+Color 다.** 색상 번호(No)로 접으면 BODY 6개 x 2색이 2건으로 줄어든다(R114). 원본 `zaji/parser.py` 와 다르게 만들지 말 것.
- 드롭다운=정규목록 ∪ 실데이터. Season `SS'26`.
- 주간 보고 버튼(`src/data/weekly-report.ts`): 보고 양식 `1. Total Sample Status Summary` 문장을 만들어 팝업에 띄운다. 손질해서 복사만 한다. 엑셀로 내보내지 않는다.
  **여기서만 완료 기준이 화면과 다르다. 보고 완료는 `Received date`고 화면 완료는 FL#이다.** 리뷰용 원단 받는 날과 FL 등록에 필요한 FDS 받는 날 간격이 커서, 이번 주에 원단 받아 리뷰까지 끝냈는데 FDS가 늦어 FL은 다음 주에 등록되는 일이 흔하다. 팀은 실물 기준으로 보고한다. **두 기준을 하나로 합치지 말 것.** 합치면 화면 현황이나 보고 숫자 중 하나가 반드시 틀어진다.
  팝업은 전체 탭과 담당 탭, 그리고 요약·상세 토글로 갈린다. 담당 탭은 요약 아래에 데이터가 있는 카테고리를 2번부터 번호를 달아 잇는다. **요약은 개발 건 이름(Style No.)으로 묶는다. FL#으로 묶지 말 것.** FL#은 스타일과 조직 조합마다 따로 나가서 그것으로 묶으면 같은 개발 건이 열 줄로 흩어진다(Purepress 5줄, 우리에프씨 4줄). 상세는 FL#과 조직까지 상태마다 한 줄씩 적는다. 요약은 카테고리 안에서 **완료 묶음을 진행 묶음과 갈라 앞에 세운다.** 한 줄에 섞으면 그 주에 끝낸 것과 남은 것이 붙어 버린다. 완료 줄은 상태가 하나뿐이라 건수만 적는다. 한쪽만 있으면 `[완료]`·`[진행]` 머리를 붙이지 않는다. 상태 문장은 공정일로 만든다. 지나간 날짜는 완료, 미래 날짜는 예정이다. **협의 내용과 판단(재가공 요청, as is ok 등)은 DD에 없어 만들 수 없다.** 뼈대만 뽑고 나머지는 사람이 채운다.
  보고 기준 진행 중 = `Received date`가 빈 건. 신규 = 그중 구간 안에 접수된 건, 공정 중 = 나머지. 그래서 `전체 진행 = 신규 + 공정 중`이 항상 맞는다.
  카테고리 분류는 `normalizeCategory`를 거친다. 네 값에 안 맞는 건은 "분류 미기재"로 따로 적는다. 그 줄이 0이 아니면 카테고리 합이 전체와 안 맞으므로 DD Category를 손봐야 한다.

## FABRIC REQUEST (`src/routes/FabricRequest.tsx`, `src/data/request-template.ts`, `src/data/request-image.ts`)
- `/request` = 통합원단부 1팀(유관부서) 소싱 의뢰 원장. **DD MASTER보다 먼저다.** 차트 작성 → 작지 → DD 행 생성 순서.
- 저장은 `requests` CACHE_KEY. 스타일 1건에 옵션 라인 N개. 옵션 라인 1개가 DD 행 1개와 짝이 될 예정(연결은 미구현).
- 엑셀에서 한 셀에 "1./2./3."으로 눌러 담던 옵션을 라인으로 푼 것이 이 화면의 핵심이다.
- 행 높이 고정(스타일 112px, 옵션 40px). 넘치면 셀 안에서만 스크롤한다. 엑셀처럼 행을 늘리지 않는다.
- 셀 더블클릭 인라인 편집. 사진과 옵션 번호는 자동 값이라 편집 불가. URGENT는 더블클릭으로 바로 뒤집는다.
- 밴드 4개(ORIGINAL·분석·의뢰·옵션)는 상단 칩으로 접고 편다. 열 머리와 밴드 머리 오른쪽 끝을 끌어 너비를 조절한다.
  밴드 손잡이는 그 밴드 열을 비율대로 함께 조절한다. 저장은 localStorage `fabric.request.colWidths`, `fabric.request.openGroups`.
- **양식과 파서는 `request-template.ts`의 `TEMPLATE_COLUMNS` 하나를 공유한다. 열 순서를 바꾸면 기존 양식 파일이 깨진다.**
- 업로드 병합 키는 `차트 + Garment No.`다. 기존 건은 `reqId`와 사진 경로를 지킨다. 안 지키면 재업로드마다 사진이 날아간다.
- 사진은 Firebase Storage(`requests/{reqId}/full.webp`, `thumb.webp`). 원본 1200px, 썸네일 400px webp로 줄여 올린다.
- **`getStorage`는 지연 초기화다**(`firebase.ts`의 `appStorage()`). 최상단에서 만들면 Storage 실패가 앱 전체 부팅을 막는다.
- 양식에 사진 열은 없다. 엑셀 이미지 셀은 원본 차트에서도 깨져 있었다. 사진은 웹에서만 올린다.

## 창고 (`src/routes/Warehouse.tsx`, `src/data/fabric-ledger.ts`)
- DD+대장 FL 우선·Style 보조 병합. 개발진행→입고대기(READY)→창고보관→소진/폐기. 입고 시 R&D No. 자동 채번. 웹상태=IDB `fabricOverrides`, 이력=`fabricEvents`.
- **입고 대기 판정은 개발처로 갈린다**(`statusFromRecord`). GD는 YDS 수취일, 국내·생산은 Received date다. 국내는 YDS 공정이 없어 그 칸이 비활성이라 YDS만 보면 영영 안 올라온다. 대장 '현황' 시트는 READY로 올리지 않는다. 창고에서 '직접 추가'한 웹 등록 행만 예외.
- 목록에서 빼는 '선택 삭제'는 `REMOVED` 오버라이드로 감추는 것이다. 원본은 지우지 않는다. 폐기와 다르다.
- 웹 등록 행 key는 `sample.id` 기준이다. 배열 인덱스로 되돌리면 대장 재업로드 때 채번이 어긋난다.
- 창고팀(정산관리팀) 보고 자료 내보내기: `src/data/warehouse-export.ts`. 시트 = `요약` + 일자별 `MM.DD` + `LIST`.
  **원본 양식을 행 단위로 재현한다.** 입고 목록과 출고완료 블록 사이 빈 줄이 일자별 2줄, 요약 1줄이다. 창고팀이 시트째 복사해 붙인다.
  입출고 시트 날짜는 날짜값+numFmt, LIST 요청일은 `8/31` 텍스트다. 서로 다르다.
  **LIST의 `Style No.` 열에는 `storageNo`(R&D No.)를 넣는다.** 원본 값이 그렇다. 실제 Style No.를 넣으면 창고팀 파일이 어긋난다.
  소진(EXHAUST)과 폐기(DISPOSE)는 `RND 출고 완료 현황` 한 목록으로 합친다.
  시트는 `요약` + 일자별 + `LIST` + `주차 집계` + `데이터` + `창고보관 현황` 여섯 종류다.
  `주차 집계`는 전사 부서·팀 틀을 원본대로 만들되 **통합원단부 줄만 채우고 나머지는 0**이다. 다른 부서 숫자는 우리가 모른다. 창고팀이 합치는 자리다.
  `데이터`는 LIST에서 R&D No.로 원단명을 끌어 쓰는 참조표, `창고보관 현황`은 기간과 무관한 현재 시점 스냅샷이다.
  입고·출고완료 목록은 **R&D No.마다 최종 이력 1건만** 올린다. 입고 취소(UNRECEIVE)와 폐기 복구(RESTORE)가 마지막이면 제외한다.

## TREND REPORT (`tools/trend`, `src/routes/TrendFabric.tsx`, `src/routes/TrendMacro.tsx`)
- 파이썬 수집기가 `public/data/trend/{feed,kpi,status}.json`을 만들고 두 화면이 그 파일만 fetch한다. 서버·DB·AI 호출 없다.
- 자동 실행, Secrets, 점수 튜닝, 제목 번역, 바이어 소스 등 **운영 상세는 전부 `tools/trend/README.md`에 있다.** 여기 옮겨 적지 말 것.

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

## 보기 설정 (`src/data/view-prefs.ts`)
- 열 너비와 그룹 펼침/접힘은 **개인 브라우저(localStorage)에만** 남는다. `CACHE_KEYS`에 없어 Firestore로 안 올라간다. 한 사람이 바꿔도 팀원 화면은 그대로다.
- 계정이 아니라 브라우저에 붙는다. 공용 PC에서는 앞사람 설정이 보이고, 다른 PC로 가면 기본값에서 시작한다.
- 키: `dd-col-widths-v2`, `dd-open-groups-v1`, `dd-finishing-open-v1`, `warehouse-col-widths-v1`, `warehouse-open-groups-v1`, `fabric.request.colWidths`, `fabric.request.openGroups`, `home-today-briefing-hidden-v1`.
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
| 창고 입고대기 | GD=DD YDS / 국내=Received date | 대장 현황 시트 제외 |
| STUDY/TS | 엑셀+웹입력 | 주차별 / 중복제외 |
| TREND | RSS 24곳, SEC 공시, World Bank, US Census | 사전 점수 채택, 공개 자료만 |
| RDDA REPORT | 월별 파일 | YTD 스냅샷, 합산 금지(미착수) |

## 코덱스 협업
기획·검토=Claude, 코딩=Codex, 최종확인=Claude. 절차·명령·함정은 `codex-handoff` 스킬에 있다. 지시서 `docs/codex/RNN-*.md`, 실행 파일 `.codex-runs/`(gitignore). **커밋은 사용자 요청 시에만.** `git reset --hard`/`checkout --`로 사용자 변경 되돌리기 금지.

## 잔여 작업
- 자료 라이브러리 OneDrive 링크 목록화.
- RDDA 월 재계산·KPI 대조, RDDA REPORT 파싱.
- DEVELOPMENT 담당자 process status 재배치(미결).
