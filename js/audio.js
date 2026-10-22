// Sound: built-in sounds generated in code, imported audio, and playback in step with the timeline.
import { S, clamp, getBlob, valueAt } from "./core.js";
import { CARD_CUES, INTRO, SOUNDS } from "./library.js";

export const buffers = {}; // asset id -> AudioBuffer
export const waves = {}; // asset id -> waveform image (data URL)

const SR = 44100;
let ctx = null;
let master = null;
let voices = [];

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  return ctx;
}

export async function resumeAudio() {
  const c = audioCtx();
  if (c.state === "suspended") await c.resume();
}

// ── Generated sounds ────────────────────────────────────
let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function makeBuffer(seconds, fill) {
  const len = Math.round(seconds * SR);
  const b = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 2 });
  const data = b.getChannelData(0);
  fill(data, len);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) for (let i = 0; i < len; i++) data[i] *= 0.9 / peak;
  b.getChannelData(1).set(data);
  return b;
}

function hit(data, start, seconds, freqFrom, freqTo, sweep, decay, amp, noise = 0) {
  let phase = 0;
  const n = Math.round(seconds * SR);
  for (let i = 0; i < n && start + i < data.length; i++) {
    const tt = i / SR;
    const f = freqTo + (freqFrom - freqTo) * Math.exp(-tt * sweep);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.exp(-tt * decay) * Math.min(1, tt * 2000);
    data[start + i] += amp * env * (Math.sin(phase) + noise * (rnd() * 2 - 1));
  }
}

const SYNTHS = {
  "snd:koothu-bgm": () => makeBuffer(INTRO + 28, koothuScore),
  "snd:drum": () => makeBuffer(4, (d) => {
    const beat = SR / 2;
    const pattern = [1, 0, 0.5, 0.35, 0.9, 0, 0.55, 0.4];
    pattern.forEach((a, b) => {
      if (!a) return;
      const low = b % 4 === 0;
      hit(d, b * beat, 0.5, low ? 140 : 260, low ? 58 : 150, low ? 28 : 40, low ? 6 : 13, a, low ? 0.05 : 0.45);
    });
  }),
  "snd:drone": () => makeBuffer(8, (d, len) => {
    const parts = [[110, 1], [165, 0.5], [220, 0.35], [330, 0.18]];
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      let v = 0;
      for (const [f, a] of parts) v += a * Math.sin(2 * Math.PI * f * tt);
      d[i] = v * (0.82 + 0.18 * Math.sin(2 * Math.PI * 0.25 * tt));
    }
  }),
  "snd:bell": () => makeBuffer(4, (d) => {
    [[1, 1, 1.4], [2, 0.4, 2.1], [2.76, 0.5, 2.6], [4.07, 0.25, 3.3], [5.4, 0.2, 4]].forEach(([r, a, dec]) =>
      hit(d, 0, 4, 660 * r, 660 * r, 1, dec, a));
  }),
  "snd:gong": () => makeBuffer(6, (d) => {
    [[98, 1, 0.55], [156.8, 0.7, 0.7], [203.1, 0.5, 0.8], [274.4, 0.35, 1], [361.2, 0.25, 1.3], [99.2, 0.6, 0.6]].forEach(([f, a, dec]) =>
      hit(d, 0, 6, f, f, 1, dec, a));
  }),
  "snd:wind": () => makeBuffer(8, (d, len) => {
    let y = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.125 * tt - Math.PI / 2);
      const k = 0.01 + 0.05 * swell;
      y += k * ((rnd() * 2 - 1) - y);
      d[i] = y * (0.2 + 0.8 * swell);
    }
  }),
};

// ── Background score for the default show ──────────────
// Built on documented practice: the ezhupara drum and ilathalam cymbals carry the performance; the conch opens
// the invocation, and chenda and maddalam are kept for dramatic moments. Generated here, not sampled.
const at = (s) => Math.round(s * SR);
const ezhupara = (d, s, a) => hit(d, at(s), 0.45, 210, 140, 30, 10, a, 0.25);
const ezhuparaLow = (d, s, a) => hit(d, at(s), 0.6, 130, 85, 22, 7, a, 0.08);
const chenda = (d, s, a) => hit(d, at(s), 0.2, 560, 400, 60, 24, a, 0.9);
const maddalam = (d, s, a) => hit(d, at(s), 0.7, 110, 62, 20, 5.5, a, 0.04);

