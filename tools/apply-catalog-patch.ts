import { readFile, writeFile } from "node:fs/promises";

interface CatalogPatch {
  measures: Record<string, { phase_offsets?: unknown; typical_range?: unknown }>;
}

async function main(): Promise<void> {
  const [patchPath, catalogPath] = process.argv.slice(2);
  if (!patchPath || !catalogPath) {
    console.error("usage: apply-catalog-patch.ts <patch.json> <catalog.json>");
    process.exit(2);
  }
  const patch = JSON.parse(await readFile(patchPath, "utf8")) as CatalogPatch;
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
    catalog_version: string;
    measures: Array<Record<string, unknown> & { code: string; limits: unknown }>;
  };
  const before = JSON.stringify(catalog.measures.map((measure) => measure.limits));
  for (const measure of catalog.measures) {
    const entry = patch.measures[measure.code];
    if (!entry) continue;
    if (entry.phase_offsets !== undefined) measure.phase_offsets = entry.phase_offsets;
    if (entry.typical_range !== undefined) measure.typical_range = entry.typical_range;
  }
  if (JSON.stringify(catalog.measures.map((measure) => measure.limits)) !== before) {
    console.error("refusing: patch changed safety limits");
    process.exit(1);
  }
  const version = Number.parseInt(catalog.catalog_version, 10);
  catalog.catalog_version = String(Number.isInteger(version) ? version + 1 : `${catalog.catalog_version}.1`);
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`patched ${catalogPath}: catalog_version ${catalog.catalog_version}`);
}

await main();
