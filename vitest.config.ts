import { defineWorkersProject, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const alias = {
  "@starplus/core": join(root, "core/src/index.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["test/**/*.test.ts", "core/test/**/*.test.ts"],
          exclude: ["test/routes/**/*.test.ts"],
        },
      },
      defineWorkersProject(async () => {
        const migrations = await readD1Migrations("./migrations");
        return {
          resolve: { alias },
          test: {
            name: "routes",
            include: ["test/routes/**/*.test.ts"],
            setupFiles: ["test/setup/apply-migrations.ts"],
            poolOptions: {
              workers: {
                wrangler: { configPath: "./wrangler.toml" },
                miniflare: {
                  bindings: { TEST_MIGRATIONS: migrations, API_KEY: "test-admin-key" },
                },
              },
            },
          },
        };
      }),
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
