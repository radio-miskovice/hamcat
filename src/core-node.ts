import { SerialPort } from "serialport";
import { HamcatClient } from "./core";
import { createNodeSerialSession } from "./node-session";

export class NodeHamcatClient extends HamcatClient {
  static create(): NodeHamcatClient {
    return new NodeHamcatClient();
  }

  async connectWithSerialPort(
    portPath: string,
    baudRate: number = 9600
  ): Promise<void> {
    const port = new SerialPort({ path: portPath, baudRate });
    const session = createNodeSerialSession(port);
    await this.connectWithSession(session);
  }
}
