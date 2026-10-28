/**
 * FABRIC ANALYSIS 완료 건을 DEVELOPMENT REQUEST 스타일로 옮기는 매핑(R352).
 *
 * 분석 → 의뢰 → 현황 → 원가 → 창고를 한 줄로 잇는 것이 기획 의도인데 분석과 의뢰 사이만
 * 끊겨 있었다. 사람이 의뢰 화면에서 값을 다시 쳤고 분석 번호도 남지 않았다.
 *
 * 여기는 순수 함수만 둔다. 저장은 하지 않는다. 요청 저장은 `FabricRequest.tsx`의
 * `commitRequests` 하나를 지나야 하고, 그 함수는 컴포넌트 안에 있다.
 *
 * 웹으로 바로 넘기는 길과 엑셀로 받는 길이 **같은 매핑을 본다.** 두 길의 결과가 다르면
 * 받아 본 사람이 어느 쪽이 맞는지 알 수 없다.
 */
import type { AnalysisRequest, RequestOption, RequestStyle } from "./schema"

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export interface AnalysisTransferOptions {
  /** 받을 보드. 엑셀 경로는 보드가 없으므로 빈 문자열이다. */
  boardId: string
  /** 보드 이름. 엑셀 경로는 빈 문자열이다. */
  chart: string
  seq: number
}

/**
 * 분석 1건 → 스타일 1건.
 *
 * 옵션은 빈 줄 하나만 만든다(2026-10-28 박향근 확정). 개발 목표 사양은 분석값과 다를 수 있어
 * 사람이 직접 적는다. `yarnDetail`, `construction`, `weight`에 분석 결과를 넣지 말 것.
 *
 * `garmentNo`에는 분석의 `sourceCode`를 넣는다(R353).
 * `developer`도 비운다. R&D 개발 담당은 분석 담당(`inCharge`)과 다른 사람일 수 있다.
 */
export function buildRequestStyleFromAnalysis(item: AnalysisRequest, opts: AnalysisTransferOptions): RequestStyle {
  const now = new Date().toISOString()
  const reqId = newId()
  const option: RequestOption = {
    optId: `${reqId}#1`,
    lineId: newId(),
    no: 1,
    yarnDetail: "",
    construction: "",
    weight: "",
    color: "",
    dyeingMethod: "",
  }
  return {
    reqId,
    chart: opts.chart,
    ...(opts.boardId ? { boardId: opts.boardId } : {}),
    stage: "분석",
    seq: opts.seq,
    garmentNo: item.sourceCode,
    brand: item.brand,
    contents: item.contents,
    origConstruction: item.construction,
    // 의뢰자가 중량을 안 적었으면 R&D 실측값이 그 원단의 유일한 중량이다.
    origWeight: item.weight !== "" ? item.weight : item.weightRnd,
    yarnAnalysis: item.yarnDescription,
    devConstruction: item.constructionRnd,
    comment: item.commentRnd,
    analyst: item.inCharge,
    urgent: item.requestType === "Urgent",
    requester: item.requester,
    developer: "",
    devPlan: "",
    analysisId: item.id,
    analysisAnNo: item.anNo,
    /*
     * 사진은 분석 경로를 그대로 가리킨다(R361). 바이트를 복사하지 않는다.
     * 복사는 Storage 다운로드 URL을 `fetch`해야 하는데 이 버킷에는 CORS 설정이 없다.
     * 삭제는 `reqId` 기준(`requests/{reqId}/...`)이라 의뢰 쪽에서 지워도 분석 원본은 멀쩡하다.
     * Firestore는 값이 undefined인 키를 싫어하므로 사진이 있을 때만 키를 만든다.
     */
    ...(item.imagePath ? { imagePath: item.imagePath, imageFrom: "analysis" as const } : {}),
    ...(item.imageThumbPath ? { imageThumbPath: item.imageThumbPath } : {}),
    options: [option],
    createdAt: now,
    updatedAt: now,
  }
}

export interface TransferablePick {
  targets: AnalysisRequest[]
  /** 완료 상태가 아니라 빠진 건수 */
  notFinished: number
  /** 이미 의뢰로 넘긴 건수. 엑셀 경로에서는 늘 0이다 */
  alreadyLinked: number
}

/**
 * 이 분석 건이 살아 있는 의뢰 스타일과 이어져 있는가(R360).
 * `requestReqId`가 적혀 있어도 그 스타일이 지워졌으면 거짓이다.
 * REQ 딱지와 "이미 넘긴 건" 판정이 이 함수 하나를 본다. 두 곳이 달라지면 안 된다.
 */
export function hasLiveRequestLink(item: AnalysisRequest, liveReqIds: ReadonlySet<string>): boolean {
  return Boolean(item.requestReqId && liveReqIds.has(item.requestReqId))
}

/**
 * 고른 건에서 넘길 수 있는 것만 추린다.
 *
 * 분석 1건은 의뢰 1건으로만 간다. 이미 넘긴 건(`requestReqId` 있음)은 뺀다.
 * 엑셀 내려받기는 문서를 다시 뽑는 것뿐이라 `allowLinked`로 그 제한을 푼다.
 */
export function pickTransferable(
  list: readonly AnalysisRequest[],
  ids: ReadonlySet<string>,
  opts?: { allowLinked?: boolean; liveReqIds?: ReadonlySet<string> },
): TransferablePick {
  const chosen = list.filter((item) => ids.has(item.id))
  const finished = chosen.filter((item) => item.state === "완료")
  // 넘긴 적이 있어도 그 스타일이 지워졌으면 다시 넘길 수 있다(R360).
  const linked = opts?.allowLinked
    ? []
    : finished.filter((item) => opts?.liveReqIds ? hasLiveRequestLink(item, opts.liveReqIds) : Boolean(item.requestReqId))
  const linkedIds = new Set(linked.map((item) => item.id))
  return {
    targets: finished.filter((item) => !linkedIds.has(item.id)),
    notFinished: chosen.length - finished.length,
    alreadyLinked: linked.length,
  }
}

/** 추려낸 결과를 사람에게 알리는 한 줄. 빠진 것이 없으면 빈 문자열이다. */
export function transferSkipNotice(pick: TransferablePick): string {
  const parts: string[] = []
  if (pick.notFinished) parts.push(`완료가 아닌 ${pick.notFinished}건`)
  if (pick.alreadyLinked) parts.push(`이미 넘긴 ${pick.alreadyLinked}건`)
  return parts.length ? `${parts.join("과 ")}은 빼고 ${pick.targets.length}건만 넘깁니다.` : ""
}

/** 엑셀 내려받기 파일 이름. 빈 양식 이름(`requestTemplateFileName`)과 구분한다. */
export function analysisChartFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  const stamp = `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  return `분석건_개발의뢰양식_${stamp}.xlsx`
}
