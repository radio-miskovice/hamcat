import { describe, expect, it } from "vitest";
import { HamcatClient } from "../src/core";
import { Rig } from "../src/rig";
import {
  createProtocolAdapter,
  type CatCommand,
  type ModelProtocolAdapter,
  type ProtocolAdapter
} from "../src/protocol";
import type { SerialSession } from "../src/serial-session";

describe("HamcatClient", () => {
  it("starts disconnected", () => {
    const client = new HamcatClient();
    expect(client.getStatus().connected).toBe(false);
  });

  it("stores selected protocol family in status", () => {
    const client = new HamcatClient();
    client.useProtocol("kenwood");
    expect(client.getStatus().protocolFamily).toBe("kenwood");
  });

  it("maps simplified model string to model adapter", () => {
    const client = new HamcatClient();
    client.useProtocol("kenwood", "qmx");
    expect(client.getStatus().modelId).toBe("qrplabs.qmx");
  });

  it("maps catalog-only model string to generic model adapter", () => {
    const client = new HamcatClient();
    client.useProtocol("kenwood", "ts480");
    expect(client.getStatus().modelId).toBe("kenwood.ts480");
  });
});

describe("Minimal control API", () => {
  it("supports get/set for vfo, frequency and mode on kenwood baseline", async () => {
    const session = new MockSerialSession();
    const client = new HamcatClient();
    client.useProtocol("kenwood");
    await client.connectWithSession(session);

    const control = getBaselineControlAdapter(client);

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
    const client = new HamcatClient();
    client.useProtocol("kenwood");
    await client.connectWithSession(session);

    const control = getBaselineControlAdapter(client);
    await expect(control.switchToTx!(client, { source: "USB" })).rejects.toThrow(
      "requires a model adapter"
    );
  });

  it("uses TS-590 source-aware TX command", async () => {
    const session = new MockSerialSession();
    const client = new HamcatClient();
    client.useProtocol("kenwood", "ts590");
    await client.connectWithSession(session);

    const control = getBaselineControlAdapter(client);
    await control.switchToTx!(client, { source: "USB" });

    expect(session.writes.at(-1)).toBe("TX1;");
  });

  it("maps TS-590 data source command from feature profile", async () => {
    const session = new MockSerialSession();
    const client = new HamcatClient();
    client.useProtocol("kenwood", "ts590");
    await client.connectWithSession(session);

    await client.sendCommand({ code: "DS", args: ["USB"] });

    expect(session.writes.at(-1)).toBe("EX06300001;");
  });

  it("uses QMX plain TX command even when source is requested", async () => {
    const session = new MockSerialSession();
    const client = new HamcatClient();
    client.useProtocol("kenwood", "qmx");
    await client.connectWithSession(session);

    const control = getBaselineControlAdapter(client);
    await control.switchToTx!(client, { source: "USB" });

    expect(session.writes.at(-1)).toBe("TX;");
  });

  it("supports split on/off on kenwood baseline", async () => {
    const session = new MockSerialSession();
    const client = new HamcatClient();
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

    client.useProtocol("kenwood");
    await client.connectWithSession(session);

    const control = getBaselineControlAdapter(client);

    await setSplit(control, client, "on");
    expect(session.writes.slice(-2)).toEqual(["FR0;", "FT1;"]);

    const splitOnPromise = getSplit(control, client);
    await waitForLastWrite("FR;");
    session.emitAscii("FR0;");
    await waitForLastWrite("FT;");
    session.emitAscii("FT1;");
    await expect(splitOnPromise).resolves.toBe("on");

    const splitOffSetPromise = setSplit(control, client, "off");
    await waitForLastWrite("FR;");
    session.emitAscii("FR0;");
    await splitOffSetPromise;
    expect(session.writes.at(-1)).toBe("FR0;");

    const splitOffPromise = getSplit(control, client);
    await waitForLastWrite("FR;");
    session.emitAscii("FR0;");
    await waitForLastWrite("FT;");
    session.emitAscii("FT0;");
    await expect(splitOffPromise).resolves.toBe("off");
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

  it("exposes a compact control surface over HamcatClient", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "qmx");

    const internalClient = (rig as unknown as { client: HamcatClient }).client;
    await internalClient.connectWithSession(session);

    await rig.setRxVfo("A");
    await rig.setTxVfo("A");
    await rig.setFreq(18100000, "A", { verify: false });
    await rig.setMode("USB");
    await rig.tx();
    await rig.rx();

    expect(session.writes.slice(0, 6)).toEqual([
      "FR0;",
      "FT0;",
      "FA00018100000;",
      "MD2;",
      "TX;",
      "RX;"
    ]);
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

    const internalClient = (rig as unknown as { client: HamcatClient }).client;
    await internalClient.connectWithSession(session);

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

    const internalClient = (rig as unknown as { client: HamcatClient }).client;
    await internalClient.connectWithSession(session);

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

  it("supports model-aware split semantics (QMX mode-flag FT=2)", async () => {
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

    const internalClient = (rig as unknown as { client: HamcatClient }).client;
    await internalClient.connectWithSession(session);

    await rig.setSplit("on");
    expect(session.writes.at(-1)).toBe("FT2;");

    const splitOnPromise = rig.getSplit();
    await waitForLastWrite("FT;");
    session.emitAscii("FT2;");
    await expect(splitOnPromise).resolves.toBe("on");

    const splitOffSetPromise = rig.setSplit("off");
    await waitForLastWrite("FT;");
    session.emitAscii("FT2;");
    await splitOffSetPromise;

    expect(session.writes.at(-2)).toBe("FT;");
    expect(session.writes.at(-1)).toBe("FT0;");

    const splitOffPromise = rig.get("split");
    await waitForLastWrite("FT;");
    session.emitAscii("FT0;");
    await expect(splitOffPromise).resolves.toBe("off");
  });

  it("enters and exits split mode for standard FT/FR models", async () => {
    const session = new MockSerialSession();
    const rig = Rig.create("kenwood", "ts590");

    const internalClient = (rig as unknown as { client: HamcatClient }).client;
    await internalClient.connectWithSession(session);

    await rig.setSplit("on");
    expect(session.writes.slice(-2)).toEqual(["FR0;", "FT1;"]);

    await rig.setSplit("off");
    expect(session.writes.at(-1)).toBe("FR0;");
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

function getBaselineControlAdapter(client: HamcatClient): ProtocolAdapter {
  const adapter = client.getProtocolAdapter();
  if (!adapter) {
    throw new Error("Expected protocol adapter to be selected.");
  }
  return adapter;
}

async function setSplit(
  adapter: ProtocolAdapter,
  client: HamcatClient,
  mode: "on" | "off"
): Promise<void> {
  if (!adapter.setRxVfo || !adapter.setTxVfo || !adapter.getRxVfo) {
    throw new Error("Baseline split control is not available on this adapter.");
  }

  if (mode === "on") {
    await adapter.setRxVfo(client, "A");
    await adapter.setTxVfo(client, "B");
    return;
  }

  const rxVfo = await adapter.getRxVfo(client);
  await adapter.setRxVfo(client, rxVfo);
}

async function getSplit(adapter: ProtocolAdapter, client: HamcatClient): Promise<"on" | "off"> {
  if (!adapter.getRxVfo || !adapter.getTxVfo) {
    throw new Error("Baseline split query is not available on this adapter.");
  }
  const rxVfo = await adapter.getRxVfo(client);
  const txVfo = await adapter.getTxVfo(client);
  return rxVfo === txVfo ? "off" : "on";
}
