// 한국 공휴일/대체공휴일 + 회사 휴무일. dateKey "YYYY-MM-DD" → 명칭. 사용자가 쉽게 추가/수정.
export const HOLIDAYS: Record<string, string> = {
  // 2026 (요일 검증 완료)
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절", "2026-03-02": "대체공휴일(삼일절)",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일(부처님오신날)",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절", "2026-08-17": "대체공휴일(광복절)",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴", "2026-09-28": "대체공휴일(추석)",
  "2026-10-03": "개천절", "2026-10-05": "대체공휴일(개천절)",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  // 2025·2027 고정일 공휴일(음력·대체는 필요 시 사용자가 추가)
  "2025-01-01": "신정", "2025-03-01": "삼일절", "2025-05-05": "어린이날", "2025-06-06": "현충일", "2025-08-15": "광복절", "2025-10-03": "개천절", "2025-10-09": "한글날", "2025-12-25": "성탄절",
  "2027-01-01": "신정", "2027-03-01": "삼일절", "2027-05-05": "어린이날", "2027-06-06": "현충일", "2027-08-15": "광복절", "2027-10-03": "개천절", "2027-10-09": "한글날", "2027-12-25": "성탄절",
}
const pad = (n: number) => String(n).padStart(2, "0")
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const isHoliday = (key: string) => key in HOLIDAYS
export const holidayName = (key: string) => HOLIDAYS[key] ?? ""
export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
/** 날짜 톤: 일요일·공휴일=휴일(빨강), 토요일=토(파랑), 그 외 평일. */
export function dayTone(d: Date): "holiday" | "sat" | "weekday" {
  if (d.getDay() === 0 || isHoliday(dateKeyOf(d))) return "holiday"
  if (d.getDay() === 6) return "sat"
  return "weekday"
}
/** 숫자/요일 텍스트 색 클래스(토큰 없이 tailwind 색으로 통일). */
export const dayToneText = (d: Date) => dayTone(d) === "holiday" ? "text-rose-500 dark:text-rose-400" : dayTone(d) === "sat" ? "text-sky-500 dark:text-sky-400" : "text-[var(--foreground)]"
