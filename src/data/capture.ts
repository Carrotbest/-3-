// 스크린샷 캡처 전용 플래그. VITE_CAPTURE=1 로 dev 서버를 띄웠을 때만 true.
// 프로덕션(GitHub Pages) 빌드에는 이 값이 없으므로 항상 false → 앱 동작 불변.
export const CAPTURE = import.meta.env.VITE_CAPTURE === "1"
