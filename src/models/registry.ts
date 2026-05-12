import type { ModelProtocolAdapter, ProtocolFamily } from "../protocol";
import { normalizeModelName } from "./feature-registry";
import { createQmxModelAdapter } from "./kenwood/qmx-model-adapter";
import { createTs590ModelAdapter } from "./kenwood/ts590-model-adapter";

export type KnownProtocolModel = "qmx" | "ts590";

export function createModelAdapterByName(
  family: ProtocolFamily,
  model: string
): ModelProtocolAdapter {
  const normalized = normalizeModelName(model);

  switch (family) {
    case "kenwood":
      switch (normalized) {
        case "qmx":
        case "kenwood-qmx":
          return createQmxModelAdapter();
        case "ts590":
        case "ts-590":
        case "kenwood-ts590":
          return createTs590ModelAdapter();
        default:
          throw new Error(`Unsupported model '${model}' for family '${family}'.`);
      }
    case "yaesu":
    case "icom":
      throw new Error(
        `No built-in model adapters registered for family '${family}' (requested '${model}').`
      );
    default:
      throw new Error(`Unsupported protocol family '${family}'.`);
  }
}
