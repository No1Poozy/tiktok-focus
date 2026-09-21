import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.output/**', '.wxt/**', 'coverage/**', '.tmp/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'chrome', 'browser'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'wxt',
                'wxt/*',
                '**/infrastructure/**',
                '**/tiktok/**',
                '**/ui/**',
                '**/entrypoints/**',
              ],
              message:
                'Domain/application code must depend on pure domain models and application ports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'wxt',
                'wxt/*',
                '**/application/**',
                '**/infrastructure/**',
                '**/tiktok/**',
                '**/ui/**',
                '**/entrypoints/**',
              ],
              message: 'Domain code may only depend on domain or genuinely generic shared code.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
