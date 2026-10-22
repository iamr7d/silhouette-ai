// Real puppets and lights: drive servos and LEDs on a board over Web Serial, and read puppeteers' controls back.
import {
  $, S, ICON, K, PROPS, allPaths, checkpoint, clamp, commit, emit, esc, getProp, itemById, lightById,
  overrides, save, snapT, sortKeys, toast, uid, valueAt,
} from "./core.js";

export const supported = typeof navigator !== "undefined" && "serial" in navigator;

const serial = { port: null, writer: null, reader: null, connected: false, hello: "", busy: false, inputs: {}, last: {}, lastAt: {} };
const live = {}; // output id -> current value
const liveIn = {}; // input id -> { raw, val }
const lastRec = {}; // input id -> last recorded time

const CMD = { servo: "S", cservo: "C", pwm: "L" };
const TYPE_RANGE = { servo: [0, 180], cservo: [-100, 100], pwm: [0, 100] };
const TYPE_LABEL = { servo: "Servo (angle)", cservo: "Continuous servo (speed)", pwm: "Light (PWM)" };
const UNIT = { servo: "°", cservo: "", pwm: "%" };
const RANGES = {
  position: [[0, 1920], [0, 1080]], scale: [[50, 150]], rotation: [[-45, 45]], opacity: [[0, 100]], depth: [[0, 100]],
  intensity: [[0, 200]], size: [[0, 300]], flicker: [[0, 100]], volume: [[0, 200]], pan: [[-100, 100]],
  turn: [[-80, 80]], tilt: [[-45, 45]],
};

// ── Connection ──────────────────────────────────────────
export async function connect() {
  if (!supported) return toast("Connecting a board needs Chrome or Edge on a computer");
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: Number(S.project.motors.baud) || 115200 });
    Object.assign(serial, { port, writer: port.writable.getWriter(), connected: true, last: {}, lastAt: {}, inputs: {}, hello: "" });
    readLoop(port);
    write("?\nE1\n");
    toast("Board connected");
    emit("motors");
  } catch (err) {
    if (err && err.name !== "NotFoundError") toast(`Could not open the port: ${err.message}`);
  }
}

export async function disconnect() {
  try {
    if (serial.reader) await serial.reader.cancel();
    if (serial.writer) serial.writer.releaseLock();
    if (serial.port) await serial.port.close();
  } catch (err) {
    // The port may already be gone (cable pulled).
  }
  Object.assign(serial, { port: null, writer: null, reader: null, connected: false, hello: "", busy: false, inputs: {} });
  overrides.clear();
  emit("motors");
}

async function readLoop(port) {
  const decoder = new TextDecoderStream();
  const piped = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();
  serial.reader = reader;
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        handleLine(buf.slice(0, i).trim());
        buf = buf.slice(i + 1);
      }
    }
  } catch (err) {
    toast("Board disconnected");
  } finally {
    reader.releaseLock();
  }
  await piped;
  if (serial.connected && serial.port === port) disconnect();
}

function handleLine(line) {
  if (line.startsWith("SHADOW")) {
    serial.hello = line;
    emit("motors");
    return;
  }
  const m = /^I(\d+)=(\d+)/.exec(line);
  if (m) serial.inputs[m[1]] = Number(m[2]);
}

function write(text) {
  if (!serial.writer || serial.busy) return false;
  serial.busy = true;
  serial.writer.write(new TextEncoder().encode(text)).catch(() => {}).finally(() => { serial.busy = false; });
  return true;
}

// ── Mapping ─────────────────────────────────────────────
export function resolveRef(ref) {
  if (!ref) return null;
  const [type, id, path, dim] = ref.split("|");
  const owner = type === "light" ? lightById(id) : itemById(id);
  const prop = owner && getProp(owner, path);
  return prop ? { owner, path, prop, dim: Number(dim) || 0 } : null;
}

export function sourceOptions() {
  const out = [];
  const add = (type, owner) => {
    for (const path of allPaths(owner)) {
      const name = path.split("/").pop();
      const def = PROPS[name];
      const part = path.startsWith("part/") ? (owner.parts || []).find((p) => p.id === path.split("/")[1]) : null;
      for (let d = 0; d < def.dims; d++) {
        out.push({
          ref: `${type}|${owner.id}|${path}|${d}`,
          label: `${owner.name} · ${part ? `${part.name} ` : ""}${def.label}${def.dims > 1 ? (d ? " Y" : " X") : ""}`,
          range: part ? [-90, 90] : RANGES[name][d],
        });
      }
    }
  };
  for (const it of S.project.items) add("item", it);
  for (const L of S.project.lights) add("light", L);
  return out;
}

