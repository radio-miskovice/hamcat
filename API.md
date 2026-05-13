# hamcat API Reference

## Entry Points

- `hamcat` (universal): browser + node exports
- `hamcat/browser`: browser-safe exports (no `RigNode`, no `NodeHamcatClient`, no `createNodeSerialSession`)
- `hamcat/node`: currently resolves to the same runtime as `hamcat`, works both with browser and nodejs

## Top-Level Classes and Types

### `Rig`

High-level control facade for baseline rig operations plus universal entry point for 
non-essential and model-specific extensions.

```ts
interface RigInterface {
	readonly features: RigModelFeatures | null;

	connect(baudRate: number, options?: RigConnectOptions): Promise<void>;
	disconnect(): Promise<void>;
	getStatus(): Promise<RigStatus>;

	onStatus(listener: StatusListener): void;
	offStatus(listener: StatusListener): void;
	onResponse(listener: RigResponseListener): void;
	offResponse(listener: RigResponseListener): void;
	onResult(listener: RigResultListener): void;
	offResult(listener: RigResultListener): void;

	sendCat(code: string, args?: string[]): Promise<{ success: true }>;
	queryCat(code: string, args?: string[]): Promise<CatResponse>;

	setFreq(hz: number, vfo?: VfoId, options?: SetFreqOptions): Promise<SetFreqResult>;
	getFreq(vfo?: VfoId): Promise<number>;

	setMode(mode: ModulationMode): Promise<void>;
	getMode(): Promise<ModulationMode>;

	setRxVfo(vfo: VfoId): Promise<void>;
	getRxVfo(): Promise<VfoId>;
	setTxVfo(vfo: VfoId): Promise<void>;
	getTxVfo(): Promise<VfoId>;

	setSplit(mode: SplitMode): Promise<void>;
	getSplit(): Promise<SplitMode>;

	tx(options?: TxSwitchOptions): Promise<void>;
	rx(): Promise<void>;

	listModels(options?: RigListModelsOptions): RigListedModel[];

	get(functionName: RigFunction, options?: { vfo?: VfoId }): Promise<unknown>;
	set(
		functionName: RigFunction,
		data?: unknown,
		options?: { vfo?: VfoId; source?: string }
	): Promise<void>;
}

class Rig {
	static create(family: ProtocolFamily, model?: string): Rig;
	static listModels(options?: RigListModelsOptions): RigListedModel[];
	static connect(
		family: ProtocolFamily,
		model: string | undefined,
		baudRate: number,
		options?: RigConnectOptions
	): Promise<Rig>;

	get features(): RigModelFeatures | null;

	connect(baudRate: number, options?: RigConnectOptions): Promise<void>;
	disconnect(): Promise<void>;
	getStatus(): Promise<RigStatus>;

	onStatus(listener: StatusListener): void;
	offStatus(listener: StatusListener): void;
	onResponse(listener: RigResponseListener): void;
	offResponse(listener: RigResponseListener): void;
	onResult(listener: RigResultListener): void;
	offResult(listener: RigResultListener): void;

	sendCat(code: string, args?: string[]): Promise<{ success: true }>;
	queryCat(code: string, args?: string[]): Promise<CatResponse>;

	setFreq(hz: number, vfo?: VfoId, options?: SetFreqOptions): Promise<SetFreqResult>;
	getFreq(vfo?: VfoId): Promise<number>;

	setMode(mode: ModulationMode): Promise<void>;
	getMode(): Promise<ModulationMode>;

	setRxVfo(vfo: VfoId): Promise<void>;
	getRxVfo(): Promise<VfoId>;
	setTxVfo(vfo: VfoId): Promise<void>;
	getTxVfo(): Promise<VfoId>;

	setSplit(mode: SplitMode): Promise<void>;
	getSplit(): Promise<SplitMode>;

	tx(options?: TxSwitchOptions): Promise<void>;
	rx(): Promise<void>;
	listModels(options?: RigListModelsOptions): RigListedModel[];

	get(functionName: RigFunction, options?: { vfo?: VfoId }): Promise<unknown>;
	set(
		functionName: RigFunction,
		data?: unknown,
		options?: { vfo?: VfoId; source?: string }
	): Promise<void>;
}
```

