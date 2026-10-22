// The screen: light behind the cloth, the figures' shadows, effects and narration.
import { $, S, FW, FH, assetURL, clamp, esc, getProp, hexRgb, valueAt, visibleAt } from "./core.js";
import { BUILTIN_IMAGES, LIGHT_TYPES } from "./library.js";
import { cutParts, editorHTML, figureHTML, isCut, poseParts } from "./rig.js";

export function imageURL(asset) {
  const b = BUILTIN_IMAGES.find((x) => x.id === asset);
  return b ? b.src : assetURL[asset] || "";
}

let lightCanvas;
let fxCanvas;
let lg;
let fg;
let W = 1;
let H = 1;
let cssH = 1;
const puppetEls = new Map();

// The screen takes the real proportions of the show's cloth (width × height in metres).
export function applyScreen() {
  const sc = S.project.screen;
  const el = $("screen");
  el.style.setProperty("--aspect", (sc.w > 0 && sc.h > 0 ? sc.w / sc.h : 16 / 9).toFixed(4));
  el.style.setProperty("--fig", `${sc.figure || 80}%`);
  el.classList.toggle("backstage", sc.view === "backstage");
  el.classList.toggle("no-sticks", sc.sticks === false);
}

export function initStage() {
  lightCanvas = $("light-canvas");
  fxCanvas = $("fx-canvas");
  lg = lightCanvas.getContext("2d");
  fg = fxCanvas.getContext("2d");
  new ResizeObserver(resize).observe($("screen"));
  resize();
}

function resize() {
  const r = $("screen").getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssH = Math.max(1, r.height);
  $("screen").style.setProperty("--sh", `${cssH}px`); // title type is sized from the cloth's height
  W = Math.max(1, Math.round(r.width * dpr));
  H = Math.max(1, Math.round(r.height * dpr));
  for (const c of [lightCanvas, fxCanvas]) {
    c.width = W;
    c.height = H;
  }
}

// ── Figures ─────────────────────────────────────────────
export function syncPuppets() {
  const box = $("puppets");
  const ids = new Set();
  for (const it of S.project.items) {
    if (it.kind !== "puppet") continue;
    ids.add(it.id);
    const parts = (it.parts || []).filter((p) => !isCut(p));
    const cuts = cutParts(it);
    const editing = S.rigEdit && S.rigEdit.item === it.id ? `${S.rigEdit.part}` : "";
    const sig = [imageURL(it.asset), ...parts.map((p) => `${p.id}:${imageURL(p.asset)}:${p.z}`),
      JSON.stringify(cuts.map((p) => [p.id, p.poly, p.pivot, p.parent, p.stick])), editing].join("|");
    let el = puppetEls.get(it.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "puppet";
      el.dataset.id = it.id;
      puppetEls.set(it.id, el);
    }
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      const src = imageURL(it.asset);
      const partImg = (p) => `<img class="part ${p.z === "back" ? "back" : "front"}" data-part="${p.id}" src="${imageURL(p.asset)}" alt="" draggable="false">`;
      el.innerHTML =
        parts.filter((p) => p.z === "back").map(partImg).join("") +
        figureHTML(it, src, it.name) +
        parts.filter((p) => p.z !== "back").map(partImg).join("") +
        // The puppeteer's sticks: the main rod down the body and a thin stick to the hand.
        '<span class="rod main"></span>' + (cuts.some((p) => p.stick) ? "" : '<span class="rod arm"></span>') +
        '<span class="h nw"></span><span class="h ne"></span><span class="h sw"></span><span class="h se"></span>' +
        editorHTML(it);
    }
    // "real" shows the leather as photographed; "translucent" lets the light through its colours; "silhouette" is shadow only.
    el.classList.toggle("silhouette", it.render === "silhouette");
    el.classList.toggle("translucent", it.render === "translucent" || it.render === "colour");
    box.appendChild(el); // keeps stacking in track order
  }
  for (const [id, el] of puppetEls) {
    if (!ids.has(id)) {
      el.remove();
      puppetEls.delete(id);
    }
  }
  syncTitles();
}

// ── Title cards ─────────────────────────────────────────
const titleEls = new Map();

// Card animations are loaded into memory once, so they can be scrubbed frame by frame on any server.
const videoURLs = new Map(); // src -> object URL, or null while loading
function videoURL(src) {
  if (videoURLs.has(src)) return videoURLs.get(src);
  videoURLs.set(src, null);
  fetch(src)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
    .then((blob) => {
      videoURLs.set(src, URL.createObjectURL(blob));
      syncTitles();
    })
    .catch(() => videoURLs.delete(src));
  return null;
}
// *Name* in body text is set in capitals, as names are in the portfolio's credits.
const bodyLine = (line) => esc(line).replace(/\*([^*]+)\*/g, '<span class="tc-name">$1</span>');

