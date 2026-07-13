import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // dev 첫 prewarm 가속 — dev 서버가 뜰 때 단축키 임계 경로 엔트리를 미리
    // 변환해 둔다. 없으면 첫 요청 시 즉석 변환으로 prewarm 이 ~1.1s 걸린다.
    // server 옵션은 dev 전용이라 프로덕션 빌드에는 영향 없음.
    server: {
      warmup: {
        clientFiles: [
          './src/renderer/selection/**/*.{ts,tsx}',
          './src/renderer/editor/**/*.{ts,tsx}',
        ],
      },
    },
    build: {
      rollupOptions: {
        input: {
          selection: resolve('src/renderer/selection/index.html'),
          editor: resolve('src/renderer/editor/index.html'),
          pin: resolve('src/renderer/pin/index.html'),
          recorder: resolve('src/renderer/recorder/index.html'),
          videoRecorder: resolve('src/renderer/video-recorder/index.html'),
          patchHistory: resolve('src/renderer/patch-history/index.html'),
          stepGuide: resolve('src/renderer/step-guide/index.html'),
          scrollCapture: resolve('src/renderer/scroll-capture/index.html'),
          countdown: resolve('src/renderer/countdown/index.html'),
          settings: resolve('src/renderer/settings/index.html'),
          history: resolve('src/renderer/history/index.html'),
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
