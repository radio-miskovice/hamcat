import { describe, expect, it } from "vitest";
import { Rig } from "../src/rig";
import {
  createProtocolAdapter,
  type CatCommand,
  type ProtocolControlClient,
  type ModelProtocolAdapter,
  type ProtocolAdapter
} from "../src/protocol";
import type { SerialSession } from "../src/serial-session";

describe("Rig transport status", () => {
  it("starts disconnected", async () => {
    const rig = Rig.create("kenwood");
    const status = await rig.getStatus();
    expect(status.connected).toBe(false);
  });

  it("stores selected protocol family in status", async () => {
    const rig = Rig.create("kenwood");
    const status = await rig.getStatus();
    expect(status.protocolFamily).toBe("kenwood");
  });

  it("maps simplified model string to model adapter", async () => {
    const rig = Rig.create("kenwood", "qmx");
    const status = await rig.getStatus();
    expect(status.modelId).toBe("qrplabs.qmx");
  });

  it("maps catalog-only model string to generic model adapter", async () => {
    const rig = Rig.create("kenwood", "ts480");
    const status = await rig.getStatus();
    expect(status.modelId).toBe("kenwood.ts480");
  });

  it("forces RTS low on connect when model uses RTS for PTT", () => {
    const rig = Rig.create("kenwood", "tx500");
    expect(
      (
        rig as unknown as {
          resolveConnectSignalOptions: (options: { rts?: boolean; dtr?: boolean }) => {
            rts?: boolean;
            dtr?: boolean;
          };
        }
      ).resolveConnectSignalOptions({ rts: true, dtr: true })
    ).toEqual({
      rts: false,
      dtr: true
    });
  });

  it("keeps connect signal options when model does not bind PTT to RTS/DTR", () => {
    const rig = Rig.create("kenwood", "qmx");
    expect(
      (
        rig as unknown as {
          resolveConnectSignalOptions: (options: { rts?: boolean; dtr?: boolean }) => {
            rts?: boolean;
            dtr?: boolean;
          };
        }
      ).resolveConnectSignalOptions({ rts: true, dtr: false })
    ).toEqual({
      rts: true,
      dtr: false
    });
  });
});

describe("Minimal control API", () => {
  it("supports get/set for vfo, frequency and mode on kenwood baseline", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood");
    await rig.connectWithSession(session);

    const control = getBaselineControlAdapter(rig);
    const client = getProtocolClient(rig);

    await control.setRxVfo!(client, "B");
    await control.setTxVfo!(client, "A");
    await control.setFrequency!(client, "A", 14074000);
    await control.setModulationMode!(client, "DATA");

    expect(session.writes.slice(0, 4)).toEqual([
      "FR1;",
      "FT0;",
      "FA00014074000;",
      "MD9;"
    ]);

    const rxVfoPromise = control.getRxVfo!(client);
    session.emitAscii("FR1;");
    await expect(rxVfoPromise).resolves.toBe("B");

    const freqPromise = control.getFrequency!(client, "A");
    session.emitAscii("FA00014074000;");
    await expect(freqPromise).resolves.toBe(14074000);

    const modePromise = control.getModulationMode!(client);
    session.emitAscii("MD9;");
    await expect(modePromise).resolves.toBe("DATA");

    await control.switchToTx!(client);
    await control.switchToRx!(client);

    expect(session.writes.at(-2)).toBe("TX;");
    expect(session.writes.at(-1)).toBe("RX;");
  });

  it("requires model adapter when tx source is requested", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood");
    await rig.connectWithSession(session);

    const control = getBaselineControlAdapter(rig);
    const client = getProtocolClient(rig);
    await expect(control.switchToTx!(client, { source: "USB" })).rejects.toThrow(
      "requires a model adapter"
    );
  });

  it("uses TS-590 source-aware TX command", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "ts590");
    await rig.connectWithSession(session);

    const control = getBaselineControlAdapter(rig);
    const client = getProtocolClient(rig);
    await control.switchToTx!(client, { source: "USB" });

    expect(session.writes.at(-1)).toBe("TX1;");
  });

  it("maps TS-590 data source command from feature profile", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "ts590");
    await rig.connectWithSession(session);

    await rig.sendCat("DS", ["USB"]);

    expect(session.writes.at(-1)).toBe("EX06300001;");
  });

  it("uses QMX plain TX command even when source is requested", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");
    await rig.connectWithSession(session);

    const control = getBaselineControlAdapter(rig);
    const client = getProtocolClient(rig);
    await control.switchToTx!(client, { source: "USB" });

    expect(session.writes.at(-1)).toBe("TX;");
  });

});