function syncTitles() {
  const box = $("titles");
  const ids = new Set();
  for (const it of S.project.items) {
    if (it.kind !== "title") continue;
    ids.add(it.id);
    const c = it.card;
    const vurl = c.video ? videoURL(c.video) : null;
    const sig = JSON.stringify(c) + (vurl || "");
    let el = titleEls.get(it.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "title-card";
      titleEls.set(it.id, el);
    }
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      // While the animation loads (or if it can't), the still gold logo stands in.
      const logo = vurl
        ? `<video class="tc-video" src="${vurl}" muted playsinline preload="auto" aria-label="UAL Creative Computing Institute"></video>`
        : '<div class="tc-logo" role="img" aria-label="UAL Creative Computing Institute"></div>';
      el.innerHTML =
        (c.logo ? logo : "") +
        (c.kicker ? `<p class="tc-kicker">${esc(c.kicker)}</p>` : "") +
        (c.title ? `<h2 class="tc-title">${esc(c.title)}</h2>` : "") +
        (c.body ? c.body.split("\n").map((l) => `<p class="tc-body">${bodyLine(l)}</p>`).join("") : "");
    }
    box.appendChild(el);
  }
  for (const [id, el] of titleEls) {
    if (!ids.has(id)) {
      el.remove();
      titleEls.delete(id);
    }
  }
}

function renderTitles(t) {
  for (const it of S.project.items) {
    if (it.kind !== "title") continue;
    const el = titleEls.get(it.id);
    if (!el) continue;
    const show = visibleAt(it, t);
    el.hidden = !show;
    if (!show) continue;
    const [x, y] = valueAt(it.props.position, t);
    const k = valueAt(it.props.scale, t)[0] / 100;
    el.style.left = `${(x / FW) * 100}%`;
    el.style.top = `${(y / FH) * 100}%`;
    el.style.opacity = clamp(valueAt(it.props.opacity, t)[0] / 100, 0, 1);
    el.style.transform = `translate(-50%, -50%) scale(${k})`;
    syncVideo(el.querySelector("video"), t - it.clip.start);
  }
  // Pause logo animations whose card is off screen.
  for (const [, el] of titleEls) {
    const v = el.querySelector("video");
    if (v && el.hidden && !v.paused) v.pause();
  }
}

// Keep a card's animation on the timeline: frame-exact while scrubbing, free-running (with drift correction) in play.
function syncVideo(v, local) {
  if (!v || !(v.readyState >= 1)) return;
  const target = clamp(local, 0, v.duration || 0);
  if (S.playing && S.rate === 1) {
    if (v.paused && local < (v.duration || 0)) v.play().catch(() => {});
    if (Math.abs(v.currentTime - target) > 0.15) v.currentTime = target;
  } else {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - target) > 0.02) v.currentTime = target;
  }
}

