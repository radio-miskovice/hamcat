import type { ModulationMode, TxSwitchOptions, VfoId } from "./control/types";
import {
  createProtocolAdapter,
  type CatCommand,
  type CatResponse,
  type ProtocolAdapter,
  type ProtocolControlClient,
  type ProtocolFamily
} from "./protocol";
import { connectSerialSession, type SerialSession } from "./serial-session";
import { createModelAdapterByName } from "./models";
import { type RigModelFeatures } from "./models/features";
import {
  getModelFeatures,
  listModels,
  type ListModelsOptions,
  type RigModelListItem
} from "./models/feature-registry";

export type RigListModelsOptions = ListModelsOptions;
export type RigListedModel = RigModelListItem;

export interface RigConnectOptions {
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
  rts?: boolean;
  dtr?: boolean;
  requestOptions?: SerialPortRequestOptions;
}

export interface RigTransportStatus {
  connected: boolean;
  bytesTx: number;
  bytesRx: number;
  protocolFamily?: ProtocolFamily;
  modelId?: string;
}

export interface RigStatus extends RigTransportStatus {
  rxVfo?: VfoId;
  txVfo?: VfoId;
  frequencyAHz?: number;
  frequencyBHz?: number;
  mode?: ModulationMode;
}

export interface SetFreqOptions {
  verify?: boolean;
}

export interface SetFreqResult {
  vfo: VfoId;
  requestedHz: number;
  appliedHz: number;
  accepted: boolean;
}

export interface RigOperationResult {
  operation: string;
  success: boolean;
  details?: Record<string, unknown>;
  response?: CatResponse;
}

export type RigResponseListener = (response: CatResponse) => void;
export type RigResultListener = (result: RigOperationResult) => void;
export type RigStatusListener = (status: RigTransportStatus) => void;

interface QueryCommandOptions {
  timeoutMs?: number;
  match?: (response: CatResponse) => boolean;
}

export type RigFunction =
  | "freq"
  | "mode"
  | "rxVfo"
  | "txVfo"
  | "ptt"
  | "dataSource";

export interface RigInterface {
  readonly features: RigModelFeatures | null;

  connect(baudRate: number, options?: RigConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<RigStatus>;

  onStatus(listener: RigStatusListener): void;
  offStatus(listener: RigStatusListener): void;
  onResponse(listener: RigResponseListener): void;
  offResponse(listener: RigResponseListener): void;
  onResult(listener: RigResultListener): void;
  offResult(listener: RigResultListener): void;

  sendCat(code: string, args?: string[]): Promise<{ success: true }>;
  queryCat(code: string, args?: string[]): Promise<CatResponse>;

  setFreq(hz: number, vfo?: VfoId, options?: SetFreqOptions): Promise<SetFreqResult>;
  getFreq(vfo?: VfoId): Promise<number>;

  setMode(mode: ModulationMode): Promise<void>;
  getMode(): Promise<ModulationMode>;
  setRxVfo(vfo: VfoId): Promise<void>;
  getRxVfo(): Promise<VfoId>;
  setTxVfo(vfo: VfoId): Promise<void>;
  getTxVfo(): Promise<VfoId>;
  setPtt(on: boolean, options?: TxSwitchOptions): Promise<void>;
  getPtt(): Promise<boolean>;

  get(functionName: RigFunction, options?: { vfo?: VfoId }): Promise<unknown>;
  set(
    functionName: RigFunction,
    data?: unknown,
    options?: { vfo?: VfoId; source?: string }
  ): Promise<void>;

  listModels(options?: RigListModelsOptions): RigListedModel[];
}

export class Rig implements RigInterface {
  private session: SerialSession | null = null;
  private protocolAdapter: ProtocolAdapter | null = null;
  private transportStatus: RigTransportStatus = {
    connected: false,
    bytesTx: 0,
    bytesRx: 0
  };

  private readonly modelFeatures: RigModelFeatures | null;
  private lastPttState = false;
  private readonly statusListeners: RigStatusListener[] = [];
  private readonly responseListeners: RigResponseListener[] = [];
  private readonly resultListeners: RigResultListener[] = [];

  // Internal bridge used by family/model adapters that depend on ProtocolControlClient.
  private readonly protocolClient: ProtocolControlClient = {
    sendCommand: (command) => this.sendCommand(command),
    queryCommand: (command) => this.queryCommand(command),
    getStatus: () => this.getTransportStatus()
  };

  protected constructor(
    private readonly family: ProtocolFamily,
    private readonly model?: string
  ) {
    this.modelFeatures = model ? getModelFeatures(family, model) : null;
    this.useProtocol(family, model);
  }

  static create(family: ProtocolFamily, model?: string): Rig {
    return new Rig(family, model);
  }