Notes:
- `Rig` delegates baseline control operations to the selected protocol adapter.
- If a family adapter does not implement the baseline operation set, `Rig` methods throw.
- `setSplit("on" | "off")` is model-aware:
	- `mode-flag` rigs use configured CAT mode flag values.
	- `vfo-pair` rigs set configured split RX/TX VFOs on `on`, and return to simplex on `off`.

### `RigNode`

Node-specific subclass for opening `serialport` ports from nodejs application. Browser version
`Rig` supports only Web Serial API interface. Therefore it does not import modules and code
that could not be used in a browser, in order to minimize size. 

```ts
interface RigNodeConnectOptions extends RigConnectOptions {
	rtscts?: boolean;
	xon?: boolean;
	xoff?: boolean;
	xany?: boolean;
	highWaterMark?: number;
	lock?: boolean;
}

class RigNode extends Rig {
	static create(family: ProtocolFamily, model?: string): RigNode;
	connectWithPort(
		portPath: string,
		baudRate: number,
		options?: RigNodeConnectOptions
	): Promise<void>;
}
```

### `NodeHamcatClient`

Lower-level node client helper (in addition to high-level `RigNode`).

```ts
class NodeHamcatClient extends HamcatClient {
	static create(): NodeHamcatClient;
	connectWithSerialPort(portPath: string, baudRate?: number): Promise<void>;
}
```

## High-Level Rig Types

```ts
interface RigConnectOptions {
	dataBits?: 7 | 8;
	stopBits?: 1 | 2;
	parity?: "none" | "even" | "odd";
	bufferSize?: number;
	flowControl?: "none" | "hardware";
	rts?: boolean;
	dtr?: boolean;
	requestOptions?: SerialPortRequestOptions;
}

interface RigStatus extends HamcatStatus {
	rxVfo?: VfoId;
	txVfo?: VfoId;
	frequencyAHz?: number;
	frequencyBHz?: number;
	mode?: ModulationMode;
}

interface SetFreqOptions {
	verify?: boolean;
}

interface SetFreqResult {
	vfo: VfoId;
	requestedHz: number;
	appliedHz: number;
	accepted: boolean;
}

interface RigOperationResult {
	operation: string;
	success: boolean;
	details?: Record<string, unknown>;
	response?: CatResponse;
}

type RigResponseListener = (response: CatResponse) => void;
type RigResultListener = (result: RigOperationResult) => void;

type RigFunction =
	| "freq"
	| "mode"
	| "rxVfo"
	| "txVfo"
	| "split"
	| "tx"
	| "rx"
	| "dataSource";

type SplitMode = "on" | "off";

interface RigListModelsOptions {
	vendor?: string;
	family?: "kenwood" | "yaesu" | "icom";
	model?: string;
}

interface RigListedModel {
	modelId: string;
	model: string;
	displayName?: string;
	vendor?: string;
	vendorName?: string;
	protocol: "kenwood" | "yaesu" | "icom";
	family: "kenwood" | "yaesu" | "icom";
}
```

## Serial Session API

```ts
interface SerialSession {
	writeBytes(data: Uint8Array): Promise<void>;
	writeText(text: string): Promise<void>;
	disconnect(): Promise<void>;
	on(listener: (data: Uint8Array) => void): void;
	off(listener: (data: Uint8Array) => void): void;
}

interface SerialSignalOptions {
	rts?: boolean;
	dtr?: boolean;
}

function isWebSerialSupported(): boolean;
function requestSerialPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
function openSerialPort(port: SerialPort, options: SerialOptions): Promise<void>;
function closeSerialPort(port: SerialPort): Promise<void>;
function createWebSerialSession(port: SerialPort): SerialSession;

function connectSerialSession(
	serialOptions: SerialOptions,
	requestOptions?: SerialPortRequestOptions,
	signalOptions?: SerialSignalOptions
): Promise<SerialSession>;

function autoConnectWebSerial(serialOptions: SerialOptions): Promise<SerialSession | null>;

import type { SerialPort as NodeSerialPort } from "serialport";
function createNodeSerialSession(port: NodeSerialPort): SerialSession;
```

