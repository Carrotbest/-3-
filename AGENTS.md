# AGENTS.md — Fabric R&D 작업 규약

한솔섬유 통합원단부 3팀 React 업무 플랫폼. 현재 상태는 `CLAUDE.md`를 먼저 보고, 필요한 과거 지시서만 `docs/codex/R*.md`에서 선택해 읽는다.

## 현재 구조

- 위치 `C:\Users\hkpark\Desktop\fabric-rnd`, 브랜치 `main`.
- React 18 · TypeScript · Vite · Zustand · Recharts · Tailwind v4 · SheetJS.
- 실행 `npm run dev`, 검증 `npm run build`; base `/-3-/`, 해시 라우터.
- `legacy/`, `legacy-vanilla/`, `backup/`은 현재 구현이 아니므로 열거나 수정하지 않는다.

## 작업 원칙

1. 사용자 요청 범위만 수정하고 기존 미커밋 변경을 보존한다. reset/checkout으로 되돌리지 않는다.
2. 실데이터·캐시·단가·협력사명은 로그, 문서, Git, 공개 파일에 넣지 않는다.
3. 새 패키지·아키텍처·데이터 계약은 필요성이 명확할 때만 도입하고 영향 범위를 먼저 보고한다.
4. Firebase/TS 동기화 수정 전 Claude 메모리 `fabric-rnd-ts-sync-incident`를 읽는다.
5. RDDA/FL 집계는 `mergedFlRegistrations`: 2026-07까지 대장, 2026-08부터 DD, 동일 FL 1건(대장 우선).
6. 커밋·푸시·배포는 사용자 지시가 있을 때만 한다.
7. 검증은 변경 규모에 맞게 `npm run build`와 필요한 테스트를 수행한다. 브라우저가 가능하면 해당 라우트도 확인한다.

## 보고

완료 시 수정 파일, 검증 결과, 남은 위험/판단 지점만 간결히 알린다.
