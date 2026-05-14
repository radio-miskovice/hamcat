# hamcat

Dual-target npm package for ham radio transceiver control.

- Browser variant using Web Serial API
- Node.js variant using serialport

## Purpose

Provide a package that could be used in user application for control
of amateur radio transceiver. 

## LICENSE

*Copyright 2026 Jindřich Vavruška jindrich@vavruska.cz *

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS 
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## How to install

### Install for application developer

To use the package in your nodejs application or for web application development:

```bash

```

### Developer install for experimenting and modification of the package

Make sure you have git, NodeJS and NPM installed in your system.

```bash
git clone https://github.com/radio-miskovice/hamcat.git
cd hamcat
npm install
npm run build
```

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
await rig.setPtt(true);
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
- `Rig` exposes straightforward methods (`getFreq`, `setFreq`, `getMode`, `setMode`, `setPtt`, `getPtt`).
- `Rig` also exposes generic `get(...)` and `set(...)` hooks for future family/model extensions.

Model-specific behavior is described in YAML profile files and consumed by model
adapters. The build pipeline converts YAML into JSON so compiled modules keep
importing JSON.

Source profile file:

- `src/models/models.yaml`

YAML hierarchy:

- top level object contains metadata and `hamCatModels`
- each `hamCatModels` key is a long model id in `<vendorid>.<modelid>` format
- only lowercase letters, digits, and `.` are allowed in long model ids

Common model fields stay at model root (`signals`, `vfoSplitPattern`,
`txSourceMap`). Additional model-specific fields go under `extra`, where each
entry uses `{ hint, value }`.

Split note:

- For standard Kenwood-style split control, omit `splitControl` and let baseline `FR`/`FT` behavior handle RX/TX VFO assignment.
- Define `splitControl` only for rigs with non-standard split behavior (for example, QMX `FT2` mode-flag split).

Model inheritance note:

- Use `sameAs` to reference a model with identical CAT semantics.
- A `sameAs` entry can stay minimal (typically just long id, display name, and `sameAs`), inheriting protocol/features/extras from the referenced model.

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

These are internal building blocks used by `Rig`. A this moment only `KenwoodProtocolAdapter` 
is implemented and tested. Tests have been performed with QRP Labs QMX and Labs 599's TX-500.
Tests with TS-590 are in the pipeline.

## Minimal viable CAT control level

`Rig` currently implements baseline CAT controls:

- TX VFO select (`setTxVfo`, `getTxVfo`)
- RX VFO select (`setRxVfo`, `getRxVfo`)
- VFO A/B frequency (`setFrequency`, `getFrequency`)
- modulation mode (`setModulationMode`, `getModulationMode`)
- PTT control (`setPtt`, `getPtt`)

Current baseline command mapping is implemented for the Kenwood family.
For model-specific TX source selection (for rigs with multiple TX audio paths),
call:

```typescript
await rig.setPtt(true, { source: "USB" });
```

If the active protocol does not provide a direct TX/RX state readback, `getPtt()`
returns the last value applied through `setPtt(...)`.
