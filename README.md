# hamcat

Dual-target npm package for ham radio transceiver control.

- Browser variant using Web Serial API
- Node.js variant using serialport

## Purpose

Provide a package that could be used in user application for control
of amateur radio tansceiver. 

## Development status

Work in progress.

**2026-05-12**

Basic functions needed to control transceiver over serialport from a web application: set and get frequency,
set and get mode, handle split operation (to some extent).

Of the three major mainstream protocols only Kenwood protocol is implemented. Icom and Yaesu are planned for later.

## Build

```bash
npm run build
npm run build:browser
```

## Web app demo (QMX/TS590)

The repo includes a simple browser app for controlling rigs through the same
Hamcat API via Web Serial.

```bash
npm install
npm run dev
```

Then open the shown localhost URL in a Chromium-based browser, pick a serial
port, choose `QMX` or `TS590`, and use the control panel for VFO, frequency,
mode, and TX/RX switching.

The demo also includes:

- one-click band/mode presets
- quick macros for CQ and split setup
- local profile save/load/delete for control values

## Entry points

- Universal import: `hamcat`
- Browser-only import: `hamcat/browser`
- Node-focused import: `hamcat/node`

## Simplified API

Use `Rig` as the top-level access class:

```typescript
import { Rig } from "hamcat";

const rig = Rig.create("kenwood", "ts590");
await rig.connect(115200);

await rig.setFreq(18100000);
await rig.setMode("USB");
await rig.setSplit("on");
await rig.tx();
```

You can also set modem control lines during connect when a rig requires fixed
states for communication/PTT safety:

```typescript
await rig.connect(115200, {
	rts: false,
	dtr: false
});
```

Core concept:

- `Rig` owns the serial session and protocol adapter selection.
- `Rig` exposes straightforward methods (`getFreq`, `setFreq`, `getMode`, `setMode`, `setSplit`, `getSplit`, `tx`, `rx`).
- `Rig` also exposes generic `get(...)` and `set(...)` hooks for future family/model extensions.

Model-specific behavior is described in YAML profile files and consumed by model
adapters. The build pipeline converts YAML into JSON so compiled modules keep
importing JSON.

Source profile file:

- `src/models/models.yaml`

YAML hierarchy:

- top level key: protocol family
- second level key: model name

Common model fields stay at model root (`signals`, `vfoSplitPattern`,
`txSourceMap`). Additional model-specific fields go under `extra`, where each
entry uses `{ hint, value }`.

Generated file:

- `src/models/models.json`

Example usage through generic setter:

```typescript
// TS-590: maps to EX06300001; (USB data source)
await rig.set("dataSource", "USB");
```

For Node.js serialport usage, use `RigNode`:

```typescript
import { RigNode } from "hamcat";

const rig = RigNode.create("kenwood", "ts590");
await rig.connectWithPort("COM4", 115200);
await rig.setFreq(14074000, "A");
```

## Protocol adapter architecture

The package now includes family-level adapters:

- `KenwoodProtocolAdapter`
- `YaesuProtocolAdapter`
- `IcomProtocolAdapter`

Each family adapter can host a model-specific extension adapter via
`ModelProtocolAdapter`. This allows vendor and model proprietary commands
without forking the family-level parser/encoder.

These are internal building blocks used by `Rig`.

## Minimal viable CAT control level

`Rig` currently implements the Kenwood baseline CAT controls:

- TX VFO select (`setTxVfo`, `getTxVfo`)
- RX VFO select (`setRxVfo`, `getRxVfo`)
- VFO A/B frequency (`setFrequency`, `getFrequency`)
- modulation mode (`setModulationMode`, `getModulationMode`)
- TX/RX switch (`switchToTx`, `switchToRx`)

Current baseline command mapping is implemented for the Kenwood family.
For model-specific TX source selection (for rigs with multiple TX audio paths),
call:

```typescript
await rig.tx({ source: "DIG" });
```
