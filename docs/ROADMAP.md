# ROADMAP — redesign v2

브랜치 `redesign/v2`. `main`은 현행 사이트가 그대로 살아 있다.
1차 8개 화면이 다 서고 팀 검토를 통과하면 병합한다.

## 역할 분담

| | 맡는 일 |
|---|---|
| **Claude** (지휘) | 아키텍처·계약 정의, `index.html`, `core/`, `data/`, `ui/widgets.js`, 통합·리뷰·커밋 |
| **Codex** (구현) | 지시서 단위 구현 — CSS 3종, `ui/table.js`·`chart.js`, 개별 화면 모듈 |

Codex에 넘기는 단위는 항상 `docs/codex/NN-*.md` 작업지시서 하나로 떨어진다.
지시서에는 (1) 맡을 파일 (2) 읽을 파일 (3) 계약 (4) 확인 항목이 반드시 들어간다.
Codex가 계약을 바꿔야 한다고 판단하면 코드를 고치지 않고 보고만 하며, 판단은 Claude가 한다.

## 단계

### 1단계 — 뼈대 (진행 중)
- [x] 저장소 정리 (`legacy/`로 구버전 격리), 브랜치 분리
- [x] 아키텍처·계약 문서, Codex 규약(AGENTS.md)
- [x] 디자인 토큰, `core/`(router·store·dom·format), `data/`(schema·sample·derive)
- [x] `data/tds-loader.js`, `data/reconcile.js` — 합계 대조 5종
- [x] 앱 셸(`index.html`), `main.js`, `ui/widgets.js`, HOME 화면
- [x] `01-css` — base·layout·components *(Codex, 검수 통과)*
- [x] `02-table-chart` — 데이터테이블·차트 래퍼 *(Codex, 검수 통과)*
- [x] 라우터 누수 수정 — 같은 뷰의 서브 라우트 전환 시 `unmount()` 누락

### 2단계 — 1차 8개 화면
- [x] DEVELOPMENT (Overview / EU Market / Season / Core / Project 서브) *(Codex, 검수 통과)*
- [ ] TS 관리
- [ ] STUDY 과제 (진행 현황 / 자료 라이브러리)
- [ ] 동기화 상태
- [ ] CALENDAR
- [ ] RDDA REPORT
- [ ] SETTING

### 3단계 — 실데이터 연결
- [ ] 실제 TDS 파일로 파싱·대조 검증 (헤더 표기 흔들림 흡수 확인)
- [ ] 대조 실패 시나리오 확인 — 화면에 이전 값이 남고 사유가 뜨는지
- [ ] 민감 필드(단가·협력사) 잠금 동작 확인

### 4단계 — 마감
- [ ] 접근성 점검 (키보드·대비·스크린리더 레이블)
- [ ] 성능 (500행 표, 차트 6종 동시)
- [ ] 팀 검토 → `main` 병합 → GitHub Pages 반영

## 결정 사항

- **빌드 없음.** ES 모듈 그대로 GitHub Pages에 올린다.
- **공개 저장소 + 민감정보 분리.** 저장소에는 더미(`data/sample.js`)만 둔다.
  실데이터는 사용자가 TDS를 연 세션 메모리에만 존재하고 커밋되지 않는다.
- **웹은 조회 전용.** 개발 건 수정 기능을 만들지 않는다. 원본은 TDS 엑셀.
- **합계 미통과 데이터는 렌더 안 함.** `reconcile()`이 `passed:false`면 이전 값을 유지한다.

## 실행

```bash
python -m http.server 5173 --directory fabric-rnd
```