Notes:
- `writeText` is ASCII-only in both browser and node session implementations.
- `connectSerialSession` can apply RTS/DTR via Web Serial `setSignals` when provided.

## Control API

```ts
type VfoId = "A" | "B";

type ModulationMode =
	| "LSB"
	| "USB"
	| "CW"
	| "FM"
	| "AM"
	| "FSK"
	| "CW-R"
	| "DATA"
	| "FSK-R";

interface TxSwitchOptions {
	source?: string;
}

interface MinimalCatControl {
	setTxVfo(vfo: VfoId): Promise<void>;
	getTxVfo(): Promise<VfoId>;
	setRxVfo(vfo: VfoId): Promise<void>;
	getRxVfo(): Promise<VfoId>;
	setSplit(mode: "on" | "off"): Promise<void>;
	getSplit(): Promise<"on" | "off">;
	setFrequency(vfo: VfoId, frequencyHz: number): Promise<void>;
	getFrequency(vfo: VfoId): Promise<number>;
	setModulationMode(mode: ModulationMode): Promise<void>;
	getModulationMode(): Promise<ModulationMode>;
	switchToTx(options?: TxSwitchOptions): Promise<void>;
	switchToRx(): Promise<void>;
}
```

`MinimalCatControl` is a baseline business capability contract, not a separate exported runtime class.

## Protocol API

```ts
type ProtocolFamily = "kenwood" | "yaesu" | "icom";

interface CatCommand {
	code: string;
	args?: string[];
	raw?: string;
}

interface CatResponse {
	family: ProtocolFamily;
	modelId?: string;
	raw: string;
	command?: string;
	payload?: Record<string, unknown>;
}

interface ModelAdapterContext {
	family: ProtocolFamily;
}

interface ProtocolControlClientStatus {
	protocolFamily?: ProtocolFamily;
	modelId?: string;
}

interface ProtocolControlClient {
	sendCommand(command: CatCommand): Promise<void>;
	queryCommand(command: CatCommand): Promise<CatResponse>;
	getStatus(): ProtocolControlClientStatus;
}

interface ModelProtocolAdapter {
	modelId: string;
	buildCommand?(command: CatCommand, context: ModelAdapterContext): Uint8Array | null;
	parseIncoming?(frame: Uint8Array, context: ModelAdapterContext): CatResponse[] | null;
}

interface ProtocolAdapter {
	readonly family: ProtocolFamily;
	readonly modelId?: string;
	setModelAdapter(adapter: ModelProtocolAdapter | null): void;
	encodeCommand(command: CatCommand): Uint8Array;
	decodeIncoming(data: Uint8Array): CatResponse[];
	setTxVfo?(client: ProtocolControlClient, vfo: VfoId): Promise<void>;
	getTxVfo?(client: ProtocolControlClient): Promise<VfoId>;
	setRxVfo?(client: ProtocolControlClient, vfo: VfoId): Promise<void>;
	getRxVfo?(client: ProtocolControlClient): Promise<VfoId>;
	setFrequency?(client: ProtocolControlClient, vfo: VfoId, frequencyHz: number): Promise<void>;
	getFrequency?(client: ProtocolControlClient, vfo: VfoId): Promise<number>;
	setModulationMode?(client: ProtocolControlClient, mode: ModulationMode): Promise<void>;
	getModulationMode?(client: ProtocolControlClient): Promise<ModulationMode>;
	switchToTx?(client: ProtocolControlClient, options?: TxSwitchOptions): Promise<void>;
	switchToRx?(client: ProtocolControlClient): Promise<void>;
}

interface ProtocolAdapterFactoryOptions {
	family: ProtocolFamily;
	modelAdapter?: ModelProtocolAdapter;
}

function createProtocolAdapter(options: ProtocolAdapterFactoryOptions): ProtocolAdapter;

abstract class BaseTextFamilyAdapter implements ProtocolAdapter {
	readonly family: ProtocolFamily;
	readonly modelId?: string;

	constructor(family: ProtocolFamily, terminator: string);
	setModelAdapter(adapter: ModelProtocolAdapter | null): void;
	encodeCommand(command: CatCommand): Uint8Array;
	decodeIncoming(data: Uint8Array): CatResponse[];

	protected createResponse(raw: string): CatResponse;
	protected formatCommand(command: CatCommand): string;
	protected ensureTerminator(raw: string): string;
}

class KenwoodProtocolAdapter extends BaseTextFamilyAdapter {}
class YaesuProtocolAdapter extends BaseTextFamilyAdapter {}
class IcomProtocolAdapter implements ProtocolAdapter {}
```

