import type { Env } from "./env.ts";
import { DEMO_CREW_ID, DEMO_PHOTO_BASE64, buildDemoSeed } from "./demo-seed.ts";

/** Fixed R2 key suffix for the seeded demo emergency photo (stable across resets). */
export const DEMO_PHOTO_ID = "dddddddd-dddd-4ddd-8000-000000000001";

/**
 * Deletes a demo crew member's measurements, results, reports and photo, but
 * keeps the crew row and any sessions, so a judge in the middle of the demo
 * is never logged out and the next reset is a no-op away.
 */
export async function resetDemoData(db: D1Database, attachments?: R2Bucket): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const pattern = "demo-%";
  for (const [table, column] of [
    ["measurements", "crew_id"],
    ["results", "crew_id"],
    ["reports", "submitted_by"],
  ] as const) {
    const deleted = await db
      .prepare(`DELETE FROM ${table} WHERE ${column} LIKE ?`)
      .bind(pattern)
      .run();
    counts[table] = deleted.meta.changes ?? 0;
  }
  counts.sessions = 0;
  counts.crew = 0;
  if (attachments) {
    await attachments.delete(`attachments/${DEMO_PHOTO_ID}`);
    counts.attachments = 1;
  }
  return counts;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function resetAndSeedDemo(env: Env): Promise<Record<string, unknown>> {
  const reset = await resetDemoData(env.DB, env.ATTACHMENTS);
  const now = Date.now();
  const seed = await buildDemoSeed(now);
  const counts: Record<string, number> = { ...reset };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO crew (id, name, role, provenance, created_at) VALUES ('demo-astronaut', 'Demo astronaut', 'astronaut', 'synthetic', ?) ON CONFLICT (id) DO NOTHING`
    ).bind(new Date(now).toISOString()),
    env.DB.prepare(
      `INSERT INTO crew (id, name, role, provenance, created_at) VALUES ('demo-surgeon', 'Demo flight surgeon', 'flight_medical_officer', 'synthetic', ?) ON CONFLICT (id) DO NOTHING`
    ).bind(new Date(now).toISOString()),
  ]);
  const byDay = new Map<string, typeof seed.measurements>();
  for (const item of seed.measurements) {
    const day = item.measured_at.slice(0, 10);
    const group = byDay.get(day) ?? [];
    group.push(item);
    byDay.set(day, group);
  }
  const resultsByDay = new Map(seed.days.map((day, i) => [day, seed.results[i]]));
  let measurements = 0;
  let results = 0;
  for (const day of [...byDay.keys()].sort()) {
    const rows = byDay.get(day)!;
    const dayResult = resultsByDay.get(day);
    const statements = rows.map((item) =>
      env.DB.prepare(
        `INSERT INTO measurements (client_id, crew_id, metric, value_num, value_text, unit, measured_at, received_at, source, device_id, capture_id, is_estimate, confirmed_by_user, provenance, setting, phase, phase_day, supersedes_client_id, voided, catalog_version, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        item.client_id, item.crew_id, item.metric, item.value_num, item.value_text, item.unit,
        item.measured_at, new Date(now).toISOString(), item.source, item.device_id, item.capture_id,
        item.is_estimate, item.confirmed_by_user, item.provenance, item.setting, item.phase, item.phase_day,
        item.supersedes_client_id, item.voided, item.catalog_version, item.schema_version
      )
    );
    if (dayResult) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO results (client_id, crew_id, assessed_at, overall_status, per_measure_json, model_advice_json, model_id, model_version, catalog_version, kb_version, inputs_hash, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          dayResult.client_id, dayResult.crew_id, dayResult.assessed_at, dayResult.overall_status,
          JSON.stringify(dayResult.per_measure), dayResult.model_advice ? JSON.stringify(dayResult.model_advice) : null,
          dayResult.model_id, dayResult.model_version, dayResult.catalog_version, dayResult.kb_version,
          dayResult.inputs_hash, new Date(now).toISOString()
        )
      );
    }
    await env.DB.batch(statements);
    measurements += rows.length;
    if (dayResult) results += 1;
  }
  const emergencyId = `seed-demo-report-emergency`;
  const reports = [
    {
      client_id: `seed-demo-report-routine`,
      kind: "routine",
      summary: "Demo routine report",
      payload: { note: "Demo routine report" },
    },
    {
      client_id: emergencyId,
      kind: "emergency",
      summary: "Demo emergency report with a photo",
      payload: {
        scenario: "bleeding",
        steps: [],
        attachments: [{ id: DEMO_PHOTO_ID, content_type: "image/jpeg", size: base64ToBytes(DEMO_PHOTO_BASE64).byteLength }],
      },
    },
  ];
  for (const report of reports) {
    await env.DB.prepare(
      `INSERT INTO reports (client_id, device_id, submitted_by, subject_crew_id, subject_label, kind, created_at, received_at, payload_json, summary_text, summary_edited, status, acknowledged_by, acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (client_id) DO NOTHING`
    )
      .bind(
        report.client_id, "seed-demo", DEMO_CREW_ID, null, "unknown crewmate", report.kind,
        new Date(now).toISOString(), new Date(now).toISOString(), JSON.stringify(report.payload),
        report.summary, 1, "delivered", null, null
      )
      .run();
  }
  if (env.ATTACHMENTS) {
    await env.ATTACHMENTS.put(`attachments/${DEMO_PHOTO_ID}`, base64ToBytes(DEMO_PHOTO_BASE64), {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { submitted_by: DEMO_CREW_ID, report_client_id: emergencyId },
    });
  }
  counts.measurementsSeeded = measurements;
  counts.resultsSeeded = results;
  counts.reportsSeeded = reports.length;
  return { reset, seeded: { person: seed.person, measurements, results, reports: reports.length } };
}
