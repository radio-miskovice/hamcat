import {
  type SerialSession,
  connectSerialSession
} from "./serial-session";
import {
  createProtocolAdapter,
  type CatCommand,
  type CatResponse,
  type ModelProtocolAdapter,
  type ProtocolAdapter,
  type ProtocolFamily
} from "./protocol";
import { createModelAdapterByName } from "./models";

export type { SerialSession };

export interface HamcatConnectOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

export interface HamcatStatus {
  connected: boolean;
  bytesTx: number;
  bytesRx: number;
  protocolFamily?: ProtocolFamily;
  modelId?: string;
}

export type DataListener = (data: Uint8Array) => void;
export type StatusListener = (status: HamcatStatus) => void;
export type ResponseListener = (response: CatResponse) => void;

export interface QueryCommandOptions {
  timeoutMs?: number;
  match?: (response: CatResponse) => boolean;
}

export class HamcatClient {
  private session: SerialSession | null = null;
  private protocolAdapter: ProtocolAdapter | null = null;
  private readonly dataListeners: DataListener[] = [];
  private readonly statusListeners: StatusListener[] = [];
  private readonly responseListeners: ResponseListener[] = [];
  private status: HamcatStatus = {
    connected: false,
    bytesTx: 0,
    bytesRx: 0
  };

  async connect(baudRate: number): Promise<void> {
    const session = await connectSerialSession({ baudRate });
    await this.connectWithSession(session);
  }

  useProtocol(family: ProtocolFamily, model?: string): void {
    const modelAdapter = model ? createModelAdapterByName(family, model) : undefined;
    this.protocolAdapter = createProtocolAdapter({ family, modelAdapter });
    this.status = {
      ...this.status,
      protocolFamily: family,
      modelId: modelAdapter?.modelId
    };
    this.emitStatus();
  }

  useProtocolAdapter(adapter: ProtocolAdapter): void {
    this.protocolAdapter = adapter;
    this.status = {
      ...this.status,
      protocolFamily: adapter.family,
      modelId: adapter.modelId
    };
    this.emitStatus();
  }

  setModelAdapter(modelAdapter: ModelProtocolAdapter | null): void {
    this.assertProtocolSelected();
    this.protocolAdapter!.setModelAdapter(modelAdapter);
    this.status = {
      ...this.status,
      modelId: modelAdapter?.modelId
    };
    this.emitStatus();
  }

  async connectWithSession(session: SerialSession): Promise<void> {
    if (this.session) {
      throw new Error("Client is already connected.");
    }

    this.session = session;
    this.status = {
      protocolFamily: this.status.protocolFamily,
      modelId: this.status.modelId,
      connected: true,
      bytesTx: 0,
      bytesRx: 0
    };

    this.session.on((data) => {
      this.status = {
        ...this.status,
        bytesRx: this.status.bytesRx + data.byteLength
      };

      if (this.protocolAdapter) {
        const responses = this.protocolAdapter.decodeIncoming(data);
        for (const response of responses) {
          for (const listener of this.responseListeners) {
            queueMicrotask(() => listener(response));
          }
        }
      }

      this.emitStatus();
      for (const listener of this.dataListeners) {
        queueMicrotask(() => listener(data));
      }
    });

    this.emitStatus();
  }

  async disconnect(): Promise<void> {
    if (!this.session) {
      return;
    }

    await this.session.disconnect();
    this.session = null;
    this.status = {
      ...this.status,
      connected: false
    };
    this.emitStatus();
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    this.assertConnected();
    await this.session!.writeBytes(data);
    this.status = {
      ...this.status,
      bytesTx: this.status.bytesTx + data.byteLength
    };
    this.emitStatus();
  }

  async sendCommand(command: CatCommand): Promise<void> {
    this.assertConnected();
    this.assertProtocolSelected();
    const payload = this.protocolAdapter!.encodeCommand(command);
    await this.sendBytes(payload);
  }

  async queryCommand(
    command: CatCommand,
    options: QueryCommandOptions = {}
  ): Promise<CatResponse> {
    this.assertConnected();
    this.assertProtocolSelected();

    const timeoutMs = options.timeoutMs ?? 500;
    const expectedCode = command.code.toUpperCase();

    return new Promise<CatResponse>((resolve, reject) => {
      const listener: ResponseListener = (response) => {
        const matched = options.match
          ? options.match(response)
          : response.command === expectedCode;

        if (!matched) {
          return;
        }

        clearTimeout(timer);
        this.off("response", listener);
        resolve(response);
      };

      const timer = setTimeout(() => {
        this.off("response", listener);
        reject(new Error(`CAT query timed out for command ${command.code}.`));
      }, timeoutMs);

      this.on("response", listener);
      this.sendCommand(command).catch((error) => {
        clearTimeout(timer);
        this.off("response", listener);
        reject(error);
      });
    });
  }

  on(
    eventName: "data" | "status" | "response",
    listener: DataListener | StatusListener | ResponseListener
  ): void {
    if (eventName === "data") {
      this.dataListeners.push(listener as DataListener);
      return;
    }

    if (eventName === "response") {
      this.responseListeners.push(listener as ResponseListener);
      return;
    }

    this.statusListeners.push(listener as StatusListener);
  }

  off(
    eventName: "data" | "status" | "response",
    listener: DataListener | StatusListener | ResponseListener
  ): void {
    if (eventName === "data") {
      const idx = this.dataListeners.indexOf(listener as DataListener);
      if (idx !== -1) {
        this.dataListeners.splice(idx, 1);
      }
      return;
    }

    if (eventName === "response") {
      const idx = this.responseListeners.indexOf(listener as ResponseListener);
      if (idx !== -1) {
        this.responseListeners.splice(idx, 1);
      }
      return;
    }

    const idx = this.statusListeners.indexOf(listener as StatusListener);
    if (idx !== -1) {
      this.statusListeners.splice(idx, 1);
    }
  }

  getStatus(): HamcatStatus {
    return { ...this.status };
  }

  getProtocolAdapter(): ProtocolAdapter | null {
    return this.protocolAdapter;
  }

  private assertConnected(): void {
    if (!this.session) {
      throw new Error("Client is not connected.");
    }
  }

  private assertProtocolSelected(): void {
    if (!this.protocolAdapter) {
      throw new Error(
        "Protocol adapter is not selected. Use useProtocol() or useProtocolAdapter()."
      );
    }
  }

  private emitStatus(): void {
    const snapshot = { ...this.status };
    for (const listener of this.statusListeners) {
      queueMicrotask(() => listener(snapshot));
    }
  }
}
