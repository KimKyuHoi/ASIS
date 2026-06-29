import { useEffect, useRef } from 'react';
import {
  GISCUS_REPO,
  GISCUS_REPO_ID,
  GISCUS_THEME,
  GISCUS_LANG,
  type GiscusConfig,
} from '../types/giscus';

/**
 * giscus client.js 스크립트를 컨테이너에 주입한다.
 * client.js 는 로드 시 자기 data-* 속성을 읽어 부모 요소에 iframe 을 그린다.
 * React lifecycle 과 무관한 외부 위젯 DOM 조작이므로 useEffect 가 맞는 자리다
 * (state 동기화가 아니라 mount/unmount 시 한 번씩 set up / tear down).
 *
 * config 가 바뀌면(탭 전환으로 다른 인스턴스가 마운트) 컨테이너를 비우고 다시 주입한다.
 */
export function useGiscus(config: GiscusConfig): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) throw new Error('giscus container ref must be attached');

    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-repo', GISCUS_REPO);
    script.setAttribute('data-repo-id', GISCUS_REPO_ID);
    script.setAttribute('data-category', config.category);
    script.setAttribute('data-category-id', config.categoryId);
    script.setAttribute('data-mapping', 'specific');
    script.setAttribute('data-term', config.term);
    script.setAttribute('data-strict', '1');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', config.inputPosition);
    script.setAttribute('data-theme', GISCUS_THEME);
    script.setAttribute('data-lang', GISCUS_LANG);
    script.setAttribute('data-loading', 'lazy');

    container.appendChild(script);

    return () => {
      // 탭 전환/언마운트 시 주입한 스크립트 + 생성된 iframe 을 모두 제거.
      container.replaceChildren();
    };
  }, [config]);

  return containerRef;
}
