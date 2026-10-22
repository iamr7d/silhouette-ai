// The landing page is a performance: the whole window is the studio's lamp-lit cloth, and scrolling moves the night
// forward. Each chapter owns a stretch of the show's timeline; the flames and branches keep moving on their own clock.
import { S, K, clamp, valueAt } from "./js/core.js";
import { BUILTIN_IMAGES, fadeCard, lampRow, makePuppet, makeTitle, screenFor } from "./js/library.js";
import { applyScreen, initStage, renderStage, syncPuppets } from "./js/stage.js";

const VIDEO = new URLSearchParams(location.search).has("video");
// Figures stand low on the cloth, leaving its upper part for the words; in the 9:16 film a little higher, clear of
// Instagram's caption at the foot of the screen.
const Y = VIDEO ? 750 : 830;
const OFF_R = 2420;
const OFF_L = -460;
const END = 50;
const BACK = [20, 24]; // the stretch watched from the puppeteers' side

// Video mode (index.html?video): a 9:16 film of the same night. The page then runs on a clock that the renderer
// sets frame by frame (window.__seek), instead of on the scroll, and every animation is pinned to that clock.
if (VIDEO) document.documentElement.classList.add("video");
// Clean footage (index.html?video&clean): only the cloth, its lamps and figures, for cutting into other films.
const CLEAN = VIDEO && new URLSearchParams(location.search).has("clean");
if (CLEAN) document.documentElement.classList.add("clean");
let showOverride = null; // in clean footage the renderer names the moment of the show directly
// Seconds of film → seconds of the show, paced for a Reel: each chapter holds just long enough to read its line.
// The film leaves the last chapter (the studio) to its own second part.
const FILM = [[0, 0], [3, 0], [7.5, 4], [10.5, 8], [15, 14], [19.5, 20], [23, 24], [30, 40], [34, 45.5], [35, 45.9]];
export const FILM_LENGTH = FILM[FILM.length - 1][0];
function filmToShow(sec) {
  for (let i = 1; i < FILM.length; i++) {
    const [a, ta] = FILM[i - 1];
    const [b, tb] = FILM[i];
    if (sec <= b) return ta + (tb - ta) * clamp((sec - a) / (b - a), 0, 1);
  }
  return END;
}
let clockMs = 0; // the film's clock, in video mode

