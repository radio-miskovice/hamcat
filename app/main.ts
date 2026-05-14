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
  Rig,
  isWebSerialSupported,
  type RigStatus,
  type ModulationMode,
  type VfoId
} from "../src/index.browser";

type ModelChoice = "qmx" | "ts590";
type SignalSetting = "" | "on" | "off";

interface StoredProfile {
  name: string;
  model: ModelChoice;
  rts?: SignalSetting;
  dtr?: SignalSetting;
  rxVfo: VfoId;
  txVfo: VfoId;
  freqA: number;
  freqB: number;
  mode: ModulationMode;
  txSource: string;
}

const PROFILE_STORAGE_KEY = "hamcat.control.profiles.v1";

const modelSelect = byId<HTMLSelectElement>("modelSelect");
const baudInput = byId<HTMLInputElement>("baudInput");
const rtsSelect = byId<HTMLSelectElement>("rtsSelect");
const dtrSelect = byId<HTMLSelectElement>("dtrSelect");
const connectBtn = byId<HTMLButtonElement>("connectBtn");
const disconnectBtn = byId<HTMLButtonElement>("disconnectBtn");
const refreshBtn = byId<HTMLButtonElement>("refreshBtn");
const statusLine = byId<HTMLParagraphElement>("statusLine");
const supportState = byId<HTMLParagraphElement>("supportState");

const rxVfoSelect = byId<HTMLSelectElement>("rxVfoSelect");
const txVfoSelect = byId<HTMLSelectElement>("txVfoSelect");
const freqAInput = byId<HTMLInputElement>("freqAInput");
const freqBInput = byId<HTMLInputElement>("freqBInput");
const modeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'));
const txSourceSelect = byId<HTMLSelectElement>("txSourceSelect");
const setRxVfoBtn = byId<HTMLButtonElement>("setRxVfoBtn");
const setTxVfoBtn = byId<HTMLButtonElement>("setTxVfoBtn");
const setFreqABtn = byId<HTMLButtonElement>("setFreqABtn");
const setFreqBBtn = byId<HTMLButtonElement>("setFreqBBtn");
const setModeBtn = byId<HTMLButtonElement>("setModeBtn");
const txBtn = byId<HTMLButtonElement>("txBtn");
const rxBtn = byId<HTMLButtonElement>("rxBtn");
const macroCqBtn = byId<HTMLButtonElement>("macroCqBtn");
const macroSplitBtn = byId<HTMLButtonElement>("macroSplitBtn");
const profileNameInput = byId<HTMLInputElement>("profileNameInput");
const profileSelect = byId<HTMLSelectElement>("profileSelect");
const saveProfileBtn = byId<HTMLButtonElement>("saveProfileBtn");
const loadProfileBtn = byId<HTMLButtonElement>("loadProfileBtn");
const deleteProfileBtn = byId<HTMLButtonElement>("deleteProfileBtn");
const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".preset-btn"));
const logBox = byId<HTMLPreElement>("logBox");

let rig: Rig | null = null;

let connected = false;

init();

