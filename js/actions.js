// Things the user does to the show: select, add, remove, import and export.
import {
  S, FPS, assetURL, blobs, checkpoint, clamp, commit, emit, getBlob, itemById, putBlob, snapT, toast, uid, withoutFire,
} from "./core.js";
import {
  BUILTIN_IMAGES, FX_TYPES, LIGHT_TYPES, SOUNDS, TRADITIONS, castItems, fadeCard, makeAudio, makeFx, makeLight, makePuppet, makeTitle,
} from "./library.js";
import { buffers, decodeFile, loadAudioAsset, registerBuffer } from "./audio.js";

export function select(type, id) {
  S.sel = id ? { type, id } : null;
  S.selKey = null;
  emit("refresh");
}

export function assetInfo(id) {
  const img = BUILTIN_IMAGES.find((b) => b.id === id);
  if (img) return { kind: "image", name: img.name, builtin: true };
  const snd = SOUNDS.find((s) => s.id === id);
  if (snd) return { kind: "audio", name: snd.name, builtin: true, loop: snd.loop, length: snd.length };
  return S.project.assets[id] || null;
}

// ── Adding to the sequence ──────────────────────────────
function startAtPlayhead(length) {
  const start = S.t < S.project.duration - 1 ? snapT(S.t) : 0;
  return { start, end: Math.min(S.project.duration, snapT(start + length)) };
}

export function addPuppet(assetId) {
  const info = assetInfo(assetId);
  if (!info) return;
  checkpoint();
  const count = S.project.items.filter((i) => i.kind === "puppet").length;
  const builtin = BUILTIN_IMAGES.find((b) => b.id === assetId);
  const it = makePuppet(assetId, info.name, count, { position: [960, 648] }, {
    flip: builtin ? builtin.flip : false,
    render: S.project.screen.style,
    start: 0,
    end: S.project.duration,
  });
  // New figures go on the top video track.
  const lastVisual = S.project.items.map((i) => i.kind !== "audio").lastIndexOf(true);
  S.project.items.splice(lastVisual + 1, 0, it);
  S.sel = { type: "item", id: it.id };
  S.selKey = null;
  commit();
  toast(`${info.name} added at the centre of the screen`);
}

export function addFx(type) {
  checkpoint();
  const { start, end } = startAtPlayhead(6);
  const it = makeFx(type, start, end);
  const lastVisual = S.project.items.map((i) => i.kind !== "audio").lastIndexOf(true);
  S.project.items.splice(lastVisual + 1, 0, it);
  S.sel = { type: "item", id: it.id };
  S.selKey = null;
  commit();
  toast(`${FX_TYPES[type].label} added at the playhead`);
}

export function addTitle() {
  checkpoint();
  const { start, end } = startAtPlayhead(4);
  const it = fadeCard(makeTitle("Title card", { kicker: "Heading", title: "Title", body: "" }, start, end));
  const lastVisual = S.project.items.map((i) => i.kind !== "audio").lastIndexOf(true);
  S.project.items.splice(lastVisual + 1, 0, it);
  S.sel = { type: "item", id: it.id };
  S.selKey = null;
  commit();
  toast("Title card added at the playhead");
}

export function addAudio(assetId) {
  const info = assetInfo(assetId);
  const buf = buffers[assetId];
  if (!info || !buf) return toast("That sound is still loading");
  checkpoint();
  const loop = Boolean(info.loop);
  const { start, end } = startAtPlayhead(loop ? 10 : buf.duration);
  const it = makeAudio(assetId, info.name, start, end, loop, 80);
  S.project.items.push(it);
  S.sel = { type: "item", id: it.id };
  S.selKey = null;
  commit();
  toast(`${info.name} added at the playhead`);
}

export function addLight(type) {
  checkpoint();
  const L = makeLight(type, 960, 900);
  S.project.lights.push(L);
  S.sel = { type: "light", id: L.id };
  S.selKey = null;
  commit();
  toast(`${LIGHT_TYPES[type].label} added`);
}