function show() {
  // Twenty-one lamps, lit one after another from the left, as a single flame is carried along the beam,
  // burning low over the history and almost out by the closing card.
  const lights = lampRow("koothu", 21, 700);
  lights.forEach((lamp, i) => {
    const on = 0.5 + i * 0.13;
    lamp.props.intensity.keys = [K(0, [0]), K(on, [0]), K(on + 0.5, [110]), K(40, [110]), K(44, [38]), K(46.4, [30]), K(48, [6])];
  });

  const ganesh = makePuppet("img:ganesh", "Ganapati", 3, { position: [960, Y] }, { start: 4, end: 8.2 });
  ganesh.props.opacity.keys = [K(4, [0]), K(5.2, [100]), K(7.2, [100]), K(8.2, [0])];
  ganesh.props.rotation.keys = [K(5.2, [0]), K(5.9, [2]), K(6.6, [-2]), K(7.2, [0])];
  ganesh.props.depth.keys = [K(7.2, [0]), K(8.2, [45])];

  const rama = makePuppet("img:rama", "Rama", 0, { position: [620, Y] }, { start: 8, end: 24.6 });
  rama.props.position.keys = [
    K(8, [OFF_L, Y]), K(10.4, [620, Y]), K(17.6, [620, Y]), K(18.3, [820, Y]), K(19, [720, Y]),
    K(20.4, [720, Y]), K(24.4, [OFF_R, Y], "linear"),
  ];
  rama.props.rotation.keys = [K(17.6, [0]), K(18.3, [7]), K(19, [0])];

  const sita = makePuppet("img:sita", "Sita", 2, { position: [1250, Y] }, { start: 8.5, end: 19.8, flip: true });
  sita.props.position.keys = [K(8.6, [OFF_R, Y]), K(11, [1250, Y]), K(17.2, [1250, Y]), K(19.6, [OFF_R, Y - 40])];
  sita.props.rotation.keys = [K(11.6, [0]), K(12.2, [-10]), K(12.8, [-10]), K(13.4, [0]), K(16, [0])];
  for (let i = 0; i <= 10; i++) sita.props.rotation.keys.push(K(16.1 + i * 0.1, [i === 10 ? 0 : i % 2 ? 2.5 : -2.5], "linear"));

  // Ravana comes in from near the lamps: a huge, soft shadow that sharpens as he reaches the cloth.
  const ravana = makePuppet("img:ravana", "Ravana", 1, { position: [1620, Y] }, { start: 14, end: 20, flip: true });
  ravana.props.position.keys = [K(14, [OFF_R, Y]), K(16.2, [1620, Y]), K(16.8, [1620, Y]), K(17.4, [1420, Y]), K(17.9, [1460, Y]), K(19.8, [OFF_R + 100, Y])];
  ravana.props.depth.keys = [K(14, [75]), K(16.4, [0])];
  ravana.props.rotation.keys = [K(16.8, [0]), K(17.4, [-6]), K(17.9, [0])];

  // A procession of museum figures, right to left, each named as it passes the middle of the cloth.
  const files = ["maricha", "hanuman", "lakshmana", "indrajit", "vibhishana", "elephant", "tiger", "chariot"];
  const scenes = [];
  const procession = files.map((f, j) => {
    const s = 24.4 + j * 1.9;
    const img = BUILTIN_IMAGES.find((b) => b.id === `img:${f}`);
    const y = f === "tiger" ? Y + 40 : Y;
    const p = makePuppet(img.id, img.name, j, { position: [2300, y] }, { start: s, end: s + 5, flip: true });
    p.props.position.keys = [K(s, [2300, y], "linear"), K(s + 5, [-380, y])];
    scenes.push({ id: `cap-${f}`, title: img.name, start: s + 1.3, end: s + 3.2, narration: img.name.split(" (")[0] });
    return p;
  });

  const vishnu = makePuppet("img:vishnu", "Vishnu", 4, { position: [960, Y + 40] }, { start: 40, end: 46 });
  vishnu.props.opacity.keys = [K(40.3, [0]), K(41.8, [100]), K(45, [100]), K(46, [0])];

  // The closing card stands where the figures did, below the words written on the cloth.
  const closing = fadeCard(makeTitle("Closing", { kicker: "A studio for shadow theatre", title: "Silhouette.ai" }, 46.4, END + 1.4), 1.2);
  closing.props.position.base = [960, 780];

  return {
    version: 3,
    title: "Silhouette.ai",
    tradition: "tholpavakoothu",
    duration: END,
    screen: { ...screenFor("tholpavakoothu"), captions: true, master: 78, hems: false }, // a little lower than the studio, for a full window of cloth
    audio: { master: 80 },
    assets: {},
    items: [ganesh, vishnu, rama, sita, ravana, ...procession, closing],
    lights,
    scenes,
    motors: { baud: 115200, send: true, outputs: [], inputs: [] },
  };
}

S.project = show();

// The cloth fills the window. On a narrow or tall window the figures are drawn smaller, so they keep their
// proportions against the lamps instead of filling the width.
function fitScreen() {
  const aspect = window.innerWidth / window.innerHeight;
  // The words take the upper cloth, so the figures stay below about half its height.
  const fig = CLEAN ? 36 : VIDEO ? 25 : Math.round(clamp((40 * aspect) / 1.78, 17, 40));
  if (S.project.screen.figure !== fig) {
    S.project.screen.figure = fig;
    applyScreen();
  }
}

initStage();
applyScreen();
fitScreen();
syncPuppets();

// ── Banyan: boughs from the corners and aerial roots hanging between the lamps and the cloth, so they fall on it
// as shadows. The words are written in the space between. ──
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f1 = (v) => v.toFixed(1);

// A banyan leaf: broad, leathery and oval with a rounded tip, on a short stalk. Drawn pointing along +x.
const LEAF = (L) => {
  const W = L * 0.62;
  const b = L * 0.2;
  return `M0,-0.9L${f1(b)},-0.9L${f1(b)},0.9L0,0.9Z` +
    `M${f1(b)},0C${f1(b + L * 0.08)},${f1(-W * 0.5)} ${f1(L * 0.86)},${f1(-W * 0.5)} ${f1(L)},0` +
    `C${f1(L * 0.86)},${f1(W * 0.5)} ${f1(b + L * 0.08)},${f1(W * 0.5)} ${f1(b)},0Z`;
};
const leaf = (x, y, ang, L) =>
  `<path d="${LEAF(L)}" stroke-width="0.6" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1((ang * 180) / Math.PI)})"/>`;

