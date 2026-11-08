/**
 * Thin wrapper around POST /api/admin/demo-reset: resets the demo crew's
 * measurements, results, reports and photo and re-seeds the 30-day history
 * on the server. The admin key comes from STARPLUS_ADMIN_KEY only — never
 * pass it on the command line.
 *
 * Usage: STARPLUS_ADMIN_KEY=<key> npx tsx tools/seed-demo.ts --base https://<worker>
 */
async function main(): Promise<void> {
  let base: string | undefined;
  const at = process.argv.indexOf("--base");
  if (at !== -1 && at + 1 < process.argv.length) base = process.argv[at + 1];
  base ??= process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length);
  if (!base) throw new Error("missing --base https://...");
  const adminKey = process.env.STARPLUS_ADMIN_KEY;
  if (!adminKey) throw new Error("missing STARPLUS_ADMIN_KEY env var");
  const res = await fetch(`${base}/api/admin/demo-reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`demo reset failed with ${res.status}`);
  console.log(JSON.stringify(await res.json()));
}

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  await main();
}
