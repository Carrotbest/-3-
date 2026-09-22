# R244 FABRIC ANALYSIS 다건 의뢰, 의뢰 확정, 엑셀 업로드, 분석 사진, 디자인 개편

상태: 미착수. R243(원장, 화면, 메일 초안) 위에 얹는다. R243 파일은 커밋 전 워킹트리에 있다.

## 사용자 요구 (2026-09-22)

1. 의뢰 팝업에 엑셀 업로드 버튼. 1팀 양식으로 자동 입력. 양식은 나중에 온다. **열 매핑을 한 곳에 모아 두고, 지금은 AX 리캡 22열 이름으로 읽게 한다.**
2. Department 기본값 `통합원단부1팀`, 고칠 수 있음.
3. Source code 입력칸에 연한 회색 안내 `ex) HMP123456 / FL26090001`.
4. Season/Year는 DD와 같은 드롭다운.
5. Construction은 DD와 같은 드롭다운.
6. 화면이 밋밋하다. 톤을 맞춰 강조할 곳에 색과 효과.
7. 팝업에서 `저장하고 추가`로 여러 건을 이어서 저장.
8. 메일 초안은 팝업에서 열지 않는다. 목록에서 체크한 뒤 `의뢰 확정`을 누르면 모아서 의뢰 메일을 연다.
9. 메일 문구는 보내는 사람 입장(`분석을 요청합니다`). 메일 아래에 본인 Outlook 서명이 그대로 들어가야 한다.
10. 결과 팝업에 의뢰 사진(가먼트 또는 원단) 구역과 분석 사진(단면, 조직도) 구역을 따로 둔다.
11. 바탕을 더 세련되게. 선과 글자가 두껍고 투박하다.
12. 상단 지표 카드는 작게 한 줄로 모으고, 그 아래 낮은 높이의 가로 KPI 그래프 카드를 둔다.

## 결정 (클로드)

### 상태에 `작성`을 더한다

`ANALYSIS_STATES = ["작성", "의뢰", "완료", "취소"]`(`src/data/schema.ts`). 팝업 저장은 `작성`이다. 목록에서 `의뢰 확정`을 눌러야 `의뢰`가 되고 메일이 열린다.

- 확정 시 `state = "의뢰"`, `requestedAt = 오늘(현지 날짜)`, `updatedAt` 갱신.
- `작성` 건은 삭제할 수 있다(아직 메일이 나가지 않아 번호가 밖에 알려지지 않았다). 삭제 시 사진도 `deleteRequestImage`로 지운다. `의뢰` 이후는 여전히 삭제 없음, 취소만.
- `취소`는 `작성`, `의뢰` 건에서 할 수 있다.
- 기존 R243 레코드(state 의뢰)는 그대로 둔다. 이관 코드 없음.

### 메일은 mailto + 클립보드로 연다 (서명 때문)

`.eml`(`X-Unsent: 1`)로 연 초안에는 Outlook이 기본 서명을 넣지 않는다. `mailto:`로 새 메일을 열면 Outlook이 기본 서명을 넣는다. 그런데 mailto 본문은 글자만 들어가 표가 깨진다. 그래서:

1. 버튼을 누르면 본문 HTML(첫 줄 + 표)을 클립보드에 쓴다. `mail-draft.ts` 42행 `copyMailTable`과 같은 `ClipboardItem({"text/html", "text/plain"})` 방식. 표만이 아니라 `mailBodyHtml`로 만든 본문 전체를 쓴다. 새 함수 `copyMailBody(lines, columns, rows)`를 `mail-draft.ts`에 추가한다.
2. 이어서 `window.location.href = mailto:{to}?cc={cc}&subject={encodeURIComponent(subject)}`로 Outlook 새 메일을 연다. 주소는 `,`로 잇고 `encodeURIComponent`. body는 넣지 않는다.
3. 화면에 안내 한 줄을 6초 보인다: `본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다.`
4. 클립보드 쓰기가 실패하면(권한) 기존 `.eml` 내려받기로 떨어지고 안내를 바꾼다.
5. 보조 버튼으로 `.eml로 받기`는 남긴다(`analysis-mail.ts` 기존 함수).

순서가 중요하다. 클립보드 쓰기는 클릭 직후 사용자 제스처 안에서 먼저 하고, mailto는 그다음이다.

### 메일 문구 (`src/data/analysis-mail.ts`)

