/**
 * 환경설정 창이 "지금 실행 중" 이라고 경고할 기능 목록.
 *
 * main(index.ts) 이 각 매니저의 isRunning/isActive 를 모아 보내고,
 * renderer(settings) 가 라벨로 바꿔 배너에 표시한다.
 * 단축키를 녹화하는 동안에는 전역 단축키가 멈추므로(shortcuts.ts pause),
 * 진행 중인 녹화를 단축키로 제어할 수 없다는 사실을 미리 알리기 위한 것이다.
 */
export type RunningFeature =
  | 'timeMachine' |
  'gif' |
  'video' |
  'stepGuide' |
  'scrollCapture';
