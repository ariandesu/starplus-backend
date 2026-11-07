import { defineConfig } from "vitest/config";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@starplus/core": join(root, "core/src/index.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "routes",
          pool: "@cloudflare/vitest-pool-workers",
          poolOptions: {
            workers: {
              wrangler: { configPath: "./wrangler.toml" },
            },
          },
          include: ["test/routes/**/*.test.ts"],
          setupFiles: ["test/setup/apply-migrations.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/routes/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["core/**/*.ts"],
      thresholds: {
        lines: 85,
      },
    },
  },
});