- 의뢰 1건: `Analysis request number: {anNo} 로 분석을 요청합니다.` / 여러 건: `아래 {N}건의 원단 분석을 요청합니다.`
- 완료 1건: `Analysis request number: {anNo} 분석이 완료되었습니다.` / 여러 건: `아래 {N}건의 분석이 완료되었습니다.`
- 제목 규칙은 R243 그대로.
- 의뢰 표에서 Brand, Construction이 빈 칸이면 빈 칸 그대로(대체값 넣지 않음).

### 의뢰 확정 흐름 (목록)

- 선택 도구줄 버튼: `의뢰 확정`(선택 중 `작성` 건만 대상. 없으면 비활성), `완료 메일`(완료 건만), `삭제`(작성 건만, 확인 창), 보조 `.eml로 받기`.
- `의뢰 확정` 클릭: 확인 창 없이 곧바로 (1) 대상 건 상태 저장 (2) 클립보드 (3) mailto. 받는 사람은 `loadAnalysisRecipients()`를 **화면 진입 때 미리 읽어 두고** 그 값을 쓴다(클릭 뒤 await하면 제스처가 끊겨 클립보드가 막힌다).
- 받는 사람 목록이 비어 있으면 mailto의 to를 비운 채 열고 안내에 `받는 사람 목록이 비어 있습니다`를 덧붙인다.

### 의뢰 팝업 (`src/components/analysis/AnalysisRequestDialog.tsx` 개편)

- 폭 `max-w-5xl`. 왼쪽 폼, 오른쪽 좁은 열(약 280px)에 `이번에 저장한 의뢰` 목록(AN No., Source code, Construction 한 줄씩, 누르면 그 건을 폼으로 불러와 수정).
- 버튼: `저장하고 추가`(저장 후 폼을 새 건으로. **유지할 칸**: Department, Requester, Request type, Objective, Source, Season/Year, Gender/Age, Brand, Customer. **비울 칸**: Source code, Construction, Contents, Weight, Comment, Request item, 사진. AN No.는 방금 저장한 목록 기준 `nextAnNo`), `저장`(저장 후 닫기), `엑셀 업로드`, `닫기`.
- 저장 상태는 `작성`. 저장 뒤 메일 버튼을 보이지 않는다.
- Department 기본값 `통합원단부1팀`(`DEFAULT_DEPARTMENT` 상수, `fabric-analysis.ts`). localStorage 기억은 없앤다.
- Source code 칸 `placeholder="ex) HMP123456 / FL26090001"`, placeholder 색은 `placeholder:text-[var(--muted-foreground)]/60`.
- Season/Year: `Select`(`src/components/ui/select.tsx`)에 `DD_SEASON_OPTIONS`(`src/data/dd-workflow.ts` 26행). 현재 값이 목록 밖이면 그 값도 옵션 맨 앞에 넣어 보인다. 빈 값 옵션 `선택 안 함`.
- Construction: `Select`에 `CONSTRUCTIONS`(`src/data/constructions.ts`). 목록 밖 현재 값 처리는 Season과 같다.
- 사진 칸은 드래그 앤 드롭 + 클릭 선택 영역(점선 테두리, 미리보기 썸네일, 지우기 버튼).
- `저장하고 추가`를 연속으로 눌러도 저장 전 목록은 매번 `useAppStore.getState().analysisRequests`에서 새로 읽는다(R243 규칙 유지).

### 엑셀 업로드 (팝업 안)

새 파일 `src/data/analysis-import.ts`.

- `ANALYSIS_IMPORT_COLUMNS`: 필드 키와 머리글 별칭 배열. **1팀 양식이 오면 이 표만 고친다.** 지금 별칭(대소문자, 공백, 괄호, `*` 무시하고 비교):

| 필드 | 별칭 |
|---|---|
| anNo | Analysis request number |
| (사진) | RDDA, Photo, Image, 사진 |
| department | Department |
| customer | Customer name |
| objective | Objective of analysis |
| description | Analysis Description, Request item |
| requesterComment | Comment (Requester), Comment |
| source | Original Fabric Source |
| sourceCode | Source code |
| season | Season/Year, Season |
| gender | Gender/Age, Gender |
| brand | Brand |
| construction | Construction Name, Construction |
| contents | Fabric Content, Contents |
| weight | Fabric weight (gsm), Weight |
| requestType | Request type |

  결과 칸(Yarn description, Construction (RND), 등)은 읽지 않는다. `Brand name` 열은 무시한다(`Brand`와 헷갈리지 않게 정확히 일치로 비교).
