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
- 작지 첨부 자동 채움: `src/data/zaji.ts`(GD `Fabric sample request report.xlsx`만, 국내 2종 미지원). 회귀규칙(조직명 최장일치·Part+Color dedup·시즌변환) 유지.
- 드롭다운=정규목록 ∪ 실데이터. Season `SS'26`.

## 창고 (`src/routes/Warehouse.tsx`, `src/data/fabric-ledger.ts`)
- DD+대장 FL 우선·Style 보조 병합. 개발진행→입고대기(READY)→창고보관→소진/폐기. 입고 시 R&D No. 자동 채번. 웹상태=IDB `fabricOverrides`, 이력=`fabricEvents`.
- **입고 대기 소스는 DD의 YDS 날짜뿐이다**(`statusFromRecord`). 대장 '현황' 시트는 READY로 올리지 않는다. 창고에서 '직접 추가'한 웹 등록 행만 예외.
- 목록에서 빼는 '선택 삭제'는 `REMOVED` 오버라이드로 감추는 것이다. 원본은 지우지 않는다. 폐기와 다르다.
- 웹 등록 행 key는 `sample.id` 기준이다. 배열 인덱스로 되돌리면 대장 재업로드 때 채번이 어긋난다.

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
- 그리드 셀 드래그는 `mousedown`에서 `preventDefault`를 건다. 안 걸면 브라우저 기본 선택이 같이 시작돼 화면 전체가 반투명 사본으로 끌려다닌다. 버튼·입력칸 위에서는 걸지 않는다.
- **실데이터·캐시 내용을 로그·git·공개 파일에 넣지 말 것.**
- TS 실시간공유 데이터 손실 이력 있음 — 동기화 손대기 전 `fabric-rnd-ts` 필독.

## 데이터 소스 규칙
| 화면 | 원본 | 기준 |
|---|---|---|
| HOME 완료/접수 | DD | Received/Request Date + 기간 |
| RDDA 등록 | ~2026-07 대장 FL.# YYMM / 08~ DD Received | 동일 FL 1건(대장 우선) `mergedFlRegistrations` |
| DEVELOPMENT | DD+대장 | `fabric-rnd-fl-ledger` |
| 창고 입고대기 | DD YDS 날짜 | 대장 현황 시트 제외 |
| STUDY/TS | 엑셀+웹입력 | 주차별 / 중복제외 |
| TREND | RSS 24곳, SEC 공시, World Bank, US Census | 사전 점수 채택, 공개 자료만 |
| RDDA REPORT | 월별 파일 | YTD 스냅샷, 합산 금지(미착수) |

## 코덱스 협업
기획·검토=Claude, 코딩=Codex, 최종확인=Claude. 절차·명령·함정은 `codex-handoff` 스킬에 있다. 지시서 `docs/codex/RNN-*.md`, 실행 파일 `.codex-runs/`(gitignore). **커밋은 사용자 요청 시에만.** `git reset --hard`/`checkout --`로 사용자 변경 되돌리기 금지.

## 잔여 작업
- 자료 라이브러리 OneDrive 링크 목록화.
- RDDA 월 재계산·KPI 대조, RDDA REPORT 파싱.
- DEVELOPMENT 담당자 process status 재배치(미결).