function init(): void {
  if (!isWebSerialSupported()) {
    supportState.textContent = "Web Serial API is unavailable in this browser. Use a Chromium-based browser over HTTPS or localhost.";
    setConnectionState(false);
    connectBtn.disabled = true;
    return;
  }

  supportState.textContent = "Web Serial API is available. Click Connect to pick your radio serial port.";

  connectBtn.addEventListener("click", () => runAction(connectRadio));
  disconnectBtn.addEventListener("click", () => runAction(disconnectRadio));
  refreshBtn.addEventListener("click", () => runAction(refreshValues));
  setRxVfoBtn.addEventListener("click", () => runAction(setRxVfoOnly));
  setTxVfoBtn.addEventListener("click", () => runAction(setTxVfoOnly));
  setFreqABtn.addEventListener("click", () => runAction(setFreqAOnly));
  setFreqBBtn.addEventListener("click", () => runAction(setFreqBOnly));
  setModeBtn.addEventListener("click", () => runAction(setModeOnly));
  txBtn.addEventListener("click", () => runAction(switchTx));
  rxBtn.addEventListener("click", () => runAction(() => getRig().setPtt(false)));
  macroCqBtn.addEventListener("click", () => runAction(runMacroCq));
  macroSplitBtn.addEventListener("click", () => runAction(runMacroSplit));
  saveProfileBtn.addEventListener("click", () => runAction(saveCurrentProfile));
  loadProfileBtn.addEventListener("click", () => runAction(loadSelectedProfile));
  deleteProfileBtn.addEventListener("click", () => runAction(deleteSelectedProfile));
  modelSelect.addEventListener("change", () => {
    toggleTxSourceForModel(modelSelect.value as ModelChoice);
  });
  profileSelect.addEventListener("change", () => {
    updateProfileActionState();
  });

  for (const button of presetButtons) {
    button.addEventListener("click", () => {
      runAction(() => applyPreset(button));
    });
  }

  refreshProfileOptions();
  updateProfileActionState();
}

async function connectRadio(): Promise<void> {
  const baudRate = Number.parseInt(baudInput.value, 10);
  if (!Number.isFinite(baudRate) || baudRate <= 0) {
    throw new Error("Baud rate must be a positive number.");
  }

  if (connected) {
    await rig?.disconnect();
  }

  const model = modelSelect.value as ModelChoice;
  const rts = parseSignalSelect(rtsSelect.value);
  const dtr = parseSignalSelect(dtrSelect.value);
  rig = Rig.create("kenwood", model);
  rig.onStatus((status: RigStatus) => {
    const family = status.protocolFamily ?? "n/a";
    const modelId = status.modelId ?? "n/a";
    statusLine.textContent = status.connected
      ? `Connected | family=${family} | model=${modelId} | tx=${status.bytesTx} rx=${status.bytesRx}`
      : "Disconnected";
  });

  await rig.connect(baudRate, { rts, dtr });
  connected = true;
  setConnectionState(true);
  toggleTxSourceForModel(model);
  refreshProfileOptions();
  appendLog(
    `Connected on ${baudRate} baud using ${model.toUpperCase()} profile (RTS=${formatSignal(rts)}, DTR=${formatSignal(dtr)}).`
  );

  await refreshValues();
}

async function disconnectRadio(): Promise<void> {
  await rig?.disconnect();
  rig = null;
  connected = false;
  setConnectionState(false);
  refreshProfileOptions();
  appendLog("Disconnected.");
}

async function refreshValues(): Promise<void> {
  ensureConnected();

  const rig = getRig();
  const rxVfo = await rig.getRxVfo();
  const txVfo = await rig.getTxVfo();
  const fa = await rig.getFreq("A");
  const fb = await rig.getFreq("B");
  const mode = await rig.getMode();

  rxVfoSelect.value = rxVfo;
  txVfoSelect.value = txVfo;
  freqAInput.value = String(fa);
  freqBInput.value = String(fb);
  setSelectedMode(mode);

  appendLog("Refreshed values from radio.");
}

async function setRxVfoOnly(): Promise<void> {
  ensureConnected();
  const rxVfo = rxVfoSelect.value as VfoId;
  await getRig().setRxVfo(rxVfo);
  appendLog(`Set RX VFO to ${rxVfo}.`);
}

async function setTxVfoOnly(): Promise<void> {
  ensureConnected();
  const txVfo = txVfoSelect.value as VfoId;
  await getRig().setTxVfo(txVfo);
  appendLog(`Set TX VFO to ${txVfo}.`);
}

async function setFreqAOnly(): Promise<void> {
  ensureConnected();
  const freqA = parseHz(freqAInput.value, "VFO A");
  const result = await getRig().setFreq(freqA, "A");
  if (result.accepted) {
    appendLog(`Set FA to ${freqA}.`);
    return;
  }
  freqAInput.value = String(result.appliedHz);
  appendLog(
    `FA request ${result.requestedHz} was adjusted by rig to ${result.appliedHz}.`,
    true
  );
}

