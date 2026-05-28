/* Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

export type VfoId = "A" | "B";

export type VfoSpec = VfoId | "TX" | "RX";

export type ModulationMode =
  | "LSB"
  | "USB"
  | "CW"
  | "FM"
  | "AM"
  | "FSK"
  | "CW-R"
  | "FSK-R"
;

export interface TxSwitchOptions {
  source?: string;
}

export interface MinimalCatControl {
  setTxVfo(vfo: VfoId): Promise<void>;
  getTxVfo(): Promise<VfoId>;
  setRxVfo(vfo: VfoId): Promise<void>;
  getRxVfo(): Promise<VfoId>;
  setSplit(on: boolean): Promise<void>;
  getSplit(): Promise<boolean>;
  setFrequency(vfo: VfoId, frequencyHz: number): Promise<void>;
  getFrequency(vfo: VfoId): Promise<number>;
  setModulationMode(mode: ModulationMode): Promise<void>;
  getModulationMode(): Promise<ModulationMode>;
  switchToTx(options?: TxSwitchOptions): Promise<void>;
  switchToRx(): Promise<void>;
}
