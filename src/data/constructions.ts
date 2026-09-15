/**
 * 원단 조직(Construction) 정규 목록. TDS Lists 기준값(lists.py)이다.
 *
 * 작지 파서(`zaji.ts`)의 조직명 최장일치와 FABRIC REQUEST 옵션 CONS 드롭다운, 요청 엑셀 양식의
 * 목록 검증이 같은 목록을 쓴다. 표기를 통일하려는 목록이라 화면에서 자유 입력을 받지 않는다.
 * 새 조직이 필요하면 이 목록에 더한다.
 */
export const CONSTRUCTIONS: readonly string[] = [
  "1*1 Rib", "10*6 Rib", "12*13 Rib", "2*1 Rib", "2*2 Rib", "2*4 Rib", "3*1 Rib", "3*2 Rib", "3*3 Rib",
  "4*1 Rib", "4*2 Rib", "4*3 Rib", "4*4 Rib", "5*2 Drop Needle Rib", "5*2 Rib", "5*3 Rib", "5*4 Rib",
  "6*2 Rib", "6*3 Rib", "6*4 Rib", "6*6 Rib", "7*3 Rib", "7*4 Rib", "7*5 Rib", "8*3 Rib", "8*4 Rib",
  "8*5 Rib", "9*2 Rib", "9*4 Rib", "Boa Fleece", "Boucle", "Canvas", "Chambray", "Chiffon", "Comez Tape",
  "Corduroy", "Crepe", "Crinkled Jersey", "Crochet", "Damboru", "Dazzle", "Denim", "Double Crepe",
  "Double Face", "Double Jacquard", "Double Jersey", "Double Knit", "Double Mesh", "Double Pique",
  "Double Sherpa", "Drop Needle", "Drop Needle Rib", "Drop Needle Single Jersey", "Duo Fold",
  "Duo Fold Thermal", "Eyelet", "Eyelet Jacquard", "Eyelet Mesh", "Fabric Bonding", "Faux Leather",
  "Faux Shearling", "Faux Suede", "Felt", "Film Bonding", "Flannel", "Flat Back Mesh", "Flat Back Rib",
  "Flat Knit", "Flat Knit Jacquard", "Flatback Rib", "Flatback Thermal", "Fleece", "Fleece Velour",
  "French Rib", "French Terry", "Fur", "Gauze", "Geargette", "Genuine Leather", "Hacci", "Herringbone",
  "Honeycomb Jacquard", "Honeycomb Mesh", "Inlay Terry", "Interlock", "ITY", "Jacquard Rib", "Lace",
  "Loop Terry", "Matte Jersey", "Memory", "Mesh", "Mesh Fleece", "Mesh Jacquard", "Milano Rib",
  "Mini French Terry", "Mink Fleece", "Modified Single Jersey", "Nonwoven", "Ottoman", "Oxford",
  "Pique Stripe", "Plain", "Plaited Jersey", "Pleats", "Pointelle", "Polar Fleece", "Polynosic", "Ponte",
  "Poplin", "Pre-smocked Jersey", "Pucker Jersey", "Quilt", "Quilt Jacquard", "Raschel", "Rib Thermal",
  "Russel Tape", "S-Knit", "Satin", "Scuba", "Seersucker", "Sequine", "Sherpa", "Single Crepe",
  "Single Jacquard", "Single Jersey", "Single Pique", "Single Stripe", "Slub Jersey", "Sweater Fleece",
  "Taffeta", "Terry", "Terry Jacquard", "Terry Velour", "Thermal", "Thermal Fleece", "Tricot",
  "Tricot Mesh", "Twill", "Twill Fleece", "Twill Jersey", "Twill Rib", "Twill Terry", "Variegated Rib",
  "Velour", "Velour Loop Terry", "Velvet", "Wide Rib", "Woven",
]

const constructionKey = (value: string): string => value.toLocaleLowerCase("en-US").replace(/[\s\-_]+/g, "")
const CONSTRUCTION_BY_KEY = new Map(CONSTRUCTIONS.map((name) => [constructionKey(name), name]))

/**
 * 사람이 친 조직명을 목록 표기로 맞춘다. 대소문자, 공백, 하이픈 차이는 같은 값으로 본다.
 * 빈 값은 ""(지정 해제), 목록에 없으면 null이다.
 */
export function matchConstruction(raw: string): string | null {
  const text = raw.trim()
  if (!text) return ""
  return CONSTRUCTION_BY_KEY.get(constructionKey(text)) ?? null
}