const sway = (r, x, y) =>
  `--dur:${f1(7 + r() * 6)}s;--delay:${f1(-r() * 8)}s;--amp:${(0.4 + r() * 0.9).toFixed(2)}deg;transform-origin:${f1(x)}px ${f1(y)}px`;

// A bough grows out and droops under its own weight (sag), carrying leaves and short twigs.
function bough(r, x0, y0, a0, len, cls, sag = 0.035, size = 1) {
  let x = x0;
  let y = y0;
  let a = a0;
  const steps = Math.round(len / 16);
  let stems = "";
  let leaves = "";
  for (let i = 0; i < steps; i++) {
    const p = i / steps;
    a += (Math.PI / 2 - a) * sag + (r() - 0.5) * 0.16;
    const nx = x + Math.cos(a) * 16;
    const ny = y + Math.sin(a) * 16;
    stems += `<path d="M${f1(x)},${f1(y)}L${f1(nx)},${f1(ny)}" fill="none" stroke-linecap="round" stroke-width="${f1((10 * (1 - p) + 1.4) * size)}"/>`;
    x = nx;
    y = ny;
    if (i > 2 && i % 2 === 0) {
      const side = (i / 2) % 2 ? 1 : -1;
      let la = a + side * (0.9 + r() * 0.6);
      la += (Math.PI / 2 - la) * 0.45; // leaves hang
      leaves += leaf(x, y, la, (38 + r() * 26) * (1 - 0.3 * p) * size);
    }
    if (i > 3 && r() < 0.2) {
      // a pendant twig with a small cluster of leaves
      let tx = x;
      let ty = y;
      let ta = a + (r() < 0.5 ? 0.9 : -0.6);
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        ta += (Math.PI / 2 - ta) * 0.18;
        const ux = tx + Math.cos(ta) * 13 * size;
        const uy = ty + Math.sin(ta) * 13 * size;
        stems += `<path d="M${f1(tx)},${f1(ty)}L${f1(ux)},${f1(uy)}" fill="none" stroke-width="${f1(1.8 * size)}"/>`;
        tx = ux;
        ty = uy;
        leaves += leaf(tx, ty, ta + (k % 2 ? 1 : -1) * 1.1, (30 + r() * 20) * size);
      }
    }
  }
  return `<g class="bough ${cls}" style="${sway(r, x0, y0)}">${stems}${leaves}</g>`;
}

// Aerial roots: cords dropping from the branches, sometimes two or three twisted together.
function root(r, x, top, end, cls) {
  const strands = r() < 0.35 ? 2 + Math.floor(r() * 2) : 1;
  let d = "";
  const bend = (r() - 0.5) * 34;
  for (let s = 0; s < strands; s++) {
    const o = (s - (strands - 1) / 2) * 3.2;
    const e = end - s * (20 + r() * 60);
    d += `<path d="M${f1(x + o)},${f1(top)}C${f1(x + o + bend)},${f1(top + (e - top) * 0.35)} ${f1(x - o - bend * 0.6)},${f1(top + (e - top) * 0.7)} ${f1(x + o * 0.4)},${f1(e)}" fill="none" stroke-linecap="round" stroke-width="${f1(1 + r() * 2.4)}"/>`;
  }
  return `<g class="bough ${cls}" style="${sway(r, x, top)}">${d}</g>`;
}

// A side: boughs from the top corner reaching in and down, and a curtain of roots along the edge.
function banyanSide(seed, cls) {
  const r = rng(seed);
  let far = "";
  let near = "";
  for (let i = 0; i < 3; i++) far += bough(r, -40, -30 + r() * 300, 0.05 + r() * 0.35, 280 + r() * 160, "far", 0.03, 1.15);
  for (let i = 0; i < 5; i++) far += root(r, 40 + r() * 300, -10, 380 + r() * 600, "far");
  near += bough(r, -30, -20 + r() * 50, 0.05 + r() * 0.15, 380 + r() * 100, "near", 0.022);
  near += bough(r, -30, 150 + r() * 120, 0.1 + r() * 0.2, 240 + r() * 100, "near", 0.04);
  for (let i = 0; i < 8; i++) near += root(r, 14 + r() * 240, -10, 300 + r() * 720, "near");
  return `<svg class="${cls}" viewBox="0 0 700 1080" preserveAspectRatio="xMinYMin meet">${far}${near}</svg>`;
}

