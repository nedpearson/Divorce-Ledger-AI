import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
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
      '@typescript-eslint/no-explicit-any': 'warn',
      // Hygiene rules inherited from the recommended presets are not security
      // rules; keep them visible as warnings so this gate fails only on the
      // security rules declared above.
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
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
    ignores: ['node_modules/**', 'dist/**', '*.config.js', '*.config.ts'],
  }
);
