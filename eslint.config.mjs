import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/", "dist/", ".wrangler/", "../starplus-frontend/core/"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "core/**/*.ts", "tools/**/*.ts", "test/**/*.ts"],
  }
);
