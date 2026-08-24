import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Runtime globals. Without these, every `process`, `require`, `console`,
  // `window` and `document` reference trips no-undef.
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': hooksPlugin,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...hooksPlugin.configs.recommended.rules,

      // Correctness — these stay hard failures.
      'react-hooks/rules-of-hooks': 'error',
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/no-children-prop': 'error',

      // Style and advisory — reported, but they do not gate the build.
      // The security gate (eslint-security.config.js) is the hard gate.
      'prettier/prettier': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'warn',
      'react/jsx-no-target-blank': 'warn',
      'react/no-unknown-property': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // Plain JS / CommonJS: same advisory posture, no React plugin.
  {
    files: ['**/*.{js,jsx,cjs,mjs}'],
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'warn',
      'no-console': 'off',
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },

  // Repo-wide advisory demotions.
  {
    rules: {
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      'no-case-declarations': 'warn',
      'prefer-const': 'warn',
      'no-undef': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unnecessary-type-constraint': 'warn',
    },
  },

  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
      'supabase.backup/**',
    ],
  },

  prettierConfig
);
