import type { BrowserWindowConstructorOptions } from 'electron';
import { SingletonWindowManager } from './common';
import { tMain } from '../i18n/strings';

/**
 * 첫 실행 언어 선택(onboarding) 윈도우 lifecycle 관리.
 *
 * settings.language 미선택('') 인 첫 실행에만 표시된다.
 * 선택 완료 IPC(i18n:onboarding-done) 를 받은 index.ts 가 stop() 으로 닫는다.
 */
export class OnboardingWindowManager extends SingletonWindowManager {
  // 언어 감지 후 show() 시점의 언어로 타이틀을 뽑기 위해 getter — 클래스 필드로
  // 두면 인스턴스 생성(모듈 로드) 시점의 언어로 굳는다.
  protected get windowOptions(): BrowserWindowConstructorOptions {
    return {
      width: 420,
      height: 340,
      title: tMain().windows.onboardingTitle,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: true,
    };
  }

  protected readonly page = 'onboarding';
  protected readonly logLabel = 'onboardingWindow';
}
