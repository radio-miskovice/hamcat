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

export interface ProtocolAdapter {
  readonly family: ProtocolFamily;
  readonly modelId?: string;
  setModelAdapter(adapter: ModelProtocolAdapter | null): void;
  encodeCommand(command: CatCommand): Uint8Array;
  decodeIncoming(data: Uint8Array): CatResponse[];
  setTxVfo?(client: ProtocolControlClient, vfo: VfoId): Promise<void>;
  getTxVfo?(client: ProtocolControlClient): Promise<VfoId>;
  setRxVfo?(client: ProtocolControlClient, vfo: VfoId): Promise<void>;
  getRxVfo?(client: ProtocolControlClient): Promise<VfoId>;
  setFrequency?(client: ProtocolControlClient, vfo: VfoId, frequencyHz: number): Promise<void>;
  getFrequency?(client: ProtocolControlClient, vfo: VfoId): Promise<number>;
  setModulationMode?(client: ProtocolControlClient, mode: ModulationMode): Promise<void>;
  getModulationMode?(client: ProtocolControlClient): Promise<ModulationMode>;
  switchToTx?(client: ProtocolControlClient, options?: TxSwitchOptions): Promise<void>;
  switchToRx?(client: ProtocolControlClient): Promise<void>;
}
