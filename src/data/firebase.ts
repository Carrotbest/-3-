import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

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
