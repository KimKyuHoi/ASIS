/**
 * 디자인 토큰을 실제 색 문자열로 푼다 — Konva 는 캔버스에 직접 그려 CSS 변수를 못 읽는다.
 * light-dark()·color-mix() 는 사용 지점의 color-scheme 으로 풀리므로, 문서 안에 임시
 * 요소를 넣어 computed color 를 읽는다 (design-system/lib/resolve-color 와 같은 방식).
 */
export function tokenColor(token: string): string {
  const root = document.documentElement;
  // 정의 안 된 토큰이면 color 가 상속값으로 조용히 바뀐다 → 즉시 실패.
  if (getComputedStyle(root).getPropertyValue(token).trim() === '') {
    throw new Error(`tokenColor: 정의되지 않은 토큰 ${token}`);
  }
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  root.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

/** 'rgb(r, g, b)' / 'rgba(r, g, b, a)' 에 투명도를 곱한 rgba 문자열. */
export function withAlpha(color: string, alpha: number): string {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(color);
  if (!m) throw new Error(`withAlpha: rgb() 형식이 아님 — ${color}`);
  // 4번째 그룹(알파)은 rgb() 형식이면 없다 — at() 으로 undefined 를 타입에 드러낸다.
  const alphaGroup = m.at(4);
  const base = alphaGroup === undefined ? 1 : Number(alphaGroup);
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${String(base * alpha)})`;
}
