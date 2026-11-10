import { createContext } from 'react';
import type { Page } from '../types/page';

/**
 * 현재 페이지(라우트·언어). 페이지마다 HTML 이 따로 있으므로 한 번 정해지면 바뀌지 않는다 —
 * 언어·탭 전환은 다른 URL 로의 이동이다. 프리렌더와 hydrate 가 같은 값을 넣는다.
 */
export const PageContext = createContext<Page | null>(null);
