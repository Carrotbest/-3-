# RDDA 화면 재구성 · 작업 현황

마지막 갱신 2026-09-16. 이 문서는 인계용이다. 다음 세션이나 다른 사람이 이어받을 때 여기부터 읽는다.

## 무엇을 하고 있나

`/rdda` 화면을 전면 재구성한다. 데이터 원본이 전략팀 월별 엑셀에서 **RDDA 원본 API 집계 JSON**으로 바뀐다.

목적은 리포팅이 아니라 **제안 엔진**이다. 어느 바이어에 무엇을 걸지, 다음에 무엇을 개발할지를 화면이 골라 준다.
월간 정기보고는 그 부산물로 나온다.

시안: https://claude.ai/artifact/TnSukxNHeh5heHYcufAS2Q

## 진행 상황

| 지시서 | 내용 | 상태 |
|---|---|---|
| `R201-rdda-report-rebuild.md` | 타입, JSON 업로드, 탭 7개 | **완료.** 빌드 통과 확인 |
| `R202-rdda-history.md` | 주간 스냅샷, 추이 탭 | 코덱스 작업 마무리 단계. 빌드 검증 필요 |
| `R203-rdda-monthly-report.md` | 월간 리포트 생성·편집·확정·인쇄 | 미착수. 프롬프트 준비됨 |

## 이어서 할 일

### 1. R202 검증

```bash
cd C:\Users\hkpark\Desktop\fabric-rnd
npm run build
git status --short
```

빌드가 통과하고 엉뚱한 파일이 지워지지 않았으면 된다.
`src/components/rdda/TrendTab.tsx`가 생겼고 `cache.ts`와 `firestore-sync.ts`에 `rddaSnapshots`가 들어갔는지 본다.

### 2. R203 실행

```powershell
Get-Content "C:\Users\hkpark\Desktop\fabric-rnd\.codex-runs\R203-prompt.txt" -Raw |
  codex exec -C C:\Users\hkpark\Desktop\fabric-rnd -s workspace-write --skip-git-repo-check `
    -c model_reasoning_effort="medium" `
    -o "C:\Users\hkpark\Desktop\fabric-rnd\.codex-runs\R203-last.txt" -
```

### 3. 실데이터로 확인

바탕화면 `RDDA_수집_v2.js`를 RDDA 로그인 상태에서 F12 콘솔에 붙여넣는다.
3~5분 뒤 `rdda-report-MMDD.json`이 다운로드된다. 그 파일을 `/rdda` 화면에서 업로드한다.

확인할 것: 팀 FL이 5,538건 근처인지, 미팅이 700건 안팎인지, 바이어 표에 Walmart 제안 2,700건 근처가 찍히는지.

## 확정된 기준

사용자가 정한 것이다. 코드가 이것과 어긋나면 코드를 고친다.

| 항목 | 값 |
|---|---|
| 주지표 | **제안 대비 픽업**. 그달 미팅에 건 원단 중 선택된 비율 |
| 누적 지표 | 전사 대비 탭에서만. 분모가 달라 섞지 않는다 |
| 첫 화면 | 바이어 탭 |
| 담당자 | 이름을 화면에 세우지 않는다. 팀 합계와 연도별만 |
| 분석 기간 | 최근 12개월 |
| 폐기 리스트 | `Customer=Hansoll`은 전량 제외. 수집 단계에서 걸러진다 |
| 주간 | KPI + 바이어 10곳. 104주 보관 |
| 월간 | 전자동 생성 후 편집. 무기한 보관 |
| 출력 | 브라우저 인쇄로 PDF 저장. 라이브러리 금지 |
| 확대 1순위 | Kohl's. Talbots는 미팅 구조상 제약이 있어 참고 지표 |
| Gender | Women's 확대. Men's와 Girl's는 현 수준 유지 |
| Poly/Spandex | 우리 영역이 아니다. 확대 대상에서 제외 |
| 중량 | 변별력이 낮아 추천 매칭에서 제외. 정보 표시만 |

## 반드시 알아야 할 함정

**폐기 리스트를 빼지 않으면 숫자가 부풀려진다.** `Customer=Hansoll`인 미팅은 원단 폐기 목록을 만들려고 판 임시 폴더다.
미팅 57건에 불과하지만 한 건에 원단 수백 개가 들어 있어 **팀 픽업의 21%, 팀 노출의 11.8%**가 여기서 나왔다.
빼면 팀 히트율이 31.0%에서 26.7%로 내려간다. FL 원장의 `MeetingCount`와 `PickupCount`에도 섞여 있으므로 건별로 차감해야 한다.

**한 달 표본으로 판단하면 안 된다.** 7월만 보면 Walmart 팀 픽업률이 70.7%인데 12개월로는 18.0%다.
대형 미팅 한 건이 월 단위 수치를 통째로 흔든다. 판단은 12개월 기준으로 한다.

**신규 원단의 낮은 수치는 실패가 아니다.** 원단은 1~2년에 걸쳐 성숙한다.
등록 후 0~3개월 히트율이 20%, 7년 넘은 것이 38%다. 스와치를 5년 보관하는 동안 계속 걸리기 때문이다.
나이를 보정하지 않고 담당자나 시기를 비교하면 최근 개발이 항상 나빠 보인다.

**오더 전환률로 팀을 평가하면 안 된다.** 업계 통상이 2~3%이고 5%면 최상위다.
우리 팀은 픽업 대비 3.8%로 정상 범위다. 가격이 오를수록 픽업률은 오르고 오더는 떨어진다.
$4~5 구간은 픽업률 43.2%인데 오더는 2.5%, $5 이상 118건은 오더가 0건이다. 기능성 개발 팀의 구조적 특성이다.

**동명이인이 많다.** RDDA 사용자 마스터에 김지현이 6명, 이종현이 3명이다.
담당 필터는 `inCharge={사번}`이고 이름이 아니다. 팀원 사번은 수집 스크립트 맨 위 `TEAM` 배열에 있다.

## 수집 API 요약

| 용도 | 엔드포인트 | 비고 |
|---|---|---|
| FL 원장 | `POST /Fabric/GetFabricLibraryList` | 85,415건. 20,000건씩 5회, 회당 10초 |
| 담당 필터 | 위에 `inCharge={사번}` | 이름 아님 |
| 미팅 | `POST /Meet/GetMeetingList` | 6,069건 |
| 제안 원단 | `POST /Meet/GetMeetProjectSampleList` | `meetid`, `librarytype=Fabric`. 미팅당 1회. 711건에 6초 |
| 픽업 | `POST /Pickup/GetPickupList` | 2,442건 |
| 픽업 상세 | `POST /Pickup/GetPickupGarmentList` | `pickupID`, `libraryType=Fabric` |
| 사용자 | `GET /USer/GetUserCombo` | 소속팀 포함 2,200명 |

모두 세션 쿠키로 인증한다. 자동화하려면 연동 계정이 필요하므로 **주 1회 수동 실행**으로 간다.

## 남은 판단

- 37~48개월 구간 히트율이 18~19%로 꺼진다. 나이 효과인지 2021~2023년 코호트 특성인지 미판별. 미팅 제안 이력을 전량 수집하면 갈린다.
- 시즌 강약(Fall 강세, Summer·Holiday 약세)은 한 해 데이터라 판단 보류. 숫자만 표기 중.
- 예측 모델은 두 시즌 이상 쌓인 뒤에. 지금은 대조만 한다.