async function setFreqBOnly(): Promise<void> {
  ensureConnected();
  const freqB = parseHz(freqBInput.value, "VFO B");
  const result = await getRig().setFreq(freqB, "B");
  if (result.accepted) {
    appendLog(`Set FB to ${freqB}.`);
    return;
  }
  freqBInput.value = String(result.appliedHz);
  appendLog(
    `FB request ${result.requestedHz} was adjusted by rig to ${result.appliedHz}.`,
    true
  );
}

async function setModeOnly(): Promise<void> {
  ensureConnected();
  const mode = getSelectedMode();
  await getRig().setMode(mode);
  appendLog(`Set mode to ${mode}.`);
}

async function switchTx(): Promise<void> {
  ensureConnected();

  const source = txSourceSelect.value.trim();
  if (source) {
    await getRig().setPtt(true, { source });
    appendLog(`Switched to TX with source ${source}.`);
    return;
  }

  await getRig().setPtt(true);
  appendLog("Switched to TX.");
}

async function applyPreset(button: HTMLButtonElement): Promise<void> {
  ensureConnected();

  const freqA = parseHz(button.dataset.freqa ?? "", "Preset VFO A");
  const rawFreqB = button.dataset.freqb;
  const freqB = rawFreqB ? parseHz(rawFreqB, "Preset VFO B") : freqA;
  const mode = button.dataset.mode as ModulationMode;
  if (!mode) {
    throw new Error("Preset is missing modulation mode.");
  }

  // Keep preset behavior predictable by landing on active VFO A.
  rxVfoSelect.value = "A";
  txVfoSelect.value = "A";
  freqAInput.value = String(freqA);
  freqBInput.value = String(freqB);
  setSelectedMode(mode);

  await getRig().setRxVfo("A");
  await getRig().setTxVfo("A");
  const resultA = await getRig().setFreq(freqA, "A");
  if (!resultA.accepted) {
    freqAInput.value = String(resultA.appliedHz);
    appendLog(
      `Preset note: FA ${resultA.requestedHz} adjusted to ${resultA.appliedHz}.`,
      true
    );
  }

  // Some radios are limited/quirky with VFO B writes; do not fail preset if this is rejected.
  try {
    const resultB = await getRig().setFreq(freqB, "B");
    if (!resultB.accepted) {
      freqBInput.value = String(resultB.appliedHz);
      appendLog(
        `Preset note: FB ${resultB.requestedHz} adjusted to ${resultB.appliedHz}.`,
        true
      );
    }
  } catch {
    appendLog("Preset note: VFO B update was rejected by radio; VFO A was applied.");
  }

  await getRig().setMode(mode);
  appendLog(`Preset applied: ${button.textContent?.trim() ?? "custom"}.`);
}

async function runMacroCq(): Promise<void> {
  ensureConnected();
  rxVfoSelect.value = "A";
  txVfoSelect.value = "A";
  setSelectedMode(modelSelect.value === "qmx" ? "CW" : "USB");
  await setRxVfoOnly();
  await setTxVfoOnly();
  await setModeOnly();
  await getRig().setPtt(true);
  appendLog("Macro CQ setup done: simplex TX on VFO A.");
}

async function runMacroSplit(): Promise<void> {
  ensureConnected();
  rxVfoSelect.value = "A";
  txVfoSelect.value = "B";
  await setRxVfoOnly();
  await setTxVfoOnly();
  await getRig().setPtt(false);
  appendLog("Macro split setup done: RX=A, TX=B.");
}

