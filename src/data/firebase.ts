import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage, type FirebaseStorage } from "firebase/storage"

// 이 값들은 공개(client) 설정으로, 비밀키가 아니다. 실제 접근 보호는
// Firestore 보안 규칙 + 로그인(Authentication)이 담당한다.
const firebaseConfig = {
  apiKey: "AIzaSyAIJ4hx0Ox809R2lfLvmRHwJbyNnlOfDC0",
  authDomain: "fabric-rnd-20a6b.firebaseapp.com",
  projectId: "fabric-rnd-20a6b",
  storageBucket: "fabric-rnd-20a6b.firebasestorage.app",
  messagingSenderId: "482564059246",
  appId: "1:482564059246:web:f844ad17ef26b19c5d367f",
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)

// Storage는 첫 사용 시점에 만든다. 최상단에서 만들면 버킷 미설정·번들 문제로 던졌을 때
// 이 모듈을 import하는 앱 전체가 부팅에 실패한다. 사진 한 기능 때문에 화면 전부가 죽으면 안 된다.
let storageInstance: FirebaseStorage | null = null

export function appStorage(): FirebaseStorage {
  if (!storageInstance) storageInstance = getStorage(firebaseApp)
  return storageInstance
}