function outputValue(o, t) {
  let v;
  if (o.manual) v = o.manualValue;
  else {
    const src = resolveRef(o.source.ref);
    if (!src) return null;
    const s = valueAt(src.prop, t)[src.dim];
    const u = (s - o.source.inMin) / (o.source.inMax - o.source.inMin || 1);
    v = o.min + clamp(u, 0, 1) * (o.max - o.min);
  }
  if (o.invert) v = o.min + o.max - v;
  return clamp(v, Math.min(o.min, o.max), Math.max(o.min, o.max));
}

// Called every frame: send changed outputs, and apply (or record) the board's inputs.
export function tickMotors(t) {
  const M = S.project.motors;
  const now = performance.now();
  let batch = "";
  const pending = {};
  for (const o of M.outputs) {
    const v = outputValue(o, t);
    live[o.id] = v;
    if (v == null || !serial.connected || !M.send) continue;
    const rv = Math.round(v);
    const prev = serial.last[o.id];
    if (prev === undefined || prev !== rv || now - (serial.lastAt[o.id] || 0) > 1000) {
      batch += `${CMD[o.type]}${o.channel}=${rv}\n`;
      pending[o.id] = rv;
    }
  }
  if (batch && write(batch)) {
    for (const [id, v] of Object.entries(pending)) {
      serial.last[id] = v;
      serial.lastAt[id] = now;
    }
  }

  overrides.clear();
  if (!serial.connected) return;
  for (const inp of M.inputs) {
    const raw = serial.inputs[inp.pin];
    const target = resolveRef(inp.target.ref);
    if (!inp.enabled || raw == null || !target) continue;
    const u = clamp((raw - inp.inMin) / (inp.inMax - inp.inMin || 1), 0, 1);
    const val = inp.target.outMin + u * (inp.target.outMax - inp.target.outMin);
    const cur = overrides.get(target.prop) || valueAt(target.prop, t);
    cur[target.dim] = val;
    overrides.set(target.prop, cur);
    liveIn[inp.id] = { raw, val };
    if (S.recording && S.playing && t - (lastRec[inp.id] ?? -1) >= 0.2) {
      lastRec[inp.id] = t;
      const p = target.prop;
      const kt = snapT(t);
      const k = p.keys.find((x) => Math.abs(x.t - kt) < 1e-6);
      if (k) k.v = cur.slice();
      else {
        p.keys.push(K(kt, cur, "linear"));
        sortKeys(p);
      }
    }
  }
}

export function toggleRecording() {
  if (!S.recording) {
    checkpoint();
    S.recording = true;
    toast("Recording the board's controls while playing");
  } else {
    S.recording = false;
    commit();
    toast("Recording stopped");
  }
  buildMotors();
}

// ── Panel ───────────────────────────────────────────────
function rangeFor(ref) {
  const opt = sourceOptions().find((o) => o.ref === ref);
  return opt ? opt.range : [0, 100];
}

function nextChannel(type) {
  const used = new Set(S.project.motors.outputs.filter((o) => (type === "pwm") === (o.type === "pwm")).map((o) => o.channel));
  let ch = 0;
  while (used.has(ch)) ch++;
  return ch;
}

export function makeOutput(type, ref, name) {
  const [min, max] = TYPE_RANGE[type];
  const [inMin, inMax] = ref ? rangeFor(ref) : [0, 100];
  return {
    id: uid("out"), name: name || "Output", type, channel: nextChannel(type), min, max, invert: false,
    manual: false, manualValue: (min + max) / 2, source: { ref: ref || "", inMin, inMax },
  };
}

export function autoMap(sel) {
  const M = S.project.motors;
  if (!sel) return toast("Select a character or light first");
  if (sel.type === "light") {
    M.outputs.push(makeOutput("pwm", `light|${sel.id}|intensity|0`, `${lightById(sel.id).name} lamp`));
    return;
  }
  const it = itemById(sel.id);
  if (!it || it.kind !== "puppet") return toast("Auto-map works for characters and lights");
  M.outputs.push(makeOutput("servo", `item|${it.id}|position|0`, `${it.name} slide`));
  M.outputs.push(makeOutput("servo", `item|${it.id}|rotation|0`, `${it.name} tilt`));
  for (const part of it.parts || []) M.outputs.push(makeOutput("servo", `item|${it.id}|part/${part.id}/rotation|0`, `${it.name} ${part.name}`));
}

