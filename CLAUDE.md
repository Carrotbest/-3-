# Fabric R&D — Claude Code 인수인계

최종 갱신: 2026-08-11

## 프로젝트
- 한솔섬유 통합원단부 3팀 Fabric R&D 업무 플랫폼 MVP. 위치 `C:\Users\hkpark\Desktop\fabric-rnd`.
- React 18 · TypeScript · Vite · Zustand · Recharts · Tailwind v4 · SheetJS.
- 실행 `npm run dev`, 검증 `npm run build`(`tsc --noEmit && vite build`). base 경로 `/-3-/`, **해시 라우터**(URL은 `/-3-/#/development/workspace` 형태).
- 미리보기: Vite dev는 `fabric-rnd-vite`(포트 5175). Desktop 레벨 `.claude/launch.json`의 `fabric-rnd`(파이썬 정적서버)는 .tsx를 octet-stream으로 서빙해 로드 실패 → dev용 금지.

## 방향(2026-08-11 브리핑)
- DD MASTER = 현황 관리 중심. **샘플관리대장 폐기**(넘버링 체계만 창고로 이관), 엑셀 병행은 1~2주 검증 후 웹 전환.
- 로그인/권한(향후): 역할별 화면·항목 노출(지하1층=입고대기만, 사업부=트렌드/RDDA만). Firebase 검토(8MB뿐, 무료 1GB 충분, 자동 엑셀 백업, ~₩30k/월).
- 전체 로드맵·미결정은 사용자 메모리 `fabric-rnd-roadmap-briefing-0811` 참조.

## 현재 상태 (DD MASTER, `src/routes/DevelopmentMasterSheet.tsx`)
- `/development/workspace` = 살아있는 현황판(DD 전체현황 64열, 7그룹, 담당·Status·Style 좌측 고정, 3단 병합 헤더).
- **와이드 레이아웃**: workspace 라우트만 `App.tsx`에서 폭 제약·패딩 해제 + flex로 뷰포트 고정(가로 스크롤바 하단 고정).
- **인라인 편집**: 셀 더블클릭 → 타입별(드롭다운·날짜피커·datalist·수기) 즉시 저장. 수식·샘플대장 연결 열은 음영·수정 불가. Status는 색 블럭 인라인. 담당 칸 ⤢ 아이콘 → 전체 64열 수정 모달.
- **신규 작지 접수 팝업(수정 모달과 별개)**: 결과/DATA/REVIEW 없음. REQUEST·ORIGINAL·담당·Style은 옵션 공통(`changeShared`), DETAIL·SCHEDULE은 옵션별(`changeOption`). 옵션 탭 추가/삭제, 저장 시 옵션 수만큼 행 등록(`saveIntake`).
- **작지 첨부 자동 채움**: `src/data/zaji.ts`(GD 파서 포팅, 파이썬 `작지변환기` 로직). GD `Fabric sample request report .xlsx` 판별→파싱→폼 자동 채움. 국내 2종은 미지원(안내). 회귀: 조직명 끝위치 최장일치·Part+Color 중복제거·시즌변환 등 원본 로직 유지.
- 드롭다운 옵션은 실데이터에서 동적 생성(정규목록 ∪ 실제값). Season 형식 `SS'26`.
- 신규 접수 레코드 `_src.sheet="웹 접수"`(고유 채번), 저장 `saveDevelopmentRecord`.

## 창고 (`src/routes/Warehouse.tsx`, `src/data/fabric-ledger.ts`)
- DD와 샘플관리대장을 FL 우선·Style 보조로 병합. 상태: 개발진행→입고대기(READY)→창고보관(WAREHOUSE)→소진/폐기. `statusFromRecord`가 devStatus 완료/receivedDate면 READY.
- 입고 시 기존 R&D No. 최대값 다음 4자리 자동 채번. 웹 상태=IndexedDB `fabricOverrides`, 이력=`fabricEvents`. 원본 엑셀 미수정, 처리자 `관리자`.
- **주의(A-2)**: DD에서 완료→창고 입고대기는 같은 스토어라 이미 자동 반영될 가능성 높음(재구현 전 브라우저 검증부터).

## 알려진 데이터 이슈 (실파일 조사)
- **RDDA 파일별 집계 기준 다름(최우선)**: 3·4·5월 파일=그 달만(1,300~1,600행), 6월 파일=6개월 누적(7,077행) → 앱이 넷 다 월 스냅샷으로 그려 6월 급등. 해법: 파일 신뢰 버리고 각 행 `MeetDate`로 월 재계산. RDDA KPI를 샘플관리대장과 대조 검증(미완).
- **RDDA REPORT**(박한상 월별 raw) 파싱 미착수.
- **TS 발주량** `Order Volume` 자유텍스트(장·yds·USD 혼재) → 지표 무의미. 상태 컬럼 없음(Result 유무로 완료/처리중 추정).
- 빈 화면: CONSTRUCTION GUIDE(제거 확정)·트렌드 3종·FABRIC ANALYSIS(존치 미정).

