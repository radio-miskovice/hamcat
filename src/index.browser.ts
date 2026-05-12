/**
 * Browser entry point — Web Serial API only.
 */

export * from "./rig";
export * from "./protocol";
export * from "./control";
export * from "./models";
export {
  isWebSerialSupported,
  requestSerialPort,
  openSerialPort,
  closeSerialPort,
  createWebSerialSession,
  connectSerialSession,
  autoConnectWebSerial
} from "./serial-session";

import { Rig } from "./rig";
import {
  isWebSerialSupported,
  requestSerialPort,
  openSerialPort,
  closeSerialPort,
  connectSerialSession
} from "./serial-session";

if (typeof window !== "undefined") {
  (window as typeof window & { Hamcat?: unknown }).Hamcat = {
    isWebSerialSupported,
    requestSerialPort,
    openSerialPort,
    closeSerialPort,
    connectSerialSession,
    Rig
  };
}
