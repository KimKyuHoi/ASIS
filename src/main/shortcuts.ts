import { globalShortcut } from 'electron';
import log from 'electron-log/main';
import { loadHotkeys, settingsStore, type HotkeyConfig } from './settings';
import { HOTKEY_DISABLED } from '../shared/editor-hotkeys';

export type HotkeyKey = keyof HotkeyConfig;

/**
 * 전역 단축키 등록 실패 한 건. main 이 알림으로 사용자에게 전달한다.
 *
 * - invalid: Electron 이 파싱하지 못하는 값(빈 문자열·손상된 JSON 값 등).
 *   저장값을 '해제'(HOTKEY_DISABLED) 로 복구해 다음 실행에서 반복되지 않게 한다.
 * - taken: 문법은 맞지만 다른 앱(또는 우리 자신의 중복 항목)이 이미 선점해 register 가 false.
 */
export type ShortcutFailure =
  | { kind: 'invalid'; key: HotkeyKey; accelerator: unknown } |
  { kind: 'taken'; key: HotkeyKey; accelerator: string };

export type ShortcutHandlers = {
  onRegion: () => void;
  onFullscreen: () => void;
  onWindow: () => void;
  /** 3초 대기 후 전체화면 캡처 — 호버 상태 재현용. */
  onDelayedFullscreen: () => void;
  /** 영역 선택 후 3초 대기 → 캡처 — 호버 상태 재현용. */
  onDelayedRegion: () => void;
  /** 모든 핀의 click-through 해제 — click-through 활성 핀이 키보드/마우스를
   *  못 받으니 외부 글로벌 단축키만이 유일한 회수 경로. */
  onDisableClickThrough: () => void;
  /** GIF 녹화 시작 — 영역 선택 → 일정 간격 캡처 → GIF. */
  onGif: () => void;
  /** 화면 영상 녹화 시작/정지 — 영역 선택 → screencapture -v → .mov. */
  onVideo: () => void;
  /** 영역 선택 → 캡처 → OCR(Vision) → 텍스트 클립보드 복사. */
  onOcr: () => void;
  /** 클립보드 이미지를 바로 Pin window 로 (Snipaste F3 결). */
  onClipboardPin: () => void;
  /** 화면 자 / 간격 측정 오버레이. */
  onRuler: () => void;
  /** 타임머신 상시 녹화 토글(시작/정지). */
  onTimeMachineToggle: () => void;
  /** 타임머신 최근 구간 즉시 저장. */
  onTimeMachineSave: () => void;
  /** 스텝바이스텝 가이드 녹화 토글. */
  onStepGuide: () => void;
  /** 스크롤 캡처 시작/정지. */
  onScrollCapture: () => void;
};

/**
 * 전역 단축키 등록·해제 lifecycle 관리.
 *
 * .claude/rules/side-effects.md 의 Rule 3 — globalShortcut 같은 시스템 전역
 * lifecycle 객체는 Class 로 캡슐화. 명시적 start/stop 으로 등록·해제.
 *
 * reload() — 환경설정에서 단축키 변경 후 재등록. handlers 를 인스턴스에 보관하고
 * stop() → _register() 순으로 교체한다.
 */
export class ShortcutManager {
  private registered: string[] = [];
  private savedHandlers: ShortcutHandlers | null = null;
  /** 환경설정에서 단축키를 녹화하는 동안 true — 이 동안에는 재등록하지 않는다. */
  private paused = false;
  /**
   * 등록 실패가 하나라도 있으면 등록 라운드마다 한 번 호출된다 (start/reload 모두).
   * main 이 알림으로 연결한다. 기본값은 로그만 — silent 하게 사라지지는 않는다.
   */
  onFailures: (failures: ShortcutFailure[]) => void = (failures) => {
    log.warn('[shortcuts] registration failures (no handler attached)', failures);
  };

  start(handlers: ShortcutHandlers): void {
    // registered 길이로 판단하면 모든 단축키가 해제/실패한 경우 이중 start 를 놓친다.
    if (this.savedHandlers) {
      throw new Error('ShortcutManager.start() called twice — already running');
    }
    this.savedHandlers = handlers;
    this._register(handlers);
  }

