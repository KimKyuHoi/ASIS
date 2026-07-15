import { app, BrowserWindow, ipcMain } from 'electron';
import { settingsStore } from '../settings';
import {
  getLanguage,
  isLanguage,
  setLanguage,
  type Language,
} from '../../shared/i18n/language';

/**
 * 언어 초기화·적용 — settings 영속화 + shared store 반영 + renderer broadcast.
 *
 * 흐름
 *   1. initLanguage(whenReady 직후): 저장된 언어(미선택이면 시스템 언어) 로드 + IPC 등록
 *   2. renderer preload 가 i18n:get-language 로 동기 조회 → 첫 페인트부터 올바른 언어
 *   3. 변경(설정/onboarding) → applyLanguage → 전체 윈도우 broadcast + 구독자(Tray 등) 통지
 */

/** 시스템 선호 언어 → 지원 언어 매핑. 한국어 외에는 전부 영어. */
export function detectSystemLanguage(): Language {
  // 선호 언어 목록이 빈 배열일 수 있어 [0] 은 진짜 옵셔널 — 그 경우 'en' 으로 시작한다.
  const primary = app.getPreferredSystemLanguages()[0];
  return primary?.startsWith('ko') ? 'ko' : 'en';
}

/** 첫 실행 언어 선택을 이미 마쳤는가 — 아니면 onboarding 언어 선택 창을 띄운다. */
export function isLanguageChosen(): boolean {
  return isLanguage(settingsStore.get('language'));
}

/** 언어 저장 + shared store 반영 + 모든 renderer 에 broadcast. */
export function applyLanguage(lang: Language): void {
  settingsStore.set('language', lang);
  setLanguage(lang);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('i18n:language-changed', lang);
  }
}

/**
 * 앱 시작 시 1회 호출 — 반드시 첫 BrowserWindow 생성(prewarm 포함) 전에 실행해야
 * preload 의 i18n:get-language sendSync 가 핸들러를 찾는다.
 */
export function initLanguage(): void {
  const stored = settingsStore.get('language');
  setLanguage(isLanguage(stored) ? stored : detectSystemLanguage());

  // sendSync 응답 — preload 가 renderer 스크립트 실행 전에 언어를 동기 결정한다.
  // 주의: 이 핸들러는 코드베이스 유일의 sendSync 짝이다. renderer 가 응답까지
  // 블로킹되므로 여기에 I/O·async 작업을 절대 추가하지 않는다 — 메모리 값 반환만.
  ipcMain.on('i18n:get-language', (event) => {
    event.returnValue = getLanguage();
  });
  ipcMain.handle('i18n:set-language', (_event, lang: unknown) => {
    if (!isLanguage(lang)) {
      // null-safety.md — 지원하지 않는 값은 silent fallback 하지 않고 명시 throw.
      throw new Error(`i18n:set-language — unsupported language: ${String(lang)}`);
    }
    applyLanguage(lang);
  });
}
