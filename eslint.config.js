import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

export default [
    {
        ignores: [
            'example/**',
            'types/**',
            'gi-types/**',
            '_build/**',
            'build/**',
            'builddir/',
            'docs/**',
            'result/**',
            'node_modules/**',
            'pnpm-lock.yaml',
            'package-lock.json',
            'eslint.config.js',
        ],
    },
    js.configs.recommended,
    {
        files: ['**/*.{ts,js}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: true,
                warnOnUnsupportedTypeScriptVersion: false,
            },
            globals: {
                pkg: 'readonly',
                ARGV: 'readonly',
                Debugger: 'readonly',
                GIRepositoryGType: 'readonly',
                globalThis: 'readonly',
                imports: 'readonly',
                Intl: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                window: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-empty-interface': 'off',
            '@typescript-eslint/no-unsafe-declaration-merging': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'no-redeclare': 'off',
            'no-import-assign': 'off',
            'no-useless-escape': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            curly: ['error', 'multi-or-nest', 'consistent'],
            'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
            'padded-blocks': ['error', 'never', { allowSingleLineBlocks: false }],
            'prefer-const': 'error',
        },
    },
    prettierConfig,
];
