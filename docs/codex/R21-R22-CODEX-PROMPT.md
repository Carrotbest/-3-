# Codex 전달용 지시문 (복사해서 Codex에 붙여넣기)

아래 블록을 그대로 Codex Desktop에 붙여넣으면 된다.

---

```
작업 폴더: C:\Users\hkpark\Desktop\fabric-rnd

두 개의 작업지시서를 순서대로 구현해줘. 반드시 R21 → R22 순서다.

1) docs/codex/R21-dd-schema-extension.md  ← 먼저. DD 64컬럼 파서/스키마 확장
2) docs/codex/R22-development-subpages.md ← 그 다음. EU/SEASON/CORE/PROJECT 화면 개편

각 문서를 처음부터 끝까지 읽고 그대로 따라라. 문서에 실제 원본 엑셀을 열어
전수 조사한 컬럼 인덱스 표와 검증 수치가 들어있으니 추측하지 말고 그 표를 써라.

공통 규칙:
- CLAUDE.md 를 먼저 읽어라. 프로젝트 상태와 금지사항이 들어있다.
- 검증: npm run build (= tsc --noEmit && vite build) 통과해야 한다.
- 개발 서버는 npm run dev, base 경로는 /-3-/ 다. (예: http://localhost:5175/-3-/)
- 사용자의 실제 데이터 값(스타일번호·거래처명·컬러 등)을 로그·커밋·문서에 남기지 마라. 건수/비율만.
- 커밋하지 마라. git reset/checkout 으로 기존 변경을 되돌리지 마라.
- 샘플관리대장 파서(SAMPLE_DEFAULT_COLUMNS, parseSamples)는 건드리지 마라. RDDA 집계가 물려 있다.
- 기존 FIELDS 17개 항목의 순서·라벨을 바꾸지 마라.
- HOME 화면과 DEVELOPMENT 오버뷰(/development)는 이번 대상이 아니다. 회귀시키지 마라.

R21 완료 후 아래 수치로 자체 검증하고 결과를 보고해라 (실제 DD 업로드 후):
- 파싱 레코드 82행
- Status 분포: 진행중 61 / 완료 12 / HOLD 3 / DROP 3 / REJECT 3
- tech.mills.yarn/knitting/dyeing 채움률 ≈100%, finishing ≈93%
- tech.yarnDetail ≈100%
- tech.actual.width/weight ≈17% (14건)
- tech.optionProgress ≈100%
수치가 다르면 별칭/인덱스가 틀린 것이다. 담당자 시트는 '담당' 컬럼이 없어
전체현황 대비 컬럼이 1칸 앞으로 밀린다는 점을 꼭 확인해라.

R22 완료 후에는 각 요구사항(1~6)별로 무엇을 어떻게 구현했는지,
그리고 문서 맨 아래 "Claude 최종 검토 체크리스트" 항목별 상태를 보고해라.
```

---

## 이후 절차

1. Codex가 R21 완료 → 사용자가 실제 DD 업로드 → Codex 자체 검증 수치 보고
2. Codex가 R22 완료
3. **Claude 최종 검토**: `npm run build`, 브라우저 실동작, 체크리스트 대조, HOME/오버뷰 회귀 확인
