import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    build: {
      rollupOptions: {
        input: {
          selection: resolve('src/renderer/selection/index.html'),
          editor: resolve('src/renderer/editor/index.html'),
          pin: resolve('src/renderer/pin/index.html'),
          recorder: resolve('src/renderer/recorder/index.html'),
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
