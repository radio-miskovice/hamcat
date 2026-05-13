import { HamcatClient, type HamcatStatus, type StatusListener } from "./core";
import type { ModulationMode, TxSwitchOptions, VfoId } from "./control/types";
import type { CatResponse, ProtocolAdapter, ProtocolFamily } from "./protocol";
import { connectSerialSession, type SerialSession } from "./serial-session";
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

export interface RigStatus extends HamcatStatus {
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

export type RigFunction =
  | "freq"
  | "mode"
  | "rxVfo"
  | "txVfo"
  | "split"
  | "tx"
  | "rx"
  | "dataSource";

export type SplitMode = "on" | "off";

export interface RigInterface {
  readonly features: RigModelFeatures | null;

  connect(baudRate: number, options?: RigConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<RigStatus>;

  onStatus(listener: StatusListener): void;
  offStatus(listener: StatusListener): void;
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
  setSplit(mode: SplitMode): Promise<void>;
  getSplit(): Promise<SplitMode>;
  tx(options?: TxSwitchOptions): Promise<void>;
  rx(): Promise<void>;

  get(functionName: RigFunction, options?: { vfo?: VfoId }): Promise<unknown>;
  set(
    functionName: RigFunction,
    data?: unknown,
    options?: { vfo?: VfoId; source?: string }
  ): Promise<void>;

  listModels(options?: RigListModelsOptions): RigListedModel[];
}

export class Rig implements RigInterface {
  private readonly modelFeatures: RigModelFeatures | null;
  private readonly responseListeners: RigResponseListener[] = [];
  private readonly resultListeners: RigResultListener[] = [];

  protected constructor(
    private readonly family: ProtocolFamily,
    private readonly model?: string
  ) {
    this.modelFeatures = model ? getModelFeatures(family, model) : null;
    this.client.useProtocol(family, model);
    this.client.on("response", (response: CatResponse) => {
      for (const listener of this.responseListeners) {
        queueMicrotask(() => listener(response));
      }
    });
  }

  private readonly client = new HamcatClient();

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
        {
          rts: options.rts,
          dtr: options.dtr
        }
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
    await this.client.disconnect();
  }

  public async connectWithSession(session: SerialSession): Promise<void> {
    await this.client.connectWithSession(session);
  }

  async getStatus(): Promise<RigStatus> {
    const transport = this.client.getStatus();
    if (!transport.connected) {
      return transport;
    }

    const control = this.getControlAdapter();

    const rxVfo = await control.getRxVfo!(this.client);
    const txVfo = await control.getTxVfo!(this.client);
    const frequencyAHz = await control.getFrequency!(this.client, "A");
    const frequencyBHz = await control.getFrequency!(this.client, "B");
    const mode = await control.getModulationMode!(this.client);

    return {
      ...transport,
      rxVfo,
      txVfo,
      frequencyAHz,
      frequencyBHz,
      mode
    };
  }

  onStatus(listener: StatusListener): void {
    this.client.on("status", listener);
  }

  offStatus(listener: StatusListener): void {
    this.client.off("status", listener);
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
    await this.client.sendCommand({ code, args });
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
    const response = await this.client.queryCommand({ code, args });
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
    await control.setFrequency!(this.client, vfo, hz);

    if (options.verify === false) {
      return {
        vfo,
        requestedHz: hz,
        appliedHz: hz,
        accepted: true
      };
    }

    const appliedHz = await control.getFrequency!(this.client, vfo);
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
    return this.getControlAdapter().getFrequency!(this.client, vfo);
  }

  async setMode(mode: ModulationMode): Promise<void> {
    await this.getControlAdapter().setModulationMode!(this.client, mode);
  }

  async getMode(): Promise<ModulationMode> {
    return this.getControlAdapter().getModulationMode!(this.client);
  }

  async setRxVfo(vfo: VfoId): Promise<void> {
    await this.getControlAdapter().setRxVfo!(this.client, vfo);
  }

  async getRxVfo(): Promise<VfoId> {
    const splitControl = this.modelFeatures?.splitControl;
    if (splitControl?.kind === "mode-flag") {
      const value = await this.querySplitModeValue();
      if (value === splitControl.splitValue) {
        return splitControl.splitRxVfo ?? "A";
      }
    }
    return this.getControlAdapter().getRxVfo!(this.client);
  }

  async setTxVfo(vfo: VfoId): Promise<void> {
    await this.getControlAdapter().setTxVfo!(this.client, vfo);
  }

  async getTxVfo(): Promise<VfoId> {
    const splitControl = this.modelFeatures?.splitControl;
    if (splitControl?.kind === "mode-flag") {
      const value = await this.querySplitModeValue();
      if (value === splitControl.splitValue) {
        return splitControl.splitTxVfo ?? "B";
      }
    }
    return this.getControlAdapter().getTxVfo!(this.client);
  }

  async setSplit(mode: SplitMode): Promise<void> {
    const splitControl = this.modelFeatures?.splitControl;
    if (splitControl?.kind === "mode-flag") {
      const command = splitControl.command ?? "FT";
      const splitValue = splitControl.splitValue ?? "2";
      const defaultSimplex = splitControl.vfoAValue ?? "0";

      if (mode === "on") {
        await this.client.sendCommand({ code: command, args: [splitValue] });
        return;
      }

      const current = await this.querySplitModeValue();
      const target = current === splitValue ? defaultSimplex : current;
      await this.client.sendCommand({ code: command, args: [target] });
      return;
    }

    if (splitControl?.kind === "vfo-pair") {
      const rxVfo = await this.getRxVfo();
      const oppositeVfo: VfoId = rxVfo === "A" ? "B" : "A";

      if (mode === "on") {
        await this.setTxVfo(oppositeVfo);
        return;
      }

      await this.setTxVfo(rxVfo);
      return;
    }

    const splitRxVfo = splitControl?.splitRxVfo ?? "A";
    const splitTxVfo = splitControl?.splitTxVfo ?? "B";

    if (mode === "on") {
      await this.setRxVfo(splitRxVfo);
      await this.setTxVfo(splitTxVfo);
      return;
    }

    // FR selection on TS-590 explicitly returns rig to simplex state.
    await this.setRxVfo(splitRxVfo);
  }

  async getSplit(): Promise<SplitMode> {
    const splitControl = this.modelFeatures?.splitControl;
    if (splitControl?.kind === "mode-flag") {
      const splitValue = splitControl.splitValue ?? "2";
      const value = await this.querySplitModeValue();
      return value === splitValue ? "on" : "off";
    }

    const rxVfo = await this.getRxVfo();
    const txVfo = await this.getTxVfo();
    return rxVfo === txVfo ? "off" : "on";
  }

  async tx(options?: TxSwitchOptions): Promise<void> {
    await this.getControlAdapter().switchToTx!(this.client, options);
  }

  async rx(): Promise<void> {
    await this.getControlAdapter().switchToRx!(this.client);
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
      case "split":
        return this.getSplit();
      case "tx":
      case "rx":
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
      case "split": {
        if (data !== "on" && data !== "off") {
          throw new Error("set('split') requires 'on' or 'off'.");
        }
        await this.setSplit(data);
        return;
      }
      case "tx": {
        await this.tx(options?.source ? ({ source: options.source } as TxSwitchOptions) : undefined);
        return;
      }
      case "rx": {
        await this.rx();
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
    const response = await this.client.queryCommand({ code: command });
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
    const adapter = this.client.getProtocolAdapter();
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
}
