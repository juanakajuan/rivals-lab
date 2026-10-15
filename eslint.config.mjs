// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    ".agents/",
    ".claude/worktrees/",
    ".cloudflare/",
    ".release/",
    ".svelte-kit/",
    ".wrangler/",
    "dist/",
    "coverage/",
    "playwright-report/",
    "test-results/",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": true,
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unsafe-type-assertion": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/heroes.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^(ally|enemy)$/]",
          message:
            "src/heroes.ts owns the team names. Use TEAMS, type Team, isTeam(), otherTeam(), teamCounts(), or a Record<Team, …> lookup.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: {
      "react-hooks": { meta: reactHooks.meta, rules: reactHooks.rules },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: [".claude/skills/verify/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
);
