# `Rig` Public API Summary

---

## 1. Object Creation and Serial Port Connection

### Static Methods

| Method | Returns | Description |
|---|---|---|
| `Rig.create(family, model?)` | `Rig` | Creates a disconnected `Rig` instance. `family`: `"kenwood"` \| `"yaesu"` \| `"icom"`. `model` selects a model-specific adapter. |
| `Rig.connect(family, model, baudRate, options?)` | `Promise<Rig>` | Creates and immediately connects a `Rig` in one call. |
| `Rig.listModels(options?)` | `RigListedModel[]` | Returns all known model descriptors, optionally filtered by `vendor`, `family`, or `model`. |

### Instance Methods

| Method | Returns | Description |
|---|---|---|
| `connect(baudRate, options?)` | `Promise<void>` | Opens a Web Serial port at the given baud rate and attaches the session. Prompts the browser port-picker unless a saved port is available. |
| `disconnect()` | `Promise<void>` | Closes the serial session. Silent if already disconnected. |
| `getStatus()` | `Promise<RigStatus>` | Queries the radio for a fresh snapshot of all control state (VFOs, frequencies, mode) and returns it merged with the current transport status. Also updates the internal `rigStatus` cache. |
| `sendCat(code, args?)` | `Promise<{ success: true }>` | Sends a raw CAT command and returns when the bytes are written. |
| `queryCat(code, args?)` | `Promise<CatResponse>` | Sends a CAT command and awaits the matching response frame (500 ms timeout). |

### Properties

| Property | Type | Description |
|---|---|---|
| `features` | `RigModelFeatures \| null` | Model-specific feature flags loaded from the model catalog. `null` when no model was specified. |

### Events

| Event | Listener type | When fired |
|---|---|---|
| `onStatus` / `offStatus` | `(status: RigStatus) => void` | After every decoded incoming serial frame. `rigStatus` is already updated before the listener is called. Also fired on connect and disconnect. |
| `onResponse` / `offResponse` | `(response: CatResponse) => void` | For every individual decoded CAT response frame. |
| `onResult` / `offResult` | `(result: RigOperationResult) => void` | After each completed set/query operation (`setFreq`, `sendCat`, `queryCat`, etc.). |

### Exceptions

| Thrown by | Condition |
|---|---|
| `connect` | Serial port unavailable; baud rate invalid; already connected. |
| `queryCat`, any `get*` method | `"CAT query timed out for command X"` — radio did not respond within 500 ms. |
| Any method requiring connection | `"Rig is not connected."` |
| Any control method | `"Protocol family 'X' does not provide baseline control methods."` — the selected family adapter is incomplete. |

---

## 2. Rig Control and State Inquiry

### Methods

| Method | Returns | Description |
|---|---|---|
| `setFreq(hz, vfo?, options?)` | `Promise<SetFreqResult>` | Sets frequency (Hz, non-negative integer). `vfo` defaults to the current RX VFO. Reads back the applied value unless `options.verify === false`. |
| `getFreq(vfo?)` | `Promise<number>` | Reads frequency from the radio. `vfo` defaults to RX VFO. |
| `setMode(mode)` | `Promise<void>` | Sets modulation mode. |
| `getMode()` | `Promise<ModulationMode>` | Reads modulation mode. |
| `setRxVfo(vfo)` | `Promise<void>` | Assigns the RX VFO (`"A"` or `"B"`). |
| `getRxVfo()` | `Promise<VfoId>` | Reads the current RX VFO. |
| `setTxVfo(vfo)` | `Promise<void>` | Assigns the TX VFO. |
| `getTxVfo()` | `Promise<VfoId>` | Reads the current TX VFO. |
| `setSplit(on)` | `Promise<void>` | Enables or disables split operation. |
| `getSplit()` | `Promise<boolean>` | Returns `true` if split is active (RX VFO ≠ TX VFO). |
| `setTx(on, options?)` | `Promise<void>` | Switches to TX (`true`) or back to RX (`false`). `options.source` selects the data source on radios that support it (requires a model adapter). |
| `getTxState()` | `Promise<boolean>` | Returns the cached TX state (`true` = transmitting). Not queried from radio; reflects the last `setTx` call or an incoming TX/RX status frame. |
| `get(functionName, options?)` | `Promise<unknown>` | Generic getter. `functionName` is a `RigFunction` value. |
| `set(functionName, data?, options?)` | `Promise<void>` | Generic setter. |

