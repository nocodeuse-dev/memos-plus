import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["main.js", "node_modules", "coverage"]
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-var": "error",
      "no-console": ["warn", { "allow": ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
);
