import type { Tool } from '../types/shapes';

// 지우개 커서 — Lucide eraser 형태를 SVG data URL 로 인코딩.
// 그림자 패스(검정)를 먼저 그려 밝은/어두운 배경 모두에서 선명히 보임.
// hotspot: (2, 14) — 지우개 지우는 끝 부분(좌하단).
export const CURSOR_ERASER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' stroke='%23000' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M22 21H7' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='m5 11 9 9' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' fill='%23ff9999' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M22 21H7' stroke='white' stroke-width='1.8' stroke-linecap='round'/%3E%3Cpath d='m5 11 9 9' stroke='white' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E\") 2 14, auto";

// 회전 화살표 커서 — 끝점 핸들 hover/드래그 시 "방향을 바꿀 수 있는 지점"임을 알림.
// 거의 한 바퀴 도는 원호 + 끝에 화살촉. 검정 그림자(4px) 위 흰 선(2px) 2겹으로
// 밝은/어두운 배경 모두에서 선명. hotspot: 중앙(11,11).
export const CURSOR_ROTATE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12 4 A8 8 0 1 1 6.86 5.87' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='M6.86 5.87 L4 4.5 M6.86 5.87 L6.2 9' stroke='%23000' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M12 4 A8 8 0 1 1 6.86 5.87' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M6.86 5.87 L4 4.5 M6.86 5.87 L6.2 9' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") 11 11, auto";

/** Stage 커서 — select 는 기본, 지우개는 전용 커서, 그 외 그리기 도구는 crosshair. */
export function stageCursor(tool: Tool): string {
  if (tool === 'select') return 'default';
  if (tool === 'eraser') return CURSOR_ERASER;
  return 'crosshair';
}