### VFO resolution for `setFreq` / `getFreq`

The `vfo` parameter is case-insensitive and accepts the following values:

| Value | Resolves to |
|---|---|
| `undefined` (omitted) | Current RX VFO from cached `rigStatus` (falls back to `"A"`) |
| `"RX"` / `"rx"` | Current RX VFO |
| `"TX"` / `"tx"` | Current TX VFO |
| `"A"` / `"a"` | VFO A |
| `"B"` / `"b"` | VFO B |

### `RigFunction` values for `get()` / `set()`

| Value | Readable | Writable | Data type |
|---|---|---|---|
| `"freq"` | ✓ | ✓ | `number` (Hz) |
| `"mode"` | ✓ | ✓ | `ModulationMode` |
| `"rxVfo"` | ✓ | ✓ | `VfoId` |
| `"txVfo"` | ✓ | ✓ | `VfoId` |
| `"split"` | ✓ | ✓ | `boolean` |
| `"tx"` | ✓ | ✓ | `boolean` |
| `"dataSource"` | ✗ | ✓ | `string` (write-only) |

### Automatic status updates from incoming frames (Kenwood)

When the radio sends unsolicited frames (e.g. via `AI1;` auto-info mode), the Kenwood adapter parses these commands and merges their content into `rigStatus` before firing `onStatus`:

| CAT command | Fields updated |
|---|---|
| `FA` | `frequencyAHz` |
| `FB` | `frequencyBHz` |
| `FR` | `rxVfo` |
| `FT` | `txVfo` |
| `MD` | `mode` |
| `TX` | `txState` (`"TX0"` = false, anything else = true) |
| `RX` | `txState = false` |
| `IF` | `frequencyAHz`, `txState`, `mode` (composite 37-char frame) |

### Exceptions

| Thrown by | Condition |
|---|---|
| `setFreq` / `getFreq` | `"Invalid VFO specifier: 'x'."` for unrecognised `vfo` value. |
| `setFreq` / `getFreq` | `"Frequency must be a non-negative integer in Hz."` |
| `setTx(true, { source })` | `"TX source selection requires a model adapter…"` if no model was specified. |

---

## 3. Data Types

### `VfoId`
```ts
type VfoId = "A" | "B";
```
Physical VFO identifier used in protocol commands and returned by get methods.

### `VfoSpec`
```ts
type VfoSpec = VfoId | "TX" | "RX";
```
Extended VFO selector accepted by `setFreq`/`getFreq`. Case-insensitive at runtime.

### `ModulationMode`
```ts
type ModulationMode = "LSB" | "USB" | "CW" | "FM" | "AM" | "FSK" | "CW-R" | "FSK-R";
```

### `RigConnectOptions`
| Field | Type | Default | Description |
|---|---|---|---|
| `dataBits` | `7 \| 8` | — | Serial data bits |
| `stopBits` | `1 \| 2` | — | Serial stop bits |
| `parity` | `"none" \| "even" \| "odd"` | — | Serial parity |
| `bufferSize` | `number` | — | Serial read buffer size |
| `flowControl` | `"none" \| "hardware"` | — | Hardware flow control |
| `rts` | `boolean` | model default | RTS line state during session (overridden by model PTT config) |
| `dtr` | `boolean` | model default | DTR line state during session |
| `requestOptions` | `SerialPortRequestOptions` | — | Passed to the browser port-picker |

### `RigTransportStatus`
| Field | Type | Description |
|---|---|---|
| `connected` | `boolean` | Whether the serial session is open |
| `bytesTx` | `number` | Bytes written since last connect |
| `bytesRx` | `number` | Bytes received since last connect |
| `protocolFamily` | `ProtocolFamily?` | Selected protocol family |
| `modelId` | `string?` | Active model adapter ID |

### `RigStatus` *(extends `RigTransportStatus`)*
| Field | Type | Description |
|---|---|---|
| `rxVfo` | `VfoId?` | Current RX VFO |
| `txVfo` | `VfoId?` | Current TX VFO |
| `frequencyAHz` | `number?` | VFO A frequency in Hz |
| `frequencyBHz` | `number?` | VFO B frequency in Hz |
| `mode` | `ModulationMode?` | Current modulation mode |
| `txState` | `boolean?` | `true` = transmitting |

Fields are `undefined` until a get/set call or an incoming frame updates them.

### `SetFreqOptions`
| Field | Type | Default | Description |
|---|---|---|---|
| `verify` | `boolean` | `true` | When `false`, skips the readback query after writing the frequency. |

