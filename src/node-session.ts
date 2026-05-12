import { SerialPort as NodeSerialPort } from "serialport";
import type { SerialSession } from "./serial-session";

export function createNodeSerialSession(port: NodeSerialPort): SerialSession {
  const dataListeners: Array<(data: Uint8Array) => void> = [];

  port.on("data", (data: Buffer) => {
    const chunk = new Uint8Array(data);
    for (const listener of dataListeners) {
      queueMicrotask(() => listener(chunk));
    }
  });

  return {
    async writeBytes(data: Uint8Array) {
      await new Promise<void>((resolve, reject) => {
        port.write(data, (err) => (err ? reject(err) : resolve()));
      });
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
      await new Promise<void>((resolve, reject) => {
        port.write(bytes, (err) => (err ? reject(err) : resolve()));
      });
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
      await new Promise<void>((resolve, reject) => {
        port.close((err) => (err ? reject(err) : resolve()));
      });
    }
  };
}
