/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

import type { CatCommand, ModelProtocolAdapter } from "../../protocol";
import { getModelFeaturesByModelId } from "../feature-registry";

const textEncoder = new TextEncoder();

const TS590_MODEL_ID = "kenwood.ts590";

const profile = getModelFeaturesByModelId(TS590_MODEL_ID);

export const TS590_TX_SOURCE_MAP = {
  MIC: "0",
  DATA: "1",
  ACC2: "1",
  USB: "1",
  DIG: "1"
} as const;

export type Ts590TxSource = keyof typeof TS590_TX_SOURCE_MAP;

export interface Ts590ModelAdapterOptions {
  txSourceMap?: Record<string, string>;
}

export function createTs590ModelAdapter(
  options: Ts590ModelAdapterOptions = {}
): ModelProtocolAdapter {
  const profileSourceMap = profile?.txSourceMap ?? {};

  const sourceMap: Record<string, string> = {
    ...TS590_TX_SOURCE_MAP,
    ...profileSourceMap,
    ...options.txSourceMap
  };

  return {
    modelId: TS590_MODEL_ID,
    buildCommand(command: CatCommand) {
      if (command.code === "DS") {
        const source = command.args?.[0];
        if (!source) {
          return null;
        }

        const normalized = source.toUpperCase();
        const dataSourceMap = profile?.extra?.dataSource?.value?.sourceMap ?? {};
        const mapped = dataSourceMap[normalized] ?? source;
        const prefix = profile?.extra?.dataSource?.value?.setCommandPrefix ?? "EX0630000";
        return textEncoder.encode(`${prefix}${mapped};`);
      }

      if (command.code !== "TX") {
        return null;
      }

      const source = command.args?.[0];
      if (!source) {
        return textEncoder.encode("TX;");
      }

      const normalized = source.toUpperCase();
      const mapped = sourceMap[normalized] ?? source;
      return textEncoder.encode(`TX${mapped};`);
    }
  };
}