### `SetFreqResult`
| Field | Type | Description |
|---|---|---|
| `vfo` | `VfoId` | The resolved VFO that was written |
| `requestedHz` | `number` | Frequency passed by the caller |
| `appliedHz` | `number` | Frequency confirmed by readback |
| `accepted` | `boolean` | `true` when `requestedHz === appliedHz` |

### `RigOperationResult`
| Field | Type | Description |
|---|---|---|
| `operation` | `string` | Name of the operation (e.g. `"setFreq"`, `"sendCat"`) |
| `success` | `boolean` | Whether the operation succeeded |
| `details` | `Record<string, unknown>?` | Operation-specific detail fields |
| `response` | `CatResponse?` | Raw CAT response if applicable |

### `TxSwitchOptions`
| Field | Type | Description |
|---|---|---|
| `source` | `string?` | Data source identifier (e.g. `"1"`, `"2"`) for radios with selectable TX audio sources. Requires a model adapter. |

### `RigListModelsOptions`
| Field | Type | Description |
|---|---|---|
| `vendor` | `string?` | Filter by vendor ID |
| `family` | `ProtocolFamily?` | Filter by protocol family |
| `model` | `string?` | Filter by model ID |

### `RigListedModel`
| Field | Type | Description |
|---|---|---|
| `modelId` | `string` | Canonical model ID (e.g. `"ts590"`) |
| `model` | `string` | Model name |
| `displayName` | `string?` | Human-readable label |
| `vendor` | `string?` | Vendor ID |
| `vendorName` | `string?` | Vendor display name |
| `protocol` / `family` | `ProtocolFamily` | Protocol family |

---

## 4. Non-Public Members

### Private / Protected Fields

| Member | Type | Purpose |
|---|---|---|
| `session` | `SerialSession \| null` | Active serial session; `null` when disconnected |
| `protocolAdapter` | `ProtocolAdapter \| null` | Encodes/decodes CAT frames and implements control commands |
| `rigStatus` | `RigStatus` | Single source of truth for all cached rig state |
| `modelFeatures` | `RigModelFeatures \| null` | Model feature flags from the catalog |
| `statusListeners` | `RigStatusListener[]` | Subscribers registered via `onStatus` |
| `responseListeners` | `RigResponseListener[]` | Subscribers registered via `onResponse` |
| `resultListeners` | `RigResultListener[]` | Subscribers registered via `onResult` |
| `protocolClient` | `ProtocolControlClient` | Internal bridge passed to the protocol/model adapters; exposes `sendCommand`, `queryCommand`, `getStatus` |

### Protected Methods (subclassing / testing)

| Method | Purpose |
|---|---|
| `constructor(family, model?)` | Protected; use `Rig.create()` or `Rig.connect()` instead |
| `connectWithSession(session)` | Attaches a pre-built `SerialSession`; used by `RigNode` and tests |
| `resolveConnectSignalOptions(options)` | Resolves `rts`/`dtr` values, overriding with model PTT signal requirements |

### Private Methods

| Method | Purpose |
|---|---|
| `resolveVfo(vfo?)` | Normalises a `VfoSpec` string to a `VfoId`, reading `rigStatus` for `"RX"`/`"TX"` aliases |
| `sendBytes(data)` | Writes raw bytes to the session and increments `bytesTx` |
| `sendCommand(command)` | Encodes a `CatCommand` via the protocol adapter and calls `sendBytes` |
| `queryCommand(command, options?)` | Sends a command and awaits a matching response with a 500 ms timeout |
| `getTransportStatus()` | Returns a snapshot of `rigStatus` typed as `RigTransportStatus` |
| `emitStatus()` | Snapshots `rigStatus` and calls all status listeners via `queueMicrotask` |
| `emitResponse(response)` | Calls all response listeners via `queueMicrotask` |
| `emitResult(result)` | Calls all result listeners via `queueMicrotask` |
| `getControlAdapter()` | Returns `protocolAdapter` or throws if missing or incomplete |
| `useProtocol(family, model?)` | Creates and attaches the protocol adapter; called from constructor |
| `querySplitModeValue()` | Reads split state via a model-specific command (e.g. `FT`) |
| `applyModelSplitAction()` | Sends a raw split on/off command when the model requires it after VFO changes |
| `assertConnected()` | Throws if `session` is null |
| `assertProtocolSelected()` | Throws if `protocolAdapter` is null |
