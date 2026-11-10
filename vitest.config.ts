import { defineWorkersProject, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const alias = {
  "@starplus/core": join(root, "core/src/index.ts"),
  // Workers have no node:os; use the portable telemetry build.
  "@better-auth/telemetry": join(root, "node_modules/@better-auth/telemetry/dist/index.mjs"),
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
          exclude: ["test/routes/**/*.test.ts", "test/demo-off/**/*.test.ts", "test/rate-limit/**/*.test.ts"],
        },
      },
      defineWorkersProject(async () => {
        const migrations = await readD1Migrations("./migrations");
        return {
          resolve: {
            alias,
            conditions: ["workerd", "worker", "browser", "module", "import", "default"],
          },
          test: {
            name: "routes",
            include: ["test/routes/**/*.test.ts"],
            setupFiles: ["test/setup/apply-migrations.ts"],
            server: { deps: { inline: ["@better-auth/telemetry", "@better-auth/core", "better-auth"] } },
            poolOptions: {
              workers: {
                wrangler: { configPath: "./wrangler.toml" },
                miniflare: {
                  bindings: {
                    TEST_MIGRATIONS: migrations,
                    API_KEY: "test-admin-key",
                    BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789abcdef",
                    BETTER_AUTH_URL: "https://example.com",
                    DEMO_PASSWORD: "demo-password-123",
                    RATE_LIMIT_MODE: "off",
                  },
                },
              },
            },
          },
        };
      }),
      defineWorkersProject(async () => {
        const migrations = await readD1Migrations("./migrations");
        return {
          resolve: {
            alias,
            conditions: ["workerd", "worker", "browser", "module", "import", "default"],
          },
          test: {
            name: "demo-off",
            include: ["test/demo-off/**/*.test.ts"],
            setupFiles: ["test/setup/apply-migrations.ts"],
            server: { deps: { inline: ["@better-auth/telemetry", "@better-auth/core", "better-auth"] } },
            poolOptions: {
              workers: {
                wrangler: { configPath: "./wrangler.toml" },
                miniflare: {
                  bindings: {
                    TEST_MIGRATIONS: migrations,
                    API_KEY: "test-admin-key",
                    BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789abcdef",
                    BETTER_AUTH_URL: "https://example.com",
                    DEMO_PASSWORD: "demo-password-123",
                    DEMO_LOGIN: "off",
                  },
                },
              },
            },
          },
        };
      }),
      defineWorkersProject(async () => {
        const migrations = await readD1Migrations("./migrations");
        return {
          resolve: {
            alias,
            conditions: ["workerd", "worker", "browser", "module", "import", "default"],
          },
          test: {
            name: "rate-limit",
            include: ["test/rate-limit/**/*.test.ts"],
            setupFiles: ["test/setup/apply-migrations.ts"],
            server: { deps: { inline: ["@better-auth/telemetry", "@better-auth/core", "better-auth"] } },
            poolOptions: {
              workers: {
                wrangler: { configPath: "./wrangler.toml" },
                miniflare: {
                  bindings: {
                    TEST_MIGRATIONS: migrations,
                    API_KEY: "test-admin-key",
                    BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789abcdef",
                    BETTER_AUTH_URL: "https://example.com",
                    DEMO_PASSWORD: "demo-password-123",
                    RATE_LIMIT_MODE: "on",
                  },
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
