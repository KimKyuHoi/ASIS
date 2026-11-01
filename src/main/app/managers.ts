import type { WebContents } from 'electron';
import { TrayManager } from '../tray';
import { ShortcutManager } from '../shortcuts';
import { SelectionOverlayManager } from '../windows/selectionOverlay';
import { EditorWindowManager } from '../windows/editorWindow';
import { PinWindowManager } from '../windows/pinWindow';
import { RecorderWindowManager } from '../windows/recorderWindow';
import { VideoRecorderWindowManager } from '../windows/videoRecorderWindow';
import { SettingsWindowManager } from '../windows/settingsWindow';
import { HistoryWindowManager } from '../windows/historyWindow';
import { PatchHistoryWindowManager } from '../windows/patchHistoryWindow';
import { RulerOverlayManager } from '../windows/rulerOverlay';
import { StepGuideWindowManager } from '../windows/stepGuideWindow';
import { ScrollCaptureWindowManager } from '../windows/scrollCaptureWindow';
import { GifStudioWindowManager } from '../windows/gifStudioWindow';
import { CountdownWindow } from '../windows/countdownWindow';
import { OnboardingWindowManager } from '../windows/onboardingWindow';
import { inputHighlight } from '../input-highlight/inputHighlight';
import type { RunningFeature } from '../../shared/running-features';

/**
 * 앱 전역 매니저 인스턴스 — 모듈 스코프 싱글턴 (side-effects.md: lifecycle 은 Class).
 * 다른 app/* 모듈은 여기서 가져다 쓴다. 생성 순서·연결은 이 파일에서만 한다.
 */
export const trayManager = new TrayManager();
export const shortcutManager = new ShortcutManager();
export const selectionOverlay = new SelectionOverlayManager();
export const editorWindow = new EditorWindowManager();
export const pinWindow = new PinWindowManager();
export const recorderWindow = new RecorderWindowManager();
export const videoRecorderWindow = new VideoRecorderWindowManager();
export const settingsWindow = new SettingsWindowManager();
export const historyWindow = new HistoryWindowManager();
export const patchHistoryWindow = new PatchHistoryWindowManager();
export const rulerOverlay = new RulerOverlayManager();
export const stepGuideWindow = new StepGuideWindowManager();
export const scrollCaptureWindow = new ScrollCaptureWindowManager();
export const countdownWindow = new CountdownWindow();
export const onboardingWindow = new OnboardingWindowManager();
// 생성자에서 IPC 채널을 1회 등록한다 — 인스턴스는 반드시 하나.
export const gifStudioWindow = new GifStudioWindowManager();
editorWindow.setPinHandler((dataUrl, w, h) => pinWindow.pin(dataUrl, w, h));
// 고정(click-through) 핀 개수가 바뀌면 트레이 메뉴 라벨("… 해제 (n)")을 다시 그린다.
pinWindow.setClickThroughCountListener(() => trayManager.refresh());

/**
 * 지금 진행 중인 녹화·캡처 목록. 순서 = 메뉴바 인디케이터 표시 우선순위.
 */
export function runningFeatures(): RunningFeature[] {
  const running: RunningFeature[] = [];
  if (recorderWindow.isActive()) running.push('gif');
  if (videoRecorderWindow.isActive()) running.push('video');
  if (stepGuideWindow.isActive()) running.push('stepGuide');
  if (scrollCaptureWindow.isActive()) running.push('scrollCapture');
  return running;
}

/**
 * 단축키 녹화 중 억제 대상 webContents. null = 녹화 중 아님.
 *
 * 녹화 동안에는 두 가지가 키 입력을 먼저 가로챈다:
 *  (a) 전역 단축키 — ⌘⇧A 를 누르면 영역 캡처가 실행돼 버린다.
 *  (b) 앱 메뉴 accelerator — ⌘W(닫기)·⌘A(전체 선택)·⌘Z(실행 취소) 등.
 * 둘 다 끈 뒤 renderer 의 keydown 만으로 순수 조합을 받는다.
 * setIgnoreMenuShortcuts 는 page keydown 은 그대로 두고 메뉴 accelerator 만 무시한다.
 * 출처: electronjs.org/docs/latest/api/web-contents (setIgnoreMenuShortcuts / destroyed).
 */
let hotkeyRecordingContents: WebContents | null = null;

/** 환경설정 창이 단축키 입력을 받기 시작한다. 이미 녹화 중이면 무시한다. */
export function beginHotkeyRecording(contents: WebContents): void {
  if (hotkeyRecordingContents) return;
  hotkeyRecordingContents = contents;
  contents.setIgnoreMenuShortcuts(true);
  // 녹화 도중 창이 닫히면 종료 신호가 오지 않는다 — 전역 단축키가 영영 죽지 않도록 복구.
  contents.once('destroyed', onHotkeyRecordingContentsDestroyed);
  shortcutManager.pause();
}

/**
 * @param resumeShortcuts 전역 단축키를 다시 등록할지. 앱 종료 경로에서는 false —
 *   stopAllManagers 가 이미 끈 단축키를 되살리면 종료 도중 재등록이 일어난다.
 */
export function endHotkeyRecording(resumeShortcuts: boolean): void {
  if (!hotkeyRecordingContents) return;
  const contents = hotkeyRecordingContents;
  hotkeyRecordingContents = null;
  contents.removeListener('destroyed', onHotkeyRecordingContentsDestroyed);
  // 파괴된 webContents 에 메서드를 호출하면 throw — 파괴 경로에서는 건너뛴다.
  if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false);
  if (resumeShortcuts) shortcutManager.resume();
}

function onHotkeyRecordingContentsDestroyed(): void {
  endHotkeyRecording(true);
}

/**
 * 모든 매니저 정리 — stopped 플래그가 세워져 prewarm 의 closed→재생성 재귀가
 * 차단된다. before-quit 과 업데이트 설치 경로(updateChecker) 양쪽에서 호출되며,
 * 각 stop() 은 멱등이라 이중 호출 안전.
 */
export const stopAllManagers = (): void => {
  // 녹화 상태 정리를 먼저 — 아래 settingsWindow.stop() 이 webContents 를 파괴할 때
  // destroyed 콜백이 방금 끈 전역 단축키를 되살리는 것을 막는다.
  endHotkeyRecording(false);
  shortcutManager.stop();
  trayManager.stop();
  selectionOverlay.stop();
  editorWindow.stop();
  pinWindow.closeAll();
  recorderWindow.stop();
  videoRecorderWindow.stop();
  inputHighlight.stop();
  settingsWindow.stop();
  historyWindow.stop();
  patchHistoryWindow.stop();
  rulerOverlay.stop();
  stepGuideWindow.stop();
  scrollCaptureWindow.stop();
  onboardingWindow.stop();
  // 진행 중 ffmpeg·작업 폴더를 동기로 정리한다.
  gifStudioWindow.stop();
};
