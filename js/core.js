// Shared state, keyframe maths, history and asset storage.

export const FPS = 25;
export const FW = 1920;
export const FH = 1080;
export const STORE = "shadow-studio-v3";
export const LAYOUT = "shadow-studio-layout";

export const $ = (id) => document.getElementById(id);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round1 = (v) => Math.round(v * 10) / 10;
export const snapT = (s) => Math.round(s * FPS) / FPS;
export const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function tc(s) {
  const f = Math.max(0, Math.round(s * FPS));
  const sec = Math.floor(f / FPS);
  return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60, f % FPS]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function parseTc(text) {
  const s = String(text).trim();
  if (s.includes(":")) {
    const parts = s.split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    const [hh, mm, ss, ff] = [0, 0, 0, 0, ...parts].slice(-4);
    return hh * 3600 + mm * 60 + ss + ff / FPS;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function hexRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Icons ───────────────────────────────────────────────
const svg = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${body}</svg>`;
const F = (d) => `<path d="${d}" fill="currentColor"/>`;
const L = (d, w = 1.3) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const EYE = "M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8z";
export const ICON = {
  start: svg(F("M3 3h1.6v10H3z") + F("M13 3 5.6 8 13 13z")),
  prev: svg(F("M10.5 3 4 8l6.5 5z") + F("M11.6 3h1.6v10h-1.6z")),
  play: svg(F("M4.5 2.8v10.4L13.2 8z")),
  stop: svg(F("M4 4h8v8H4z")),
  next: svg(F("M5.5 3 12 8l-6.5 5z") + F("M2.8 3h1.6v10H2.8z")),
  end: svg(F("M3 3l7.4 5L3 13z") + F("M11.4 3H13v10h-1.6z")),
  safe: svg(L("M2 3.5h12v9H2z") + L("M4.5 5.5h7v5h-7z")),
  loop: svg(L("M3 7.5V6.5a2 2 0 0 1 2-2h7.5M10.5 2.5l2 2-2 2M13 8.5v1a2 2 0 0 1-2 2H3.5M5.5 13.5l-2-2 2-2")),
  eye: svg(L(EYE) + '<circle cx="8" cy="8" r="1.9" fill="currentColor"/>'),
  eyeOff: svg(L(EYE) + L("M2.5 13.5l11-11")),
  lock: svg(L("M4.5 7.5h7v6h-7z") + L("M6 7.5V5.5a2 2 0 0 1 4 0v2")),
  unlock: svg(L("M4.5 7.5h7v6h-7z") + L("M6 7.5V5.5a2 2 0 0 1 3.8-.9")),
  speaker: svg(F("M2.5 6h2.5L8.5 3v10L5 10H2.5z") + L("M10.5 5.5a3.5 3.5 0 0 1 0 5M12.3 3.8a6 6 0 0 1 0 8.4")),
  speakerOff: svg(F("M2.5 6h2.5L8.5 3v10L5 10H2.5z") + L("M10.5 6l3.5 4M14 6l-3.5 4")),
  stopwatch: svg('<circle cx="8" cy="9" r="4.8" fill="none" stroke="currentColor" stroke-width="1.3"/>' + L("M8 9V6.4M6.6 2.6h2.8M11.6 4.6l.9-.9")),
  kprev: svg(F("M10 4.5 5.5 8l4.5 3.5z")),
  knext: svg(F("M6 4.5 10.5 8 6 11.5z")),
  diamond: svg('<path d="M8 3.6 12.4 8 8 12.4 3.6 8z" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
  reset: svg(L("M4.2 5A4.8 4.8 0 1 1 3.2 8.6") + L("M3.6 2.4v2.8h2.8")),
  list: svg(F("M2 3h12v1.4H2zM2 7.3h12v1.4H2zM2 11.6h12V13H2z")),
  grid: svg(F("M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z")),
  magnet: svg(L("M4 2.5V8a4 4 0 0 0 8 0V2.5") + L("M4 5.2h2.4M9.6 5.2H12")),
  seq: svg('<rect x="2" y="3.5" width="12" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>' + L("M5 3.5v9M11 3.5v9", 1.1)),
  chevron: svg(L("M5.5 6.5 8 9l2.5-2.5", 1.5)),
  close: svg(L("M4 4l8 8M12 4l-8 8", 1.4)),
  plus: svg(L("M8 3v10M3 8h10", 1.5)),
  edit: svg(L("M10.5 2.8l2.7 2.7-7.4 7.4-3.3.6.6-3.3z") + L("M9.2 4.1l2.7 2.7")),
  trash: svg(L("M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5")),
  up: svg(L("M8 12V4M4.5 7.5 8 4l3.5 3.5", 1.4)),
  down: svg(L("M8 4v8M4.5 8.5 8 12l3.5-3.5", 1.4)),
  lamp: svg(F("M8 1.5c1.6 2 2.4 3.4 2.4 4.6A2.4 2.4 0 0 1 8 8.5a2.4 2.4 0 0 1-2.4-2.4C5.6 4.9 6.4 3.5 8 1.5z") + F("M2.5 10h11l-1.7 3.5H4.2z")),
  fire: svg(F("M8 1.5c.4 2.2 3.8 3.6 3.8 7.2A3.8 3.8 0 0 1 8 12.5a3.8 3.8 0 0 1-3.8-3.8c0-1.6.8-2.6 1.6-3.4.1 1.2.7 2 1.5 2.3C7 5.8 7.4 3.6 8 1.5z")),
  note: svg(F("M6 3.2 13 2v8.3a2 2 0 1 1-1.4-1.9V4.6L7.4 5.4v6.4a2 2 0 1 1-1.4-1.9z")),
  figure: svg(F("M8 1.8a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM5.2 6.4h5.6l1.2 4h-1.6L9.6 14H6.4l-.8-3.6H4z")),
  move: svg(L("M8 2v12M2 8h12M8 2 6.3 3.7M8 2l1.7 1.7M8 14l-1.7-1.7M8 14l1.7-1.7M2 8l1.7-1.7M2 8l1.7 1.7M14 8l-1.7-1.7M14 8l-1.7 1.7")),
  plug: svg(L("M6 2v3.5M10 2v3.5M4.5 5.5h7v2.5a3.5 3.5 0 0 1-7 0zM8 11.5V14")),
  import: svg(L("M8 2.5v7.5M5 7l3 3 3-3M3 11.5v2h10v-2")),
  rec: svg('<circle cx="8" cy="8" r="4.5" fill="currentColor"/>'),
};

// ── Event bus ───────────────────────────────────────────
const handlers = {};
export const on = (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn);
export const emit = (ev, ...args) => (handlers[ev] || []).forEach((fn) => fn(...args));

// ── Session state ───────────────────────────────────────
export const S = {
  project: null,
  sel: null, // { type: "item" | "light", id }
  selKey: null, // { path, key }
  t: 0,
  playing: false,
  rate: 1,
  loop: true,
  snap: true,
  pps: 40,
  dirty: false,
  gesture: null,
  collapsed: {},
  recording: false,
  rigEdit: null, // { item, part } while a figure's parts are being shaped on the screen
};

// ── Properties ──────────────────────────────────────────
export const PROPS = {
  position: { label: "Position", dims: 2, step: 1, digits: 1, min: -6000, max: 8000 },
  scale: { label: "Scale", dims: 1, step: 0.5, digits: 1, min: 0, max: 800, unit: "%" },
  rotation: { label: "Rotation", dims: 1, step: 0.5, digits: 1, min: -720, max: 720, unit: "°" },
  opacity: { label: "Opacity", dims: 1, step: 0.5, digits: 1, min: 0, max: 100, unit: "%" },
  depth: { label: "Off the cloth", dims: 1, step: 0.5, digits: 0, min: 0, max: 100, unit: "%" },
  // A figure is a leather plate in space: it can turn on its stick (about the upright) and tilt toward or away.
  turn: { label: "Turn", dims: 1, step: 0.5, digits: 1, min: -85, max: 85, unit: "°" },
  tilt: { label: "Tilt", dims: 1, step: 0.5, digits: 1, min: -60, max: 60, unit: "°" },
  intensity: { label: "Intensity", dims: 1, step: 0.5, digits: 0, min: 0, max: 300, unit: "%" },
  size: { label: "Spread", dims: 1, step: 0.5, digits: 0, min: 5, max: 400, unit: "%" },
  flicker: { label: "Flicker", dims: 1, step: 0.5, digits: 0, min: 0, max: 100, unit: "%" },
  volume: { label: "Volume", dims: 1, step: 0.5, digits: 0, min: 0, max: 200, unit: "%" },
  pan: { label: "Pan", dims: 1, step: 0.5, digits: 0, min: -100, max: 100 },
};
export const propDef = (path) => PROPS[path.split("/").pop()];

export const GROUPS = {
  puppet: [
    { id: "motion", label: "Motion", paths: ["position", "scale", "rotation"] },
    { id: "shadow", label: "Shadow", paths: ["depth", "opacity"] },
    { id: "space", label: "3D", paths: ["turn", "tilt"] },
  ],
  fx: [{ id: "fx", label: "Effect", paths: ["position", "scale", "intensity"] }],
  title: [{ id: "titlecard", label: "Title card", paths: ["position", "scale", "opacity"] }],
  audio: [{ id: "audio", label: "Audio", paths: ["volume", "pan"] }],
  light: [{ id: "light", label: "Light", paths: ["position", "intensity", "size", "flicker"] }],
};

const DEF = {
  puppet: { position: [960, 648], scale: [100], rotation: [0], depth: [0], opacity: [100], turn: [0], tilt: [0] },
  fx: { position: [960, 1000], scale: [100], intensity: [100] },
  title: { position: [960, 540], scale: [100], opacity: [100] },
  audio: { volume: [100], pan: [0] },
  light: { position: [960, 1010], intensity: [100], size: [100], flicker: [0] },
};

export function makeProps(kind, overrides = {}) {
  const out = {};
  for (const [name, v] of Object.entries(DEF[kind])) out[name] = { base: (overrides[name] || v).slice(), keys: [] };
  return out;
}

export const propDefault = (kind, path) => (path.startsWith("part/") ? [0] : DEF[kind][path].slice());

// ── Keyframes ───────────────────────────────────────────
export const K = (t, v, i = "ease") => ({ t, v: v.slice(), i });

// Live input from a board overrides a property while it is connected.
export const overrides = new Map();

export function getProp(owner, path) {
  if (!owner) return null;
  if (path.startsWith("part/")) {
    const [, pid, name] = path.split("/");
    const part = (owner.parts || []).find((p) => p.id === pid);
    return part ? part.props[name] : null;
  }
  // Shows saved before a property existed get it, at its default, when first asked for.
  if (!owner.props[path] && owner.kind && DEF[owner.kind] && DEF[owner.kind][path]) owner.props[path] = { base: DEF[owner.kind][path].slice(), keys: [] };
  return owner.props[path] || null;
}

export function sortKeys(p) {
  p.keys.sort((a, b) => a.t - b.t);
}

export function valueAt(p, time) {
  const o = overrides.get(p);
  if (o) return o.slice();
  const ks = p.keys;
  if (!ks.length) return p.base.slice();
  if (time <= ks[0].t) return ks[0].v.slice();
  const last = ks[ks.length - 1];
  if (time >= last.t) return last.v.slice();
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (time >= a.t && time < b.t) {
      if (a.i === "hold") return a.v.slice();
      let u = (time - a.t) / (b.t - a.t);
      if (a.i === "ease") u = u * u * (3 - 2 * u);
      return a.v.map((av, d) => av + (b.v[d] - av) * u);
    }
  }
  return last.v.slice();
}

export function keyIndexAt(p, time) {
  const ft = snapT(time);
  return p.keys.findIndex((k) => Math.abs(k.t - ft) < 1e-6);
}

// With animation on, a change writes a keyframe at the playhead; otherwise it sets the static value.
export function setValue(owner, path, v, time = S.t) {
  const p = getProp(owner, path);
  if (!p) return;
  if (!p.keys.length) {
    p.base = v.slice();
    return;
  }
  const i = keyIndexAt(p, time);
  if (i >= 0) p.keys[i].v = v.slice();
  else {
    p.keys.push(K(snapT(time), v));
    sortKeys(p);
  }
}

export function allPaths(owner) {
  if (owner.kind && DEF[owner.kind]) for (const name of Object.keys(DEF[owner.kind])) getProp(owner, name);
  const paths = Object.keys(owner.props);
  for (const part of owner.parts || []) paths.push(`part/${part.id}/rotation`);
  return paths;
}

export function keyTimesOf(owner) {
  const set = new Set();
  for (const path of allPaths(owner)) for (const k of getProp(owner, path).keys) set.add(k.t);
  return [...set].sort((a, b) => a - b);
}

// ── Lookups ─────────────────────────────────────────────
export const itemById = (id) => S.project.items.find((i) => i.id === id);
export const lightById = (id) => S.project.lights.find((l) => l.id === id);
export const ownerOf = (sel) => (!sel ? null : sel.type === "light" ? lightById(sel.id) : itemById(sel.id));
export const selectedOwner = () => ownerOf(S.sel);
export const visibleAt = (it, time) => it.enabled && time >= it.clip.start && time < it.clip.end;
export const kindOf = (sel) => (!sel ? null : sel.type === "light" ? "light" : itemById(sel.id)?.kind);

// ── Saving and history ──────────────────────────────────
const undoStack = [];
const redoStack = [];

export function isProject(p) {
  return Boolean(
    p && p.version === 3 && typeof p.duration === "number" && p.screen && p.motors &&
    Array.isArray(p.items) && Array.isArray(p.lights) && Array.isArray(p.scenes)
  );
}

// Fire is not part of Silhouette.ai: drop fire clips and fire-crackle sounds from older or imported shows,
// and turn any fire torch into an oil lamp.
export function withoutFire(p) {
  p.items = p.items.filter((it) => !(it.kind === "fx" && it.fx === "fire") && it.asset !== "snd:fire");
  for (const L of p.lights) {
    if (L.type === "torch") {
      L.type = "oil";
      if (L.name === "Fire torch") L.name = "Oil lamp";
    }
  }
  return p;
}

export function loadProject() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE) || "null");
    return isProject(p) ? withoutFire(p) : null;
  } catch (err) {
    return null;
  }
}

export function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(S.project));
  } catch (err) {
    toast("Could not save in this browser; export the show to keep it");
  }
  S.dirty = false;
  renderDocState();
}

export function checkpoint() {
  undoStack.push(JSON.stringify(S.project));
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  S.dirty = true;
  renderDocState();
}

// Drop a checkpoint taken for a gesture that changed nothing.
export function dropCheckpoint() {
  undoStack.pop();
  S.dirty = false;
  renderDocState();
}

export function commit() {
  save();
  emit("refresh");
}

function restore(json) {
  S.project = JSON.parse(json);
  S.selKey = null;
  if (S.sel && !ownerOf(S.sel)) S.sel = null;
  S.t = Math.min(S.t, S.project.duration);
  commit();
}

export function undo() {
  if (!undoStack.length) return toast("Nothing to undo");
  redoStack.push(JSON.stringify(S.project));
  restore(undoStack.pop());
  toast("Undo");
}

export function redo() {
  if (!redoStack.length) return toast("Nothing to redo");
  undoStack.push(JSON.stringify(S.project));
  restore(redoStack.pop());
  toast("Redo");
}

export function renderDocState() {
  const state = $("save-state");
  if (!state) return;
  state.textContent = S.dirty ? "Editing" : "Saved";
  $("save-dot").classList.toggle("dirty", S.dirty);
  $("doc-title").textContent = S.project ? S.project.title || "Untitled show" : "";
}

let toastTimer = 0;
export function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1600);
}

// ── Asset storage (imported images and sounds) ──────────
export const assetURL = {}; // asset id -> object URL
export const blobs = {}; // asset id -> Blob

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("shadow-studio", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("assets");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function putBlob(id, blob) {
  blobs[id] = blob;
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("assets", "readwrite");
      tx.objectStore("assets").put(blob, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    toast("Media is kept for this visit only; export the show to keep it");
  }
}

export async function getBlob(id) {
  if (blobs[id]) return blobs[id];
  try {
    const d = await db();
    const blob = await new Promise((resolve, reject) => {
      const req = d.transaction("assets").objectStore("assets").get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (blob) blobs[id] = blob;
    return blob;
  } catch (err) {
    return null;
  }
}
