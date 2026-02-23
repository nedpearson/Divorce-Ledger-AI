import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Security rules – kept as errors
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-prototype-builtins": "error",
      "no-with": "error",
      "no-caller": "error",
      "no-extend-native": "error",
      "no-iterator": "error",
      "no-labels": "error",
      "no-lone-blocks": "error",
      "no-multi-str": "error",
      "no-new-wrappers": "error",
      "no-octal": "error",
      "no-octal-escape": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-throw-literal": "error",
      "no-unused-expressions": "error",
      "no-useless-call": "error",
      "no-useless-concat": "error",
      // Allow `void` as a statement (fire-and-forget promise pattern) but forbid other usages
      "no-void": ["error", { allowAsStatement: true }],
      // TypeScript rules – downgraded to warn in security config (code-quality, not security)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      // Code-quality rules inherited from tseslint.configs.recommended – warn only
      "prefer-const": "warn",
      "no-empty": "warn",
      "no-constant-binary-expression": "warn",
      "no-useless-catch": "warn",
      "no-useless-escape": "warn",
      "no-case-declarations": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "*.config.js",
      "*.config.ts",
      // CJS scripts and service worker use CommonJS require() and browser/Node globals
      "scripts/**",
      "client/public/**",
      // Backup directory – not production code
      "supabase.backup/**",
    ],
  }
);
