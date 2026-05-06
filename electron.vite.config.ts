import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    build: {
      // Multi-entry — 메뉴바 앱은 자체 main window 가 없지만, 임시로 Phase 1
      // 스캐폴드의 index 를 유지하고, Phase 2-C 의 selection 오버레이를 추가.
      // Phase 3 의 editor 는 통합 시점에 같은 패턴으로 entry 추가한다.
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          selection: resolve('src/renderer/selection/index.html'),
          editor: resolve('src/renderer/editor/index.html'),
          pin: resolve('src/renderer/pin/index.html'),
        },
      },
    },
    plugins: [
      react({
        babel: {
          plugins: [
            ['babel-plugin-react-compiler', { target: '19' }],
          ],
        },
      }),
    ],
  },
});
