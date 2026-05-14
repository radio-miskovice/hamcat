/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

import { SerialPort } from "serialport";
import { createNodeSerialSession } from "./node-session";
import { Rig, type RigConnectOptions } from "./rig";
import type { ProtocolFamily } from "./protocol";

export interface RigNodeConnectOptions extends RigConnectOptions {
  rtscts?: boolean;
  xon?: boolean;
  xoff?: boolean;
  xany?: boolean;
  highWaterMark?: number;
  lock?: boolean;
}

export class RigNode extends Rig {
  protected constructor(family: ProtocolFamily, model?: string) {
    super(family, model);
  }

  static create(family: ProtocolFamily, model?: string): RigNode {
    return new RigNode(family, model);
  }

  async connectWithPort(
    portPath: string,
    baudRate: number,
    options: RigNodeConnectOptions = {}
  ): Promise<void> {
    const hardwareFlowControl =
      options.flowControl === "hardware"
        ? true
        : options.flowControl === "none"
          ? false
          : undefined;

    const signalOptions = this.resolveConnectSignalOptions(options);

    const port = new SerialPort({
      path: portPath,
      baudRate,
      dataBits: options.dataBits,
      stopBits: options.stopBits,
      parity: options.parity,
      rtscts: options.rtscts ?? hardwareFlowControl,
      xon: options.xon,
      xoff: options.xoff,
      xany: options.xany,
      highWaterMark: options.highWaterMark ?? options.bufferSize,
      lock: options.lock,
      autoOpen: false
    });

    await new Promise<void>((resolve, reject) => {
      port.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    if (signalOptions.rts !== undefined || signalOptions.dtr !== undefined) {
      await new Promise<void>((resolve, reject) => {
        port.set(
          {
            rts: signalOptions.rts,
            dtr: signalOptions.dtr
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          }
        );
      });
    }

    const session = createNodeSerialSession(port);
    await this.connectWithSession(session);
  }
}