export function addLightRow(type, count) {
  checkpoint();
  const n = clamp(Math.round(count) || 1, 1, 60);
  const from = 150;
  const to = 1770;
  for (let i = 0; i < n; i++) {
    const L = makeLight(type, n === 1 ? 960 : from + ((to - from) * i) / (n - 1), 1010, { name: `${LIGHT_TYPES[type].label} ${S.project.lights.length + 1}` });
    S.project.lights.push(L);
  }
  commit();
  toast(`${n} lights added in a row`);
}

export function removeSelected() {
  if (!S.sel) return;
  checkpoint();
  if (S.sel.type === "light") S.project.lights = S.project.lights.filter((l) => l.id !== S.sel.id);
  else S.project.items = S.project.items.filter((i) => i.id !== S.sel.id);
  S.sel = null;
  S.selKey = null;
  commit();
  toast("Removed · Ctrl+Z to undo");
}

export function moveTrack(dir) {
  const it = S.sel && S.sel.type === "item" ? itemById(S.sel.id) : null;
  if (!it) return;
  const items = S.project.items;
  const i = items.indexOf(it);
  const sameGroup = (x) => (x.kind === "audio") === (it.kind === "audio");
  let j = i + dir;
  while (j >= 0 && j < items.length && !sameGroup(items[j])) j += dir;
  if (j < 0 || j >= items.length) return;
  checkpoint();
  [items[i], items[j]] = [items[j], items[i]];
  commit();
}

// Replace the show's figures with the tradition's cast (keyframes and parts of the old figures go with them).
export function applyCast(key) {
  const tr = TRADITIONS[key];
  if (!tr) return;
  checkpoint();
  const P = S.project;
  const at = P.items.findIndex((i) => i.kind === "puppet");
  const cast = castItems(key, P.duration);
  P.items = P.items.filter((i) => i.kind !== "puppet");
  P.items.splice(at < 0 ? 0 : Math.min(at, P.items.length), 0, ...cast);
  if (S.sel && S.sel.type === "item" && !P.items.some((i) => i.id === S.sel.id)) S.sel = null;
  commit();
  toast(cast.length ? `${tr.label}: ${cast.length} figures on the cloth` : `${tr.label} has no figures of its own`);
}

export function applyTradition(key) {
  const tr = TRADITIONS[key];
  if (!tr) return;
  checkpoint();
  const P = S.project;
  P.tradition = key;
  P.lights = tr.lights();
  P.screen.cloth = tr.cloth;
  P.screen.style = tr.style;
  P.screen.w = tr.screen.w;
  P.screen.h = tr.screen.h;
  P.screen.figure = tr.screen.figure;
  P.screen.view = tr.view || "audience";
  for (const it of P.items) if (it.kind === "puppet") it.render = tr.style;
  if (S.sel && S.sel.type === "light") S.sel = null;
  commit();
  toast(`${tr.label}: screen size, lights, cloth and figure look set`);
}

// ── Importing media ─────────────────────────────────────
async function processImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  let opaque = true;
  for (let i = 3; i < d.length; i += 4 * 61) {
    if (d[i] < 250) {
      opaque = false;
      break;
    }
  }
  let removed = false;
  if (opaque) {
    // A photo on a plain background: take the corner colour as background and cut it out.
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
      const i = (y * w + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    });
    const bg = [0, 1, 2].map((k) => corners.reduce((s, px) => s + px[k], 0) / 4);
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
      if (dist < 40) d[i + 3] = 0;
      else if (dist < 70) d[i + 3] = Math.round((255 * (dist - 40)) / 30);
    }
    g.putImageData(img, 0, 0);
    removed = true;
  }
  const blob = (await new Promise((r) => c.toBlob(r, "image/webp", 0.92))) || (await new Promise((r) => c.toBlob(r, "image/png")));
  return { blob, w, h, removed };
}

async function storeImage(file) {
  const { blob, w, h, removed } = await processImage(file);
  const id = uid("img");
  await putBlob(id, blob);
  assetURL[id] = URL.createObjectURL(blob);
  return { id, info: { id, kind: "image", name: file.name.replace(/\.[^.]+$/, ""), w, h }, removed };
}

