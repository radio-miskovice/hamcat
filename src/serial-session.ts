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
  if (!port.readable && !port.writable) {
    await port.open(options);
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
      await writer.write(data);
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
      await writer.write(bytes);
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
