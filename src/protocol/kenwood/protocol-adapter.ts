import { BaseTextFamilyAdapter } from "../base-family-adapter";
import type {
  ModulationMode,
  TxSwitchOptions,
  VfoId
} from "../../control/types";
import type { ProtocolControlClient } from "../types";

const KENWOOD_MODE_TO_CODE: Record<ModulationMode, string> = {
  LSB: "1",
  USB: "2",
  CW: "3",
  FM: "4",
  AM: "5",
  FSK: "6",
  "CW-R": "7",
  DATA: "9",
  "FSK-R": "0"
};

const KENWOOD_CODE_TO_MODE: Record<string, ModulationMode> = {
  "1": "LSB",
  "2": "USB",
  "3": "CW",
  "4": "FM",
  "5": "AM",
  "6": "FSK",
  "7": "CW-R",
  "9": "DATA",
  "0": "FSK-R"
};

export class KenwoodProtocolAdapter extends BaseTextFamilyAdapter {
  constructor() {
    super("kenwood", ";");
  }

  async setTxVfo(client: ProtocolControlClient, vfo: VfoId): Promise<void> {
    this.assertKenwoodFamily(client);
    await client.sendCommand({ code: "FT", args: [this.vfoToKenwood(vfo)] });
  }

  async getTxVfo(client: ProtocolControlClient): Promise<VfoId> {
    this.assertKenwoodFamily(client);
    const response = await client.queryCommand({ code: "FT" });
    return this.parseKenwoodVfo(this.readPayloadText(response));
  }

  async setRxVfo(client: ProtocolControlClient, vfo: VfoId): Promise<void> {
    this.assertKenwoodFamily(client);
    await client.sendCommand({ code: "FR", args: [this.vfoToKenwood(vfo)] });
  }

  async getRxVfo(client: ProtocolControlClient): Promise<VfoId> {
    this.assertKenwoodFamily(client);
    const response = await client.queryCommand({ code: "FR" });
    return this.parseKenwoodVfo(this.readPayloadText(response));
  }

  async setFrequency(
    client: ProtocolControlClient,
    vfo: VfoId,
    frequencyHz: number
  ): Promise<void> {
    this.assertKenwoodFamily(client);
    this.assertFrequency(frequencyHz);
    const code = vfo === "A" ? "FA" : "FB";
    await client.sendCommand({
      code,
      args: [this.formatKenwoodFrequency(frequencyHz)]
    });
  }

