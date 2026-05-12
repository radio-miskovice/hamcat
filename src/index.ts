/**
 * Universal entry point — works in both browser (Web Serial API) and Node.js
 * (via the serialport package).
 */

export * from "./rig";
export * from "./rig-node";
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
export { createNodeSerialSession } from "./node-session";
export { NodeHamcatClient } from "./core-node";

import { Rig } from "./rig";
import { RigNode } from "./rig-node";
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
    Rig,
    RigNode
  };
}