document.getElementById("banyan").innerHTML = banyanSide(7, "left") + banyanSide(23, "right");

// ── The opening: a blue night before any lamp is lit ──
const night = document.getElementById("night");
// A few stars and a small moon high up, between the banyan leaves at the sides.
const sky = rng(3);
let stars = "";
for (let i = 0; i < 320; i++) {
  // denser toward the top of the sky; a few bright ones twinkle
  const y = Math.pow(sky(), 1.4) * 78;
  const big = sky() < 0.08;
  const tw = sky() < 0.18 ? ` class="tw" style="--tw:${f1(2 + sky() * 4)}s;--twd:${f1(-sky() * 5)}s"` : "";
  stars += `<circle cx="${f1(sky() * 100)}" cy="${f1(y)}" r="${big ? 0.17 : f1(0.05 + sky() * 0.05)}" opacity="${f1(0.3 + sky() * 0.65)}"${tw}/>`;
}
night.innerHTML =
  `<svg class="stars" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="#dfe8ff">${stars}</g></svg>` +
  `<div class="moon" aria-hidden="true"></div>` +
  `<div class="sign-on"><h1 class="so-title" aria-label="Silhouette.ai, studio for shadow theatre">` +
  `<span class="so-word" aria-hidden="true">Silhouette</span><span class="so-sub" aria-hidden="true">Studio · AI</span></h1></div>`;

// Comets: now and then a quick one streaks across the night and burns out.
const comets = document.createElement("div");
comets.className = "comets";
night.appendChild(comets);
function shootComet() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || night.style.opacity === "0" || document.hidden) return;
  const c = document.createElement("div");
  c.className = "comet quick";
  const fromLeft = Math.random() < 0.5;
  const angle = 14 + Math.random() * 22; // degrees below the horizontal
  c.style.top = `${f1(4 + Math.random() * 38)}%`;
  c.style.left = fromLeft ? `${f1(-10 + Math.random() * 40)}%` : `${f1(70 + Math.random() * 40)}%`;
  c.style.setProperty("--ang", `${fromLeft ? angle : 180 - angle}deg`);
  c.style.setProperty("--len", `${f1(18 + Math.random() * 16)}vw`);
  c.style.animationDuration = `${f1(0.9 + Math.random() * 0.9)}s`;
  c.innerHTML = "<span></span>";
  c.addEventListener("animationend", () => c.remove());
  comets.appendChild(c);
}
// On the page they come at random; in the film, at set moments of the opening night.
const FILM_COMETS = [0.6, 2.2, 3.9, 5.6];
let filmComet = 0;
if (!VIDEO) {
  (function nextComet() {
    setTimeout(() => {
      shootComet();
      nextComet();
    }, 2500 + Math.random() * 4500);
  })();
  setTimeout(shootComet, 1200);
}

// Leaves let go as a new chapter is written on the cloth, and drift down past the lamps.
const falling = document.getElementById("falling");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function dropLeaves(n) {
  if (reduceMotion) return;
  const r = Math.random;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    el.className = "leaf-fall";
    const L = 34 + r() * 22;
    el.innerHTML = `<svg viewBox="-4 -24 ${f1(L + 8)} 48" width="${f1(L * 0.9)}"><path d="${LEAF(L)}"/></svg>`;
    el.style.left = `${f1(6 + r() * 88)}%`;
    el.style.setProperty("--dx", `${f1((r() - 0.5) * 30)}vw`);
    el.style.setProperty("--spin", `${f1(180 + r() * 540)}deg`);
    el.style.animationDuration = `${f1(6 + r() * 4)}s`;
    el.style.animationDelay = `${f1(r() * 1.4)}s`;
    el.addEventListener("animationend", () => el.remove());
    falling.appendChild(el);
  }
}

