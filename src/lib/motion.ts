/**
 * 카드류 공통 hover 반응.
 *
 * 예전에는 `transition-transform transition-shadow` 로 적혀 있었는데, 둘 다
 * transition-property 를 쓰기 때문에 나중에 나온 쪽이 앞의 것을 덮어썼다.
 * 결과적으로 transform 에는 transition 이 걸리지 않아 hover 시 카드가 툭 튀었다.
 * 두 속성을 한 선언으로 묶고, 감속 곡선을 길게 잡아 부드럽게 올라오도록 한다.
 *
 * 들리는 높이는 `--hover-lift` 로 바깥에서 끌 수 있다. 스프링으로 직접 transform 을
 * 제어하는 Magnetic 래퍼 안에서는 이 값이 0 이 되어 움직임이 겹치지 않는다.
 */
export const hoverLift = "transition-[transform,box-shadow] duration-[var(--t-lift)] ease-[var(--e-soft)] hover:translate-y-[var(--hover-lift)] hover:shadow-[var(--shadow-2)] motion-reduce:transform-none motion-reduce:transition-none"