- `parseAnalysisWorkbook(file: File): Promise<{ rows: AnalysisImportRow[]; warnings: string[] }>`. exceljs를 `src/data/dd-export.ts` 152~153행과 같은 방식으로 동적 import 한다. 첫 시트, 1~10행에서 별칭 3개 이상 맞는 행을 머리글로 본다. 빈 행 건너뜀.
- 값 정리: requestType은 `urgent` 포함이면 Urgent, 아니면 Normal. weight 숫자 변환 실패는 "". construction은 `matchConstruction`으로 목록 표기에 맞추고 없으면 원문 유지 + 경고. season은 `DD_SEASON_OPTIONS`에 없으면 원문 유지 + 경고. anNo는 **무시한다**(번호는 대시보드가 매긴다. 엑셀에 번호가 있으면 경고 한 줄 `엑셀의 AN 번호는 쓰지 않고 새로 매깁니다`).
- 사진: `worksheet.getImages()`의 `range.tl.nativeRow`(0부터)로 행을 찾아 그 행의 첫 사진을 `workbook.getImage(Number(imageId))`의 `buffer`, `extension`으로 `File`을 만든다(`image/jpeg` 또는 `image/png`).
- 팝업 동작: 업로드하면 폼 아래(또는 폼 대신) `가져온 {N}건` 미리보기 표(사진 썸네일, Source code, Construction, Contents, Weight, Season, 경고 아이콘)와 `N건 저장` 버튼을 보인다. 저장은 한 번의 `saveAnalysisRequests`로 전 건을 `작성` 상태로 넣고(번호는 순서대로 `nextAnNo`를 이어 매김), 그 뒤 사진을 차례로 올려 경로를 채워 한 번 더 저장한다. 사진 실패는 건별 안내만.
- 업로드는 표에 바로 쓰지 않는다. 미리보기에서 사람이 `N건 저장`을 눌러야 들어간다. 이 원칙을 바꾸지 마라.

### 사진 원본 크기 제한

`src/data/request-image.ts`의 `validateRequestImage`에 선택 인자 `maxSourceBytes = MAX_SOURCE_SIZE`를 더하고, `uploadRequestImage(reqId, file, options?: { maxSourceBytes?: number })`로 넘긴다. 분석 쪽은 20MB(`20 * 1024 * 1024`)를 넘긴다. 업로드되는 것은 1200px webp라 Storage 규칙 3MB 안에 든다. **FABRIC REQUEST 쪽 호출은 인자를 넘기지 않아 동작이 그대로다.** `storage.rules`는 고치지 않는다.

### 분석 사진 (결과 팝업)

- 타입에 `resultImages?: { key: string; imagePath: string; imageThumbPath: string }[]` 추가. 최대 4장.
- 경로 `uploadRequestImage(\`analysis-${id}-r${key}\`, file, { maxSourceBytes })`, key는 `Date.now().toString(36)`. 지우면 `deleteRequestImage(\`analysis-${id}-r${key}\`)` 뒤 배열에서 뺀다.
- 의뢰 사진(`imagePath`)도 결과 팝업에서 바꿀 수 있다(편집 권한일 때).

### 결과 팝업 (`AnalysisDetailDialog.tsx` 개편)

- 폭 `max-w-6xl`. 머리: AN No.(크게, tabular), 상태 칩, Urgent 칩, 의뢰일과 소요일.
- 본문 2열(`lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`):
  - 왼쪽: `의뢰 사진` 카드(4:3 비율, object-contain, 연한 바탕, 누르면 새 탭 원본) 아래 의뢰 정보(2열 정의 목록, 라벨은 11px 대문자 자간, 값은 13px).
  - 오른쪽: `분석 결과` 폼(In charge, Yarn description 여러 줄, Construction (RND)은 `CONSTRUCTIONS` Select, Weight (RND), Comment (RND), 완료일) 아래 `분석 사진` 구역(단면, 조직도. 2×2 격자, 빈 칸은 점선 추가 타일, 사진 위에 호버 시 지우기).
- 버튼 줄은 R243 기능 유지하되 `의뢰 메일 초안` 버튼은 뺀다(목록에서 확정). `완료 메일`은 남긴다(mailto + 클립보드).

### 목록 화면 디자인 (`src/routes/FabricAnalysis.tsx`)

