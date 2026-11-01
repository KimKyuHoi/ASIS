import { parseColor, type Rgba } from './contrast';

/**
 * scope 안에서 색 토큰이 실제로 풀린 값을 읽는다. light-dark()·color-mix() 는 사용 지점의
 * color-scheme 으로 풀리므로 반드시 측정하려는 외형의 요소(scope) 안에서 재야 한다.
 */
export function resolveColor(scope: HTMLElement, token: string): Rgba {
  const declared = getComputedStyle(scope).getPropertyValue(token).trim();
  // 정의 안 된 토큰이면 color 가 상속값으로 조용히 바뀌어 엉뚱한 대비가 나온다 → 즉시 실패.
  if (declared === '') throw new Error(`resolveColor: 정의되지 않은 토큰 ${token}`);
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  scope.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return parseColor(value);
}