export function buildMotors() {
  const host = $("tab-motors");
  if (!host) return;
  const M = S.project.motors;
  const opts = sourceOptions();
  const options = (sel) =>
    '<option value="">Choose what drives it…</option>' +
    opts.map((o) => `<option value="${o.ref}"${o.ref === sel ? " selected" : ""}>${esc(o.label)}</option>`).join("");
  const num = (attrs, v, step = 1) => `<input class="num" type="number" step="${step}" ${attrs} value="${v}">`;

  const status = !supported
    ? '<span class="pill warn">Web Serial is not available in this browser. Use Chrome or Edge on a computer.</span>'
    : serial.connected
      ? `<span class="pill ok">Connected${serial.hello ? ` · ${esc(serial.hello)}` : ""}</span>`
      : '<span class="pill">Not connected · outputs are simulated below</span>';

  const outs = M.outputs.map((o) => {
    const [tmin, tmax] = TYPE_RANGE[o.type];
    return `<div class="card" data-mo="${o.id}">
      <div class="card-top">
        <input class="name" data-f="name" value="${esc(o.name)}">
        <select data-f="type">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}"${k === o.type ? " selected" : ""}>${l}</option>`).join("")}</select>
        <label class="inline">Ch ${num('data-f="channel" min="0" max="31"', o.channel)}</label>
        <button class="ib xs" data-mact="del-out" title="Remove">${ICON.trash}</button>
      </div>
      <div class="card-row"><select class="grow" data-f="ref">${options(o.source.ref)}</select></div>
      <div class="card-row">
        <span class="muted">In</span>${num('data-f="inMin"', o.source.inMin, "any")}<span class="muted">to</span>${num('data-f="inMax"', o.source.inMax, "any")}
        <span class="arrow">→</span>
        <span class="muted">Out</span>${num(`data-f="min" min="${tmin}" max="${tmax}"`, o.min)}<span class="muted">to</span>${num(`data-f="max" min="${tmin}" max="${tmax}"`, o.max)}${UNIT[o.type]}
        <label class="chk"><input type="checkbox" data-f="invert"${o.invert ? " checked" : ""}> Invert</label>
      </div>
      <div class="card-row">
        <label class="chk"><input type="checkbox" data-f="manual"${o.manual ? " checked" : ""}> Manual</label>
        <input class="grow" type="range" data-f="manualValue" min="${Math.min(o.min, o.max)}" max="${Math.max(o.min, o.max)}" step="1" value="${o.manualValue}"${o.manual ? "" : " disabled"}>
        <span class="gauge"><i data-gauge="${o.id}"></i></span><span class="live" data-live="${o.id}">–</span>
      </div>
    </div>`;
  }).join("");

  const ins = M.inputs.map((inp) => `<div class="card" data-mi="${inp.id}">
      <div class="card-top">
        <input class="name" data-f="name" value="${esc(inp.name)}">
        <label class="inline">Pin A<select data-f="pin">${[0, 1, 2, 3, 4, 5].map((p) => `<option value="${p}"${p === inp.pin ? " selected" : ""}>${p}</option>`).join("")}</select></label>
        <label class="chk"><input type="checkbox" data-f="enabled"${inp.enabled ? " checked" : ""}> On</label>
        <button class="ib xs" data-mact="del-in" title="Remove">${ICON.trash}</button>
      </div>
      <div class="card-row"><select class="grow" data-f="ref">${options(inp.target.ref)}</select></div>
      <div class="card-row">
        <span class="muted">Reading</span>${num('data-f="inMin" min="0" max="1023"', inp.inMin)}<span class="muted">to</span>${num('data-f="inMax" min="0" max="1023"', inp.inMax)}
        <span class="arrow">→</span>${num('data-f="outMin"', inp.target.outMin, "any")}<span class="muted">to</span>${num('data-f="outMax"', inp.target.outMax, "any")}
        <span class="live" data-livein="${inp.id}">–</span>
      </div>
    </div>`).join("");

  host.innerHTML = `<div class="mpanel">
    <div class="mbar">
      ${status}
      <span class="grow"></span>
      <label class="inline">Baud <select data-mset="baud">${[9600, 57600, 115200, 250000].map((b) => `<option${b === Number(M.baud) ? " selected" : ""}>${b}</option>`).join("")}</select></label>
      ${serial.connected
        ? '<button class="btn" data-mact="disconnect">Disconnect</button>'
        : `<button class="btn primary" data-mact="connect"${supported ? "" : " disabled"}>${ICON.plug} Connect board</button>`}
    </div>
    <div class="mbar sub">
      <label class="chk"><input type="checkbox" data-mset="send"${M.send ? " checked" : ""}> Send to the board</label>
      <button class="btn${S.recording ? " rec" : ""}" data-mact="record" title="Write the board's controls as keyframes while the sequence plays">${ICON.rec} ${S.recording ? "Recording…" : "Record controls"}</button>
      <span class="grow"></span>
      <a class="link" href="hardware/shadow_controller/shadow_controller.ino" download>Arduino sketch</a>
      <a class="link" href="hardware/README.md" target="_blank" rel="noopener">Wiring guide</a>
    </div>
    <div class="sec-h">Outputs · motors and lamps <span class="grow"></span>
      <button class="btn" data-mact="automap" title="Create outputs for the selected character or light">Auto-map selection</button>
      <button class="btn" data-mact="add-out">${ICON.plus} Add output</button></div>
    ${outs || '<p class="empty">No outputs yet. Each output drives one servo or lamp channel from a property on the timeline, or by hand.</p>'}
    <div class="sec-h">Inputs · puppeteer's controls <span class="grow"></span>
      <button class="btn" data-mact="add-in">${ICON.plus} Add input</button></div>
    ${ins || '<p class="empty">No inputs yet. An input reads a potentiometer or sensor on the board and moves a property live, for performing real puppets and screen figures together.</p>'}
  </div>`;
  tickMotorsUI();
}

export function tickMotorsUI() {
  const host = $("tab-motors");
  if (!host || host.hidden) return;
  for (const o of S.project.motors.outputs) {
    const v = live[o.id];
    const label = host.querySelector(`[data-live="${o.id}"]`);
    const gauge = host.querySelector(`[data-gauge="${o.id}"]`);
    if (!label) continue;
    label.textContent = v == null ? "–" : `${Math.round(v)}${UNIT[o.type]}`;
    const lo = Math.min(o.min, o.max);
    const hi = Math.max(o.min, o.max);
    gauge.style.width = v == null ? "0" : `${((v - lo) / (hi - lo || 1)) * 100}%`;
  }
  for (const inp of S.project.motors.inputs) {
    const el = host.querySelector(`[data-livein="${inp.id}"]`);
    const li = liveIn[inp.id];
    if (el) el.textContent = serial.connected && li ? `${li.raw} → ${li.val.toFixed(1)}` : "–";
  }
}

export function bindMotors() {
  const host = $("tab-motors");
  host.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-mact]");
    if (!b) return;
    const M = S.project.motors;
    const act = b.dataset.mact;
    if (act === "connect") return connect();
    if (act === "disconnect") return disconnect();
    if (act === "record") return toggleRecording();
    checkpoint();
    if (act === "add-out") M.outputs.push(makeOutput("servo", "", `Output ${M.outputs.length + 1}`));
    else if (act === "add-in") M.inputs.push({ id: uid("in"), name: `Control ${M.inputs.length + 1}`, pin: M.inputs.length % 6, enabled: true, inMin: 0, inMax: 1023, target: { ref: "", outMin: 0, outMax: 100 } });
    else if (act === "automap") autoMap(S.sel);
    else if (act === "del-out") M.outputs = M.outputs.filter((o) => o.id !== b.closest("[data-mo]").dataset.mo);
    else if (act === "del-in") M.inputs = M.inputs.filter((i) => i.id !== b.closest("[data-mi]").dataset.mi);
    commit();
  });

  host.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.f !== "manualValue") return;
    const o = S.project.motors.outputs.find((x) => x.id === el.closest("[data-mo]").dataset.mo);
    o.manualValue = Number(el.value);
  });

  host.addEventListener("change", (e) => {
    const el = e.target;
    const M = S.project.motors;
    if (el.dataset.mset) {
      checkpoint();
      if (el.dataset.mset === "baud") M.baud = Number(el.value);
      else M.send = el.checked;
      return commit();
    }
    const f = el.dataset.f;
    if (!f) return;
    const val = el.type === "checkbox" ? el.checked : el.type === "number" || el.type === "range" ? Number(el.value) : el.value;
    checkpoint();
    const outEl = el.closest("[data-mo]");
    if (outEl) {
      const o = M.outputs.find((x) => x.id === outEl.dataset.mo);
      if (f === "ref") {
        o.source.ref = val;
        [o.source.inMin, o.source.inMax] = rangeFor(val);
        if (o.name.startsWith("Output")) o.name = (sourceOptions().find((x) => x.ref === val) || {}).label || o.name;
      } else if (f === "inMin" || f === "inMax") o.source[f] = val;
      else if (f === "type") {
        o.type = val;
        [o.min, o.max] = TYPE_RANGE[val];
        o.manualValue = (o.min + o.max) / 2;
      } else o[f] = val;
    } else {
      const inp = M.inputs.find((x) => x.id === el.closest("[data-mi]").dataset.mi);
      if (f === "ref") {
        inp.target.ref = val;
        [inp.target.outMin, inp.target.outMax] = rangeFor(val);
      } else if (f === "outMin" || f === "outMax") inp.target[f] = val;
      else inp[f] = f === "pin" ? Number(val) : val;
    }
    if (f === "manualValue") {
      save();
      return;
    }
    commit();
  });
}