// ── Scroll → timeline ──
const chapters = [...document.querySelectorAll(".ch")];
const fill = document.getElementById("ruler-fill");
const screenEl = document.getElementById("screen");
const cue = document.getElementById("cue");
const bar = document.querySelector(".bar");
const doc = document.documentElement;

// A chapter's time runs while it scrolls past the top of the window.
function targetTime() {
  if (VIDEO) {
    const ft = showOverride ?? filmToShow(clockMs / 1000);
    let cur = chapters[0];
    for (const ch of chapters) if (ft >= Number(ch.dataset.t0)) cur = ch;
    return { t: ft, current: cur };
  }
  let t = 0;
  let current = chapters[0];
  for (const ch of chapters) {
    const r = ch.getBoundingClientRect();
    if (r.top <= 0) {
      const t0 = Number(ch.dataset.t0);
      const t1 = Number(ch.dataset.t1);
      t = t0 + (t1 - t0) * clamp(-r.top / r.height, 0, 1);
      current = ch;
    }
  }
  return { t, current };
}

// How brightly the lamps light the cloth, 0 (dark) to 1; it decides whether the words on it are gold or ink.
function clothLight(t) {
  if (S.project.screen.view === "backstage") return 0;
  let sum = 0;
  for (const L of S.project.lights) sum += valueAt(L.props.intensity, t)[0];
  return clamp(sum / S.project.lights.length / 95, 0, 1);
}
const GOLD = [226, 191, 116];
const INK = [30, 14, 5];
let inkShown = -1;
function setInk(level) {
  const k = Math.round(level * 40) / 40;
  if (k === inkShown) return;
  inkShown = k;
  const e = k * k * (3 - 2 * k);
  const c = GOLD.map((g, i) => Math.round(g + (INK[i] - g) * e)).join(", ");
  doc.style.setProperty("--ink", `rgb(${c})`);
  doc.style.setProperty("--ink-soft", `rgba(${c}, ${(0.78 + 0.14 * e).toFixed(2)})`);
}

