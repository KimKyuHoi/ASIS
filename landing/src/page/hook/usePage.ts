import { use } from 'react';
import { PageContext } from '../lib/page-context';
import type { Page } from '../types/page';

export function usePage(): Page {
  const page = use(PageContext);
  if (page === null) throw new Error('usePage must be used inside <PageContext value={...}>');
  return page;
}
