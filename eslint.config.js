import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    // `docs/` is a self-contained VitePress project with its own toolchain and
    // build output. Linting it with the application's config fails as soon as
    // anyone has built the docs locally.
    ignores: [
      "dist",
      "docs",
      "eslint.config.js",
      "postcss.config.cjs",
      "tailwind.config.ts"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true }
      ]
    }
  }
);
