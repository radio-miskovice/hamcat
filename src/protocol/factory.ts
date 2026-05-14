/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

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
