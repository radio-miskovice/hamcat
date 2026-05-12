import type { ProtocolFamily } from "../protocol";
import featureEntries from "./models.json";

export type SignalFunction =
  | "none"
  | "ptt-on"
  | "ptt-off"
  | "flow"
  | "on"
  | "off";

export interface RigSignalFeatures {
  rts?: SignalFunction;
  dtr?: SignalFunction;
}

export type VfoSplitPattern = "same-band" | "any";

export interface RigDataSourceFeatures {
  setCommandPrefix: string;
  sourceMap: Record<string, string>;
}

export interface RigSplitControlFeatures {
  kind: "vfo-pair" | "mode-flag";
  command?: string;
  splitValue?: string;
  vfoAValue?: string;
  vfoBValue?: string;
  splitRxVfo?: "A" | "B";
  splitTxVfo?: "A" | "B";
}

export interface RigExtraFeature<T = unknown> {
  hint: string;
  value: T;
}

export interface RigExtraFeatures {
  dataSource?: RigExtraFeature<RigDataSourceFeatures>;
  [key: string]: RigExtraFeature<unknown> | undefined;
}

export interface RigModelFeatures {
  family: ProtocolFamily;
  model: string;
  modelId: string;
  signals?: RigSignalFeatures;
  vfoSplitPattern?: VfoSplitPattern;
  splitControl?: RigSplitControlFeatures;
  txSourceMap?: Record<string, string>;
  extra?: RigExtraFeatures;
}

export const RIG_MODEL_FEATURES: RigModelFeatures[] =
  featureEntries as RigModelFeatures[];
