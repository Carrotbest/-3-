# 작업지시 R5 — 전역 스타일 다듬기 (글자 축소 + 사이드바 세련화)

전제: `docs/REACT_REBUILD.md`. R0~R3 완료, 8개 화면 동작 중. 검증은 `npx tsc --noEmit` + `npm run build`.

사용자 피드백:
> 전반적으로 글자 포인트가 크다. 조금만 낮춰줘. 네비게이터(사이드바)와 각 항목들을 더 세련된 컬러와
> ACTIVE한 동적 요소로.

## 맡을 파일

- `src/index.css` (전역 타이포 스케일 조정)
- `src/components/layout/AppSidebar.tsx` + 필요한 사이드바 전용 스타일
- `src/components/layout/Topbar.tsx` (필요 시 미세 조정)
- 개별 화면(routes/*)·데이터 로직은 **건드리지 마라.**

## 1. 글자 크기 — 전반적으로 한 단계 낮춤 (과하지 않게)

- `html { font-size: 15px }` (기본 16 → 15). rem 기반이라 전체가 ~6% 작아진다.
- 페이지 제목이 특히 크다: `PageHeader` 의 제목을 현재보다 한 단계 작게
  (예: `text-3xl`/`text-2xl` → `text-xl`, `font-semibold` 유지). 부제는 `text-sm` → `text-[13px]` 수준.
- StatCard 의 큰 숫자도 살짝만 축소(예: `text-3xl` → `text-2xl`). KPI 라벨·캡션은 그대로.
- **본문 가독성은 유지.** 12px 미만으로 내리지 마라. 표 셀은 `text-sm` 유지.
- 토큰만 사용. 임의 hex 금지.

## 2. 사이드바 세련화 + ACTIVE 동적 요소

레퍼런스(shadcn admin)의 절제된 느낌은 유지하되, 활성/호버에 생기를 준다.

- **활성 항목**: 배경 `bg-sidebar-accent` + **좌측 2~3px 강조 바**(accent 색, `--primary` 또는 차트 오렌지 톤)
  + 아이콘·텍스트 색 강조. 좌측 바는 `transition` 으로 부드럽게 나타나게.
- **호버**: 배경 옅게(`hover:bg-sidebar-accent/60`), 아이콘 살짝 확대(`scale-105`) 또는 좌측 이동 등
  미세 모션. `transition-colors`/`transition-transform` + `--t-fast`.
- **그룹 라벨**(GENERAL/TECHNICAL SERVICES…): 자간 넓히고 더 옅게(`text-[10px] tracking-wider text-muted-foreground/70`).
- **DEVELOPMENT 접기/펼치기**: chevron 회전 애니메이션, 하위 항목 열릴 때 높이 트랜지션.
- **브랜드 영역**: 상단 "F" 아바타에 은은한 그라디언트(토큰 `--chart-1`→`--chart-2` 정도) 한 겹.
- `prefers-reduced-motion` 존중: 모션 줄이기 시 트랜지션 최소화.
- 접근성: 활성 항목 `aria-current="page"` 유지, 포커스 링 유지.

## 하지 말 것

- 다크/라이트 토큰 값 변경(색 팔레트는 그대로), 화면 로직 수정, 새 npm 설치.
- 사이드바를 과하게 화려하게(네온·큰 그림자 남발) 만들지 마라. "세련되게 절제" 가 목표다.

## 검증
`npx tsc --noEmit` + `npm run build`. 브라우저 확인은 Claude 가 한다.

## 보고
```
DONE: <파일>
CHANGES: <글자 스케일 변경 요약 / 사이드바에 넣은 동적 요소>
BUILD: <결과>
NOTES: <판단 필요 지점>
```
커밋하지 마라.