async function saveCurrentProfile(): Promise<void> {
  ensureConnected();

  const name = profileNameInput.value.trim();
  if (!name) {
    throw new Error("Enter a profile name before saving.");
  }

  const profiles = readProfiles();
  const next: StoredProfile = {
    name,
    model: modelSelect.value as ModelChoice,
    rts: normalizeSignalSetting(rtsSelect.value),
    dtr: normalizeSignalSetting(dtrSelect.value),
    rxVfo: rxVfoSelect.value as VfoId,
    txVfo: txVfoSelect.value as VfoId,
    freqA: parseHz(freqAInput.value, "VFO A"),
    freqB: parseHz(freqBInput.value, "VFO B"),
    mode: getSelectedMode(),
    txSource: txSourceSelect.value
  };

  const idx = profiles.findIndex((p) => p.name === name);
  if (idx >= 0) {
    profiles[idx] = next;
  } else {
    profiles.push(next);
  }

  writeProfiles(profiles);
  refreshProfileOptions(name);
  appendLog(`Saved profile ${name}.`);
}

async function loadSelectedProfile(): Promise<void> {
  ensureConnected();

  const name = profileSelect.value;
  if (!name) {
    throw new Error("Select a profile to load.");
  }

  const profile = readProfiles().find((p) => p.name === name);
  if (!profile) {
    throw new Error(`Profile ${name} was not found.`);
  }

  if (profile.model !== modelSelect.value) {
    throw new Error(
      `Profile ${profile.name} uses ${profile.model.toUpperCase()}. Switch model and reconnect before loading.`
    );
  }

  const profileRts = normalizeSignalSetting(profile.rts);
  const profileDtr = normalizeSignalSetting(profile.dtr);
  rtsSelect.value = profileRts;
  dtrSelect.value = profileDtr;
  toggleTxSourceForModel(profile.model);
  rxVfoSelect.value = profile.rxVfo;
  txVfoSelect.value = profile.txVfo;
  freqAInput.value = String(profile.freqA);
  freqBInput.value = String(profile.freqB);
  setSelectedMode(profile.mode);
  txSourceSelect.value = profile.txSource;
  profileNameInput.value = profile.name;

  await setRxVfoOnly();
  await setTxVfoOnly();
  await setFreqAOnly();
  await setFreqBOnly();
  await setModeOnly();
  appendLog(
    `Profile signal settings restored (RTS=${formatSignal(parseSignalSelect(profileRts))}, DTR=${formatSignal(parseSignalSelect(profileDtr))}). Reconnect to apply serial line changes.`,
    true
  );
  appendLog(`Loaded profile ${profile.name} into current session.`);
}

async function deleteSelectedProfile(): Promise<void> {
  const name = profileSelect.value;
  if (!name) {
    throw new Error("Select a profile to delete.");
  }

  const remaining = readProfiles().filter((p) => p.name !== name);
  writeProfiles(remaining);
  refreshProfileOptions();
  appendLog(`Deleted profile ${name}.`);
}