function ilathalam(d, s, a) {
  for (const f of [3150, 4210, 5270, 6630, 7940, 9310]) hit(d, at(s), 0.55, f, f, 1, 8 + f / 1800, a * 0.16);
}

function chengila(d, s, a) {
  // A small, high gong.
  for (const [f, k] of [[620, 1], [1490, 0.6], [2310, 0.4], [3420, 0.25]]) hit(d, at(s), 2.5, f, f, 1, 1.6 + f / 2500, a * k);
}

function conch(d, s, dur, f0, a) {
  const start = at(s);
  const n = at(dur);
  let ph = 0;
  for (let i = 0; i < n && start + i < d.length; i++) {
    const tt = i / SR;
    const env = Math.min(1, tt / 0.7) * Math.min(1, Math.max(0, (dur - tt) / 0.6));
    const f = f0 * (1 - 0.06 * Math.exp(-tt * 3)) * (1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * tt));
    ph += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 1; k <= 8; k++) v += Math.sin(k * ph) * (k === 1 ? 1 : k === 2 ? 0.7 : k === 3 ? 0.55 : 0.5 / k);
    d[start + i] += a * env * (v + 0.05 * (rnd() * 2 - 1));
  }
}

// One bar of a 6-beat cycle: [strong, -, light, medium, light, light].
function cycle(d, from, to, beat, ezAmp, cymAmp) {
  const accents = [1, 0, 0.45, 0.75, 0.45, 0.4];
  let i = 0;
  for (let s = from; s < to - 1e-6; s += beat, i++) {
    const a = accents[i % 6];
    if (!a) continue;
    if (i % 6 === 0) ezhuparaLow(d, s, ezAmp);
    else ezhupara(d, s, ezAmp * a);
    if (i % 3 === 0) ilathalam(d, s, cymAmp * (i % 6 === 0 ? 1 : 0.7));
  }
}

function koothuScore(d, len) {
  const T = len / SR;
  const o = INTRO; // the show starts after the opening cards
  // A quiet drone under everything, fading in and out.
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.min(1, tt / 2) * Math.min(1, (T - tt) / 2.5);
    d[i] += 0.07 * env * (Math.sin(2 * Math.PI * 110 * tt) + 0.5 * Math.sin(2 * Math.PI * 165 * tt) + 0.3 * Math.sin(2 * Math.PI * 220 * tt));
  }
  // Opening cards: a soft cymbal as each card appears, and the small gong for the first and the title.
  for (const s of CARD_CUES) ilathalam(d, s, 0.35);
  chengila(d, CARD_CUES[0], 0.25);
  chengila(d, CARD_CUES[CARD_CUES.length - 1], 0.35);
  // Invocation: conch, then the small gong and slow cymbals.
  conch(d, o + 0.1, 2.9, 233, 0.45);
  chengila(d, o + 3.1, 0.55);
  ilathalam(d, o + 3.1, 0.6);
  chengila(d, o + 5.2, 0.4);
  ilathalam(d, o + 5.2, 0.45);
  ezhuparaLow(d, o + 6.4, 0.6);
  // Rama and Sita: the ezhupara cycle at an easy pace.
  cycle(d, o + 7, o + 14.4, 0.3, 0.55, 0.5);
  // Ravana enters: chenda and maddalam for the dramatic moment, then a faster cycle.
  maddalam(d, o + 14.4, 1.1);
  for (let k = 0; k < 10; k++) chenda(d, o + 14.4 + k * 0.075, 0.35 + 0.05 * k);
  ilathalam(d, o + 14.4, 1);
  cycle(d, o + 15.2, o + 23.4, 0.2, 0.7, 0.6);
  for (let s = o + 15.2; s < o + 23.4; s += 1.2) chenda(d, s, 0.5);
  // The strike.
  maddalam(d, o + 18.6, 1.2);
  ilathalam(d, o + 18.6, 1.1);
  for (let k = 0; k < 6; k++) chenda(d, o + 18.6 + k * 0.06, 0.6);
  // Rama alone: the gong, then a slow heartbeat on the drum as the lamps burn low.
  chengila(d, o + 23.4, 0.8);
  maddalam(d, o + 23.4, 0.9);
  for (let s = o + 24.6, a = 0.55; s < T - 0.8; s += 1.2, a *= 0.8) ezhuparaLow(d, s, a);
  // Gentle limiting so the loud hits don't flatten the rest when normalised.
  for (let i = 0; i < len; i++) d[i] = Math.tanh(d[i] * 1.3);
}

