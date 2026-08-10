# 작업지시 R9 — 완료 샘플 라이브러리 (DEVELOPMENT 탭)

전제: `docs/REACT_REBUILD.md`. 검증 `npx tsc --noEmit` + `npm run build`. 토큰 색만. React 18 forwardRef 확인.
동적 부품 재사용(`src/components/motion`, `src/lib/motion.ts`).

사용자 요구: 완료된 샘플 현황을 라이브러리 형태로. 공정 data(편직/염색/가공/remark)와
in-house data(폭/중량/축률/필링 등)를 포함. 위치는 **DEVELOPMENT 안의 탭**.

## 1. 데이터 모델 확장 (src/data)

### schema.ts
- `interface CompletedSample` 추가:
  ```ts
  {
    styleNo: string; flNo: string; season: string; category: string;
    buyer: string; owner: string; construction: string;
    process: { knit: string; dye: string; finish: string; remark: string };   // 공정 data
    inhouse: { widthCm: number; weightGsm: number; shrinkagePct: number; pilling: number };  // in-house 물성
    completedAt: string;   // ISO
  }
  ```
  (pilling 은 등급 1~5, shrinkage 는 % , width cm, weight g/m²)

### sample.ts
- `sampleCompleted(n=24)` 추가: 시드 고정 더미. 완료 샘플만.
  process/inhouse 값은 그럴듯한 범위로(예: widthCm 150~190, weightGsm 110~340, shrinkagePct -2~4, pilling 3~5).
  기존 `sampleRecords` 의 완료 건과 겹치는 styleNo 를 일부 사용해도 됨. **실제 값·협력사명 지어내지 마라**(더미 표시).
- store 초기화(main.tsx)에서 `completed` 상태에 넣는다. store 키 `completed: CompletedSample[]` 추가.

## 2. DEVELOPMENT 탭 추가

- 현재 목록/보드/타임라인 탭 옆에 **"완료 샘플"** 탭 추가.
  단, 이 탭은 카테고리 리스트(eu/season/core/project)에서만 의미가 있는 게 아니라 전체 완료 샘플 아카이브다.
  → overview 대시보드는 그대로 두고, **완료 샘플 탭은 항상 전체 completed 를 보여준다**(카테고리 필터는 탭 내부 필터로).

## 3. 완료 샘플 라이브러리 UI (src/components 또는 routes 내부)

- **상단 필터/검색 바**: 검색(Style/FL/조직) + select(시즌·카테고리·조직·바이어) + 물성 범위(중량·폭) 슬라이더/입력(선택).
- **갤러리 카드 그리드**: 카드마다 썸네일 자리(placeholder 박스, 이미지 없음) + Style No. / FL No. / 조직 / 중량 g/m² / 시즌 배지.
  `hoverLift` + `Reveal` 순차. 21st Galleries/Cards 패턴.
- **카드 클릭 → Sheet 상세**(기존 `src/components/ui/sheet.tsx` 재사용, forwardRef 버전):
  상단 식별정보 + **Tabs 2개**:
  - **공정** 탭: 편직 / 염색 / 가공 / Remark (라벨-값 목록)
  - **물성(in-house)** 탭: 폭 / 중량 / 축률 / 필링 — 값 + 간단한 기준 대비 표시(예: 필링 4↑ 양호). 표 형태.
- 완료 샘플이 없으면 emptyState.

## 4. 목적 문구
라이브러리 상단에 한 줄: "완료된 샘플의 공정·물성 이력입니다. 재개발 전 유사 조직·물성을 여기서 확인하세요."

## 규칙
- schema/sample/store/main 은 이 기능에 필요한 범위만 확장(기존 필드·동작 깨지 말 것).
- 다른 화면 수정 금지. MutationObserver 금지. 새 npm 금지(슬라이더 필요하면 기존 select/input 로 대체). 커밋 금지.

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE / TYPES / DERIVE·STORE 변경 / BUILD / NOTES.
