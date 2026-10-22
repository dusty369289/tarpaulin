import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/** A rule set with every rule lowered to a warning, keeping its options. */
const asWarnings = (rules) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, level]) => [
      name,
      Array.isArray(level) ? ['warn', ...level.slice(1)] : level === 'off' ? 'off' : 'warn',
    ]),
  );

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'src-tauri/gen', 'coverage', '.claude'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Accessibility. Warnings for now, so the existing findings can be fixed by the code's owners
  // without blocking anyone; switch to the recommended levels once `pnpm lint` shows none.
  {
    files: ['src/**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: asWarnings(jsxA11y.flatConfigs.recommended.rules),
  },
);
