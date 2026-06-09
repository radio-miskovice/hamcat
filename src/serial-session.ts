export interface SerialSession {
  writeBytes(data: Uint8Array): Promise<void>;
  writeText(text: string): Promise<void>;
  disconnect(): Promise<void>;
  on(listener: (data: Uint8Array) => void): void;
  off(listener: (data: Uint8Array) => void): void;
}

export interface SerialSignalOptions {
  rts?: boolean;
  dtr?: boolean;
}

interface SerialPortWithInfo extends SerialPort {
  getInfo?: () => unknown;
  getSignals?: () => Promise<unknown>;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function toHex(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function toAscii(data: Uint8Array): string {
  let ascii = "";
  for (const byte of data) {
    ascii += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".";
  }
  return ascii;
}

function serialDiag(event: string, details: Record<string, unknown>): void {
  console.debug(`[hamcat:webserial] ${event}`, details);
}

function describeRuntime(): Record<string, unknown> {
  if (typeof navigator === "undefined") {
    return { navigator: "unavailable" };
  }

  return {
    userAgent: navigator.userAgent,
    platform:
      typeof navigator.platform === "string" && navigator.platform.length > 0
        ? navigator.platform
        : "unknown",
    language: navigator.language
  };
}

function toRuntimeOpenOptions(options: SerialOptions): Record<string, unknown> {
  const normalized: Record<string, unknown> = { baudRate: options.baudRate };
  if (options.dataBits !== undefined) {
    normalized.dataBits = options.dataBits;
  }
  if (options.stopBits !== undefined) {
    normalized.stopBits = options.stopBits;
  }
  if (options.parity !== undefined) {
    normalized.parity = options.parity;
  }
  if (options.bufferSize !== undefined) {
    normalized.bufferSize = options.bufferSize;
  }
  if (options.flowControl !== undefined) {
    normalized.flowControl = options.flowControl;
  }
  return normalized;
}

async function writeWithDiagnostics(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: Uint8Array,
  writeKind: "bytes" | "text"
): Promise<void> {
  const hex = toHex(data);
  const ascii = toAscii(data);
  const desiredSizeBefore = writer.desiredSize;
  const readyStarted = nowMs();
  await writer.ready;
  const readyWaitMs = Number((nowMs() - readyStarted).toFixed(3));
  const started = nowMs();

  serialDiag("writer.write.before", {
    writeKind,
    length: data.byteLength,
    hex,
    ascii,
    desiredSizeBefore,
    readyWaitMs
  });

  try {
    await writer.write(data);
    serialDiag("writer.write.after", {
      writeKind,
      length: data.byteLength,
      hex,
      ascii,
      desiredSizeAfter: writer.desiredSize,
      elapsedMs: Number((nowMs() - started).toFixed(3)),
      ok: true
    });
  } catch (error) {
    serialDiag("writer.write.after", {
      writeKind,
      length: data.byteLength,
      hex,
      ascii,
      desiredSizeAfter: writer.desiredSize,
      elapsedMs: Number((nowMs() - started).toFixed(3)),
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export async function requestSerialPort(
  options?: SerialPortRequestOptions
): Promise<SerialPort> {
  if (!isWebSerialSupported()) {
    throw new Error("Web Serial API is not supported in this browser context.");
  }
  return navigator.serial.requestPort(options);
}

export async function openSerialPort(
  port: SerialPort,
  options: SerialOptions
): Promise<void> {
  serialDiag("runtime.info", describeRuntime());

  const portWithInfo = port as SerialPortWithInfo;
  if (typeof portWithInfo.getInfo === "function") {
    let info: unknown;
    try {
      info = portWithInfo.getInfo();
    } catch (error) {
      info = { error: error instanceof Error ? error.message : String(error) };
    }
    serialDiag("port.info", { info });
  }

  if (!port.readable && !port.writable) {
    serialDiag("port.open.options", {
      options: toRuntimeOpenOptions(options)
    });
    await port.open(options);
    serialDiag("port.open.after", {
      readable: port.readable !== null,
      writable: port.writable !== null
    });
  }
}

export async function closeSerialPort(port: SerialPort): Promise<void> {
  if (port.readable || port.writable) {
    await port.close();
  }
}

export function createWebSerialSession(port: SerialPort): SerialSession {
  if (!port.readable || !port.writable) {
    throw new Error("Serial port streams are not available after opening the port.");
  }

  const readable = port.readable as ReadableStream<Uint8Array>;
  const writable = port.writable as WritableStream<Uint8Array>;

  const reader = readable.getReader();
  const writer = writable.getWriter();

  const dataListeners: Array<(data: Uint8Array) => void> = [];
  let isReading = true;

  const startReader = async () => {
    while (isReading) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          isReading = false;
          break;
        }

        const chunk = value.slice();
        for (const listener of dataListeners) {
          queueMicrotask(() => listener(chunk));
        }
      } catch {
        isReading = false;
        break;
      }
    }
  };

  startReader().catch(() => undefined);

  return {
    async writeBytes(data: Uint8Array) {
      await writeWithDiagnostics(writer, data, "bytes");
    },
    async writeText(text: string) {
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code > 0x7f) {
          throw new Error(
            `Non-ASCII character at position ${i} (code ${code}) is not allowed.`
          );
        }
        bytes[i] = code;
      }
      await writeWithDiagnostics(writer, bytes, "text");
    },
    on(listener: (data: Uint8Array) => void) {
      dataListeners.push(listener);
    },
    off(listener: (data: Uint8Array) => void) {
      const idx = dataListeners.indexOf(listener);
      if (idx !== -1) {
        dataListeners.splice(idx, 1);
      }
    },
    async disconnect() {
      isReading = false;
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      await writer.close().catch(() => undefined);
      writer.releaseLock();
      await closeSerialPort(port);
    }
  };
}

export async function connectSerialSession(
  serialOptions: SerialOptions,
  requestOptions?: SerialPortRequestOptions,
  signalOptions?: SerialSignalOptions
): Promise<SerialSession> {
  const port = await requestSerialPort(requestOptions);
  await openSerialPort(port, serialOptions);

  if (signalOptions && (signalOptions.rts !== undefined || signalOptions.dtr !== undefined)) {
    await port.setSignals({
      requestToSend: signalOptions.rts,
      dataTerminalReady: signalOptions.dtr
    });
    serialDiag("port.setSignals.after", {
      requestToSend: signalOptions.rts,
      dataTerminalReady: signalOptions.dtr
    });

    const portWithInfo = port as SerialPortWithInfo;
    if (typeof portWithInfo.getSignals === "function") {
      try {
        const signals = await portWithInfo.getSignals();
        serialDiag("port.getSignals.afterSetSignals", {
          signals
        });
      } catch (error) {
        serialDiag("port.getSignals.afterSetSignals", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return createWebSerialSession(port);
}

export async function autoConnectWebSerial(
  serialOptions: SerialOptions
): Promise<SerialSession | null> {
  if (!isWebSerialSupported()) {
    return null;
  }

  let ports: SerialPort[];
  try {
    ports = await navigator.serial.getPorts();
  } catch {
    return null;
  }

  if (ports.length === 0) {
    return null;
  }

  const port = ports[0];
  await openSerialPort(port, serialOptions);
  return createWebSerialSession(port);
}
