/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

import type { ModulationMode, TxSwitchOptions, VfoId } from "../control/types";

export type ProtocolFamily = "kenwood" | "yaesu" | "icom";

export interface CatCommand {
  code: string;
  args?: string[];
  raw?: string;
}

export interface CatResponse {
  family: ProtocolFamily;
  modelId?: string;
  raw: string;
  command?: string;
  payload?: Record<string, unknown>;
}

export interface ModelAdapterContext {
  family: ProtocolFamily;
}

export interface ProtocolControlClientStatus {
  protocolFamily?: ProtocolFamily;
  modelId?: string;
  splitAction?: {
    command: {
      on: string;
      off: string;
      get?: string;
    };
  };
}

export interface ProtocolControlClient {
  sendCommand(command: CatCommand): Promise<void>;
  queryCommand(command: CatCommand): Promise<CatResponse>;
  getStatus(): ProtocolControlClientStatus;
}

export interface ModelProtocolAdapter {
  modelId: string;
  buildCommand?(
    command: CatCommand,
    context: ModelAdapterContext
  ): Uint8Array | null;
  parseIncoming?(
    frame: Uint8Array,
    context: ModelAdapterContext
  ): CatResponse[] | null;
}

export interface RigStatusPatch {
  rxVfo?: VfoId;
  txVfo?: VfoId;
  frequencyAHz?: number;
  frequencyBHz?: number;
  mode?: ModulationMode;
  txState?: boolean;
}

export interface ProtocolAdapter {
  readonly family: ProtocolFamily;
  readonly modelId?: string;
  setModelAdapter(adapter: ModelProtocolAdapter | null): void;
  encodeCommand(command: CatCommand): Uint8Array;
  decodeIncoming(data: Uint8Array): CatResponse[];
  parseStatusFromResponse?(response: CatResponse): RigStatusPatch | null;
  setTxVfo?(client: ProtocolControlClient, vfo: VfoId): Promise<void>;
  getTxVfo?(client: ProtocolControlClient): Promise<VfoId>;
  setRxVfo?(client: ProtocolControlClient, vfo: VfoId): Promise<void>;
  getRxVfo?(client: ProtocolControlClient): Promise<VfoId>;
  setFrequency?(client: ProtocolControlClient, vfo: VfoId, frequencyHz: number): Promise<void>;
  getFrequency?(client: ProtocolControlClient, vfo: VfoId): Promise<number>;
  setModulationMode?(client: ProtocolControlClient, mode: ModulationMode): Promise<void>;
  getModulationMode?(client: ProtocolControlClient): Promise<ModulationMode>;
  setSplit?(client: ProtocolControlClient, on: boolean): Promise<void>;
  getSplit?(client: ProtocolControlClient): Promise<boolean>;
  switchToTx?(client: ProtocolControlClient, options?: TxSwitchOptions): Promise<void>;
  switchToRx?(client: ProtocolControlClient): Promise<void>;
}
