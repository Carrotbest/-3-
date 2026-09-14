# R132 FDS/YDS 요청에 "FL 등록, FDS 미수취" 건 추가

상태: 미착수

## 요구
DD MASTER의 FDS/YDS 요청 팝업에서 FL#은 유효한데 FDS가 빈 건도 목록에 넣고 따로 표시한다.

## 틀리기 쉬운 점 (다시 시도하지 말 것)
- `fds-yds-request.ts` 75행 `isCompletedFlNo` 제외 줄만 지우면 안 된다. FL#이 들어가면 `applyDdFormulas`가 Status를 `완료`로 올린다(`dd-workflow.ts` 130행). 그래서 71행 `isInProgress`에서 이미 걸러진다. 새 건은 `isInProgress`를 거치지 않는 별도 분기로 잡는다.
- 기간 제한 없이 넣으면 안 된다. FDS 날짜는 웹에서만 입력되고 엑셀 업로드로는 들어오지 않는다. 제한이 없으면 엑셀로 올린 과거 완료 건이 거의 다 들어온다.

## 확정 규칙 (사용자 결정)
새 분기 조건. 모두 만족해야 한다.
1. 개발처 GD, `styleNo` 있음 (기존과 같음)
2. `receivedDate` 있음 (기존과 같음)
3. `isCompletedFlNo(record.flNo)` 참
4. `tech.sampleDates.fds` 비어 있음. YDS는 보지 않는다.
5. Status(`devStatus`, 공백 제거 후 대문자)가 `DROP`, `HOLD`, `REJECT`가 아님
6. FL 등록월이 이번 달 또는 지난달. FL 형식은 `FL`+YY+MM+4자리. `(2000+YY)*12 + (MM-1)`과 `today.getFullYear()*12 + today.getMonth()`의 차가 0 또는 1일 때만 넣는다.

표시:
- 화면: 기존 목록 아래에 따로 모은다. 첫 행 앞에 구분 줄을 한 줄 넣는다. 행 배경은 호박색 옅은 색이다. 번호 미기재(`missing`) 행의 붉은 배경이 우선한다.
- 엑셀과 표 복사: 같은 표 아래쪽에 모인다. REMARK 앞에 `{FL#} 등록, FDS 미수취`를 붙인다. 기존 비고가 있으면 ` / `로 잇는다. 열 구성은 바꾸지 않는다.

## 파일별 조치
| 파일 | 조치 |
|---|---|
| `src/data/fds-yds-request.ts` | `FdsYdsRow`에 `flRegistered: boolean` 추가. `FDS_YDS_COLUMNS` 타입의 Omit에 `flRegistered`를 더한다. `collectFdsYdsRows(records, today = new Date())`로 바꾸고 위 분기를 더한다. 기존 분기 조건은 그대로 둔다. `remark`에 위 문구를 붙인다. 정렬은 `flRegistered` 거짓이 먼저, 그 안에서 기존 정렬(missing 먼저, 담당, HMP, BODY)을 유지한다. 함수 위 주석에 새 분기와 이유 두 가지(Status 자동 완료, FDS 웹 전용)를 짧게 더한다. |
| `src/routes/DevelopmentMasterSheet.tsx` | 990행 근처에 `fdsYdsFlRegistered` 건수 useMemo 추가. 2633~2634행 설명에 `· FL 등록·FDS 미수취 N건`(0이면 생략)을 붙인다. 2640행 문장을 "FL#이 등록된 건은 FDS를 이미 받은 것으로 보고 제외합니다. 다만 이번 달과 지난달에 FL을 등록했는데 FDS가 빈 건은 표 아래에 따로 모으고 REMARK에 FL#을 적어 보냅니다."로 바꾼다. 2648행 tbody에서 첫 `flRegistered` 행 앞에 구분 줄(`colSpan` 전체, 호박색 옅은 배경, 굵은 글씨 `FL 등록 · FDS 미수취 N건`)을 넣는다. 행 className은 missing이면 기존 붉은색, 아니고 flRegistered면 `bg-amber-500/10`. |
| `CLAUDE.md` | 20행 FDS/YDS 요청 팝업 설명 끝에 한 문단 추가: 새 분기 조건 6개 요약, Status 자동 완료 때문에 별도 분기라는 점, FDS 웹 전용이라 등록월 2개월 제한을 둔다는 점, REMARK 표기. |

## 하지 말 것
- 기존 분기(진행중, FL 미등록, FDS 또는 YDS 빈 건) 조건을 바꾸지 않는다.
- 엑셀과 복사에 열을 더하지 않는다. GD 양식 열 구성이 고정이다.
- `xlsx-parsers.ts`, `dd-export.ts`에 FDS 열을 더하지 않는다. 별도 미착수 과제다.
- `isInProgress`, `isCompletedFlNo`, `applyDdFormulas`를 고치지 않는다. 다른 화면 숫자가 바뀐다.

## 검증
- `npm run build` 성공.
- `git status --short`에 위 세 파일과 이 문서만 보인다.
