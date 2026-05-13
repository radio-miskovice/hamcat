import type { ProtocolFamily } from "../protocol";
import {
  RIG_MODEL_CATALOG,
  RIG_MODEL_FEATURES,
  type RigModelFeatures
} from "./features";

export interface ListModelsOptions {
  vendor?: string;
  family?: ProtocolFamily;
  model?: string;
}

export interface RigModelListItem {
  modelId: string;
  model: string;
  displayName?: string;
  vendor?: string;
  vendorName?: string;
  protocol: ProtocolFamily;
  family: ProtocolFamily;
}

export function normalizeModelName(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (
    normalized === "ts-590" ||
    normalized === "kenwood-ts590" ||
    normalized === "kenwood.ts590"
  ) {
    return "ts590";
  }
  if (
    normalized === "ts-480" ||
    normalized === "kenwood-ts480" ||
    normalized === "kenwood.ts480"
  ) {
    return "ts480";
  }
  if (
    normalized === "ts-450" ||
    normalized === "kenwood-ts450" ||
    normalized === "kenwood.ts450"
  ) {
    return "ts450";
  }
  if (
    normalized === "ts-690" ||
    normalized === "kenwood-ts690" ||
    normalized === "kenwood.ts690"
  ) {
    return "ts690";
  }
  if (
    normalized === "kenwood-qmx" ||
    normalized === "qrplabs-qmx" ||
    normalized === "qrplabs.qmx"
  ) {
    return "qmx";
  }
  if (
    normalized === "kx-3" ||
    normalized === "elecraft-kx3" ||
    normalized === "elecraft.kx3"
  ) {
    return "kx3";
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
      (entry) =>
        entry.family === family &&
        (entry.model.toLowerCase() === normalized || entry.modelId.toLowerCase() === normalized)
    ) ?? null
  );
}

export function getModelFeaturesByModelId(modelId?: string): RigModelFeatures | null {
  if (!modelId) {
    return null;
  }

  return RIG_MODEL_FEATURES.find((entry) => entry.modelId === modelId) ?? null;
}

export function listModels(options: ListModelsOptions = {}): RigModelListItem[] {
  const vendorFilter = options.vendor?.trim().toLowerCase();
  const modelFilter = options.model?.trim().toLowerCase();
  const vendorNames = new Map(
    (RIG_MODEL_CATALOG.vendors ?? []).map((vendor) => [vendor.id.toLowerCase(), vendor.name])
  );

  return RIG_MODEL_FEATURES.filter((entry) => {
    if (options.family && entry.family !== options.family) {
      return false;
    }

    if (vendorFilter) {
      const vendorId = entry.vendor?.toLowerCase() ?? "";
      const vendorName = vendorNames.get(vendorId)?.toLowerCase() ?? "";
      if (!vendorId.includes(vendorFilter) && !vendorName.includes(vendorFilter)) {
        return false;
      }
    }

    if (modelFilter) {
      const modelName = entry.model.toLowerCase();
      const displayName = entry.displayName?.toLowerCase() ?? "";
      const modelId = entry.modelId.toLowerCase();
      if (
        !modelName.includes(modelFilter) &&
        !displayName.includes(modelFilter) &&
        !modelId.includes(modelFilter)
      ) {
        return false;
      }
    }

    return true;
  })
    .map((entry) => ({
      modelId: entry.modelId,
      model: entry.model,
      displayName: entry.displayName,
      vendor: entry.vendor,
      vendorName: entry.vendor ? vendorNames.get(entry.vendor.toLowerCase()) : undefined,
      protocol: entry.protocol,
      family: entry.family
    }))
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}