전반: 선과 글자를 가볍게.
- 카드 테두리 `border-[var(--border)]/60`, 그림자 없음 또는 `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`. 표 머리글 11px, `font-medium`, `tracking-wide`, `text-[var(--muted-foreground)]`, 머리 바탕 `bg-[var(--muted)]/40`. 본문 13px, `font-normal`. 행 구분선 `border-[var(--border)]/50`. 굵은 글씨는 AN No.만(`font-medium tabular-nums`).
- 행 호버 `hover:bg-[var(--muted)]/40`, 선택 행 연한 청록 바탕. Urgent 행은 왼쪽 2px 빨간 띠(`shadow-[inset_2px_0_0_theme(colors.rose.500)]`).
- 상태 칩: 작성 slate, 의뢰 amber, 완료 emerald, 취소 slate 옅게. 칩은 `text-[11px] px-2 py-0.5 rounded-full` + 앞에 6px 점.
- 강조색 하나를 정한다: 청록(`teal-600`, 다크 `teal-400`). 주 버튼(`새 분석 의뢰`, `의뢰 확정`), 활성 탭 밑줄, 선택 체크, KPI 그래프 완료 계열에 쓴다. 의뢰 계열은 amber, Urgent는 rose.
- 썸네일 36px `rounded-md ring-1 ring-[var(--border)]/60`, 없으면 연한 바탕에 `ImageOff` 아이콘 14px.

상단:
- **지표 한 줄**(카드 하나, 높이 약 64px, 4칸을 세로 구분선으로): 작성, 분석 대기(의뢰), Urgent 대기, 이번 달 완료, 평균 소요일. 각 칸 라벨 11px, 숫자 20px `font-semibold tabular-nums`, 색 점 하나. 숫자는 `NumberTicker`(`src/components/motion/NumberTicker.tsx`)를 쓴다. 칸을 누르면 해당 탭으로 간다.
- **KPI 그래프 카드**(높이 140px 내외, 풀폭): 최근 12주 주별 의뢰 건수(amber 막대)와 완료 건수(teal 막대)를 나란히, 평균 소요일(오른쪽 축, 회색 점선 꺾은선). Recharts `ComposedChart`, 색은 `src/components/charts/chart-theme.ts`의 `readChartTheme()`로 축과 격자, 툴팁(`tooltipStyle`)을 맞춘다. 막대 모서리 둥글게(`radius={[3,3,0,0]}`), `barSize` 8, 격자는 가로선만 옅게, 축 글자 10px. 데이터가 하나도 없으면 카드 안에 옅은 안내 `최근 12주 데이터가 없습니다`. 주 기준은 월요일 시작, 의뢰는 `requestedAt`(작성 제외), 완료는 `finishedAt`.
- 그래프 데이터 계산은 `src/data/fabric-analysis.ts`의 `analysisWeeklySeries(list, today = new Date())`로 둔다.

## 하지 말 것

- 엑셀 업로드 결과를 확인 없이 표에 쓰지 마라.
- `writeBatch`, `mergeForKey`를 직접 부르지 마라. 저장은 `saveAnalysisRequests`만.
- 병합 id(`id`)를 바꾸거나 anNo로 대신하지 마라.
- `storage.rules`, `firestore.rules`를 고치지 마라. FABRIC REQUEST 동작을 바꾸지 마라(`request-image.ts` 변경은 선택 인자 추가뿐).
- 긴 표를 `SectionCard`로 감싸지 마라(`Reveal` 임계값).
- ref 콜백 안에서 setState 하지 마라.
- 실명, 메일 주소, 실데이터를 코드와 문서에 넣지 마라. 별칭 표에 실제 값 예시를 넣지 마라.
- `fabricAnalysis`(옛 AX export 키), `ingestFabric`, `parseFabricAnalysis`는 건드리지 마라.

## 검증

- `npm run build` 통과.
- `git status --short`가 아래 범위 안.

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | 상태 `작성`, `resultImages` |
| `src/data/fabric-analysis.ts` | `DEFAULT_DEPARTMENT`, `analysisWeeklySeries`, localStorage 기억 제거 |
| `src/data/analysis-mail.ts` | 문구, mailto + 클립보드 |
| `src/data/mail-draft.ts` | `copyMailBody` 추가 |
| `src/data/analysis-import.ts` | 새 파일 |
| `src/data/request-image.ts` | 선택 인자 `maxSourceBytes` |
| `src/components/analysis/AnalysisRequestDialog.tsx` | 개편 |
| `src/components/analysis/AnalysisDetailDialog.tsx` | 개편 |
| `src/components/analysis/*` | 필요하면 새 파일(예: 사진 드롭존, KPI 그래프) |
| `src/routes/FabricAnalysis.tsx` | 개편 |
