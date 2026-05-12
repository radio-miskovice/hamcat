import type { ProtocolFamily } from "../protocol";
import { RIG_MODEL_FEATURES, type RigModelFeatures } from "./features";

export function normalizeModelName(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (normalized === "ts-590" || normalized === "kenwood-ts590") {
    return "ts590";
  }
  if (normalized === "kenwood-qmx") {
    return "qmx";
  }
  return normalized;
}

export function getModelFeatures(
  family: ProtocolFamily,
  model: string
): RigModelFeatures | null {
  const normalized = normalizeModelName(model);
  return (
    RIG_MODEL_FEATURES.find(
      (entry) => entry.family === family && entry.model.toLowerCase() === normalized
    ) ?? null
  );
}

export function getModelFeaturesByModelId(modelId?: string): RigModelFeatures | null {
  if (!modelId) {
    return null;
  }

  return RIG_MODEL_FEATURES.find((entry) => entry.modelId === modelId) ?? null;
}
