/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

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
    normalized === "ts-570" ||
    normalized === "kenwood-ts570" ||
    normalized === "kenwood.ts570"
  ) {
    return "ts570";
  }
  if (
    normalized === "ts-2000" ||
    normalized === "kenwood-ts2000" ||
    normalized === "kenwood.ts2000"
  ) {
    return "ts2000";
  }
  if (
    normalized === "ts-880" ||
    normalized === "kenwood-ts880" ||
    normalized === "kenwood.ts880"
  ) {
    return "ts880";
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
  if (
    normalized === "kx-2" ||
    normalized === "elecraft-kx2" ||
    normalized === "elecraft.kx2"
  ) {
    return "kx2";
  }
  if (
    normalized === "elecraft-k3" ||
    normalized === "elecraft.k3"
  ) {
    return "k3";
  }
  if (
    normalized === "elecraft-k2" ||
    normalized === "elecraft.k2"
  ) {
    return "k2";
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
