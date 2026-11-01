/**
 * ASIS ESLint config
 *
 * Strict, rules adapted for TypeScript + React 19 + Electron.
 *  - 코드 품질: no-eval, no-throw-literal, eqeqeq, consistent-return 등
 *  - 스타일: ESLint @stylistic 으로 직접 강제 (Prettier는 비코드 파일 전용)
 *  - React: react / react-hooks / react-refresh / react-compiler
 *  - TypeScript: @electron-toolkit/eslint-config-ts (typescript-eslint recommended)
 *  - src/** 한정 타입 정보 기반 규칙 (typescript-eslint strictTypeChecked + stylisticTypeChecked)
 *  - 복잡도·크기 상한 — 리팩토링 목표치. 넘으면 파일/함수를 나눈다.
 */

import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import typescriptEslint from 'typescript-eslint';
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
      'docs/assets/**',
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

  // ─── src/** 타입 정보 기반 규칙 ──────────────────────────────────────
  // projectService 가 tsconfig.node.json / tsconfig.web.json 을 찾아 타입 정보를 붙인다.
  // 설정 파일·landing/ 처럼 tsconfig 밖 파일에는 적용하지 않는다.
  ...[
    ...typescriptEslint.configs.strictTypeChecked,
    ...typescriptEslint.configs.stylisticTypeChecked,
  ].map((config) => ({ ...config, files: ['src/**/*.{ts,tsx}'] })),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // null-safety.md — 타입상 null 이 될 수 없는데 ?. / ?? 로 무마한 곳을 잡는다.
      '@typescript-eslint/no-unnecessary-condition': 'error',
      // 판별 유니온(RecorderResult.kind 등)에 variant 가 추가되면 처리 누락을 잡는다.
      '@typescript-eslint/switch-exhaustiveness-check': ['error', {
        considerDefaultExhaustiveForUnions: true,
        requireDefaultForNonUnion: true,
      }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowNumber: true,
      }],
      '@typescript-eslint/no-confusing-void-expression': ['error', {
        ignoreArrowShorthand: true,
      }],
      // 프로젝트는 type 별칭을 쓴다(consistent-type-definitions: type).
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

      // ─── 복잡도·크기 상한 — 넘으면 함수/파일을 나눈다 ──────────────
      'complexity': ['error', 12],
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 3],
      'max-params': ['error', 3],
      'max-lines-per-function': ['error', {
        max: 80,
        skipBlankLines: true,
        skipComments: true,
      }],
      'max-lines': ['error', {
        max: 300,
        skipBlankLines: true,
        skipComments: true,
      }],
      'no-nested-ternary': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-param-reassign': ['error', {
        props: true,
        // canvas 2D 컨텍스트·reduce 누산기는 변경이 본래 용도.
        // event — ipcMain.on 의 sendSync 응답은 Electron API 가 event.returnValue 대입을 요구한다.
        ignorePropertyModificationsFor: ['ctx', 'acc', 'event'],
      }],
      'no-duplicate-imports': 'error',
    },
  },

  // ─── 렌더러 React 규칙 ───────────────────────────────────────────────
  {
    files: ['src/renderer/**/*.tsx'],
    rules: {
      // {count && <X/>} 가 0 을 렌더링하는 실수를 막는다.
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary', 'coerce'] }],
      'react/no-array-index-key': 'error',
      'react/no-unstable-nested-components': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/hook-use-state': 'error',
      'react/jsx-boolean-value': ['error', 'never'],
      'react/self-closing-comp': 'error',
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