describe("Protocol adapters", () => {
  it("encodes base kenwood command with semicolon", () => {
    const adapter = createProtocolAdapter({ family: "kenwood" });
    const encoded = adapter.encodeCommand({ code: "FA", args: ["00014000000"] });
    const text = new TextDecoder().decode(encoded);
    expect(text).toBe("FA00014000000;");
  });

  it("allows model adapter to override command encoding", () => {
    const modelAdapter: ModelProtocolAdapter = {
      modelId: "elecraft-kx3",
      buildCommand(command: CatCommand) {
        if (command.code !== "EX") {
          return null;
        }
        return new TextEncoder().encode("EX001;");
      }
    };

    const adapter = createProtocolAdapter({
      family: "kenwood",
      modelAdapter
    });

    const encoded = adapter.encodeCommand({ code: "EX" });
    const text = new TextDecoder().decode(encoded);
    expect(text).toBe("EX001;");
    expect(adapter.modelId).toBe("elecraft-kx3");
  });

  it("implements standard kenwood split with TX on opposite VFO and +1kHz bump when A/B are equal", async () => {
    const adapter = createProtocolAdapter({ family: "kenwood" });

    let rxVfo: "A" | "B" = "A";
    let txVfo: "A" | "B" = "A";
    let freqA = 14074000;
    let freqB = 14074000;

    const client: ProtocolControlClient = {
      getStatus: () => ({ protocolFamily: "kenwood" }),
      async sendCommand(command) {
        const code = command.code.toUpperCase();
        const arg = command.args?.[0] ?? "";
        if (code === "FR") {
          rxVfo = arg === "1" ? "B" : "A";
          return;
        }
        if (code === "FT") {
          txVfo = arg === "1" ? "B" : "A";
          return;
        }
        if (code === "FA") {
          freqA = Number.parseInt(arg, 10);
          return;
        }
        if (code === "FB") {
          freqB = Number.parseInt(arg, 10);
        }
      },
      async queryCommand(command) {
        const code = command.code.toUpperCase();
        if (code === "FR") {
          return {
            family: "kenwood",
            raw: `FR${rxVfo === "A" ? "0" : "1"};`,
            command: "FR",
            payload: { text: rxVfo === "A" ? "0" : "1" }
          };
        }
        if (code === "FT") {
          return {
            family: "kenwood",
            raw: `FT${txVfo === "A" ? "0" : "1"};`,
            command: "FT",
            payload: { text: txVfo === "A" ? "0" : "1" }
          };
        }
        if (code === "FA") {
          return {
            family: "kenwood",
            raw: `FA${freqA.toString().padStart(11, "0")};`,
            command: "FA",
            payload: { text: freqA.toString().padStart(11, "0") }
          };
        }
        return {
          family: "kenwood",
          raw: `FB${freqB.toString().padStart(11, "0")};`,
          command: "FB",
          payload: { text: freqB.toString().padStart(11, "0") }
        };
      }
    };

    await adapter.setSplit!(client, true);
    expect(txVfo).toBe("B");
    expect(freqB).toBe(14075000);

    await adapter.setSplit!(client, false);
    expect(txVfo).toBe(rxVfo);

    await expect(adapter.getSplit!(client)).resolves.toBe(false);
  });
});

