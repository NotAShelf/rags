import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const config = tseslint.config(
  // JavaScript
  eslint.configs.recommended,
  // TypeScript
  ...tseslint.configs.recommended,

  {
    // Global ignores
    ignores: [
      "subprojcts/",
      "nix/",
      "**/node_modules/", // dependencies
      "**/.github/",
      "**/result/", // nix build artifacts
      "example/",
      "types/",
      "gi-types/",
      "_build/",
      "build/",
    ],
  },

  {
    // Global configuration
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
        warnOnUnsupportedTypeScriptVersion: false,
      },
      globals: {
        // Custom globals from .eslintrc.yml
        pkg: "readonly",
        ARGV: "readonly",
        Debugger: "readonly",
        GIRepositoryGType: "readonly",
        imports: "readonly",
        log: "readonly",
        logError: "readonly",
        print: "readonly",
        printerr: "readonly",
        window: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        ...globals.es2021,
      },
    },
  },

  {
    // Global rules
    rules: {
      // TypeScript rules
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "(^unused|_$)",
          argsIgnorePattern: "^(unused|_)",
        },
      ],
      "@typescript-eslint/no-empty-interface": "off",

      // JavaScript/ESLint rules
      "arrow-parens": ["error", "as-needed"],
      "comma-dangle": ["error", "always-multiline"],
      "comma-spacing": ["error", { before: false, after: true }],
      "comma-style": ["error", "last"],
      curly: ["error", "multi-or-nest", "consistent"],
      "dot-location": ["error", "property"],
      "eol-last": "error",
      indent: ["error", 4, { SwitchCase: 1 }],
      "keyword-spacing": ["error", { before: true }],
      "lines-between-class-members": [
        "error",
        "always",
        { exceptAfterSingleLine: true },
      ],
      "padded-blocks": ["error", "never", { allowSingleLineBlocks: false }],
      "prefer-const": "error",
      quotes: ["error", "single", { avoidEscape: true }],
      semi: ["error", "always"],
      "nonblock-statement-body-position": ["error", "below"],
      "no-trailing-spaces": "error",
      "no-useless-escape": "off",
      "max-len": ["error", { code: 100 }],
      "func-call-spacing": "error",
      "array-bracket-spacing": "error",
      "space-before-function-paren": [
        "error",
        {
          anonymous: "never",
          named: "never",
          asyncArrow: "ignore",
        },
      ],
      "space-before-blocks": "error",
      "key-spacing": "error",
      "object-curly-spacing": ["error", "always"],
    },
  },

  {
    // Allow triple-slash references in `*.d.ts` files.
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },

  {
    // Set globals for Node scripts.
    files: ["src/scripts/**"],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    // Set globals for browser scripts (decoder files).
    files: ["**/decoder.js", "**/decoder.ts"],
    languageOptions: {
      globals: globals.browser,
    },
  },
);

export default config;
