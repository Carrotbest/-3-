export interface MetaFacility {
  roomPath: string
  name: string
  path: string | null
  position: [number, number, number]
  hitSize: [number, number, number]
}

export const META_FACILITIES: MetaFacility[] = [
  { roomPath: "/", name: "안내데스크", path: "/", position: [9.5, 1.7, 0], hitSize: [3.5, 2.2, 3.5] },
  { roomPath: "/meta", name: "오피스 단말", path: "/meta", position: [-7, 2.25, -2.2], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/development/workspace", name: "전체 현황", path: "/development", position: [-8, 2.25, -1.8], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/development/workspace", name: "개발 현황판", path: "/development/workspace", position: [-14, 2.6, -4.2], hitSize: [2.7, 2.2, 0.8] },
  { roomPath: "/development/workspace", name: "EU 보드", path: "/development/eu", position: [-4, 2.25, -1.8], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/development/workspace", name: "시즌 보드", path: "/development/season", position: [0, 2.25, -1.8], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/development/workspace", name: "코어 보드", path: "/development/core", position: [4, 2.25, -1.8], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/development/workspace", name: "프로젝트 보드", path: "/development/project", position: [8, 2.25, -1.8], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/request", name: "의뢰 접수대", path: "/request", position: [-7, 2.25, -2], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/fabric-analysis", name: "분석 작업대", path: "/fabric-analysis", position: [-5, 2.3, -2.2], hitSize: [3.3, 2.3, 1.5] },
  { roomPath: "/cost", name: "원가 단말", path: "/cost", position: [0, 2.25, -2.4], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/warehouse", name: "원단 선반", path: "/warehouse", position: [-10.5, 2.9, -1.8], hitSize: [3.6, 2.8, 1.4] },
  { roomPath: "/warehouse", name: "검품대", path: "/warehouse", position: [1.6, 2.3, -1.8], hitSize: [3.3, 2.3, 1.5] },
  { roomPath: "/ts", name: "TS 접수대", path: "/ts", position: [-7, 2.25, -2], hitSize: [2.6, 2.2, 1.8] },
  { roomPath: "/study", name: "자료 서가", path: "/study", position: [-8, 2.7, -4.6], hitSize: [2.5, 2.5, 0.9] },
  { roomPath: "/protocol", name: "기준표 보드", path: "/protocol", position: [-6, 2.6, -4.7], hitSize: [2.7, 2.2, 0.8] },
  { roomPath: "/rdda", name: "보고 스크린", path: "/rdda", position: [0, 3.25, -4.2], hitSize: [13.3, 3.2, 0.7] },
  { roomPath: "/trend/fabric", name: "원단 전시 벽", path: "/trend/fabric", position: [-7.05, 2.8, 0], hitSize: [1.2, 3, 10] },
  { roomPath: "/trend/macro", name: "티커 보드", path: "/trend/macro", position: [0, 3.5, -5.88], hitSize: [15, 3.4, 0.7] },
  { roomPath: "/trend/portfolio", name: "전시 받침대", path: "/trend/portfolio", position: [-4.5, 3.1, -1.5], hitSize: [3.8, 2.8, 1.2] },
  { roomPath: "/calendar", name: "일정 보드", path: "/calendar", position: [0, 2.6, 4.7], hitSize: [2.7, 2.2, 0.8] },
  { roomPath: "/setting", name: "서버랙", path: "/setting", position: [-2.6, 2.6, -2.5], hitSize: [1.4, 2.5, 1.2] },
  { roomPath: "/process-innovation", name: "준비 중", path: null, position: [0, 2.1, 0], hitSize: [3.5, 2.2, 2] },
]

/** 클릭하면 팝업만 띄우는 오브젝트. 화면으로 이동하는 META_FACILITIES와 다르다. */
export interface MetaObject {
  roomPath: string
  id: string
  name: string
  position: [number, number, number]
  hitSize: [number, number, number]
}

export const META_OBJECTS: MetaObject[] = [
  { roomPath: "/warehouse", id: "warehouse-rack", name: "원단 랭", position: [-6.3, 1.5, -1.8], hitSize: [3.4, 2.4, 1.2] },
  { roomPath: "/development/workspace", id: "dd-wall", name: "현황 모니터 벽", position: [0, 2, -4], hitSize: [7.2, 2.6, 0.6] },
  { roomPath: "/request", id: "request-hanger", name: "원단 행거", position: [0, 1.4, -4], hitSize: [10, 1.8, 0.8] },
  { roomPath: "/rdda", id: "rdda-screen", name: "보고 스크린", position: [0, 1.55, -4.1], hitSize: [13.3, 2.2, 0.6] },
  { roomPath: "/trend/macro", id: "macro-ticker", name: "티커 보드", position: [0, 1.2, -5.7], hitSize: [6.4, 1.8, 0.6] },
  { roomPath: "/calendar", id: "calendar-board", name: "월간 보드", position: [-4.1, 1.7, 0], hitSize: [0.6, 2.2, 3.2] },
]
