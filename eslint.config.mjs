// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const ownedImports = [
  {
    owner: "src/useBoardController.tsx",
    regex: "(^|/)boardSession(\\.ts)?$",
    importNames: ["BoardSession"],
    message:
      "src/useBoardController.tsx owns BoardSession. Read board state from the BoardController that useBoardController() returns.",
  },
  {
    owner: "src/CompBuilder.tsx",
    regex: "(^|/)savedComps(\\.ts)?$",
    importNames: ["SavedCompSession"],
    message:
      "src/CompBuilder.tsx owns SavedCompSession. Pass CompBuilder the CompStorage and WorkspaceAutosave from openAppData(), and read comp state in CompBuilder with useSyncExternalStore(session.subscribe, session.getSnapshot).",
  },
];

const ownedGlobals = [
  {
    owner: "src/appData.ts",
    names: ["indexedDB", "localStorage", "BroadcastChannel"],
    message:
      "src/appData.ts owns browser storage and the storage channel. Write saved comps with CompStorage.update from openAppData(), or add the storage code to src/appData.ts.",
  },
];

const globalObjects = ["window", "globalThis", "self"];

/**
 * @param {string} [owner]
 * @returns {import("eslint").Linter.RuleEntry}
 */
function restrictedImports(owner) {
  return [
    "error",
    {
      patterns: ownedImports
        .filter((entry) => entry.owner !== owner)
        .map(({ regex, importNames, message }) => ({
          regex,
          importNames,
          message,
        })),
    },
  ];
}

/**
 * @param {string} [owner]
 * @returns {import("eslint").Linter.RulesRecord}
 */
function ownerRules(owner) {
  const globals = ownedGlobals
    .filter((entry) => entry.owner !== owner)
    .flatMap(({ names, message }) => names.map((name) => ({ name, message })));
  const properties = globals.flatMap(({ name, message }) =>
    globalObjects.map((object) => ({ object, property: name, message })),
  );
  // An entry with no options keeps the options of an earlier block, so an owner turns the rule off.
  return {
    "no-restricted-imports": restrictedImports(owner),
    "no-restricted-globals": globals.length ? ["error", ...globals] : "off",
    "no-restricted-properties": properties.length
      ? ["error", ...properties]
      : "off",
  };
}

const owners = [
  ...new Set([...ownedImports, ...ownedGlobals].map(({ owner }) => owner)),
];

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
        {
          selector:
            "CallExpression[callee.name='useState'] > CallExpression[callee.property.name='getSnapshot'], CallExpression[callee.name='useState'] > ArrowFunctionExpression > CallExpression[callee.property.name='getSnapshot']",
          message:
            "Do not copy a store snapshot into React state. Read it with useSyncExternalStore(store.subscribe, store.getSnapshot).",
        },
      ],
      ...ownerRules(),
    },
  },
  ...owners.map((owner) => ({ files: [owner], rules: ownerRules(owner) })),
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