// ── Malayalam: each chapter's headline and words, for the Rachana line and the Malayalam reading ──
const ML = {
  "The lamps": [null, "കേരളത്തിലും തമിഴ്നാട്ടിലും തോൽപ്പാവകൾ കൊണ്ടുള്ള നിഴൽപ്പാവക്കൂത്ത്: കേരളത്തിലെ പാലക്കാട്, തൃശ്ശൂർ, മലപ്പുറം ജില്ലകളിലും മധുരയുടെ പരിസരങ്ങളിലും. കേരളത്തിൽ ഇത് ഭദ്രകാളിക്കുള്ളതാണ്: ദാരികനോട് യുദ്ധം ചെയ്യുകയായിരുന്നതിനാൽ രാവണവധം കാണാൻ കഴിയാതെപോയ ദേവിക്കായി ആ യുദ്ധം വീണ്ടും അവതരിപ്പിക്കുന്നു."],
  "Invocation": ["കഥയ്ക്കു മുമ്പ്, ഗണപതി.", "ഗണപതിയെയും ഗുരുക്കന്മാരെയും വന്ദിച്ചാണ് ഓരോ രാത്രിയും തുടങ്ങുന്നത്; അത് പുലരും വരെ നീളും. രാമായണം മുഴുവൻ പറയാൻ ഇരുപത്തൊന്ന് രാത്രികൾ വേണം, ജനുവരി മുതൽ മേയ് വരെയുള്ള കാലത്ത്."],
  "Rama and Sita": ["കമ്പരാമായണം, രാത്രി മുഴുവൻ.", "പുലവർ കമ്പരുടെ തമിഴ് പദ്യങ്ങൾ പാടി, തമിഴിലും മലയാളത്തിലും സംസ്കൃതത്തിലും വ്യാഖ്യാനിക്കുന്നു: ആറു മുതൽ പത്തു വർഷം കൊണ്ട് പഠിച്ചെടുക്കുന്ന മൂവായിരത്തിലധികം പദ്യങ്ങൾ."],
  "Ravana": ["തിരശ്ശീലയിൽ നിന്ന് അകലുമ്പോൾ നിഴൽ വളരുന്നു.", "ഓരോ പാവയും രണ്ടു കോലുകളിൽ തിരശ്ശീലയോടു ചേർത്തുപിടിക്കുന്നു: ഒന്ന് ഉടലിന്, മെലിഞ്ഞ മറ്റൊന്ന് കൈയ്ക്ക്. വിളക്കുകളിലേക്ക് പിന്നോട്ടു നീക്കുമ്പോൾ നിഴൽ വലുതാകുകയും മങ്ങുകയും ചെയ്യുന്നു. രാവണൻ അങ്ങനെയാണ് വരുന്നത്."],
  "Behind the cloth": ["മറുവശം.", "പാവകളിക്കാർ നിൽക്കുന്നിടം: എണ്ണ നിറച്ച ഇരുപത്തൊന്ന് ചിരട്ടകൾ, ഓരോന്നിലും പരുത്തിത്തിരി, ഏകദേശം 1.3 മീറ്റർ ഉയരത്തിലുള്ള വിളക്കുമാടത്തിൽ, ഏകദേശം നാൽപ്പത്തിരണ്ട് അടി നീളമുള്ള കൂത്തുമാടത്തിൽ."],
  "The figures": ["തോലിൽ വെട്ടിയെടുത്ത ഇരുന്നൂറ് രൂപങ്ങൾ.", "ആട്ടിൻതോൽ, പണ്ട് മാൻതോൽ; വെളിച്ചം കടക്കാൻ തുളച്ച്, സസ്യച്ചായങ്ങൾ കൊണ്ട് നിറം നൽകിയത്. ചിലതിന് നാലടി ഉയരം; ഒരു മുഴുവൻ അവതരണത്തിന് 180 മുതൽ 200 വരെ പാവകൾ വേണം."],
  "History": ["എത്ര പഴക്കമുണ്ടെന്ന് ആർക്കും ഉറപ്പില്ല.", "ഒൻപതാം നൂറ്റാണ്ടു മുതൽ പതിനെട്ടാം നൂറ്റാണ്ടു വരെ പല കാലങ്ങൾ പറയപ്പെടുന്നു. പുലവർ കുടുംബങ്ങൾ ഇത് കാത്തുസൂക്ഷിച്ചു: ക്ഷേത്രത്തിൽ നിന്ന് 1979-ൽ താഷ്കന്റ് വരെ, 2021-ൽ ആദ്യത്തെ വനിതാ സംഘം വരെ."],
  "The studio": ["നിഴൽനാടകത്തിനായി ഒരു സ്റ്റുഡിയോ.", "ഈ പേജ് ഉണ്ടാക്കിയത് Silhouette.ai-ലാണ്: യഥാർത്ഥ തിരശ്ശീലയും വിളക്കുകളും, കോലുകളിലെ പാവകൾ, ടൈംലൈൻ, ശബ്ദം, യഥാർത്ഥ പാവകൾക്കായി മോട്ടോറുകൾ."],
};
for (const ch of chapters) {
  const [head, para] = ML[ch.dataset.name];
  const txt = ch.querySelector(".txt");
  // Everything but the numeral and links is English; it gives way to the Malayalam when that is chosen.
  for (const el of txt.children) if (!el.classList.contains("no") && !el.classList.contains("ml-title") && !el.querySelector("a")) el.classList.add("en");
  const p = document.createElement("p");
  p.className = "ml-para";
  p.lang = "ml";
  p.textContent = para;
  const line = txt.querySelector(".line");
  if (head && line) {
    const h = document.createElement("p");
    h.className = "ml-head";
    h.lang = "ml";
    h.textContent = head;
    line.after(h);
    h.after(p);
  } else (txt.querySelector(".ml-title") || txt.querySelector(".no")).after(p); // a chapter without an English headline
}
const langBtn = document.getElementById("lang");
function setLang(ml) {
  doc.dataset.lang = ml ? "ml" : "en";
  langBtn.textContent = ml ? "English" : "മലയാളം";
  langBtn.lang = ml ? "en" : "ml";
  langBtn.title = ml ? "Read in English" : "Read in Malayalam";
  langBtn.setAttribute("aria-pressed", String(ml));
  try { localStorage.setItem("silhouette-lang", ml ? "ml" : "en"); } catch (e) {}
}
langBtn.addEventListener("click", () => setLang(doc.dataset.lang !== "ml"));
if (VIDEO) setLang(new URLSearchParams(location.search).get("lang") === "ml");
else {
  try { setLang(localStorage.getItem("silhouette-lang") === "ml"); } catch (e) { setLang(false); }
}

