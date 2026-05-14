/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

import type { ModelProtocolAdapter, ProtocolFamily } from "../protocol";
import { getModelFeatures, normalizeModelName } from "./feature-registry";
import { createQmxModelAdapter } from "./kenwood/qmx-model-adapter";
import { createTs590ModelAdapter } from "./kenwood/ts590-model-adapter";

export type KnownProtocolModel = "qmx" | "ts590";

export function createModelAdapterByName(
  family: ProtocolFamily,
  model: string
): ModelProtocolAdapter {
  const normalized = normalizeModelName(model);
  const knownModel = getModelFeatures(family, normalized);

  switch (family) {
    case "kenwood":
      switch (normalized) {
        case "qmx":
        case "kenwood-qmx":
        case "qrplabs.qmx":
          return createQmxModelAdapter();
        case "ts590":
        case "ts-590":
        case "kenwood-ts590":
        case "kenwood.ts590":
          return createTs590ModelAdapter();
        default:
          if (knownModel) {
            return { modelId: knownModel.modelId };
          }
          throw new Error(`Unsupported model '${model}' for family '${family}'.`);
      }
    case "yaesu":
    case "icom":
      if (knownModel) {
        return { modelId: knownModel.modelId };
      }
      throw new Error(
        `No built-in model adapters registered for family '${family}' (requested '${model}').`
      );
    default:
      throw new Error(`Unsupported protocol family '${family}'.`);
  }
}
