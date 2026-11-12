import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      ...jsxA11y.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Use the Web Crypto fairness boundary, never Math.random.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.value='random']",
          message: 'Use the Web Crypto fairness boundary, never Math.random.',
        },
        {
          selector: 'CallExpression[callee.property.name=/^(skip|only)$/]',
          message: 'Do not weaken evaluation by skipping or focusing tests.',
        },
        {
          selector: 'CallExpression[callee.name=/^(xit|xdescribe)$/]',
          message: 'Disabled tests are not permitted.',
        },
      ],
    },
  },
);
