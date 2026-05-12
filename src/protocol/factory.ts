import { IcomProtocolAdapter } from "./icom-protocol-adapter";
import { KenwoodProtocolAdapter } from "./kenwood";
import { YaesuProtocolAdapter } from "./yaesu-protocol-adapter";
import type {
  ModelProtocolAdapter,
  ProtocolAdapter,
  ProtocolFamily
} from "./types";

export interface ProtocolAdapterFactoryOptions {
  family: ProtocolFamily;
  modelAdapter?: ModelProtocolAdapter;
}

export function createProtocolAdapter(
  options: ProtocolAdapterFactoryOptions
): ProtocolAdapter {
  let adapter: ProtocolAdapter;

  switch (options.family) {
    case "kenwood":
      adapter = new KenwoodProtocolAdapter();
      break;
    case "yaesu":
      adapter = new YaesuProtocolAdapter();
      break;
    case "icom":
      adapter = new IcomProtocolAdapter();
      break;
    default:
      throw new Error(`Unsupported protocol family: ${options.family}`);
  }

  if (options.modelAdapter) {
    adapter.setModelAdapter(options.modelAdapter);
  }

  return adapter;
}
