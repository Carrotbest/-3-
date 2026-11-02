import type { FabricLedgerItem } from "./fabric-ledger"

/** 창고 처리 권한 판단(R290). 소유자는 예외. 화면과 저장 함수가 같은 판단을 쓴다. */
export interface WarehouseActor {
  email: string
  department: string | null
  isOwner: boolean
}

export type WarehouseRule = "confirm" | "outbound" | "lifecycle" | "restore" | "storageNo" | "yds" | "rack"

const sameEmail = (left: string | undefined, right: string): boolean =>
  Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase())

/** 막히면 사람에게 보일 이유를, 허용이면 null 을 돌려준다. fabric1 은 1팀 원단 여부. */
export function warehouseDenial(actor: WarehouseActor, rule: WarehouseRule, item: FabricLedgerItem, fabric1: boolean): string | null {
  if (actor.isOwner) return null
  const settlement = actor.department === "settlement"
  switch (rule) {
    case "confirm":
      return settlement ? null : "입고 확인과 확인 취소는 창고팀만 할 수 있습니다."
    case "outbound":
      return settlement ? null : "출고 등록은 창고팀만 할 수 있습니다. 출고 요청 메일을 보내 주세요."
    case "lifecycle":
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 폐기와 소진은 1팀만 할 수 있습니다."
        : "폐기와 소진은 원단 R&D팀(3팀)만 할 수 있습니다."
    // 되돌리는 동작은 3팀과 창고팀이 함께 한다(R379, R380, R381, 2026-11-02 박향근 지시).
    // 이력에서의 복구, 목록 숨김 해제, 입고 취소, 출고 취소가 모두 여기에 든다. 실물을 쥔 쪽과
    // 개발을 쥔 쪽 어느 쪽이든 잘못 들어간 건을 그 자리에서 되돌릴 수 있어야 한다는 요구다.
    // 출고 취소는 재가공 반출 후 재입고의 정식 경로라 3팀이 못 쓰면 복구로 우회하게 된다.
    // lifecycle 에 남는 것은 폐기와 소진, outbound 에 남는 것은 출고 등록뿐이다.
    // **되돌리기를 처분이나 등록과 다시 한 규칙으로 합치지 말 것.**
    case "restore":
      if (settlement) return null
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 복구는 1팀과 창고팀만 할 수 있습니다."
        : "복구, 입고 대기로 되돌리기, 출고 취소는 원단 R&D팀(3팀)과 창고팀만 할 수 있습니다."
    case "storageNo":
      if (sameEmail(item.intakeByEmail, actor.email)) return null
      return item.intakeByEmail
        ? "R&D No.는 입고를 등록한 사람만 고칠 수 있습니다."
        : "등록자 기록이 없는 원단이라 R&D No.는 관리자만 고칠 수 있습니다."
    case "yds":
    case "rack": {
      const label = rule === "yds" ? "보유 재고" : "Rack No."
      if (settlement) return null
      if (rule === "yds" ? item.locks.yds : item.locks.rackNo) return `${label}는 창고팀이 입력한 값이라 창고팀만 고칠 수 있습니다.`
      if (sameEmail(item.intakeByEmail, actor.email)) return null
      return `${label}는 입고를 등록한 사람과 창고팀만 고칠 수 있습니다.`
    }
  }
}

/** 여러 원단 중 처음 걸리는 이유. 모두 허용이면 null. */
export function firstWarehouseDenial(
  actor: WarehouseActor,
  rule: WarehouseRule,
  items: readonly FabricLedgerItem[],
  isFabric1: (item: FabricLedgerItem) => boolean,
): string | null {
  for (const item of items) {
    const reason = warehouseDenial(actor, rule, item, isFabric1(item))
    if (reason) return reason
  }
  return null
}
