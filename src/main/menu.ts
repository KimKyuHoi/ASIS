import { Menu, type MenuItemConstructorOptions } from 'electron';
import { is } from '@electron-toolkit/utils';

/**
 * 애플리케이션 메뉴 설치.
 *
 * Electron 기본 메뉴(setApplicationMenu 미호출 시 자동 적용)의 View 항목에는
 * zoomIn(Cmd+Plus)·zoomOut(Cmd+-)·resetZoom(Cmd+0) accelerator 가 들어 있다.
 * 이 accelerator 가 에디터의 자체 줌 단축키 keydown 을 먼저 가로채 renderer 의
 * useEditorKeyboard 핸들러로 오지 않게 만든다 (특히 Cmd+- 가 안 먹던 원인).
 * 여기서는 zoom 세 항목을 뺀 표준 메뉴를 설치해 zoom 키를 에디터가 직접 받게 한다.
 *
 * Edit 메뉴(role: 'editMenu')는 반드시 유지한다 — macOS 에서 이 메뉴의 accelerator
 * 가 없으면 textarea/input 의 Cmd+C/V/X/A 편집 단축키가 동작하지 않는다.
 *
 * 출처: Electron lib/browser/api/menu-item-roles.ts (zoom role accelerator 정의),
 *       electronjs.org/docs/latest/api/menu (role 기반 표준 메뉴 구성).
 */
export function installAppMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: '보기',
      submenu: [
        // dev 에서만 reload/devtools 노출 — prod 에디터에서 새로고침은 이미지 유실 위험.
        ...(is.dev
          ? ([
            { role: 'reload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
          ] as MenuItemConstructorOptions[])
          : []),
        { role: 'togglefullscreen' },
        // zoomIn/zoomOut/resetZoom 의도적으로 제외 — 에디터 줌 단축키와 충돌.
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