  async getFrequency(client: ProtocolControlClient, vfo: VfoId): Promise<number> {
    this.assertKenwoodFamily(client);
    const code = vfo === "A" ? "FA" : "FB";
    const response = await client.queryCommand({ code });
    const payload = this.readPayloadText(response);
    const value = Number.parseInt(payload, 10);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid frequency payload: ${payload}`);
    }
    return value;
  }

  async setModulationMode(
    client: ProtocolControlClient,
    mode: ModulationMode
  ): Promise<void> {
    this.assertKenwoodFamily(client);
    const code = KENWOOD_MODE_TO_CODE[mode];
    if (!code) {
      throw new Error(`Unsupported modulation mode: ${mode}`);
    }
    await client.sendCommand({ code: "MD", args: [code] });
  }

  async getModulationMode(client: ProtocolControlClient): Promise<ModulationMode> {
    this.assertKenwoodFamily(client);
    const response = await client.queryCommand({ code: "MD" });
    const payload = this.readPayloadText(response);
    const mode = KENWOOD_CODE_TO_MODE[payload];
    if (!mode) {
      throw new Error(`Unknown modulation mode code: ${payload}`);
    }
    return mode;
  }

  async switchToTx(
    client: ProtocolControlClient,
    options?: TxSwitchOptions
  ): Promise<void> {
    this.assertKenwoodFamily(client);

    if (!options?.source) {
      await client.sendCommand({ code: "TX" });
      return;
    }

    const status = client.getStatus();
    if (!status.modelId) {
      throw new Error(
        "TX source selection requires a model adapter for vendor/model-specific commands."
      );
    }

    await client.sendCommand({ code: "TX", args: [options.source] });
  }

  async switchToRx(client: ProtocolControlClient): Promise<void> {
    this.assertKenwoodFamily(client);
    await client.sendCommand({ code: "RX" });
  }

  async setSplit(client: ProtocolControlClient, on: boolean): Promise<void> {
    this.assertKenwoodFamily(client);

    const splitActionCommand = this.getSplitActionCommand(client);
    if (splitActionCommand) {
      const raw = on ? splitActionCommand.on : splitActionCommand.off;
      await client.sendCommand({ code: "", raw });
      return;
    }

    const rxVfo = await this.getRxVfo(client);
    if (!on) {
      await this.setTxVfo(client, rxVfo);
      return;
    }

    const txVfo: VfoId = rxVfo === "A" ? "B" : "A";
    const freqA = await this.getFrequency(client, "A");
    const freqB = await this.getFrequency(client, "B");

    await this.setTxVfo(client, txVfo);
    if (freqA === freqB) {
      const splitTxFreq = (txVfo === "A" ? freqA : freqB) + 1000;
      await this.setFrequency(client, txVfo, splitTxFreq);
    }
  }

  async getSplit(client: ProtocolControlClient): Promise<boolean> {
    this.assertKenwoodFamily(client);

    const splitActionCommand = this.getSplitActionCommand(client);
    if (splitActionCommand?.get) {
      const code = this.extractCommandCode(splitActionCommand.get);
      const response = await client.queryCommand({
        code,
        raw: splitActionCommand.get
      });

      const payload = this.readPayloadText(response).trim().toUpperCase();
      if (["1", "ON", "TRUE", "T", "YES", "Y"].includes(payload)) {
        return true;
      }
      if (["0", "OFF", "FALSE", "F", "NO", "N"].includes(payload)) {
        return false;
      }
      throw new Error(`Unexpected split-state payload: ${payload || "<empty>"}`);
    }

    const rxVfo = await this.getRxVfo(client);
    const txVfo = await this.getTxVfo(client);
    return rxVfo !== txVfo;
  }

  private assertKenwoodFamily(client: ProtocolControlClient): void {
    const status = client.getStatus();
    if (status.protocolFamily !== "kenwood") {
      throw new Error(
        "Minimal control baseline is currently implemented for kenwood family."
      );
    }
  }

  private vfoToKenwood(vfo: VfoId): string {
    return vfo === "A" ? "0" : "1";
  }

  private parseKenwoodVfo(payload: string): VfoId {
    if (payload === "0") {
      return "A";
    }
    if (payload === "1") {
      return "B";
    }
    throw new Error(`Unexpected VFO payload: ${payload}`);
  }

  private formatKenwoodFrequency(frequencyHz: number): string {
    return frequencyHz.toString().padStart(11, "0");
  }

  private assertFrequency(frequencyHz: number): void {
    if (!Number.isInteger(frequencyHz) || frequencyHz < 0) {
      throw new Error("Frequency must be a non-negative integer in Hz.");
    }
  }

  private readPayloadText(response: { payload?: Record<string, unknown> }): string {
    const value = response.payload?.text;
    if (typeof value !== "string") {
      throw new Error("Response does not contain text payload.");
    }
    return value;
  }

  private getSplitActionCommand(
    client: ProtocolControlClient
  ): { on: string; off: string; get?: string } | undefined {
    const splitAction = client.getStatus().splitAction;
    return splitAction?.command;
  }

  private extractCommandCode(raw: string): string {
    const match = /^\s*([A-Za-z]{2})/.exec(raw);
    if (!match) {
      throw new Error(`Split action query command must start with a CAT command code: '${raw}'`);
    }
    return match[1].toUpperCase();
  }
}