## Model Features API

```ts
type SignalFunction =
	| "none"
	| "ptt-on"
	| "ptt-off"
	| "flow"
	| "on"
	| "off";

interface RigSignalFeatures {
	rts?: SignalFunction;
	dtr?: SignalFunction;
}

type VfoSplitPattern = "same-band" | "any";

interface RigDataSourceFeatures {
	setCommandPrefix: string;
	sourceMap: Record<string, string>;
}

interface RigSplitControlFeatures {
	kind: "vfo-pair" | "mode-flag";
	command?: string;
	splitValue?: string;
	vfoAValue?: string;
	vfoBValue?: string;
	splitRxVfo?: "A" | "B";
	splitTxVfo?: "A" | "B";
}

interface RigExtraFeature<T = unknown> {
	hint: string;
	value: T;
}

interface RigExtraFeatures {
	dataSource?: RigExtraFeature<RigDataSourceFeatures>;
	[key: string]: RigExtraFeature<unknown> | undefined;
}

interface RigModelFeatures {
	family: ProtocolFamily;
	model: string;
	modelId: string;
	signals?: RigSignalFeatures;
	vfoSplitPattern?: VfoSplitPattern;
	splitControl?: RigSplitControlFeatures;
	txSourceMap?: Record<string, string>;
	extra?: RigExtraFeatures;
}

const RIG_MODEL_FEATURES: RigModelFeatures[];

function normalizeModelName(model: string): string;
function getModelFeatures(family: ProtocolFamily, model: string): RigModelFeatures | null;
function getModelFeaturesByModelId(modelId?: string): RigModelFeatures | null;
```

## Model Adapter Registry and Built-ins

```ts
type KnownProtocolModel = "qmx" | "ts590";

function createModelAdapterByName(
	family: ProtocolFamily,
	model: string
): ModelProtocolAdapter;

function createQmxModelAdapter(): ModelProtocolAdapter;

const TS590_TX_SOURCE_MAP: {
	readonly MIC: "0";
	readonly DATA: "1";
	readonly ACC2: "1";
	readonly USB: "1";
	readonly DIG: "1";
};

type Ts590TxSource = keyof typeof TS590_TX_SOURCE_MAP;

interface Ts590ModelAdapterOptions {
	txSourceMap?: Record<string, string>;
}

function createTs590ModelAdapter(
	options?: Ts590ModelAdapterOptions
): ModelProtocolAdapter;
```

## Browser Global

When loaded in a browser context, the package assigns `window.Hamcat` with:

- `Rig`
- `RigNode` (universal entry only)
- `isWebSerialSupported`
- `requestSerialPort`
- `openSerialPort`
- `closeSerialPort`
- `connectSerialSession`

## Compatibility and Behavior Notes

- High-level control (`Rig`) requires protocol adapters to provide baseline control capabilities.
- Standard split behavior uses `FR` (RX VFO) and `FT` (TX VFO); models following this pattern should omit `splitControl`.
- Use `splitControl` only for rigs with non-standard split semantics (for example, QMX mode-flag split via `FT2`).
- Model metadata source is `src/models/models.yaml`, converted during build to `src/models/models.json`.
