import { analysisLeadDays } from "./fabric-analysis"
import type { AnalysisRequest } from "./schema"

export type AnalysisPrintMode = "request" | "report"

const text = (value: string | number | undefined | null): string => {
  const out = String(value ?? "").trim()
  return out || "-"
}

/** 어떤 종이가 나갈지. 완료 건은 리포트, 그 밖에는 의뢰서다. 버튼이 하나라 여기서 갈린다. */
export function analysisSheetMode(item: AnalysisRequest): AnalysisPrintMode {
  return item.state === "완료" ? "report" : "request"
}

/** 취소 건은 종이로 내보내지 않는다. */
export function isAnalysisPrintable(item: AnalysisRequest): boolean {
  return item.state !== "취소"
}

/** 상단 짧은 칸. 네 칸씩 세 줄로 앉는다. 라벨은 AX 리캡 열 이름을 그대로 쓴다. */
export function analysisHeadFields(item: AnalysisRequest): [string, string][] {
  return [
    ["Requester", text(item.requester)],
    ["Department", text(item.department)],
    ["Customer", text(item.customer)],
    ["Brand", text(item.brand)],
    ["Season / Year", text(item.season)],
    ["Gender / Age", text(item.gender)],
    ["Objective", text(item.objective)],
    ["Source", text(item.source)],
    ["Source code", text(item.sourceCode)],
    ["Construction", text(item.construction)],
    ["Fabric content", text(item.contents)],
    ["Weight (gsm)", item.weight === "" ? "-" : String(item.weight)],
  ]
}

/** 전폭 한 줄로 내리는 긴 글. */
export function analysisNoteLines(item: AnalysisRequest): [string, string][] {
  return [
    ["Request item", text(item.description)],
    ["Comment (Requester)", text(item.requesterComment)],
  ]
}

/** 리포트 결과 칸. 의뢰 때 적힌 값과 RND 결과를 나란히 둔다. */
export function analysisResultFields(item: AnalysisRequest): [string, string][] {
  return [
    ["In charge", text(item.inCharge)],
    ["Construction (RND)", text(item.constructionRnd)],
    ["Weight (RND, gsm)", item.weightRnd === "" ? "-" : String(item.weightRnd)],
    ["Construction (의뢰)", text(item.construction)],
    ["Fabric content (의뢰)", text(item.contents)],
    ["Weight (의뢰, gsm)", item.weight === "" ? "-" : String(item.weight)],
  ]
}

/** 의뢰서 아래 손으로 적는 결과 칸의 이름. 웹 입력 칸과 같은 이름이라 옮겨 적기 쉽다. */
export const ANALYSIS_WRITE_LINES = ["Yarn description", "Construction", "Weight (gsm)", "Comment (RND)"] as const

export function analysisLeadText(item: AnalysisRequest): string {
  const days = analysisLeadDays(item)
  return days == null ? "-" : `${days}일`
}

/** 꼬리말에 찍는 출력 시각. 언제 뽑은 종이인지 알아야 한다. */
export function analysisPrintStamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * 인쇄에 올릴 사진 경로. 의뢰서는 시료 사진 1장(참고 사진 칸에 앉는다),
 * 리포트는 시료 사진 + 분석 사진이다. 썸네일은 400px이라 인쇄에 쓰지 않는다.
 */
export function analysisPrintImages(item: AnalysisRequest, mode: AnalysisPrintMode): string[] {
  if (mode === "request") return item.imagePath ? [item.imagePath] : []
  return [item.imagePath, ...(item.resultImages ?? []).map((image) => image.imagePath)]
    .filter((path): path is string => Boolean(path))
}
