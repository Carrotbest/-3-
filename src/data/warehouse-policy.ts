import type { FabricLedgerItem } from "./fabric-ledger"

/** 창고 처리 권한 판단(R290). 소유자는 예외. 화면과 저장 함수가 같은 판단을 쓴다. */
export interface WarehouseActor {
  email: string
  department: string | null
  isOwner: boolean
}

export type WarehouseRule = "confirm" | "outbound" | "lifecycle" | "storageNo" | "yds" | "rack"

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
      return settlement ? null : "출고 등록과 출고 취소는 창고팀만 할 수 있습니다. 출고 요청 메일을 보내 주세요."
    case "lifecycle":
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 폐기, 소진, 복구는 1팀만 할 수 있습니다."
        : "폐기, 소진, 입고 대기로 되돌리기, 복구는 원단 R&D팀(3팀)만 할 수 있습니다."
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
