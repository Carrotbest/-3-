/**
 * 편집(쓰기) 권한을 가진 소유자 계정의 이메일.
 * 이 이메일로 로그인한 사용자만 데이터를 저장할 수 있고(=Firestore 보안 규칙과 일치),
 * 나머지 로그인 사용자는 읽기 전용이다.
 * 소유자를 바꾸려면 이 값과 Firestore 보안 규칙(firestore.rules)을 함께 수정한다.
 */
export const OWNER_EMAIL = "hkpark@hansoll.com"
