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
import featureEntries from "./models.json";

export interface RigModelVendor {
  id: string;
  name: string;
}

export interface RigModelCatalogEntry {
  sameAs?: string;
  protocol?: ProtocolFamily;
  model?: string;
  vendor?: string;
  displayName?: string;
  signals?: RigSignalFeatures;
  vfoSplitPattern?: VfoSplitPattern;
  splitControl?: RigSplitControlFeatures;
  txSourceMap?: Record<string, string>;
  extra?: RigExtraFeatures;
}

export interface RigModelCatalog {
  version: string;
  schema: string;
  schemaVersion: string;
  vendors?: RigModelVendor[];
  hamCatModels: Record<string, RigModelCatalogEntry>;
}

export type SignalFunction =
  | "none"
  | "ptt-on"
  | "ptt-off"
  | "flow"
  | "on"
  | "off";

export interface RigSignalFeatures {
  rts?: SignalFunction;
  dtr?: SignalFunction;
}

export type VfoSplitPattern = "same-band" | "any";

export interface RigDataSourceFeatures {
  setCommandPrefix: string;
  sourceMap: Record<string, string>;
}

export interface RigSplitControlFeatures {
  kind: "vfo-pair" | "mode-flag";
  command?: string;
  splitValue?: string;
  vfoAValue?: string;
  vfoBValue?: string;
  splitRxVfo?: "A" | "B";
  splitTxVfo?: "A" | "B";
}

export interface RigExtraFeature<T = unknown> {
  hint: string;
  value: T;
}

export interface RigExtraFeatures {
  dataSource?: RigExtraFeature<RigDataSourceFeatures>;
  [key: string]: RigExtraFeature<unknown> | undefined;
}

export interface RigModelFeatures {
  family: ProtocolFamily;
  protocol: ProtocolFamily;
  model: string;
  modelId: string;
  sameAs?: string;
  vendor?: string;
  displayName?: string;
  signals?: RigSignalFeatures;
  vfoSplitPattern?: VfoSplitPattern;
  splitControl?: RigSplitControlFeatures;
  txSourceMap?: Record<string, string>;
  extra?: RigExtraFeatures;
}

export const RIG_MODEL_CATALOG: RigModelCatalog = featureEntries as RigModelCatalog;

function parseModelId(modelId: string): { vendorFromId?: string; modelFromId?: string } {
  const parts = modelId.split(".");
  if (parts.length < 2) {
    return {};
  }

  return {
    vendorFromId: parts[0],
    modelFromId: parts[parts.length - 1]
  };
}

function resolveCatalogEntry(
  modelId: string,
  cache: Map<string, RigModelCatalogEntry>,
  stack: Set<string>
): RigModelCatalogEntry {
  const cached = cache.get(modelId);
  if (cached) {
    return cached;
  }

  const current = RIG_MODEL_CATALOG.hamCatModels[modelId];
  if (!current) {
    throw new Error(`Model '${modelId}' is not present in catalog.`);
  }

  if (stack.has(modelId)) {
    throw new Error(`Circular sameAs reference detected for '${modelId}'.`);
  }

  stack.add(modelId);
  const base = current.sameAs
    ? resolveCatalogEntry(current.sameAs, cache, stack)
    : undefined;

  const { vendorFromId, modelFromId } = parseModelId(modelId);
  const resolved: RigModelCatalogEntry = {
    ...base,
    ...current,
    vendor: current.vendor ?? base?.vendor ?? vendorFromId,
    model: current.model ?? base?.model ?? modelFromId,
    protocol: current.protocol ?? base?.protocol
  };

  stack.delete(modelId);

  if (!resolved.protocol) {
    throw new Error(`Model '${modelId}' must define protocol directly or through sameAs.`);
  }

  if (!resolved.model) {
    throw new Error(`Model '${modelId}' must define model directly or through sameAs.`);
  }

  cache.set(modelId, resolved);
  return resolved;
}

export const RIG_MODEL_FEATURES: RigModelFeatures[] = Object.entries(
  RIG_MODEL_CATALOG.hamCatModels
).map(([modelId]) => {
  const resolved = resolveCatalogEntry(modelId, new Map(), new Set());
  return {
    ...resolved,
    family: resolved.protocol!,
    protocol: resolved.protocol!,
    model: resolved.model!,
    modelId
  };
});
