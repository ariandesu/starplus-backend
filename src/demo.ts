import type { Env } from "./env.ts";

/** Fixed R2 key suffix for the seeded demo emergency photo (stable across resets). */
export const DEMO_PHOTO_ID = "dddddddd-dddd-4ddd-8ddd-000000000001";

export async function resetDemoData(db: D1Database, attachments?: R2Bucket): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const pattern = "demo-%";
  for (const [table, column] of [
    ["measurements", "crew_id"],
    ["results", "crew_id"],
    ["reports", "submitted_by"],
    ["sessions", "crew_id"],
    ["access_codes", "crew_id"],
  ] as const) {
    const deleted = await db
      .prepare(`DELETE FROM ${table} WHERE ${column} LIKE ?`)
      .bind(pattern)
      .run();
    counts[table] = deleted.meta.changes ?? 0;
  }
  const crewDeleted = await db.prepare("DELETE FROM crew WHERE id LIKE ?").bind(pattern).run();
  counts.crew = crewDeleted.meta.changes ?? 0;
  if (attachments) {
    await attachments.delete(`attachments/${DEMO_PHOTO_ID}`);
    counts.attachments = 1;
  }
  return counts;
}