// ── Light ───────────────────────────────────────────────
const seeds = new Map();
function seedOf(id) {
  if (!seeds.has(id)) {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973;
    seeds.set(id, h);
  }
  return seeds.get(id);
}
const noise = (t, s) => Math.sin(t * 7.3 + s) * 0.5 + Math.sin(t * 13.1 + s * 2.1) * 0.3 + Math.sin(t * 23.7 + s * 0.7) * 0.2;
const rgb = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(",")})`;

function lightList(t, live = t) {
  const P = S.project;
  const m = P.screen.master / 100;
  const out = [];
  for (const L of P.lights) {
    if (!L.enabled) continue;
    const [x, y] = valueAt(L.props.position, t);
    const I = (valueAt(L.props.intensity, t)[0] / 100) * m;
    const sz = valueAt(L.props.size, t)[0] / 100;
    const fl = valueAt(L.props.flicker, t)[0] / 100;
    const type = LIGHT_TYPES[L.type] || {};
    out.push({
      x, y, sz, seed: seedOf(L.id), col: hexRgb(L.color), spot: L.type === "spot", flame: Boolean(type.flame), body: type.body,
      inten: Math.max(0, I * (1 + fl * 0.35 * noise(live, seedOf(L.id)))),
    });
  }
  return out;
}

let softCache = 1;
// Big flames and wide lamps give softer edges to anything held away from the cloth.
export const softness = () => softCache;

function drawLights(t, live = t) {
  const g = lg;
  const list = lightList(t, live);
  let E = 0;
  let wsum = 0;
  const tint = [0, 0, 0];
  let szsum = 0;
  for (const l of list) {
    const w = l.inten * l.sz;
    E += w;
    wsum += w;
    szsum += l.sz * l.inten;
    for (let i = 0; i < 3; i++) tint[i] += l.col[i] * w;
  }
  const avgTint = wsum > 0 ? tint.map((v) => v / wsum) : [255, 255, 255];
  softCache = clamp(wsum > 0 ? szsum / Math.max(1e-6, list.reduce((s, l) => s + l.inten, 0)) : 1, 0.4, 2.5);

  const cloth = hexRgb(S.project.screen.cloth);
  // The cotton takes the colour of the lamps: oil flames turn it a deep, saturated orange.
  const lit = cloth.map((v, i) => v * (0.08 + (0.92 * avgTint[i]) / 255) * (i === 1 ? 0.88 : 1)); // deep, slightly red orange
  const dim = clamp(0.06 + 0.8 * (1 - Math.exp(-E / 5)), 0.03, 0.9);

  // A row of lamps along the whole beam lights the cloth almost evenly end to end, a little brighter at the
  // lamps' height and darker towards the ends; there are no separate pools of light.
  // From the puppeteers' side the cloth is lit only by what spills from the lamps: warm pools around each
  // lamp and darkness beyond, where the audience's side glows evenly.
  const back = S.project.screen.view === "backstage";
  g.globalCompositeOperation = "source-over";
  g.fillStyle = rgb(lit.map((v) => v * dim * (back ? 0.14 : 0.5)));
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const n = Math.max(1, list.length);
  // On the audience's side the pools always merge into one band, however far apart the lamps fall on screen
  // (a close camera on a long stage spreads them out).
  const spacing = n > 1 ? (W * 0.84) / (n - 1) : W;
  for (const l of list) {
    const a = clamp((l.inten * (back ? 0.9 : 0.5)) / Math.sqrt(n), 0, 1) * (l.flame ? 1 : 0.8);
    if (a <= 0.002) continue;
    const col = cloth.map((c, i) => Math.round((c * l.col[i]) / 255)).join(",");
    const px = (l.x / FW) * W;
    const py = l.flame ? flameAt(l).fy : (l.y / FH) * H;
    const r = (l.spot ? 0.35 : back ? 0.55 : 1.15) * H * Math.max(0.05, l.sz);
    g.save();
    g.translate(px, py);
    g.scale(l.spot ? 1 : back ? 1.5 : Math.max(1.5, (1.4 * spacing) / r), 1); // wider than tall, so the lamps merge into one band
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    const stops = l.spot ? [[0, 1], [0.5, 0.55], [0.8, 0.15], [1, 0]] : [[0, 1], [0.25, 0.78], [0.5, 0.38], [0.75, 0.1], [1, 0]];
    for (const [o, f] of stops) grad.addColorStop(o, `rgba(${col},${a * f})`);
    g.fillStyle = grad;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
  g.globalCompositeOperation = "source-over";
  const ends = g.createLinearGradient(0, 0, W, 0);
  const e = Math.min(0.12, (H / W) * 0.8);
  const endShade = back ? 0.6 : 0.35;
  ends.addColorStop(0, `rgba(0, 0, 0, ${endShade})`);
  ends.addColorStop(e, "rgba(0, 0, 0, 0)");
  ends.addColorStop(1 - e, "rgba(0, 0, 0, 0)");
  ends.addColorStop(1, `rgba(0, 0, 0, ${endShade})`);
  g.fillStyle = ends;
  g.fillRect(0, 0, W, H);

  g.globalCompositeOperation = "multiply";
  g.drawImage(clothTexture(), 0, 0);
  g.globalCompositeOperation = "source-over";

  lampsCache = list.filter((l) => l.flame);
  if (S.project.screen.view !== "backstage") {
    // From the audience side the lamps are behind the cloth: each flame shows as a small, bright teardrop,
    // slightly softened by the cotton, with only a little glow of its own.
    for (const l of lampsCache) {
      if (l.inten <= 0.02) continue; // an unlit lamp shows nothing through the cloth
      const { fx, fy, fh } = flameAt(l);
      g.save();
      g.filter = `blur(${Math.max(0.4, fh * 0.045).toFixed(2)}px)`;
      drawFlame(g, fx, fy, fh * 0.75, live, l.seed, clamp(l.inten, 0, 2), 0.35);
      g.restore();
    }
  }
  if (S.project.screen.hems !== false) drawHems(g); // a page can show the cloth edge to edge
}

// The cloth is edged above and below with dark border cloth, with a thin trim where they meet.
function drawHems(g) {
  const top = H * 0.045;
  const bottom = H * 0.04;
  g.fillStyle = "#0a0604";
  g.fillRect(0, 0, W, top);
  g.fillRect(0, H - bottom, W, bottom);
  g.fillStyle = "rgba(120, 52, 22, 0.55)";
  g.fillRect(0, top, W, Math.max(1, H * 0.006));
  g.fillRect(0, H - bottom - Math.max(1, H * 0.006), W, Math.max(1, H * 0.006));
}

// Cotton, multiplied over the light: uneven weave in soft blotches, slack folds, seams between the widths of
// cloth sewn together, and a fine grain. Built from smooth noise, so nothing repeats in a visible pattern.
let clothTex = null;
function clothTexture() {
  if (clothTex && clothTex.width === W && clothTex.height === H) return clothTex;
  let s = 20261022;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const noiseLayer = (cols, rows, lo) => {
    const c = document.createElement("canvas");
    c.width = cols;
    c.height = rows;
    const g = c.getContext("2d");
    const img = g.createImageData(cols, rows);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.round(255 * (lo + (1 - lo) * rand()));
      img.data[i] = v;
      img.data[i + 1] = Math.round(v * 0.995);
      img.data[i + 2] = Math.round(v * 0.985);
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.globalCompositeOperation = "multiply";
  g.drawImage(noiseLayer(Math.max(4, Math.round(W / 90)), Math.max(3, Math.round(H / 45)), 0.86), 0, 0, W, H); // blotches
  g.drawImage(noiseLayer(Math.max(8, Math.round(W / 22)), Math.max(4, Math.round(H / 14)), 0.94), 0, 0, W, H); // weave
  // Slack folds: a few soft vertical shadows where the cloth hangs loose between ties.
  for (let i = 0; i < 9; i++) {
    const x = rand() * W;
    const w = (0.01 + 0.03 * rand()) * W;
    const fold = g.createLinearGradient(x - w, 0, x + w, 0);
    fold.addColorStop(0, "rgba(255,255,255,0)");
    fold.addColorStop(0.5, `rgba(150,140,130,${(0.12 + 0.12 * rand()).toFixed(3)})`);
    fold.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = fold;
    g.fillRect(x - w, 0, 2 * w, H);
  }
  // Seams between the widths of cloth.
  g.fillStyle = "rgba(170, 150, 130, 0.13)";
  for (let i = 1; i < 7; i++) g.fillRect((W * i) / 7 + (rand() - 0.5) * W * 0.01, 0, Math.max(1, W * 0.0007), H);
  // Fine grain, tiled from a small random tile.
  const grain = noiseLayer(128, 128, 0.94);
  g.fillStyle = g.createPattern(grain, "repeat");
  g.fillRect(0, 0, W, H);
  clothTex = c;
  return c;
}

let lampsCache = [];

// Lamp sizes as a share of the cloth height; a lamp's position is its foot on the beam or floor.
const lampHeight = () => H * 0.17;
const bowlHeight = () => H * 0.09;

// Where a lamp's flame sits and how tall it is.
function flameAt(l) {
  const x = (l.x / FW) * W;
  const y = (l.y / FH) * H;
  const I = clamp(l.inten, 0, 2);
  const grow = Math.min(1.35, 0.55 + 0.45 * I);
  if (l.body === "deepam") return { fx: x + lampHeight() * 0.2, fy: y - lampHeight() * 0.74, fh: lampHeight() * 0.32 * grow };
  if (l.body === "bowl") {
    const sh = shellOf(l); // the flame burns at the wick's end, over the left rim
    return { fx: x - sh.w * 0.4, fy: y - sh.h - sh.h * 0.12, fh: sh.h * 1.05 * grow };
  }
  return { fx: x, fy: y, fh: lampHeight() * 0.26 * grow };
}

// A chiratta: half a coconut shell holding oil, a cotton wick laid over its rim. Shells are cut by hand, so each
// one differs a little in size, tilt and the line of its broken rim.
const rand = (seed, k) => {
  const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
function shellOf(l) {
  const k = 0.88 + 0.22 * rand(l.seed, 1);
  // A half coconut shell is about 15 cm across against a figure about a metre tall, so its size follows the
  // figures; it is never so wide that neighbours on the beam touch (about 60% of the space between two lamps).
  const fig = (H * (S.project.screen.figure || 55)) / 100;
  const n = Math.max(2, S.project.lights.length);
  const gap = (W * 0.84) / (n - 1);
  const h = Math.min(fig * 0.077, Math.max(W * 0.0155, gap * 0.31)) * k;
  return { h, w: h * (1.85 + 0.2 * rand(l.seed, 2)), tilt: (rand(l.seed, 3) - 0.5) * 0.08 };
}

function drawBowl(g, x, y, I, l) {
  const { h, w, tilt } = shellOf(l);
  const top = y - h;
  const lit = Math.min(1, I);
  const ry = h * 0.2; // the rim seen a little from above
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.translate(-x, -y);

  // Contact shadow on the beam.
  g.fillStyle = "rgba(0, 0, 0, 0.55)";
  g.beginPath();
  g.ellipse(x, y, w * 0.42, h * 0.08, 0, 0, Math.PI * 2);
  g.fill();

  // The rim: an ellipse broken unevenly where the shell was split.
  const rim = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const j = 1 + (rand(l.seed, 10 + (i % 48)) - 0.5) * 0.05;
    rim.push([x + Math.cos(a) * (w / 2) * j, top + Math.sin(a) * ry * j]);
  }

  // The outside of the shell: a hemisphere, fibrous brown, lit from the flame on the left.
  const shell = new Path2D();
  shell.moveTo(rim[24][0], rim[24][1]); // left rim point
  shell.bezierCurveTo(x - w * 0.52, top + h * 0.6, x - w * 0.3, y, x, y);
  shell.bezierCurveTo(x + w * 0.3, y, x + w * 0.52, top + h * 0.6, rim[0][0], rim[0][1]);
  for (let i = 1; i <= 24; i++) shell.lineTo(rim[i][0], rim[i][1]); // front half of the rim
  shell.closePath();
  const body = g.createRadialGradient(x - w * 0.3, top + h * 0.1, h * 0.05, x - w * 0.1, top + h * 0.4, w * 0.75);
  body.addColorStop(0, `rgb(${90 + 60 * lit}, ${48 + 30 * lit}, ${20 + 10 * lit})`);
  body.addColorStop(0.45, "#3b1f0c");
  body.addColorStop(1, "#0d0603");
  g.fillStyle = body;
  g.fill(shell);

  // Fibre: the shell's grain runs from the rim down to the base, with the odd pale scratch.
  g.save();
  g.clip(shell);
  for (let i = 0; i < 26; i++) {
    const u = (i + rand(l.seed, 100 + i)) / 26 - 0.5;
    const xs = x + u * w * 0.98;
    g.strokeStyle = rand(l.seed, 200 + i) > 0.7 ? `rgba(160, 105, 60, ${0.18 * (0.4 + lit)})` : "rgba(10, 4, 1, 0.35)";
    g.lineWidth = Math.max(0.6, h * (0.012 + 0.02 * rand(l.seed, 300 + i)));
    g.beginPath();
    g.moveTo(xs, top + ry * 0.6);
    g.quadraticCurveTo(x + u * w * 0.7, top + h * 0.7, x + u * w * 0.25, y);
    g.stroke();
  }
  // Rounding: darker toward the far side and the base.
  const shade = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  g.fillStyle = shade;
  g.fillRect(x - w / 2, top - ry, w, h + ry * 2);
  g.restore();

  // Inside: the far wall of the shell, then the oil, then the near rim's broken edge.
  const inner = new Path2D();
  rim.forEach(([px, py], i) => (i ? inner.lineTo(px, py) : inner.moveTo(px, py)));
  inner.closePath();
  const wall = g.createLinearGradient(0, top - ry, 0, top + ry);
  wall.addColorStop(0, `rgb(${70 + 50 * lit}, ${38 + 24 * lit}, ${16 + 8 * lit})`);
  wall.addColorStop(1, "#1a0c05");
  g.fillStyle = wall;
  g.fill(inner);
  // Oil, a little below the rim, holding the flame's reflection.
  const oil = g.createRadialGradient(x - w * 0.22, top + ry * 0.3, 0, x, top + ry * 0.35, w * 0.45);
  oil.addColorStop(0, `rgba(255, 200, 110, ${0.75 * lit})`);
  oil.addColorStop(0.35, `rgba(150, 80, 20, ${0.6 + 0.3 * lit})`);
  oil.addColorStop(1, "rgba(30, 14, 4, 0.95)");
  g.fillStyle = oil;
  g.beginPath();
  g.ellipse(x, top + ry * 0.35, w * 0.43, ry * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  // The cut edge of the shell: pale, rough, catching the light on the flame's side.
  const edge = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  edge.addColorStop(0, `rgba(230, 170, 100, ${0.35 + 0.55 * lit})`);
  edge.addColorStop(0.6, `rgba(150, 95, 50, ${0.25 + 0.3 * lit})`);
  edge.addColorStop(1, "rgba(60, 32, 14, 0.5)");
  g.strokeStyle = edge;
  g.lineWidth = Math.max(1, h * 0.06);
  g.lineJoin = "round";
  g.stroke(inner);

  // The wick: twisted cotton lying in the oil, its end drawn up over the rim where it burns.
  const { fx, fy } = flameAt(l);
  g.strokeStyle = "#d9ccb4";
  g.lineWidth = Math.max(1, h * 0.07);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x - w * 0.02, top + ry * 0.4);
  g.quadraticCurveTo(x - w * 0.3, top + ry * 0.2, fx + w * 0.02, fy + h * 0.04);
  g.stroke();
  g.strokeStyle = "#1a0f08"; // the charred tip
  g.beginPath();
  g.moveTo(fx + w * 0.04, fy + h * 0.06);
  g.lineTo(fx, fy);
  g.stroke();
  g.restore();
}

// The vilakku madam: the wooden beam the lamps stand on.
function drawBeam(g, lamps) {
  if (!lamps.length) return;
  const h = bowlHeight();
  // The beam runs the full length of the stage behind the cloth.
  const y = (lamps[0].y / FH) * H;
  const x0 = 0;
  const x1 = W;
  // A dark timber in shadow: only its top edge catches light, and only under each lamp.
  const beam = g.createLinearGradient(0, y, 0, y + h * 0.7);
  beam.addColorStop(0, "rgba(14, 8, 4, 0.96)");
  beam.addColorStop(1, "rgba(4, 2, 1, 0.98)");
  g.fillStyle = beam;
  g.fillRect(x0, y - h * 0.02, x1 - x0, h * 0.7);
  g.globalCompositeOperation = "lighter";
  for (const l of lamps) {
    const lx = (l.x / FW) * W;
    const spill = g.createRadialGradient(lx, y, 0, lx, y, h * 1.4);
    spill.addColorStop(0, `rgba(255, 140, 60, ${0.22 * clamp(l.inten, 0, 1.5)})`);
    spill.addColorStop(1, "rgba(255, 140, 60, 0)");
    g.fillStyle = spill;
    g.fillRect(lx - h * 1.4, y - h * 0.02, h * 2.8, h * 0.25);
  }
  g.globalCompositeOperation = "source-over";
}

// Backstage view: the lamps stand between the viewer and the figures.
function drawLampsFront(t) {
  const g = fg;
  const bowls = lampsCache.filter((l) => l.body === "bowl");
  const rows = new Map();
  for (const l of bowls) rows.set(Math.round(l.y), [...(rows.get(Math.round(l.y)) || []), l]);
  for (const row of rows.values()) drawBeam(g, row);
  for (const l of lampsCache) drawLamp(g, (l.x / FW) * W, (l.y / FH) * H, l, t);
}

// Polished brass: dark at the edges, a bright band where it faces the viewer, warm from the flame above.
function brass(g, cx, halfW) {
  const b = g.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
  b.addColorStop(0, "#3a2408");
  b.addColorStop(0.18, "#8a5d1c");
  b.addColorStop(0.4, "#d9a44a");
  b.addColorStop(0.52, "#fbe2a0");
  b.addColorStop(0.62, "#d39a3e");
  b.addColorStop(0.85, "#7a5016");
  b.addColorStop(1, "#2e1c06");
  return b;
}

function drawDeepam(g, x, y, h, I) {
  const s = (v) => v * h;
  // Foot: a stepped dome.
  g.fillStyle = brass(g, x, s(0.3));
  g.beginPath();
  g.moveTo(x - s(0.3), y);
  g.bezierCurveTo(x - s(0.3), y - s(0.07), x - s(0.1), y - s(0.1), x - s(0.06), y - s(0.16));
  g.lineTo(x + s(0.06), y - s(0.16));
  g.bezierCurveTo(x + s(0.1), y - s(0.1), x + s(0.3), y - s(0.07), x + s(0.3), y);
  g.closePath();
  g.fill();
  g.fillStyle = "#2a1a06";
  g.fillRect(x - s(0.3), y - s(0.012), s(0.6), s(0.012)); // shadowed base edge
  // Stem with turned rings.
  g.fillStyle = brass(g, x, s(0.045));
  g.fillRect(x - s(0.035), y - s(0.62), s(0.07), s(0.47));
  for (const [ry, rw] of [[0.2, 0.08], [0.33, 0.06], [0.45, 0.09], [0.57, 0.07]]) {
    g.fillStyle = brass(g, x, s(rw));
    g.beginPath();
    g.ellipse(x, y - s(ry), s(rw), s(0.022), 0, 0, Math.PI * 2);
    g.fill();
  }
  // Bowl, with the rim catching the flame.
  g.fillStyle = brass(g, x, s(0.27));
  g.beginPath();
  g.moveTo(x - s(0.27), y - s(0.7));
  g.bezierCurveTo(x - s(0.25), y - s(0.6), x - s(0.1), y - s(0.6), x, y - s(0.6));
  g.bezierCurveTo(x + s(0.1), y - s(0.6), x + s(0.25), y - s(0.6), x + s(0.27), y - s(0.7));
  g.closePath();
  g.fill();
  g.fillStyle = "#3b2508"; // oil in the bowl
  g.beginPath();
  g.ellipse(x, y - s(0.7), s(0.27), s(0.035), 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = `rgba(255, 214, 140, ${0.35 + 0.45 * Math.min(1, I)})`;
  g.lineWidth = Math.max(1, s(0.014));
  g.beginPath();
  g.ellipse(x, y - s(0.7), s(0.27), s(0.035), 0, Math.PI, Math.PI * 2);
  g.stroke();
  // Wick resting on the rim.
  g.strokeStyle = "#1c1206";
  g.lineWidth = Math.max(1, s(0.016));
  g.beginPath();
  g.moveTo(x + s(0.1), y - s(0.705));
  g.lineTo(x + s(0.2), y - s(0.735));
  g.stroke();
  return { fx: x + s(0.2), fy: y - s(0.74) };
}

function drawFlame(g, fx, fy, fh, t, seed, I, bloomAmount = 1) {
  const flick = 1 + 0.16 * noise(t * 1.9, seed);
  const h = fh * flick;
  const w = h * 0.34;
  const sway = noise(t * 1.4, seed + 5) * w * 0.4;
  const tipX = fx + sway;
  const path = () => {
    g.beginPath();
    g.moveTo(fx - w * 0.5, fy);
    g.bezierCurveTo(fx - w * 0.62, fy - h * 0.38, tipX - w * 0.18, fy - h * 0.78, tipX, fy - h);
    g.bezierCurveTo(tipX + w * 0.18, fy - h * 0.78, fx + w * 0.62, fy - h * 0.38, fx + w * 0.5, fy);
    g.bezierCurveTo(fx + w * 0.4, fy + w * 0.32, fx - w * 0.4, fy + w * 0.32, fx - w * 0.5, fy);
    g.closePath();
  };
  // Small bloom right around the flame only.
  g.globalCompositeOperation = "lighter";
  const bloom = g.createRadialGradient(fx, fy - h * 0.45, 0, fx, fy - h * 0.45, h * 1.1);
  bloom.addColorStop(0, `rgba(255, 190, 110, ${0.32 * bloomAmount * Math.min(1, I)})`);
  bloom.addColorStop(1, "rgba(255, 190, 110, 0)");
  g.fillStyle = bloom;
  g.fillRect(fx - h * 1.1, fy - h * 1.55, h * 2.2, h * 2.2);
  g.globalCompositeOperation = "source-over";
  // Outer flame: orange fading at the edges.
  const outer = g.createLinearGradient(0, fy, 0, fy - h);
  outer.addColorStop(0, "rgba(255, 150, 40, 0.95)");
  outer.addColorStop(0.5, "rgba(255, 186, 70, 0.92)");
  outer.addColorStop(1, "rgba(255, 120, 30, 0.15)");
  g.fillStyle = outer;
  path();
  g.fill();
  // Bright core.
  const core = g.createRadialGradient(fx + sway * 0.2, fy - h * 0.32, 0, fx + sway * 0.2, fy - h * 0.32, h * 0.42);
  core.addColorStop(0, "rgba(255, 255, 240, 1)");
  core.addColorStop(0.55, "rgba(255, 236, 170, 0.9)");
  core.addColorStop(1, "rgba(255, 210, 120, 0)");
  g.fillStyle = core;
  path();
  g.fill();
  // Blue root at the wick.
  g.fillStyle = "rgba(70, 110, 255, 0.45)";
  g.beginPath();
  g.ellipse(fx, fy - w * 0.08, w * 0.24, w * 0.15, 0, 0, Math.PI * 2);
  g.fill();
}

function drawLamp(g, x, y, l, t) {
  const I = clamp(l.inten, 0, 2);
  if (l.body === "deepam") drawDeepam(g, x, y, lampHeight(), I);
  else if (l.body === "bowl") drawBowl(g, x, y, I, l);
  if (I <= 0.02) return;
  const { fx, fy, fh } = flameAt(l);
  drawFlame(g, fx, fy, fh, t, l.seed, I);
}

// ── Effects ─────────────────────────────────────────────
function drawSmoke(g, px, py, u, I, t, dark) {
  for (let i = 0; i < 12; i++) {
    const p = (t * 0.22 + i / 12) % 1;
    const bx = px + Math.sin(p * 6 + i * 1.3) * 70 * u;
    const by = py - p * 620 * u;
    const r = (50 + 150 * p) * u;
    const a = 0.28 * (1 - p) * Math.min(1, I);
    const grad = g.createRadialGradient(bx, by, 0, bx, by, r);
    const c = dark ? "40, 36, 34" : "95, 90, 86";
    grad.addColorStop(0, `rgba(${c}, ${a})`);
    grad.addColorStop(1, `rgba(${c}, 0)`);
    g.fillStyle = grad;
    g.fillRect(bx - r, by - r, 2 * r, 2 * r);
  }
}

function drawSparks(g, px, py, u, I, t) {
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 46; i++) {
    const p = (t * 0.7 + i * 0.137) % 1;
    const x = px + (Math.sin(i * 12.9) * 160 + Math.sin(t * 3 + i) * 30 * p) * u;
    const y = py - p * 520 * u;
    const a = (1 - p) * Math.min(1, I);
    g.fillStyle = `rgba(255, 214, 150, ${a})`;
    g.beginPath();
    g.arc(x, y, (2 + (i % 3)) * u * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
}

function drawFx(t, live = t) {
  const g = fg;
  g.clearRect(0, 0, W, H);
  const dark = S.project.screen.style === "silhouette";
  for (const it of S.project.items) {
    if (it.kind !== "fx" || !visibleAt(it, t)) continue;
    const [x, y] = valueAt(it.props.position, t);
    const s = valueAt(it.props.scale, t)[0] / 100;
    const I = clamp(valueAt(it.props.intensity, t)[0] / 100, 0, 3);
    if (I <= 0.001) continue;
    const px = (x / FW) * W;
    const py = (y / FH) * H;
    const u = (H / FH) * s;
    if (it.fx === "smoke") drawSmoke(g, px, py, u, I, live, dark);
    else if (it.fx === "sparks") drawSparks(g, px, py, u, I, live);
  }
}

function renderCaption(t) {
  const el = $("caption");
  const P = S.project;
  const scene = P.scenes.find((sc) => t >= sc.start && t < sc.end);
  const text = P.screen.captions && scene ? scene.narration : "";
  el.hidden = !text;
  if (text && el.textContent !== text) el.textContent = text;
}

// ── Frame ───────────────────────────────────────────────
// t places everything on the timeline; live drives what never stops moving (flames, flicker, the hand-held
// wobble). The studio passes one clock; the landing page scrubs t by scroll while live keeps running.
export function renderStage(t, live = t) {
  const P = S.project;
  drawLights(t, live);
  const soft = softness();
  for (const it of P.items) {
    if (it.kind !== "puppet") continue;
    const el = puppetEls.get(it.id);
    if (!el) continue;
    const show = visibleAt(it, t);
    el.hidden = !show;
    if (!show) continue;
    let [x, y] = valueAt(it.props.position, t);
    const [s] = valueAt(it.props.scale, t);
    let [r] = valueAt(it.props.rotation, t);
    const [o] = valueAt(it.props.opacity, t);
    const dd = clamp(valueAt(it.props.depth, t)[0], 0, 100) / 100;
    // While its parts are being shaped, a figure stands upright, square to the cloth, in its rest pose.
    const shaping = Boolean(S.rigEdit && S.rigEdit.item === it.id);
    const turn = shaping ? 0 : valueAt(getProp(it, "turn"), t)[0];
    const tilt = shaping ? 0 : valueAt(getProp(it, "tilt"), t)[0];
    if (shaping) r = 0;

    if (P.screen.natural !== false && !shaping) {
      // A puppet is carried on sticks, not slid on rails: it bobs with the puppeteer's steps,
      // leans into the direction it travels, and never holds perfectly still.
      const vx = (valueAt(it.props.position, t + 0.04)[0] - valueAt(it.props.position, t - 0.04)[0]) / 0.08;
      const moving = clamp((Math.abs(vx) - 40) / 400, 0, 1);
      y -= moving * 16 * Math.abs(Math.sin((Math.PI * x) / 150));
      r += moving * clamp(vx / 1200, -1, 1) * 5;
      const seed = seedOf(it.id);
      r += noise(live * 0.8, seed) * 0.7;
      y += noise(live * 0.6, seed + 3) * 3;
    }

    const front = P.screen.view !== "backstage";
    // The figures are held up against the cloth, above the lamp beam: from the puppeteers' side the flames burn at
    // their feet, not across their middles.
    if (!front) y -= ((P.screen.figure || 55) / 100) * FH * 0.5;
    let k = s / 100;
    let shade = "";
    let fade = 1;
    if (front) {
      // Drawn back from the cloth toward the lamps, a figure's shadow grows, loses its edges, its colour and
      // its punched detail, and turns pale: a soft dark shape rather than a blurred picture.
      k *= 1 + dd * 0.6;
      const blur = dd * cssH * 0.022 * soft;
      shade = dd > 0.01 ? `blur(${blur.toFixed(2)}px) brightness(${(1 - 0.92 * dd).toFixed(3)})` : "";
      fade = 1 - dd * 0.5;
    } else {
      // From the puppeteers' side a figure taken toward the lamps is simply nearer: larger, still sharp.
      k *= 1 + dd * 0.35;
    }
    el.style.left = `${(x / FW) * 100}%`;
    el.style.top = `${(y / FH) * 100}%`;
    el.style.opacity = clamp((o / 100) * fade, 0, 1);
    // In space: the plate turns on its main stick and tilts toward or away, in perspective, so its shadow on the cloth
    // narrows and leans as a real one does. Its edge shows as it turns: the thickness of the leather.
    el.style.transform = `translate(-50%, -50%) rotate(${r}deg) rotateY(${turn}deg) rotateX(${tilt}deg) scale(${it.flip ? -k : k}, ${k})`;
    let edge = "";
    if (Math.abs(turn) > 1.5 || Math.abs(tilt) > 1.5) {
      const thick = ((it.thick ?? 3) * cssH) / 1080 / Math.max(k, 0.2);
      const ex = thick * Math.sin((turn * Math.PI) / 180) * (it.flip ? -1 : 1);
      const ey = -thick * Math.sin((tilt * Math.PI) / 180);
      edge = `drop-shadow(${ex.toFixed(2)}px ${ey.toFixed(2)}px 0 ${front ? "rgba(12, 6, 2, 0.95)" : "#4a2c12"})`;
    }
    el.style.filter = [edge, shade].filter(Boolean).join(" ");
    el.style.setProperty("--k", Math.max(k, 0.05));
    const hand = it.hand || [16, 14];
    el.style.setProperty("--hx", `${hand[0]}%`);
    el.style.setProperty("--hy", `${hand[1]}%`);
    el.classList.toggle("no-arm", it.armStick === false);
    el.classList.toggle("selected", Boolean(S.sel && S.sel.type === "item" && S.sel.id === it.id));
    // Cut parts turn on their joints; the arm stick, riding on its part, is turned back so it still hangs to the
    // puppeteer's hand below.
    poseParts(el, it, (part) => (shaping ? 0 : valueAt(part.props.rotation, t)[0]));
    for (const part of it.parts || []) {
      if (isCut(part)) continue;
      const img = el.querySelector(`[data-part="${part.id}"]`);
      if (!img) continue;
      const [pr] = valueAt(part.props.rotation, t);
      img.style.left = `${part.pivot[0]}%`;
      img.style.top = `${part.pivot[1]}%`;
      img.style.height = `${part.size}%`;
      img.style.transformOrigin = `${part.anchor[0]}% ${part.anchor[1]}%`;
      img.style.transform = `translate(${-part.anchor[0]}%, ${-part.anchor[1]}%) rotate(${pr}deg)`;
    }
  }
  drawFx(t, live);
  if (P.screen.view === "backstage") drawLampsFront(live);
  renderTitles(t);
  renderCaption(t);
}
