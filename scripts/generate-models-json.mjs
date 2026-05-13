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
  throw new Error("Expected src/models/models.yaml to contain a top-level object.");
}

const { version, schema, schemaVersion, vendors, hamCatModels } = parsed;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("Expected top-level 'version' to be a non-empty string.");
}

if (typeof schema !== "string" || schema.length === 0) {
  throw new Error("Expected top-level 'schema' to be a non-empty string.");
}

if (typeof schemaVersion !== "string" || schemaVersion.length === 0) {
  throw new Error("Expected top-level 'schemaVersion' to be a non-empty string.");
}

if (
  vendors !== undefined &&
  (!Array.isArray(vendors) ||
    vendors.some(
      (vendor) =>
        !vendor ||
        typeof vendor !== "object" ||
        Array.isArray(vendor) ||
        typeof vendor.id !== "string" ||
        typeof vendor.name !== "string" ||
        !/^[a-z0-9]+$/.test(vendor.id)
    ))
) {
  throw new Error("Expected optional top-level 'vendors' to be an array of { id, name }.");
}

if (!hamCatModels || typeof hamCatModels !== "object" || Array.isArray(hamCatModels)) {
  throw new Error("Expected top-level 'hamCatModels' to be an object keyed by modelId.");
}

const normalizedModels = {};
const knownProtocols = new Set(["kenwood", "yaesu", "icom"]);
const modelIdPattern = /^[a-z0-9]+(?:\.[a-z0-9]+)+$/;

for (const [modelId, details] of Object.entries(hamCatModels)) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    throw new Error(`Expected model '${modelId}' to be an object.`);
  }

  if (!modelIdPattern.test(modelId)) {
    throw new Error(
      `Expected model id '${modelId}' to match '<vendor>.<model>' using lowercase letters and digits.`
    );
  }

  const hasSameAs = typeof details.sameAs === "string" && details.sameAs.length > 0;
  const hasProtocol = typeof details.protocol === "string";
  const hasModel = typeof details.model === "string" && details.model.length > 0;

  if (!hasSameAs && !(hasProtocol && hasModel)) {
    throw new Error(
      `Model '${modelId}' must define either sameAs or both protocol and model.`
    );
  }

  if (hasSameAs && !modelIdPattern.test(details.sameAs)) {
    throw new Error(`Model '${modelId}' has invalid sameAs id '${details.sameAs}'.`);
  }

  if (hasProtocol && !knownProtocols.has(details.protocol)) {
    throw new Error(
      `Expected model '${modelId}' to have protocol 'kenwood' | 'yaesu' | 'icom'.`
    );
  }

  if (details.vendor !== undefined && !/^[a-z0-9]+$/.test(details.vendor)) {
    throw new Error(`Model '${modelId}' has invalid vendor id '${details.vendor}'.`);
  }

  normalizedModels[modelId] = details;
}

const output = {
  version,
  schema,
  schemaVersion,
  ...(vendors ? { vendors } : {}),
  hamCatModels: normalizedModels
};

await writeFile(jsonPath, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Generated ${path.relative(rootDir, jsonPath)} from ${path.relative(rootDir, yamlPath)}.`);
