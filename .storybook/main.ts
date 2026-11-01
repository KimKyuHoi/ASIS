import type { StorybookConfig } from '@storybook/react-vite';
import react from '@vitejs/plugin-react';

/**
 * ASIS 디자인 시스템 Storybook — `pnpm storybook` → http://localhost:6007
 * (6006 은 다른 프로젝트가 쓰고 있어 6007 고정)
 *
 * 루트에 vite.config 가 없어(electron.vite.config.ts 만 있음) Storybook 은 기본 Vite 설정으로
 * 뜬다. 앱 렌더러와 같은 결과를 보려고 React Compiler 플러그인을 여기서 똑같이 붙인다.
 */
const config: StorybookConfig = {
  stories: ['./docs/*.mdx', '../src/renderer/design-system/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [
      ...(viteConfig.plugins ?? []),
      react({ babel: { plugins: [['babel-plugin-react-compiler', { target: '19' }]] } }),
    ],
  }),
};

export default config;
