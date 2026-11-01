import { useEffect, useSyncExternalStore } from 'react';
import type { GuideDraftStep } from '../../../shared/step-guide';
import {
  closeStep,
  getAnnotationVersion,
  openStep,
  subscribeAnnotations,
} from '../lib/step-annotations';

/** 주석 변경 횟수 — side-effects.md: 외부 store 를 React 가 읽으므로 useSyncExternalStore. */
export function useAnnotationVersion(): number {
  return useSyncExternalStore(subscribeAnnotations, getAnnotationVersion);
}

/**
 * 선택한 단계를 이미지 에디터에 띄운다.
 *
 * side-effects.md — 에디터 store 는 외부 store 라 선택(React state)과 동기화하는 자리는 useEffect.
 * GIF 단계는 애니메이션이라 주석 대상이 아니다 → 에디터에서 내린다.
 */
export function useStepAnnotations(selected: GuideDraftStep | undefined): void {
  const id = selected?.id;
  const kind = selected?.kind;
  const imageDataUrl = selected?.imageDataUrl;
  const width = selected?.width;
  const height = selected?.height;
  useEffect(() => {
    // 선택이 없으면(단계를 모두 지움) undefined — 실제 옵셔널.
    if (id === undefined || kind !== 'image' || imageDataUrl === undefined) {
      closeStep();
      return;
    }
    if (width === undefined || height === undefined) {
      throw new Error('useStepAnnotations — 이미지 단계인데 크기가 없다.');
    }
    openStep({ id, imageDataUrl, width, height });
  }, [id, kind, imageDataUrl, width, height]);
}
