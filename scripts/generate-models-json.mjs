import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const yamlPath = path.join(rootDir, "src", "models", "models.yaml");
const jsonPath = path.join(rootDir, "src", "models", "models.json");

const yamlContent = await readFile(yamlPath, "utf8");
const parsed = parse(yamlContent);

if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
  throw new Error("Expected src/models/models.yaml to contain a top-level object keyed by family.");
}

const entries = [];

for (const [family, models] of Object.entries(parsed)) {
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    throw new Error(`Expected family '${family}' to contain an object keyed by model.`);
  }

  for (const [model, details] of Object.entries(models)) {
    if (!details || typeof details !== "object" || Array.isArray(details)) {
      throw new Error(`Expected model '${family}.${model}' to be an object.`);
    }

    entries.push({
      family,
      model,
      modelId: details.modelId ?? `${family}-${model}`,
      ...details
    });
  }
}

await writeFile(jsonPath, JSON.stringify(entries, null, 2) + "\n", "utf8");
console.log(`Generated ${path.relative(rootDir, jsonPath)} from ${path.relative(rootDir, yamlPath)}.`);