function drawWave(buffer) {
  const W = 600;
  const H = 40;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / W));
  g.fillStyle = "rgba(8, 36, 20, 0.75)";
  for (let x = 0; x < W; x++) {
    let lo = 1;
    let hi = -1;
    for (let i = x * step; i < (x + 1) * step && i < data.length; i += 4) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
    const y1 = ((1 - hi) / 2) * H;
    const y2 = ((1 - lo) / 2) * H;
    g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
  return c.toDataURL();
}

export function buildSynths() {
  for (const [id, make] of Object.entries(SYNTHS)) {
    buffers[id] = make();
    waves[id] = drawWave(buffers[id]);
  }
}

// Built-in sounds that are files (the recording), decoded once at start-up.
export async function loadBuiltinFiles() {
  await Promise.all(SOUNDS.filter((s) => s.src && !buffers[s.id]).map(async (s) => {
    try {
      const data = await (await fetch(s.src)).arrayBuffer();
      registerBuffer(s.id, await audioCtx().decodeAudioData(data));
      s.length = buffers[s.id].duration;
    } catch (err) {
      // Missing or unreadable file: the track stays silent and the rest of the show still plays.
    }
  }));
}

export async function loadAudioAsset(id) {
  if (buffers[id]) return buffers[id];
  const blob = await getBlob(id);
  if (!blob) return null;
  try {
    const decoded = await audioCtx().decodeAudioData(await blob.arrayBuffer());
    buffers[id] = decoded;
    waves[id] = drawWave(decoded);
    return decoded;
  } catch (err) {
    return null;
  }
}

export async function decodeFile(file) {
  const decoded = await audioCtx().decodeAudioData(await file.arrayBuffer());
  return decoded;
}

export function registerBuffer(id, buffer) {
  buffers[id] = buffer;
  waves[id] = drawWave(buffer);
}

// ── Playback ────────────────────────────────────────────
export function startAudio(t0) {
  stopAudio();
  if (S.rate !== 1) return;
  const c = audioCtx();
  for (const it of S.project.items) {
    if (it.kind !== "audio" || !it.enabled) continue;
    const b = buffers[it.asset];
    if (!b) continue;
    const { start, end } = it.clip;
    const offset = it.clip.offset || 0;
    if (t0 >= end) continue;
    const from = Math.max(t0, start);
    const into = offset + (from - start);
    const dur = end - from;
    if (!it.loop && into >= b.duration) continue;
    const src = c.createBufferSource();
    src.buffer = b;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(g);
    let pan = null;
    if (c.createStereoPanner) {
      pan = c.createStereoPanner();
      g.connect(pan);
      pan.connect(master);
    } else g.connect(master);
    const when = c.currentTime + (from - t0);
    if (it.loop) {
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = b.duration;
      src.start(when, into % b.duration);
      src.stop(when + dur);
    } else {
      src.start(when, into, Math.min(dur, b.duration - into));
    }
    voices.push({ it, src, g, pan });
  }
  updateAudio(t0, true);
}

export function stopAudio() {
  for (const v of voices) {
    try { v.src.stop(); } catch (err) { /* already stopped */ }
    v.src.disconnect();
  }
  voices = [];
}

export function updateAudio(t, immediate = false) {
  if (!ctx || !voices.length) return;
  const now = ctx.currentTime;
  master.gain.setTargetAtTime(S.project.audio.master / 100, now, 0.03);
  for (const v of voices) {
    const vol = v.it.enabled ? valueAt(v.it.props.volume, t)[0] / 100 : 0;
    v.g.gain.setTargetAtTime(vol, now, immediate ? 0.005 : 0.03);
    if (v.pan) v.pan.pan.setTargetAtTime(clamp(valueAt(v.it.props.pan, t)[0] / 100, -1, 1), now, 0.03);
  }
}

let preview = null;
export async function previewSound(id) {
  await resumeAudio();
  if (preview) {
    try { preview.stop(); } catch (err) { /* already stopped */ }
  }
  const b = buffers[id] || (await loadAudioAsset(id));
  if (!b) return;
  const c = audioCtx();
  preview = c.createBufferSource();
  preview.buffer = b;
  const g = c.createGain();
  g.gain.value = 0.8;
  preview.connect(g).connect(c.destination);
  preview.start(0, 0, Math.min(b.duration, 4));
}
