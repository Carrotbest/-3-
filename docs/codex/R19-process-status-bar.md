# 작업지시 R19 — 담당자별 현황 PROCESS STATUS 막대 재설계

파일: `src/routes/Development.tsx` (DevelopmentOverview 의 "담당자별 현황" 카드).
검증: `npx tsc --noEmit` + `npm run build`. 커밋 금지. 다른 화면·로직 훼손 금지.

## 문제
현재 PROCESS STATUS 는 4개 공정(미접수/편직대기/염색중/등록대기)을 **하나의 그라데이션 누적 막대**로 그려서 구간 경계·수치가 눈에 안 들어온다. (`PROCESS_SEGMENT_CLASS` 의 `bg-gradient-to-r`, 높이 h-3 단일 바.)

## 요구
- **그라데이션 제거 → 솔리드(단색) 막대**로 명확하게. 각 공정이 또렷이 구분되게.
- 누적 단일바보다 **각 공정을 개별 막대로 보여주는 편이 명확**하면 그렇게(예: 4개 미니 바 그룹 / 가로 바 리스트). 판단은 맡김. 핵심은 "한눈에 어느 공정에 몇 건인지".
- 수치(count)·라벨은 유지. 공정별 고정 색은 토큰 사용(원사/편직/염색/피니쉬 대응: `--chart-1~4`). 상태별 매핑: 미접수=chart-1, 편직대기=chart-2, 염색중=chart-3, 등록대기=chart-4 (또는 더 읽기 쉬운 조합).
- **디자인·동적 UI 를 고급스럽게**: 마운트 시 막대가 자라나는 애니메이션(기존 `AnimatedBar` 활용 가능), 호버 시 해당 공정 강조/툴팁, 미세한 그림자·라운드·정렬. 과하지 않게(모더레이트+). `prefers-reduced-motion` 존중.
- 0건 구간도 시각적으로 표현(빈 트랙 또는 옅은 색)해 "0"이 분명히 보이게.
- 반응형: 좁은 폭에서도 라벨·수치가 겹치지 않게.

## 참고
- 담당자 데이터: `owner.process = [{ key, label, count, pct }]` (key: unreceived/knitting/dyeing/registration).
- 기존 `AnimatedBar`(width 애니메이션)·`hoverLift`·shadcn 카드 톤·차트 토큰을 재사용. 새 npm 금지.
- **연결된 MCP(디자인/컴포넌트 도구 등)가 있으면 적극 활용**해 룩을 다듬어도 좋다.

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE / 새 컴포넌트·수정부 / 시각 방식(개별바 vs 누적) / 애니메이션·인터랙션 / TSC·BUILD / NOTES.