## 구현 결정·주의
- **데모 번호는 실제 채번 규칙과 다르다(의도된 현상태)**: `sample.ts`의 FL은 `FL-26xxx`(숫자 5자리)라 `derive.ts`의 `rddaMonthFromFlNo`(8자리 요구)를 통과하지 못한다. 그래서 데모에서는 HOME RDDA 등록 현황·GD# 기입률이 0으로 나온다. 2026-08-18에 실제 규칙(FL+YY+MM+4자리)을 따르도록 바꿔봤으나 **RDDA 등록 수치가 실제와 맞지 않아 사용자 요청으로 원복**함. 다시 손대려면 RDDA 집계 기준부터 확정할 것.
- **화면 검증 시 주의**: `NumberTicker`·`RadialKpi`는 초기값 0에서 `requestAnimationFrame`으로만 올라간다. 탭이 비활성(`visibilityState: hidden`)이면 rAF가 안 돌아 **모든 KPI가 0으로 보인다**. 실값은 두 컴포넌트의 `aria-label`에서 읽을 것(0을 버그로 오인하기 쉬움).
- 날짜 파싱은 `XLSX.SSF.format("yyyy-mm-dd", value)`(하루 밀림 방지). zaji.ts는 `cellDates:true` Date 직접.
- 샘플관리대장 파싱=IndexedDB `completed`. 새 필드(sourceSheet, R&D No.) 반영하려면 재업로드 필요.
- RDDA 등록: ~2026-07 샘플관리대장 FL.# YYMM, 2026-08~ DD Received Date, 동일 FL 1건. FL 형식 `FL+YY+MM+4자리`, 생산처=끝 4자리 첫 숫자(9 GD·5 국내·0 생산·2 사입).
- **사용자 실제 데이터·캐시 내용을 로그·git·공개 파일에 넣지 말 것.**
- 팝업/모달 투명 버그 원인: `@theme`에 `--color-background` 미매핑 → shadcn Sheet의 `bg-background` 투명. 새 `src/components/ui/dialog.tsx`는 명시적 `var(--card)` 사용.

## 데이터 소스 규칙
| 화면/지표 | 원본 | 기준 |
|---|---|---|
| HOME 완료/접수 | DD | Received/Request Date + 사용자 기간 |
| HOME 스케줄 | DD 진행중 | Due Date D-7/D+ |
| RDDA 등록 | ~07 샘플대장 / 08~ DD | FL.# YYMM / Received, 동일 FL 1건 |
| DEVELOPMENT | DD + 샘플대장 | 진행 현황 + 완료 샘플 |
| STUDY / TS | 각 엑셀 + 웹 입력 | 주차별 / 중복제외 누적 |
| RDDA REPORT | 월별 RDDA 파일 | YTD 스냅샷, 합산 금지 |

## 코덱스 협업
- 기획·검토 Claude, 코딩 Codex, 최종 확인 Claude.
- 실행: `codex exec -C "C:\Users\hkpark\Desktop\fabric-rnd" -s workspace-write -o .codex-runs/RNN-last.txt - < .codex-runs/RNN-prompt.txt` (codex-cli, 모델 gpt-5.6-sol). `.codex-runs/`는 gitignore.
- 지시서 `docs/codex/RNN-*.md`(R21~R33 존재). Codex에 "그 문서 그대로 구현 + 금지사항" 프롬프트로 전달.
- **커밋은 사용자 요청 시에만.** 현재 브랜치 `redesign/v2` 미푸시. 대규모 재구축 중이라 `git reset --hard`/`git checkout --`로 사용자 변경 되돌리기 금지.

## 다음 작업
- ~~A-1: 신규 접수 필수항목 별표+저장차단 → `docs/codex/R30-intake-required-fields.md`~~ **완료(빌드·UI 검증)**.
- ~~B(1차): CONSTRUCTION GUIDE 제거 + 다크모드 제거 → `docs/codex/R31-remove-construction-guide-darkmode.md`~~ **완료(빌드·UI 검증)**.
- ~~C(전역 레이아웃): 검색줄·출처줄 제거, 제목 상단바 이동, 사이드바 이모지 토글+메뉴 목적재편 → `docs/codex/R32-global-layout-sidebar.md`~~ **완료(빌드·UI 검증)**.
- ~~D(DD 마스터): Developer 삭제·Request Date 정렬·열너비 드래그·가운데정렬·Balance % → `docs/codex/R33-dd-master-columns.md`~~ **완료(빌드·UI 검증)**.
- ~~R34(Home): Quick access 하단 3열 글래스 그리드 이동 + 상단 우측 레일에 팀 일정 캘린더(미팅·연차·외근·출장, IndexedDB `events` 영속) 신설 → `docs/codex/R34-quickaccess-bottom-team-calendar.md`~~ **완료(Codex 구현, tsc·vite build·UI 검증)**. 참고: 실시간 팀 공유는 향후 Firebase 필요, 현재 로컬 저장.
- ~~A-2: DD 완료→창고 입고대기 연결 검증~~ **완료(브라우저 검증)**. DD 완료 31건이 창고 입고대기 31건으로 자동 연결됨. 재구현 불필요.
- B(잔여): 자료 라이브러리 OneDrive 링크 목록화, TS 상세 화면.
- 데이터: RDDA 월 재계산·KPI 대조, RDDA REPORT 파싱.