  static listModels(options: RigListModelsOptions = {}): RigListedModel[] {
    return listModels(options);
  }

  get features(): RigModelFeatures | null {
    return this.modelFeatures;
  }

  listModels(options: RigListModelsOptions = {}): RigListedModel[] {
    return Rig.listModels(options);
  }

  async connect(baudRate: number, options: RigConnectOptions = {}): Promise<void> {
    const {
      requestOptions,
      dataBits,
      stopBits,
      parity,
      bufferSize,
      flowControl
    } = options;

    const signalOptions = this.resolveConnectSignalOptions(options);

    const session = await connectSerialSession(
      {
        baudRate,
        dataBits,
        stopBits,
        parity,
        bufferSize,
        flowControl
      },
        requestOptions,
        signalOptions
    );

    await this.connectWithSession(session);
  }

  static async connect(
    family: ProtocolFamily,
    model: string | undefined,
    baudRate: number,
    options: RigConnectOptions = {}
  ): Promise<Rig> {
    const rig = Rig.create(family, model);
    await rig.connect(baudRate, options);
    return rig;
  }

  async disconnect(): Promise<void> {
    if (!this.session) {
      return;
    }

    await this.session.disconnect();
    this.session = null;
    this.transportStatus = {
      ...this.transportStatus,
      connected: false
    };
    this.emitStatus();
  }

  public async connectWithSession(session: SerialSession): Promise<void> {
    if (this.session) {
      throw new Error("Rig is already connected.");
    }

    this.session = session;
    this.transportStatus = {
      protocolFamily: this.transportStatus.protocolFamily,
      modelId: this.transportStatus.modelId,
      connected: true,
      bytesTx: 0,
      bytesRx: 0
    };

    this.session.on((data) => {
      this.transportStatus = {
        ...this.transportStatus,
        bytesRx: this.transportStatus.bytesRx + data.byteLength
      };

      if (this.protocolAdapter) {
        const responses = this.protocolAdapter.decodeIncoming(data);
        for (const response of responses) {
          this.emitResponse(response);
        }
      }

      this.emitStatus();
    });

    this.emitStatus();
  }

  async getStatus(): Promise<RigStatus> {
    const transport = this.getTransportStatus();
    if (!transport.connected) {
      return transport;
    }

    const control = this.getControlAdapter();

    const rxVfo = await control.getRxVfo!(this.protocolClient);
    const txVfo = await control.getTxVfo!(this.protocolClient);
    const frequencyAHz = await control.getFrequency!(this.protocolClient, "A");
    const frequencyBHz = await control.getFrequency!(this.protocolClient, "B");
    const mode = await control.getModulationMode!(this.protocolClient);

    return {
      ...transport,
      rxVfo,
      txVfo,
      frequencyAHz,
      frequencyBHz,
      mode
    };
  }

  onStatus(listener: RigStatusListener): void {
    this.statusListeners.push(listener);
  }

  offStatus(listener: RigStatusListener): void {
    const idx = this.statusListeners.indexOf(listener);
    if (idx !== -1) {
      this.statusListeners.splice(idx, 1);
    }
  }

  onResponse(listener: RigResponseListener): void {
    this.responseListeners.push(listener);
  }

  offResponse(listener: RigResponseListener): void {
    const idx = this.responseListeners.indexOf(listener);
    if (idx !== -1) {
      this.responseListeners.splice(idx, 1);
    }
  }

  onResult(listener: RigResultListener): void {
    this.resultListeners.push(listener);
  }

  offResult(listener: RigResultListener): void {
    const idx = this.resultListeners.indexOf(listener);
    if (idx !== -1) {
      this.resultListeners.splice(idx, 1);
    }
  }

  async sendCat(code: string, args?: string[]): Promise<{ success: true }> {
    await this.sendCommand({ code, args });
    this.emitResult({
      operation: "sendCat",
      success: true,
      details: {
        code,
        args
      }
    });
    return { success: true };
  }

  async queryCat(code: string, args?: string[]): Promise<CatResponse> {
    const response = await this.queryCommand({ code, args });
    this.emitResult({
      operation: "queryCat",
      success: true,
      details: {
        code,
        args
      },
      response
    });
    return response;
  }

  async setFreq(
    hz: number,
    vfo: VfoId = "A",
    options: SetFreqOptions = {}
  ): Promise<SetFreqResult> {
    const control = this.getControlAdapter();
    await control.setFrequency!(this.protocolClient, vfo, hz);

    if (options.verify === false) {
      return {
        vfo,
        requestedHz: hz,
        appliedHz: hz,
        accepted: true
      };
    }

    const appliedHz = await control.getFrequency!(this.protocolClient, vfo);
    const result = {
      vfo,
      requestedHz: hz,
      appliedHz,
      accepted: appliedHz === hz
    };
    this.emitResult({
      operation: "setFreq",
      success: result.accepted,
      details: {
        vfo,
        requestedHz: hz,
        appliedHz
      }
    });
    return result;
  }