function parseHz(raw: string, fieldName: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} frequency must be a non-negative integer (Hz).`);
  }
  return parsed;
}

function parseSignalSelect(value: string): boolean | undefined {
  if (value === "on") {
    return true;
  }
  if (value === "off") {
    return false;
  }
  return undefined;
}

function formatSignal(value: boolean | undefined): string {
  if (value === true) {
    return "on";
  }
  if (value === false) {
    return "off";
  }
  return "auto";
}

function ensureConnected(): void {
  if (!connected) {
    throw new Error("Not connected. Click Connect first.");
  }
}

function getRig(): Rig {
  if (!rig) {
    throw new Error("Rig is not initialized.");
  }
  return rig;
}

function setConnectionState(isConnected: boolean): void {
  connectBtn.disabled = isConnected;
  disconnectBtn.disabled = !isConnected;
  refreshBtn.disabled = !isConnected;

  rxVfoSelect.disabled = !isConnected;
  txVfoSelect.disabled = !isConnected;
  freqAInput.disabled = !isConnected;
  freqBInput.disabled = !isConnected;
  for (const radio of modeRadios) {
    radio.disabled = !isConnected;
  }
  txSourceSelect.disabled = !isConnected;
  setRxVfoBtn.disabled = !isConnected;
  setTxVfoBtn.disabled = !isConnected;
  setFreqABtn.disabled = !isConnected;
  setFreqBBtn.disabled = !isConnected;
  setModeBtn.disabled = !isConnected;
  txBtn.disabled = !isConnected;
  rxBtn.disabled = !isConnected;
  macroCqBtn.disabled = !isConnected;
  macroSplitBtn.disabled = !isConnected;
  saveProfileBtn.disabled = !isConnected;
  profileSelect.disabled = !isConnected;

  for (const button of presetButtons) {
    button.disabled = !isConnected;
  }

  updateProfileActionState();
}

function toggleTxSourceForModel(model: ModelChoice): void {
  if (model === "qmx") {
    txSourceSelect.value = "";
    txSourceSelect.disabled = true;
    return;
  }

  if (connected) {
    txSourceSelect.disabled = false;
  }
}

function getSelectedMode(): ModulationMode {
  const selected = modeRadios.find((radio) => radio.checked);
  if (!selected) {
    throw new Error("No mode radio option is selected.");
  }
  return selected.value as ModulationMode;
}

function setSelectedMode(mode: ModulationMode): void {
  const target = modeRadios.find((radio) => radio.value === mode);
  if (!target) {
    throw new Error(`Unsupported mode value in UI: ${mode}`);
  }

  for (const radio of modeRadios) {
    radio.checked = radio === target;
  }
}

function readProfiles(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isStoredProfile);
  } catch {
    return [];
  }
}

function writeProfiles(profiles: StoredProfile[]): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

function refreshProfileOptions(selectedName?: string): void {
  const profiles = readProfiles().sort((a, b) => a.name.localeCompare(b.name));
  const current = selectedName ?? profileSelect.value;

  while (profileSelect.firstChild) {
    profileSelect.removeChild(profileSelect.firstChild);
  }

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "(none)";
  profileSelect.appendChild(emptyOption);

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.name;
    option.textContent = `${profile.name} (${profile.model.toUpperCase()})`;
    profileSelect.appendChild(option);
  }

  if (profiles.some((p) => p.name === current)) {
    profileSelect.value = current;
  } else {
    profileSelect.value = "";
  }

  updateProfileActionState();
}

function updateProfileActionState(): void {
  const hasSelection = profileSelect.value.trim().length > 0;
  loadProfileBtn.disabled = !connected || !hasSelection;
  deleteProfileBtn.disabled = !connected || !hasSelection;
}

function normalizeSignalSetting(value: unknown): SignalSetting {
  if (value === "on" || value === "off") {
    return value;
  }
  return "";
}

function isStoredProfile(value: unknown): value is StoredProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const rts = candidate.rts;
  const dtr = candidate.dtr;
  const hasValidRts = rts === undefined || rts === "" || rts === "on" || rts === "off";
  const hasValidDtr = dtr === undefined || dtr === "" || dtr === "on" || dtr === "off";
  return (
    typeof candidate.name === "string" &&
    (candidate.model === "qmx" || candidate.model === "ts590") &&
    hasValidRts &&
    hasValidDtr &&
    (candidate.rxVfo === "A" || candidate.rxVfo === "B") &&
    (candidate.txVfo === "A" || candidate.txVfo === "B") &&
    Number.isInteger(candidate.freqA) &&
    Number.isInteger(candidate.freqB) &&
    typeof candidate.mode === "string" &&
    typeof candidate.txSource === "string"
  );
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = toMessage(error);
    appendLog(message, true);
  }
}

function appendLog(message: string, isError = false): void {
  const stamp = new Date().toLocaleTimeString();
  const prefix = isError ? "ERROR" : "INFO";
  const line = `[${stamp}] ${prefix}: ${message}`;
  logBox.textContent = `${line}\n${logBox.textContent}`.slice(0, 6000);
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}
