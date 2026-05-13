import type { CatCommand, ModelProtocolAdapter } from "../../protocol";

const textEncoder = new TextEncoder();

export function createQmxModelAdapter(): ModelProtocolAdapter {
  return {
    modelId: "qrplabs.qmx",
    buildCommand(command: CatCommand) {
      if (command.code !== "TX") {
        return null;
      }

      // QMX follows plain Kenwood TX without source suffix.
      return textEncoder.encode("TX;");
    }
  };
}
