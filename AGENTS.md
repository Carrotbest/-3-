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
5. FL 집계는 `mergedFlRegistrations`: 월 컷오프 없다. 대장 전체 + DD에만 있는 FL, 동일 FL은 1건(대장 우선).
6. 커밋·푸시·배포는 사용자 지시가 있을 때만 한다.
7. 검증은 `npm run build` 하나로 끝낸다. 모든 수정을 마친 뒤 한 번만 돌린다.

## 읽지 않는 것

토큰을 가장 크게 먹는 건 큰 파일을 통째로 읽는 일이다. 다음은 열지 않는다.

- `public/data/**` — `archive.json` 2.5MB, `feed.json` 400KB다. 한 번 읽으면 그 실행이 끝난다
- `node_modules/`, `dist/`, `*.xlsx`, `package-lock.json`
- `legacy/`, `legacy-vanilla/`, `backup/`

값을 꼭 확인해야 하면 전문을 읽지 말고 `jq`나 줄 수 세기로 필요한 수치만 뽑는다.

`docs/codex/R*.md`는 지시서가 지목한 것만 읽는다. 전체를 훑지 않는다.

## 탐색을 줄인다

지시서에 파일 경로와 함수명이 적혀 있으면 저장소를 뒤지지 말고 그 파일부터 연다.
경로가 없을 때만 검색한다.

큰 파일은 전문 대신 해당 함수 주변만 읽는다. `TrendFabric.tsx`, `derive.ts`처럼
1,000줄 넘는 파일이 여럿이다.

같은 오류를 두 번 고쳐서 실패하면 멈춘다. 세 번째 시도를 하지 말고 무엇이 막혔는지 보고한다.
막힌 상태로 계속 도는 것이 가장 비싸다.

## 보고

수정 파일 목록, 검증 결과, 판단이 필요한 지점만 쓴다.
바꾼 코드를 보고에 다시 붙이지 않는다. 요청자가 파일에서 직접 본다.
잘한 점을 나열하지 않는다. 못 한 것이 있으면 그것만 명확히 쓴다.