  async getFreq(vfo: VfoId = "A"): Promise<number> {
    return this.getControlAdapter().getFrequency!(this.protocolClient, vfo);
  }

  async setMode(mode: ModulationMode): Promise<void> {
    await this.getControlAdapter().setModulationMode!(this.protocolClient, mode);
  }

  async getMode(): Promise<ModulationMode> {
    return this.getControlAdapter().getModulationMode!(this.protocolClient);
  }

  async setRxVfo(vfo: VfoId): Promise<void> {
    await this.getControlAdapter().setRxVfo!(this.protocolClient, vfo);
  }

  async getRxVfo(): Promise<VfoId> {
    const splitControl = this.modelFeatures?.splitControl;
    if (splitControl?.kind === "mode-flag") {
      const value = await this.querySplitModeValue();
      if (value === splitControl.splitValue) {
        return splitControl.splitRxVfo ?? "A";
      }
    }
    return this.getControlAdapter().getRxVfo!(this.protocolClient);
  }

  async setTxVfo(vfo: VfoId): Promise<void> {
    await this.getControlAdapter().setTxVfo!(this.protocolClient, vfo);
  }

  async getTxVfo(): Promise<VfoId> {
    const splitControl = this.modelFeatures?.splitControl;
    if (splitControl?.kind === "mode-flag") {
      const value = await this.querySplitModeValue();
      if (value === splitControl.splitValue) {
        return splitControl.splitTxVfo ?? "B";
      }
    }
    return this.getControlAdapter().getTxVfo!(this.protocolClient);
  }

  async setPtt(on: boolean, options?: TxSwitchOptions): Promise<void> {
    if (on) {
      await this.getControlAdapter().switchToTx!(this.protocolClient, options);
      this.lastPttState = true;
      return;
    }

    await this.getControlAdapter().switchToRx!(this.protocolClient);
    this.lastPttState = false;
  }

  async getPtt(): Promise<boolean> {
    return this.lastPttState;
  }

  async get(functionName: RigFunction, options?: { vfo?: VfoId }): Promise<unknown> {
    switch (functionName) {
      case "freq":
        return this.getFreq(options?.vfo ?? "A");
      case "mode":
        return this.getMode();
      case "rxVfo":
        return this.getRxVfo();
      case "txVfo":
        return this.getTxVfo();
      case "ptt":
        return this.getPtt();
      case "dataSource":
        throw new Error(`Function '${functionName}' is write-only.`);
      default:
        throw new Error(`Unsupported get() function '${functionName}'.`);
    }
  }

  async set(
    functionName: RigFunction,
    data?: unknown,
    options?: { vfo?: VfoId; source?: string }
  ): Promise<void> {
    switch (functionName) {
      case "freq": {
        if (!Number.isInteger(data) || (data as number) < 0) {
          throw new Error("set('freq') requires a non-negative integer frequency in Hz.");
        }
        await this.setFreq(data as number, options?.vfo ?? "A");
        return;
      }
      case "mode": {
        if (typeof data !== "string") {
          throw new Error("set('mode') requires modulation mode string data.");
        }
        await this.setMode(data as ModulationMode);
        return;
      }
      case "rxVfo": {
        if (data !== "A" && data !== "B") {
          throw new Error("set('rxVfo') requires VFO 'A' or 'B'.");
        }
        await this.setRxVfo(data);
        return;
      }
      case "txVfo": {
        if (data !== "A" && data !== "B") {
          throw new Error("set('txVfo') requires VFO 'A' or 'B'.");
        }
        await this.setTxVfo(data);
        return;
      }
      case "ptt": {
        if (typeof data !== "boolean") {
          throw new Error("set('ptt') requires boolean data.");
        }
        await this.setPtt(
          data,
          data && options?.source
            ? ({ source: options.source } as TxSwitchOptions)
            : undefined
        );
        return;
      }
      case "dataSource": {
        if (typeof data !== "string") {
          throw new Error("set('dataSource') requires source string data.");
        }
        await this.sendCat("DS", [data]);
        return;
      }
      default:
        throw new Error(`Unsupported set() function '${functionName}'.`);
    }
  }

  private async querySplitModeValue(): Promise<string> {
    const command = this.modelFeatures?.splitControl?.command ?? "FT";
    const response = await this.queryCommand({ code: command });
    const payload = response.payload?.text;
    if (typeof payload !== "string") {
      throw new Error(`Response for ${command} did not include text payload.`);
    }
    return payload;
  }

