import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node + browser globals. Without these, `console`, `process`, `require`,
    // `Buffer`, `setTimeout` and friends all trip no-undef, which is what
    // produced ~5,000 findings that had nothing to do with security.
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },
  {
    // Note the cjs/mjs extensions: without them the overrides below never
    // reached the repo's CommonJS scripts, and they failed the gate on
    // preset defaults.
    files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
    rules: {
      // --- security rules: these are what this gate exists to enforce ---
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-prototype-builtins': 'error',
      'no-with': 'error',
      'no-caller': 'error',
      'no-extend-native': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-multi-str': 'error',
      'no-new-wrappers': 'error',
      'no-octal': 'error',
      'no-octal-escape': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-void': 'error',

      // --- hygiene rules inherited from the recommended presets ---
      // Not security rules. Kept visible as warnings so this gate fails only
      // on the security rules above.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unnecessary-type-constraint': 'warn',
      'no-useless-catch': 'warn',

      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  {
    // .cjs files are CommonJS by definition; require() is correct there.
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '*.config.js',
      '*.config.ts',
      // Dead backup copy of the supabase edge functions.
      'supabase.backup/**',
    ],
  }
);
