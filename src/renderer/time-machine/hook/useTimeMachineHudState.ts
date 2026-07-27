import { useEffect, useState } from 'react';

/**
 * 알약이 표시할 단계. main 의 timeMachineHudWindow.ts 가 push 하는 형태와 동형이다
 * (renderer 는 main 을 import 하지 않는다 — step-guide 와 같은 컨벤션).
 *
 *  - recording: 상시 녹화 중. 경과 시간 + 버퍼 길이 + 저장/정지 버튼.
 *  - saving:    구간 concat 진행 중.
 *  - saved:     저장 완료 직후. main 이 일정 시간 뒤 recording 으로 되돌린다.
 *  - notice:    저장할 구간 없음·실패 등 한 줄 안내. 역시 main 이 되돌린다.
 */
export type TimeMachineHudPhase =
  | { kind: 'recording' } |
  { kind: 'saving' } |
  { kind: 'saved'; seconds: number } |
  { kind: 'notice'; message: string };

export type TimeMachineHudState = {
  phase: TimeMachineHudPhase;
  bufferSeconds: number;
  /**
   * 녹화 시작 시각(main 의 Date.now()). 경과 시간은 renderer 가 이 값으로 자체
   * 계산한다 — main 이 매초 IPC 를 보내지 않기 위함.
   */
  startedAt: number;
};

/**
 * main 이 push 하는 타임머신 상태를 구독하는 훅.
 *
 * side-effects.md — onState 는 store 가 아니라 단순 콜백 등록/해제 형태의 IPC
 * push 라서 useEffect + setState 로 동기화한다 (useStepGuideState 와 동일 판단).
 *
 * 구독을 먼저 걸고 ready() 를 보낸다 — 반대 순서면 main 의 첫 push 를 놓친다.
 *
 * @returns 아직 main 의 첫 push 를 못 받았으면 null (핸드셰이크 전 — 진짜 옵셔널).
 */
export function useTimeMachineHudState(): TimeMachineHudState | null {
  const [state, setState] = useState<TimeMachineHudState | null>(null);

  useEffect(() => {
    const api = window.timeMachineHud;
    if (!api) throw new Error('window.timeMachineHud 미노출 — preload 셋업 확인.');
    // IPC 구독 — teardown 에서 해제 (Strict Mode 이중 마운트 시 중복 등록 방지).
    const off = api.onState((next) => setState(next));
    api.ready();
    return off;
  }, []);

  return state;
}
