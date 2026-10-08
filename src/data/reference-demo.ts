import type { ReferenceItem } from "@/data/reference-schema"

export const REFERENCE_DEMO: ReferenceItem[] = [
  {
    id: "demo-01", title: "원사 번수와 데니어 환산 기초", category: "fundamentals", format: "pdf", tags: ["원사", "교육"],
    sizeBytes: 412_000, documentDate: "2025-07-18", modifiedAt: "2025-07-18", owner: "박향근",
    excerpt: "번수와 데니어의 정의를 비교하고 기본 환산식을 정리한 입문 자료입니다. 원사 규격을 빠르게 읽는 예시를 함께 담았습니다.",
  },
  {
    id: "demo-02", title: "편직기 게이지와 침수의 이해", category: "fundamentals", format: "pptx", tags: ["편직", "교육"],
    sizeBytes: 5_800_000, documentDate: "2025-09-04", modifiedAt: "2025-09-08", owner: "김지현",
    excerpt: "게이지와 침수의 관계를 편직 구조별로 설명합니다. 사양 검토에 필요한 기본 확인 항목을 예시로 제시합니다.",
  },
  {
    id: "demo-03", title: "염색 공정 단계별 관리 기준", category: "process", format: "pdf", tags: ["염색", "기준"],
    sizeBytes: 2_300_000, documentDate: "2025-11-12", modifiedAt: "2025-11-20", owner: "변재휘",
    excerpt: "전처리부터 수세까지 단계별 관리 포인트를 정리했습니다. 공정 조건을 기록할 때 확인할 기준도 포함합니다.",
  },
  {
    id: "demo-04", title: "후가공 온도와 폭 관리", category: "process", format: "pptx", tags: ["가공", "기준"],
    sizeBytes: 8_900_000, documentDate: "2026-01-15", modifiedAt: "2026-01-17", owner: "박향근",
    excerpt: "텐터 온도와 폭 설정이 완제품 물성에 미치는 영향을 설명합니다. 조건 변경 전후의 점검 순서를 함께 정리했습니다.",
  },
  {
    id: "demo-05", title: "편직 침수 역산 추정", category: "process", format: "docx", tags: ["편직", "기준"],
    sizeBytes: 780_000, documentDate: "2026-02-06", modifiedAt: "2026-02-12", owner: "김지현", needsReview: true,
  },
  {
    id: "demo-06", title: "세로줄 불량 사례와 원인 분석", category: "quality", format: "pptx", tags: ["편직", "사례"],
    sizeBytes: 39_400_000, documentDate: "2026-03-24", modifiedAt: "2026-03-28", owner: "변재휘", needsReview: true,
    excerpt: "세로줄 외관 불량의 대표 유형과 발생 지점을 사례 중심으로 살펴봅니다. 원인 후보를 좁히는 점검 흐름을 제공합니다.",
  },
  {
    id: "demo-07", title: "백색 원단 색차 발생 사례", category: "quality", format: "pptx", tags: ["염색", "사례"],
    sizeBytes: 12_600_000, documentDate: "2026-04-09", modifiedAt: "2026-04-10", owner: "박향근",
    excerpt: "백색 원단에서 관찰되는 색차 사례를 광원과 공정 조건별로 정리했습니다. 재현 확인 시 필요한 비교 기준을 담았습니다.",
  },
  {
    id: "demo-08", title: "재생 폴리에스터 기술 자료", category: "materials", format: "pdf", tags: ["소재", "벤더자료"],
    sizeBytes: 3_700_000, documentDate: "2026-05-19", modifiedAt: "2026-05-22", owner: "김지현",
    excerpt: "재생 폴리에스터의 제조 방식과 주요 특성을 소개합니다. 일반 폴리에스터와 비교할 때 확인할 항목을 요약했습니다.",
  },
  {
    id: "demo-09", title: "항균 가공제 비교 자료", category: "materials", format: "pdf", tags: ["가공", "벤더자료"],
    sizeBytes: 1_500_000, documentDate: "2026-06-11", modifiedAt: "2026-06-16", owner: "변재휘",
  },
  {
    id: "demo-10", title: "셀룰로오스계 신소재 개요", category: "materials", format: "pptx", tags: ["소재", "벤더자료"],
    sizeBytes: 18_200_000, documentDate: "2026-07-07", modifiedAt: "2026-07-13", owner: "박향근",
    excerpt: "셀룰로오스계 신소재의 원료와 생산 특성을 개괄합니다. 혼용 설계와 가공에서 살펴볼 포인트를 정리했습니다.",
  },
  {
    id: "demo-11", title: "면 수급 동향 보고", category: "market", format: "pdf", tags: ["시장"],
    sizeBytes: 960_000, documentDate: "2026-08-21", modifiedAt: "2026-08-25", owner: "김지현",
    excerpt: "주요 산지의 면 공급 흐름과 수요 변화를 요약한 자료입니다. 시장 변동을 검토할 때 참고할 지표를 담았습니다.",
  },
  {
    id: "demo-12", title: "지속가능 인증 체계 정리", category: "market", format: "xlsx", tags: ["인증", "기준"],
    sizeBytes: 128_000, documentDate: "2026-09-14", modifiedAt: "2026-09-18", owner: "변재휘",
  },
]
