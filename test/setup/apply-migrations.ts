import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationsDir = join(root, "migrations");

export async function applyMigrations(db: D1Database): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const stmt of sql.split(";")) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) {
        await db.prepare(trimmed).run();
      }
    }
  }
}