export async function importFiles(files, { addToSequence = true } = {}) {
  let added = 0;
  for (const file of files) {
    try {
      if (file.type.startsWith("image/")) {
        const { id, info, removed } = await storeImage(file);
        S.project.assets[id] = info;
        if (addToSequence) addPuppet(id);
        if (removed) toast(`${info.name}: background removed`);
        added++;
      } else if (file.type.startsWith("audio/")) {
        const buffer = await decodeFile(file);
        const id = uid("aud");
        await putBlob(id, file);
        registerBuffer(id, buffer);
        S.project.assets[id] = { id, kind: "audio", name: file.name.replace(/\.[^.]+$/, ""), length: buffer.duration, loop: false };
        if (addToSequence) addAudio(id);
        added++;
      } else {
        toast(`${file.name}: not an image or sound`);
      }
    } catch (err) {
      toast(`${file.name}: could not be read`);
    }
  }
  if (added) commit();
}

export async function addPart(itemId, file) {
  const it = itemById(itemId);
  if (!it || !file) return;
  try {
    const { id, info } = await storeImage(file);
    checkpoint();
    S.project.assets[id] = info;
    it.parts = it.parts || [];
    it.parts.push({
      id: uid("part"),
      name: info.name,
      asset: id,
      pivot: [50, 35],
      anchor: [50, 8],
      size: 40,
      z: "front",
      props: { rotation: { base: [0], keys: [] } },
    });
    commit();
    toast(`${info.name} joined to ${it.name}. Set its pivot in Effect Controls`);
  } catch (err) {
    toast("That image could not be read");
  }
}

// Load imported media from browser storage after a reload.
export async function loadUserAssets() {
  const jobs = Object.values(S.project.assets).map(async (a) => {
    if (a.kind === "image" && !assetURL[a.id]) {
      const blob = await getBlob(a.id);
      if (blob) assetURL[a.id] = URL.createObjectURL(blob);
    } else if (a.kind === "audio") {
      await loadAudioAsset(a.id);
    }
  });
  await Promise.all(jobs);
}

// ── Show files ──────────────────────────────────────────
const toDataURL = (blob) =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });

export async function exportShow() {
  const media = {};
  for (const id of Object.keys(S.project.assets)) {
    const blob = blobs[id] || (await getBlob(id));
    if (blob) media[id] = await toDataURL(blob);
  }
  const data = { format: "shadow-studio-show", version: 3, project: S.project, media };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(S.project.title || "show").replace(/[^\w-]+/g, "-").toLowerCase()}.shadow.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importShow(file, isProject) {
  const data = JSON.parse(await file.text());
  const project = data.format === "shadow-studio-show" ? data.project : data;
  if (!isProject(project)) throw new Error("not a show");
  for (const [id, url] of Object.entries(data.media || {})) {
    const blob = await (await fetch(url)).blob();
    await putBlob(id, blob);
    const a = project.assets[id];
    if (a && a.kind === "image") assetURL[id] = URL.createObjectURL(blob);
  }
  checkpoint();
  S.project = withoutFire(project);
  S.sel = null;
  S.selKey = null;
  S.t = 0;
  await loadUserAssets();
  commit();
}

export function setClip(it, which, v) {
  const P = S.project;
  const c = it.clip;
  const buf = it.kind === "audio" ? buffers[it.asset] : null;
  if (which === "start") {
    let ns = clamp(snapT(v), 0, c.end - 1 / FPS);
    if (buf && !it.loop) ns = Math.max(ns, c.start - (c.offset || 0));
    if (it.kind === "audio") c.offset = Math.max(0, (c.offset || 0) + (ns - c.start));
    c.start = ns;
  } else if (which === "end") {
    let ne = clamp(snapT(v), c.start + 1 / FPS, P.duration);
    if (buf && !it.loop) ne = Math.min(ne, c.start + (buf.duration - (c.offset || 0)));
    c.end = ne;
  } else if (which === "offset") {
    c.offset = clamp(snapT(v), 0, buf ? buf.duration : 0);
  }
}