  private emitResult(result: RigOperationResult): void {
    for (const listener of this.resultListeners) {
      queueMicrotask(() => listener(result));
    }
  }

  private getControlAdapter(): ProtocolAdapter {
    const adapter = this.protocolAdapter;
    if (!adapter) {
      throw new Error(
        "Protocol adapter is not selected. Call Rig.create/connect with a family first."
      );
    }

    const hasControlMethods =
      typeof adapter.setTxVfo === "function" &&
      typeof adapter.getTxVfo === "function" &&
      typeof adapter.setRxVfo === "function" &&
      typeof adapter.getRxVfo === "function" &&
      typeof adapter.setFrequency === "function" &&
      typeof adapter.getFrequency === "function" &&
      typeof adapter.setModulationMode === "function" &&
      typeof adapter.getModulationMode === "function" &&
      typeof adapter.switchToTx === "function" &&
      typeof adapter.switchToRx === "function";

    if (!hasControlMethods) {
      throw new Error(
        `Protocol family '${this.family}' does not provide baseline control methods.`
      );
    }

    return adapter;
  }

  private useProtocol(family: ProtocolFamily, model?: string): void {
    const modelAdapter = model ? createModelAdapterByName(family, model) : undefined;
    this.protocolAdapter = createProtocolAdapter({ family, modelAdapter });
    this.transportStatus = {
      ...this.transportStatus,
      protocolFamily: family,
      modelId: modelAdapter?.modelId
    };
    this.emitStatus();
  }

  protected resolveConnectSignalOptions(
    options: Pick<RigConnectOptions, "rts" | "dtr"> = {}
  ): { rts?: boolean; dtr?: boolean } {
    const resolved: { rts?: boolean; dtr?: boolean } = {
      rts: options.rts,
      dtr: options.dtr
    };

    const modelPttSignal = this.modelFeatures?.ptt;
    const modelSignals = this.modelFeatures?.signals;
    const modelUsesRtsForPtt =
      modelPttSignal === "rts" ||
      modelSignals?.rts === "ptt-on" ||
      modelSignals?.rts === "ptt-off";
    const modelUsesDtrForPtt =
      modelPttSignal === "dtr" ||
      modelSignals?.dtr === "ptt-on" ||
      modelSignals?.dtr === "ptt-off";

    if (modelUsesRtsForPtt) {
      resolved.rts = false;
    }

    if (modelUsesDtrForPtt) {
      resolved.dtr = false;
    }

    return resolved;
  }

  private async sendBytes(data: Uint8Array): Promise<void> {
    this.assertConnected();
    await this.session!.writeBytes(data);
    this.transportStatus = {
      ...this.transportStatus,
      bytesTx: this.transportStatus.bytesTx + data.byteLength
    };
    this.emitStatus();
  }

  private async sendCommand(command: CatCommand): Promise<void> {
    this.assertConnected();
    this.assertProtocolSelected();
    const payload = this.protocolAdapter!.encodeCommand(command);
    await this.sendBytes(payload);
  }

  private async queryCommand(
    command: CatCommand,
    options: QueryCommandOptions = {}
  ): Promise<CatResponse> {
    this.assertConnected();
    this.assertProtocolSelected();

    const timeoutMs = options.timeoutMs ?? 500;
    const expectedCode = command.code.toUpperCase();

    return new Promise<CatResponse>((resolve, reject) => {
      const listener: RigResponseListener = (response) => {
        const matched = options.match
          ? options.match(response)
          : response.command === expectedCode;

        if (!matched) {
          return;
        }

        clearTimeout(timer);
        this.offResponse(listener);
        resolve(response);
      };

      const timer = setTimeout(() => {
        this.offResponse(listener);
        reject(new Error(`CAT query timed out for command ${command.code}.`));
      }, timeoutMs);

      this.onResponse(listener);
      this.sendCommand(command).catch((error) => {
        clearTimeout(timer);
        this.offResponse(listener);
        reject(error);
      });
    });
  }

  private getTransportStatus(): RigTransportStatus {
    return { ...this.transportStatus };
  }

  private assertConnected(): void {
    if (!this.session) {
      throw new Error("Rig is not connected.");
    }
  }

  private assertProtocolSelected(): void {
    if (!this.protocolAdapter) {
      throw new Error(
        "Protocol adapter is not selected. Call Rig.create/connect with a family first."
      );
    }
  }

  private emitStatus(): void {
    const snapshot = this.getTransportStatus();
    for (const listener of this.statusListeners) {
      queueMicrotask(() => listener(snapshot));
    }
  }

  private emitResponse(response: CatResponse): void {
    for (const listener of this.responseListeners) {
      queueMicrotask(() => listener(response));
    }
  }
}
