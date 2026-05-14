/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

import {
  type CatCommand,
  type CatResponse,
  type ModelProtocolAdapter,
  type ProtocolAdapter
} from "./types";

const textEncoder = new TextEncoder();

export class IcomProtocolAdapter implements ProtocolAdapter {
  readonly family = "icom" as const;
  private modelAdapter: ModelProtocolAdapter | null = null;
  private frameBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

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

    if (command.raw) {
      return this.encodeRawHex(command.raw);
    }

    const asciiPayload = `${command.code}${command.args?.join("") ?? ""}`;
    const payload = textEncoder.encode(asciiPayload);
    return this.wrapFrame(payload);
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

    this.frameBuffer = concat(this.frameBuffer, data);

    const responses: CatResponse[] = [];
    let frame = this.extractFirstFrame();
    while (frame) {
      responses.push({
        family: this.family,
        modelId: this.modelAdapter?.modelId,
        raw: toHex(frame),
        payload: {
          frame
        }
      });
      frame = this.extractFirstFrame();
    }

    return responses;
  }

  private extractFirstFrame(): Uint8Array<ArrayBufferLike> | null {
    const start = findStart(this.frameBuffer);
    if (start < 0) {
      this.frameBuffer = new Uint8Array(0);
      return null;
    }

    if (start > 0) {
      this.frameBuffer = this.frameBuffer.slice(start);
    }

    const end = this.frameBuffer.indexOf(0xfd, 2);
    if (end < 0) {
      return null;
    }

    const frame = this.frameBuffer.slice(0, end + 1);
    this.frameBuffer = this.frameBuffer.slice(end + 1);
    return frame;
  }

  private wrapFrame(
    payload: Uint8Array<ArrayBufferLike>
  ): Uint8Array<ArrayBufferLike> {
    const header = new Uint8Array([0xfe, 0xfe]);
    const footer = new Uint8Array([0xfd]);
    return concat(concat(header, payload), footer);
  }

  private encodeRawHex(raw: string): Uint8Array<ArrayBufferLike> {
    const normalized = raw.replace(/[^0-9a-fA-F]/g, "");
    if (normalized.length % 2 !== 0) {
      throw new Error("Icom raw hex input must contain an even number of hex digits.");
    }

    const out = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
      out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
    }
    return out;
  }
}

function concat(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

function toHex(data: Uint8Array<ArrayBufferLike>): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function findStart(data: Uint8Array<ArrayBufferLike>): number {
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0xfe && data[i + 1] === 0xfe) {
      return i;
    }
  }
  return -1;
}