  reload(): void {
    if (!this.savedHandlers) return;
    this.stop();
    // 녹화 중이면 등록을 되살리지 않는다 — resume() 이 책임진다.
    // (녹화 중 저장 → settings:set → reload 경로에서 단축키가 되살아나는 것을 막음)
    if (this.paused) return;
    this._register(this.savedHandlers);
  }

  /**
   * 단축키 녹화 동안 전역 단축키를 일시 해제한다.
   * 해제하지 않으면 ⌘⇧A 를 누르는 순간 영역 캡처가 실행돼 그 조합을 지정할 수 없다.
   * 중복 호출은 무시 — 이미 해제된 상태를 그대로 둔다.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.stop();
  }

  /** 녹화 종료 — 해제했던 전역 단축키를 다시 등록한다. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.reload();
  }

  stop(): void {
    for (const accelerator of this.registered) {
      globalShortcut.unregister(accelerator);
    }
    this.registered = [];
  }

  private _register(handlers: ShortcutHandlers): void {
    // 저장값에 새로 추가된 키가 없을 수 있어 DEFAULT_HOTKEYS 로 병합 (loadHotkeys).
    const hotkeys = loadHotkeys();
    const bindings: Array<[HotkeyKey, () => void]> = [
      ['region', handlers.onRegion],
      ['fullscreen', handlers.onFullscreen],
      ['window', handlers.onWindow],
      ['delayedFullscreen', handlers.onDelayedFullscreen],
      ['delayedRegion', handlers.onDelayedRegion],
      ['disableClickThrough', handlers.onDisableClickThrough],
      ['gif', handlers.onGif],
      ['video', handlers.onVideo],
      ['ocr', handlers.onOcr],
      ['clipboardPin', handlers.onClipboardPin],
      ['ruler', handlers.onRuler],
      ['timeMachineToggle', handlers.onTimeMachineToggle],
      ['timeMachineSave', handlers.onTimeMachineSave],
      ['stepGuide', handlers.onStepGuide],
      ['scrollCapture', handlers.onScrollCapture],
    ];

    const failures: ShortcutFailure[] = [];
    // 손상된 값을 '해제' 로 되돌려 저장할 항목. 기본값으로 되돌리지 않는 이유 —
    // 기본값이 사용자가 다른 기능에 지정한 조합과 충돌해 연쇄 실패를 낳을 수 있다.
    const repaired: Partial<HotkeyConfig> = {};

    for (const [key, callback] of bindings) {
      // 설정 JSON 이 손으로 편집됐거나 구버전이 남긴 값일 수 있어 string 을 가정하지 않는다.
      const accelerator: unknown = hotkeys[key];
      // 환경설정에서 해제한 단축키('') — 등록하지 않는다. 트레이 메뉴로만 실행 가능.
      if (accelerator === HOTKEY_DISABLED) continue;
      if (typeof accelerator !== 'string') {
        log.warn('[shortcuts] non-string accelerator — disabling', { key, accelerator });
        failures.push({ kind: 'invalid', key, accelerator });
        repaired[key] = HOTKEY_DISABLED;
        continue;
      }

      let ok: boolean;
      try {
        ok = globalShortcut.register(accelerator, callback);
      } catch (err: unknown) {
        // Electron 은 파싱할 수 없는 accelerator 에 throw 한다
        // ("Error processing argument at index 0, conversion failure from …").
        // 한 항목 때문에 앱 시작 전체가 실패하면 자동 업데이트까지 막히므로(v0.7.2),
        // 해당 항목만 해제로 복구하고 나머지는 계속 등록한다.
        log.warn('[shortcuts] invalid accelerator — disabling', { key, accelerator, err });
        failures.push({ kind: 'invalid', key, accelerator });
        repaired[key] = HOTKEY_DISABLED;
        continue;
      }

      if (!ok) {
        // null-safety.md — 등록 실패를 silent 하게 무시하지 않는다. 다만 throw 로
        // 전체를 되감는 대신 실패 목록으로 모아 사용자에게 알린다.
        log.warn('[shortcuts] accelerator already taken', { key, accelerator });
        failures.push({ kind: 'taken', key, accelerator });
        continue;
      }
      this.registered.push(accelerator);
    }

    if (Object.keys(repaired).length > 0) {
      settingsStore.set('hotkeys', { ...hotkeys, ...repaired });
    }
    if (failures.length > 0) this.onFailures(failures);
  }
}
