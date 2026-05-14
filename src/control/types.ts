export type VfoId = "A" | "B";

export type ModulationMode =
  | "LSB"
  | "USB"
  | "CW"
  | "FM"
  | "AM"
  | "FSK"
  | "CW-R"
  | "DATA"
  | "FSK-R";

export interface TxSwitchOptions {
  source?: string;
}

export interface MinimalCatControl {
  setTxVfo(vfo: VfoId): Promise<void>;
  getTxVfo(): Promise<VfoId>;
  setRxVfo(vfo: VfoId): Promise<void>;
  getRxVfo(): Promise<VfoId>;
  setFrequency(vfo: VfoId, frequencyHz: number): Promise<void>;
  getFrequency(vfo: VfoId): Promise<number>;
  setModulationMode(mode: ModulationMode): Promise<void>;
  getModulationMode(): Promise<ModulationMode>;
  switchToTx(options?: TxSwitchOptions): Promise<void>;
  switchToRx(): Promise<void>;
}
