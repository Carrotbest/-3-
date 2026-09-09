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
- FDS/YDS 요청 팝업(`src/data/fds-yds-request.ts`): GD 진행분 중 FDS 또는 YDS 미수취분. DROP·HOLD·REJECT 제외.
  **STYLE#(GD#/SA#)과 ARRANGE#가 둘 다 있어야 올린다.** 하나라도 비면 GD가 작지를 못 찾아 요청해도 접수가 안 된다.
  REQUEST 열은 **일부러 비워 보낸다**. 메일 쓰는 날에 맞춰 손으로 적는 값이라 접수일(requestDate)과 다르다.
- 작지 첨부 자동 채움: `src/data/zaji.ts`(GD `Fabric sample request report.xlsx`만, 국내 2종 미지원). 회귀규칙(조직명 최장일치·Part+Color dedup·시즌변환) 유지.
- 드롭다운=정규목록 ∪ 실데이터. Season `SS'26`.

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
- **실데이터·캐시 내용을 로그·git·공개 파일에 넣지 말 것.**
- TS 실시간공유 데이터 손실 이력 있음 — 동기화 손대기 전 `fabric-rnd-ts` 필독.

## 보기 설정 (`src/data/view-prefs.ts`)
- 열 너비와 그룹 펼침/접힘은 **개인 브라우저(localStorage)에만** 남는다. `CACHE_KEYS`에 없어 Firestore로 안 올라간다. 한 사람이 바꿔도 팀원 화면은 그대로다.
- 계정이 아니라 브라우저에 붙는다. 공용 PC에서는 앞사람 설정이 보이고, 다른 PC로 가면 기본값에서 시작한다.
- 키: `dd-col-widths-v2`, `dd-open-groups-v1`, `dd-finishing-open-v1`, `warehouse-col-widths-v1`, `warehouse-open-groups-v1`, `fabric.request.colWidths`, `fabric.request.openGroups`.
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
