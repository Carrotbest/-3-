# R34 — DEVELOPMENT Overview: Schedule Alerts 제거 → 전체 완료 샘플로 교체

## 목적
DEVELOPMENT 오버뷰(`/development`) 하단의 **"Schedule Alerts" 섹션을 삭제**하고, 그 자리에
하위탭(EU/Season/Core/Project)의 "완료 샘플" 탭과 동일한 **전체 현황 완료 샘플 뷰**(`CompletedSampleLibrary`)를 배치한다.

대상: `src/routes/Development.tsx` **한 파일로 한정**. 다른 화면/컴포넌트 변경 금지.

## 배경(현재 코드)
- `Development()` 라우터: `overview`면 `DevelopmentOverview`, `workspace`면 마스터, 그 외(EU/Season/Core/Project)는 `DevelopmentList` 렌더.
- `DevelopmentList`의 "완료 샘플" 탭(`view === "completed"`)은 이미 `<CompletedSampleLibrary records={records} samples={completed} />` 로 **전체(전 카테고리)** 완료 샘플 캘린더+테이블을 보여준다.
- `DevelopmentOverview({ records })` 하단에 `SectionCard title="Schedule Alerts"` 섹션이 있고, 관련 상태/컴포넌트가 붙어 있다.

## 변경 내용 (`DevelopmentOverview` 및 관련 정리)

1. **완료 샘플 데이터 확보**: `DevelopmentOverview` 안에서 완료 샘플을 읽는다.
   - `const completed = useAppStore((state) => state.completed)` 추가(이미 파일에서 `useAppStore` 사용 중).

2. **"Schedule Alerts" 섹션 삭제**: `DevelopmentOverview` 반환 JSX에서 `SectionCard title="Schedule Alerts" … </SectionCard>` 블록 전체 제거.

3. **그 자리에 전체 완료 샘플 뷰 삽입**: 삭제한 위치(Categories 섹션 바로 다음)에 아래를 렌더한다.
   ```tsx
   <CompletedSampleLibrary records={records} samples={completed} />
   ```
   - `records`는 오버뷰가 받은 전체 records(진행중 필터 `active`가 아니라 원본 `records`)를 그대로 전달 → 전체 현황.
   - `CompletedSampleLibrary`는 자체적으로 "완료 캘린더"·"전체 완료 샘플" SectionCard를 렌더하므로 추가 래핑/제목 불필요.

4. **이 기능 전용 잔여 코드 정리**(오버뷰에서만 쓰이던 것들):
   - `const schedule = useMemo(() => scheduleAlerts(records), [records])` 제거.
   - `const [alertDetail, setAlertDetail] = useState<HomeKpiDetailRow | null>(null)` 제거.
   - 반환부의 `<ScheduleAlertSheet alert={alertDetail} … />` 렌더 제거.
   - **`ScheduleAlertSheet` 컴포넌트 정의 자체 제거**(다른 곳에서 사용하지 않음 — 파일 내 유일 사용처가 오버뷰).
   - 그 결과 미사용이 되는 import 제거: `scheduleAlerts`(@/data/…), `HomeKpiDetailRow` 타입 import.
   - **주의**: `fmtDate`는 `displayField` 등 다른 곳에서 계속 사용되므로 **제거하지 말 것**. `CategoryStyleSheet`·`ScheduleAlertSheet` 외 다른 컴포넌트/헬퍼는 건드리지 말 것.
   - `import`에서 실제로 더 이상 참조되지 않는 심볼만 지운다(다른 곳 사용 여부 grep 확인 후).

## 검증
- `npm run build`(tsc + vite) 통과, 미사용 심볼/깨진 import 없음.
- `/development`(오버뷰) 하단에 "Schedule Alerts"가 사라지고, "완료 캘린더" + "전체 완료 샘플" 표가 나타난다(전 카테고리 기준, 하위탭 완료 샘플과 동일 컴포넌트).
- 오버뷰 상단(총 개발·유형·접수현황·4공정 KPI·담당자별·Categories)은 그대로 유지.
- EU/Season/Core/Project 하위탭의 "완료 샘플" 탭은 기존과 동일하게 동작(회귀 없음).
- 카테고리 카드 클릭 → 대표 스타일 팝업(`CategoryStyleSheet`) 정상 동작.

## 절대 금지
- `DevelopmentList`·`DevelopmentMasterPage`·`CompletedSampleLibrary`·`DevelopmentDetailSheet` 내부 로직 변경 금지(오버뷰 배치/정리만).
- 다른 라우트/레이아웃(R32·R33 결과)·DD 마스터 시트 변경 금지.
- git commit/reset/checkout 금지. 실제 데이터 값을 로그·문서에 남기지 말 것.
