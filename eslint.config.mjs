/**
 * ASIS ESLint config
 *
 * Strict, rules adapted for TypeScript + React 19 + Electron.
 *  - 코드 품질: no-eval, no-throw-literal, eqeqeq, consistent-return 등
 *  - 스타일: ESLint @stylistic 으로 직접 강제 (Prettier는 비코드 파일 전용)
 *  - React: react / react-hooks / react-refresh / react-compiler
 *  - TypeScript: @electron-toolkit/eslint-config-ts (typescript-eslint recommended)
 */

import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import stylistic from '@stylistic/eslint-plugin';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';
import eslintPluginReactCompiler from 'eslint-plugin-react-compiler';

// no-restricted-syntax 셀렉터 — Shaka 스타일 + 프로젝트 룰.
const noRestrictedSyntax = [
  {
    selector: ':not(MethodDefinition,Property) > FunctionExpression',
    message: '함수 표현식 대신 화살표 함수를 사용하세요.',
  },
  {
    selector:
      'BinaryExpression[operator=/^([<>!=]=?)$/] > ' +
      'CallExpression[callee.property.name=indexOf]',
    message: 'indexOf 비교 대신 Array.includes를 사용하세요.',
  },
  {
    selector: 'MemberExpression[property.name="prototype"]',
    message: '.prototype 대신 ES6 클래스를 사용하세요.',
  },
  // Rule 1: React Compiler가 자동 메모이제이션 — 수동 memo 금지.
  // 자세한 내용은 .claude/rules/react-compiler.md 참고.
  {
    selector: "CallExpression[callee.name='useMemo']",
    message:
      'useMemo 금지 — React Compiler가 자동 메모이제이션을 처리합니다 ' +
      '(.claude/rules/react-compiler.md).',
  },
  {
    selector: "CallExpression[callee.name='useCallback']",
    message:
      'useCallback 금지 — React Compiler가 자동 메모이제이션을 처리합니다 ' +
      '(.claude/rules/react-compiler.md).',
  },
  {
    selector: "CallExpression[callee.name='memo']",
    message:
      'React.memo 금지 — React Compiler가 자동 메모이제이션을 처리합니다 ' +
      '(.claude/rules/react-compiler.md).',
  },
  {
    selector:
      "CallExpression[callee.object.name='React']" +
      "[callee.property.name='memo']",
    message:
      'React.memo 금지 — React Compiler가 자동 메모이제이션을 처리합니다 ' +
      '(.claude/rules/react-compiler.md).',
  },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/build/**/*.js',
      '**/.husky/_/**',
    ],
  },

  // TypeScript baseline
  tseslint.configs.recommended,

  // React
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: { react: { version: 'detect' } },
  },

  // 메인/공통 룰
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    plugins: {
      '@stylistic': stylistic,
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
      'react-compiler': eslintPluginReactCompiler,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // ─── React Hooks / Refresh / Compiler ────────────────────────────
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      'react-compiler/react-compiler': 'error',

      // ─── Possible errors ─────────────────────────────────────────────
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-misleading-character-class': 'error',
      'no-template-curly-in-string': 'error',
      'no-fallthrough': ['error', { allowEmptyCase: true }],
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',

      // ─── Best practices ──────────────────────────────────────────────
      'accessor-pairs': 'error',
      'array-callback-return': 'error',
      'consistent-return': 'error',
      'default-case-last': 'error',
      'eqeqeq': ['error', 'always'],
      'no-alert': 'error',
      'no-caller': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-div-regex': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-label': 'error',
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'no-implied-eval': 'error',
      'no-invalid-this': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-multi-str': 'error',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-proto': 'error',
      'no-return-assign': 'error',
      'no-script-url': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-useless-call': 'error',
      'no-useless-catch': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-void': 'error',
      'radix': ['error', 'always'],
      'require-await': 'error',
      'yoda': ['error', 'never'],

      // ─── Variables ───────────────────────────────────────────────────
      'no-label-var': 'error',
      'no-shadow-restricted-names': 'error',

      // ─── ES6+ ────────────────────────────────────────────────────────
      'no-useless-constructor': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      'prefer-template': 'error',
      'object-shorthand': ['error', 'always'],

      // ─── 제한 셀렉터 ─────────────────────────────────────────────────
      'no-restricted-syntax': ['error', ...noRestrictedSyntax],

      // ─── TypeScript 강화 (비-타입 정보 기반) ────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

      // ─── @stylistic (formatting; Prettier 대신 ESLint가 강제) ───────
      '@stylistic/array-bracket-newline': ['error', 'consistent'],
      '@stylistic/array-bracket-spacing': ['error', 'never'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/arrow-spacing': 'error',
      '@stylistic/block-spacing': ['error', 'always'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': 'error',
      '@stylistic/comma-style': 'error',
      '@stylistic/computed-property-spacing': 'error',
      '@stylistic/dot-location': ['error', 'property'],
      '@stylistic/eol-last': 'error',
      '@stylistic/function-call-spacing': 'error',
      '@stylistic/indent': ['error', 2, {
        SwitchCase: 1,
        ignoredNodes: ['ConditionalExpression'],
      }],
      '@stylistic/jsx-quotes': ['error', 'prefer-double'],
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/linebreak-style': ['error', 'unix'],
      '@stylistic/max-len': ['error', {
        code: 100,
        tabWidth: 2,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      '@stylistic/new-parens': 'error',
      '@stylistic/no-floating-decimal': 'error',
      '@stylistic/no-mixed-operators': ['error', {
        groups: [['&', '|', '^', '~', '<<', '>>', '>>>', '&&', '||']],
        allowSamePrecedence: false,
      }],
      '@stylistic/no-mixed-spaces-and-tabs': 'error',
      '@stylistic/no-multi-spaces': ['error', { ignoreEOLComments: true }],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-whitespace-before-property': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/operator-linebreak': ['error', 'after', {
        overrides: { '?': 'before', ':': 'before' },
      }],
      '@stylistic/padded-blocks': ['error', 'never'],
      '@stylistic/quote-props': ['error', 'consistent-as-needed'],
      '@stylistic/quotes': ['error', 'single', {
        avoidEscape: true,
        allowTemplateLiterals: 'always',
      }],
      '@stylistic/rest-spread-spacing': 'error',
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/semi-spacing': 'error',
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/space-before-function-paren': ['error', {
        asyncArrow: 'always',
        anonymous: 'never',
        named: 'never',
      }],
      '@stylistic/spaced-comment': ['error', 'always', {
        markers: ['*', '!', '/'],
      }],
      '@stylistic/switch-colon-spacing': 'error',
      '@stylistic/wrap-iife': ['error', 'inside'],
    },
  },

  // 메인 프로세스 / preload — Node 환경
  {
    files: ['src/main/**/*.{ts,tsx}', 'src/preload/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
  },

  // 렌더러 — DOM 환경
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
      },
    },
  },

  // 설정 파일들 — 룰 완화
  {
    files: [
      '*.config.{ts,js,mjs,cjs}',
      'electron.vite.config.ts',
      'commitlint.config.mjs',
    ],
    rules: {
      '@stylistic/max-len': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  // .d.ts — 글로벌 타입 augment 등은 interface가 필요
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },
);