describe("Rig facade", () => {
  it("lists available models and supports filtering", () => {
    const all = Rig.listModels();
    expect(all.some((entry) => entry.modelId === "qrplabs.qmx")).toBe(true);
    expect(all.some((entry) => entry.modelId === "kenwood.ts590")).toBe(true);
    expect(all.some((entry) => entry.modelId === "kenwood.ts480")).toBe(true);
    expect(all.some((entry) => entry.modelId === "kenwood.ts450")).toBe(true);
    expect(all.some((entry) => entry.modelId === "kenwood.ts690")).toBe(true);
    expect(all.some((entry) => entry.modelId === "elecraft.kx3")).toBe(true);

    const byFamily = Rig.listModels({ family: "kenwood" });
    expect(byFamily.length).toBeGreaterThanOrEqual(5);

    const byVendor = Rig.listModels({ vendor: "qrp" });
    expect(byVendor.map((entry) => entry.modelId)).toContain("qrplabs.qmx");

    const byPartialModel = Rig.listModels({ model: "590" });
    expect(byPartialModel.map((entry) => entry.modelId)).toContain("kenwood.ts590");

    const rig = Rig.create("kenwood", "qmx");
    expect(rig.listModels({ model: "qmx" }).map((entry) => entry.modelId)).toContain("qrplabs.qmx");
  });

  it("exposes a compact control surface over Rig transport/protocol core", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");

    await rig.connectWithSession(session);

    await rig.setRxVfo("A");
    await rig.setTxVfo("A");
    await rig.setFreq(18100000, "A", { verify: false });
    await rig.setMode("USB");
    await rig.setTx(true);
    await rig.setTx(false);

    expect(session.writes.slice(0, 8)).toEqual([
      "FR0;",
      "SP0;",
      "FT0;",
      "SP0;",
      "FA00018100000;",
      "MD2;",
      "TX;",
      "RX;"
    ]);
  });

  it("uses model splitAction commands for QMX split toggling", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");
    await rig.connectWithSession(session);

    await rig.setRxVfo("A");
    await rig.setTxVfo("B");
    await rig.setTxVfo("A");

    expect(session.writes).toContain("SP1;");
    expect(session.writes.filter((write) => write === "SP0;").length).toBeGreaterThanOrEqual(1);
  });

  it("uses splitAction commands for setSplit/getSplit on QMX", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");
    await rig.connectWithSession(session);

    await rig.setSplit(true);
    expect(session.writes.at(-1)).toBe("SP1;");

    const getOnPromise = rig.getSplit();
    expect(session.writes.at(-1)).toBe("SP;");
    session.emitAscii("SP1;");
    await expect(getOnPromise).resolves.toBe(true);

    await rig.setSplit(false);
    expect(session.writes.at(-1)).toBe("SP0;");

    const getOffPromise = rig.getSplit();
    expect(session.writes.at(-1)).toBe("SP;");
    session.emitAscii("SP0;");
    await expect(getOffPromise).resolves.toBe(false);
  });

  it("returns last set PTT state when protocol has no PTT readback", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");

    await rig.connectWithSession(session);

    await expect(rig.getTxState()).resolves.toBe(false);
    await rig.setTx(true);
    await expect(rig.getTxState()).resolves.toBe(true);
    await rig.setTx(false);
    await expect(rig.getTxState()).resolves.toBe(false);
  });

  it("reports adjusted frequency when rig does not accept requested value", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");
    const waitForLastWrite = async (expected: string): Promise<void> => {
      for (let i = 0; i < 20; i++) {
        if (session.writes.at(-1) === expected) {
          return;
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
      throw new Error(`Timed out waiting for write ${expected}.`);
    };

    await rig.connectWithSession(session);

    const setPromise = rig.setFreq(18100000, "A");
    await waitForLastWrite("FA;");
    session.emitAscii("FA00014000000;");
    await expect(setPromise).resolves.toEqual({
      vfo: "A",
      requestedHz: 18100000,
      appliedHz: 14000000,
      accepted: false
    });
  });

  it("fails when selected family does not provide baseline control", async () => {
    const rig = Rig.create("icom");
    await expect(rig.setMode("USB")).rejects.toThrow(
      "does not provide baseline control methods"
    );
  });

  it("emits CAT response and operation result events", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");

    await rig.connectWithSession(session);

    const responses: string[] = [];
    const results: string[] = [];

    rig.onResponse((response) => {
      responses.push(response.command ?? "");
    });
    rig.onResult((result) => {
      results.push(result.operation);
    });

    const queryPromise = rig.queryCat("FA");
    session.emitAscii("FA00014000000;");
    await queryPromise;

    await rig.sendCat("TX");

    expect(responses).toContain("FA");
    expect(results).toContain("queryCat");
    expect(results).toContain("sendCat");
  });


});

class MockSerialSession implements SerialSession {
  private listeners: Array<(data: Uint8Array) => void> = [];
  readonly writes: string[] = [];

  async writeBytes(data: Uint8Array): Promise<void> {
    this.writes.push(new TextDecoder().decode(data));
  }

  async writeText(text: string): Promise<void> {
    this.writes.push(text);
  }

  async disconnect(): Promise<void> {
    return;
  }

  on(listener: (data: Uint8Array) => void): void {
    this.listeners.push(listener);
  }

  off(listener: (data: Uint8Array) => void): void {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
      this.listeners.splice(idx, 1);
    }
  }

  emitAscii(raw: string): void {
    const chunk = new TextEncoder().encode(raw);
    for (const listener of this.listeners) {
      listener(chunk);
    }
  }
}

function getBaselineControlAdapter(rig: Rig): ProtocolAdapter {
  const adapter = (rig as unknown as { getControlAdapter: () => ProtocolAdapter }).getControlAdapter();
  if (!adapter) {
    throw new Error("Expected protocol adapter to be selected.");
  }
  return adapter;
}

function getProtocolClient(rig: Rig): ProtocolControlClient {
  return (rig as unknown as { protocolClient: ProtocolControlClient }).protocolClient;
}
