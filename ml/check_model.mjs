import { readFile } from "node:fs/promises";

async function main() {
  const modelPath = process.argv[2];
  if (!modelPath) {
    console.error("usage: check_model.mjs <model.json>");
    process.exit(2);
  }
  const { loadModel } = await import("../core/src/model.ts");
  const raw = JSON.parse(await readFile(modelPath, "utf8"));
  const loaded = loadModel(raw);
  if (!loaded.ok) {
    console.error(`model check failed: ${loaded.reason}`);
    process.exit(1);
  }
  const model = loaded.model.definition;
  console.log(
    `model ok: ${model.model_id} ${model.model_version} (${model.reference_cases.length} reference cases)`
  );
}

await main();
