import { useEffect, useState } from 'react';

/** HUD 가 표시할 녹화 상태 — 스텝 수 + GIF 녹화 중 여부. */
export type StepGuideHudState = {
  stepCount: number;
  gifRecording: boolean;
};

/**
 * main 이 push 하는 녹화 상태(스텝 수 + GIF 녹화 여부)를 구독하는 훅.
 *
 * side-effects.md — main 의 상태는 "React state 와 직접 동기화" 되는 IPC push
 * 이벤트다. window.stepGuide.onState 가 이미 store 없는 단순 콜백 등록/해제
 * 형태(useSyncExternalStore 대상인 외부 store 가 아님)이므로, useEffect + setState 로
 * 동기화한다. teardown 에서 구독 해제(project IPC 컨벤션).
 *
 * onState 는 cleanup 함수를 반환한다.
 */
export function useStepGuideState(): StepGuideHudState {
  const [state, setState] = useState<StepGuideHudState>({
    stepCount: 0,
    gifRecording: false,
  });

  useEffect(() => {
    const api = window.stepGuide;
    if (!api) throw new Error('window.stepGuide 미노출 — preload 셋업 확인.');
    // IPC 구독 — teardown 에서 해제 (Strict Mode 이중 마운트 시 중복 등록 방지).
    const off = api.onState((next) => setState(next));
    return off;
  }, []);

  return state;
}