let t = 0;
let live = 0;
let last = performance.now();
let shown = null;
let visible = true;
new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(screenEl);
const performanceEl = document.querySelector(".performance");

function frame(ms) {
  const dt = clamp((ms - last) / 1000, 0, 0.1);
  last = ms;
  live = VIDEO ? ms / 1000 : live + dt;
  const { t: target, current } = targetTime();
  t = VIDEO ? target : t + (target - t) * Math.min(1, dt * 5);
  if (Math.abs(target - t) < 0.002) t = target;
  if (VIDEO) while (filmComet < FILM_COMETS.length && ms / 1000 >= FILM_COMETS[filmComet]) {
    filmComet++;
    shootComet();
  }

  const view = t >= BACK[0] && t < BACK[1] ? "backstage" : "audience";
  if (S.project.screen.view !== view) {
    S.project.screen.view = view;
    applyScreen();
    placeCamera();
    screenEl.classList.remove("turn");
    void screenEl.offsetWidth; // restart the turn animation
    screenEl.classList.add("turn");
  }
  setInk(clothLight(t));
  const dawn = clamp((t - 0.6) / 2.6, 0, 1); // the moon goes as the lamps come up
  night.style.opacity = (1 - dawn * dawn * (3 - 2 * dawn)).toFixed(3);
  bar.classList.toggle("away", t < 0.9);

  // The words of the playing chapter are on the cloth; none while the opening title stands, or once the night is over.
  const over = !VIDEO && performanceEl.getBoundingClientRect().bottom < window.innerHeight * 0.6;
  const on = over || (current === chapters[0] && t < (VIDEO ? 1 : 2.4)) ? null : current;
  if (on !== shown) {
    shown = on;
    for (const ch of chapters) ch.classList.toggle("on", ch === on);
    if (on) dropLeaves(3);
  }
  fill.style.transform = `scaleX(${(t / END).toFixed(4)})`;
  cue.classList.toggle("gone", window.scrollY > 40);
  if (visible || VIDEO) renderStage(t, live);
  if (!VIDEO) requestAnimationFrame(frame);
}
if (!VIDEO) requestAnimationFrame(frame);

// The renderer moves the film to a moment, then captures it. CSS animations and transitions are paused and set to
// the same clock, each counted from the moment it began, so every frame is exact.
const born = new Map();
window.__seek = (sec) => {
  clockMs = sec * 1000;
  frame(clockMs);
  for (const a of document.getAnimations()) {
    if (!born.has(a)) born.set(a, clockMs);
    a.pause();
    a.currentTime = Math.max(0, clockMs - born.get(a));
  }
  return t;
};
// A camera for clean footage: frame part of the stage, `zoom` times closer, centred on stage x `cx` (0 to 1920).
// The figures keep their size against the cloth's height; the lamps spread out as they do on a real 42-foot stage.
let camera = null;
function placeCamera() {
  if (!camera) return;
  // The back view is mirrored, so the same place on the stage is at the other end of the screen.
  const x = S.project.screen.view === "backstage" ? 1920 - camera.cx : camera.cx;
  screenEl.style.right = "auto";
  screenEl.style.width = `${camera.zoom * 100}%`;
  screenEl.style.left = `${50 - (x / 1920) * camera.zoom * 100}%`;
}
window.__camera = (zoom, cx) => {
  camera = { zoom, cx };
  placeCamera();
};
window.__seekShow = (showT, sec) => {
  showOverride = showT;
  return window.__seek(sec);
};
window.__ready = Promise.all([document.fonts.ready, ...[...document.images].map((im) => im.decode().catch(() => {}))]);
window.addEventListener("resize", fitScreen);

// ── Sound: the Tholpavakoothu recording, only when asked for ──
const music = document.getElementById("music");
const sound = document.getElementById("sound");
sound.addEventListener("click", () => {
  const on = music.paused;
  if (on) {
    music.volume = 0.6;
    music.play().catch(() => {});
  } else music.pause();
  sound.setAttribute("aria-label", on ? "Turn the music off" : "Play the music");
  sound.setAttribute("aria-pressed", String(on));
});
