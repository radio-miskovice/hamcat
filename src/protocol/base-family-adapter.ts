import {
  type CatCommand,
  type CatResponse,
  type ModelProtocolAdapter,
  type ProtocolAdapter,
  type ProtocolFamily
} from "./types";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export abstract class BaseTextFamilyAdapter implements ProtocolAdapter {
  private modelAdapter: ModelProtocolAdapter | null = null;
  private lineBuffer = "";

  constructor(
    public readonly family: ProtocolFamily,
    private readonly terminator: string
  ) {}

  get modelId(): string | undefined {
    return this.modelAdapter?.modelId;
  }

  setModelAdapter(adapter: ModelProtocolAdapter | null): void {
    this.modelAdapter = adapter;
  }

  encodeCommand(command: CatCommand): Uint8Array {
    const modelBytes = this.modelAdapter?.buildCommand?.(command, {
      family: this.family
    });

    if (modelBytes) {
      return modelBytes;
    }

    const raw = this.formatCommand(command);
    return textEncoder.encode(raw);
  }

  decodeIncoming(data: Uint8Array): CatResponse[] {
    const modelResponses = this.modelAdapter?.parseIncoming?.(data, {
      family: this.family
    });

    if (modelResponses && modelResponses.length > 0) {
      return modelResponses.map((response) => ({
        ...response,
        family: this.family,
        modelId: response.modelId ?? this.modelAdapter?.modelId
      }));
    }

    const chunk = textDecoder.decode(data, { stream: true });
    this.lineBuffer += chunk;

    const responses: CatResponse[] = [];
    let next = this.lineBuffer.indexOf(this.terminator);

    while (next >= 0) {
      const frame = this.lineBuffer.slice(0, next + this.terminator.length);
      this.lineBuffer = this.lineBuffer.slice(next + this.terminator.length);
      responses.push(this.createResponse(frame));
      next = this.lineBuffer.indexOf(this.terminator);
    }

    return responses;
  }

  protected createResponse(raw: string): CatResponse {
    const trimmed = raw.trim();
    const commandMatch = /^([A-Za-z]{2})/.exec(trimmed);
    const command = commandMatch ? commandMatch[1].toUpperCase() : undefined;
    const payload = command ? trimmed.slice(command.length).replace(/;$/, "") : "";

    return {
      family: this.family,
      modelId: this.modelAdapter?.modelId,
      raw,
      command,
      payload: {
        text: payload
      }
    };
  }

  protected formatCommand(command: CatCommand): string {
    if (command.raw) {
      return this.ensureTerminator(command.raw);
    }

    const args = command.args?.join("") ?? "";
    return this.ensureTerminator(`${command.code}${args}`);
  }

  protected ensureTerminator(raw: string): string {
    if (raw.endsWith(this.terminator)) {
      return raw;
    }
    return `${raw}${this.terminator}`;
  }
}
