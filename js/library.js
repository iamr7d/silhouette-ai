// Built-in figures, traditions, light types, effects, sounds and movements.
import { FW, K, S, getProp, makeProps, snapT, sortKeys, uid, valueAt } from "./core.js";

// Tholpavakoothu figures photographed in the Museu do Oriente, Lisbon (Wikimedia Commons, CC0).
export const BUILTIN_IMAGES = [
  { id: "img:rama", name: "Rama", src: "assets/puppets/rama.webp", flip: false, source: "Tholpavakoothu figure" },
  { id: "img:ravana", name: "Ravana", src: "assets/puppets/ravana.webp", flip: true, source: "Tholpavakoothu figure" },
  { id: "img:sita", name: "Sita", src: "assets/puppets/sita.webp", flip: true, source: "Tholpavakoothu figure" },
  { id: "img:ganesh", name: "Ganesh", src: "assets/puppets/ganesh.webp", flip: false, source: "Tholpavakoothu figure" },
  { id: "img:vishnu", name: "Vishnu", src: "assets/puppets/vishnu.webp", flip: false, source: "Tholpavakoothu figure" },
  // More figures from the same museum and photographer (CC0), cut out with tools/cutout_puppets.py.
  ...[
    ["lakshmana", "Lakshmana", "Ravana Chhaya figure"],
    ["hanuman-rc", "Hanuman (Ravana Chhaya)", "Ravana Chhaya figure"],
    ["tree", "Tree", "Ravana Chhaya figure"],
    ["maricha", "Maricha, the golden deer", "Tholu bommalata figure"],
    ["hanuman", "Hanuman", "Indian shadow puppet"],
    ["indrajit", "Indrajit", "Indian shadow puppet"],
    ["vibhishana", "Vibhishana", "Indian shadow puppet"],
    ["ravana-hermit", "Ravana as a hermit", "Indian shadow puppet"],
    ["rakshasa", "Rakshasa", "Indian shadow puppet"],
    ["rakshasa-2", "Rakshasa (second)", "Indian shadow puppet"],
    ["giant", "Giant of Lanka", "Indian shadow puppet"],
    ["warrior", "Warrior of Lanka", "Indian shadow puppet"],
    ["elephant", "War elephant", "Indian shadow puppet"],
    ["tiger", "Tiger", "Indian shadow puppet"],
    ["chariot", "Rama in his chariot", "Indian shadow puppet"],
    ["clown", "Clown", "Indian shadow puppet"],
  // These are painted, translucent figures; tools/punch_puppets.py gives each a solid, punched-leather shadow like
  // a Tholpavakoothu figure's (the originals stay in assets/puppets/).
  ].map(([file, name, source]) => ({ id: `img:${file}`, name, src: `assets/puppets/punched/${file}.webp`, flip: false, source })),
];

// Sounds are generated in the browser (see audio.js), so they carry no licence terms.
export const SOUNDS = [
  // The Tholpavakoothu recording played on the portfolio's ShadowStage section.
  { id: "snd:recording", name: "Tholpavakoothu recording", loop: true, src: "assets/audio/pavakkoothu.mp3" },
  { id: "snd:koothu-bgm", name: "Koothu night (background score)", loop: false, length: 45 },
  { id: "snd:drum", name: "Drum loop", loop: true, length: 4 },
  { id: "snd:drone", name: "Drone", loop: true, length: 8 },
  { id: "snd:bell", name: "Bell", loop: false, length: 4 },
  { id: "snd:gong", name: "Gong", loop: false, length: 6 },
  { id: "snd:wind", name: "Wind", loop: true, length: 8 },
];

export const FX_TYPES = {
  smoke: { label: "Smoke", color: "#8a8f99" },
  sparks: { label: "Sparks", color: "#e0b341" },
};

export const PALETTE = ["#8f7bd8", "#cf6f6f", "#3fae9a", "#d6a246", "#4f8fd6", "#b46fc0", "#6fae4f", "#c98a4f"];

// flame: draws a visible flame at the lamp; body: "deepam" draws the brass lamp under it.
export const LIGHT_TYPES = {
  koothu: { label: "Koothu lamp (earthen bowl)", short: "Clay lamp", color: "#ff8a30", size: 90, intensity: 110, flicker: 30, flame: true, body: "bowl" },
  deepam: { label: "Deepam (brass oil lamp)", short: "Brass deepam", color: "#ffb062", size: 95, intensity: 100, flicker: 25, flame: true, body: "deepam" },
  oil: { label: "Oil lamp", short: "Oil lamp", color: "#ffb062", size: 100, intensity: 100, flicker: 22, flame: true },
  candle: { label: "Candle", short: "Candle", color: "#ffa64d", size: 70, intensity: 70, flicker: 35, flame: true },
  bulb: { label: "Incandescent bulb", short: "Bulb", color: "#ffd9a8", size: 120, intensity: 110, flicker: 0 },
  led: { label: "LED, warm white", short: "LED warm", color: "#fff1dc", size: 110, intensity: 120, flicker: 0 },
  daylight: { label: "LED, daylight", short: "LED daylight", color: "#eef3ff", size: 110, intensity: 120, flicker: 0 },
  spot: { label: "Spotlight", short: "Spotlight", color: "#fff1d6", size: 45, intensity: 180, flicker: 0 },
  gel: { label: "Coloured gel", short: "Gel", color: "#4f7dff", size: 140, intensity: 90, flicker: 0 },
};

export function makeLight(type, x, y, extra = {}) {
  const d = LIGHT_TYPES[type];
  return {
    id: uid("light"),
    name: extra.name || d.label,
    type,
    color: extra.color || d.color,
    enabled: true,
    props: makeProps("light", {
      position: [Math.round(x), Math.round(y)],
      intensity: [extra.intensity ?? d.intensity],
      size: [extra.size ?? d.size],
      flicker: [d.flicker],
    }),
  };
}

export function lampRow(type, count, y, from = 150, to = 1770) {
  return Array.from({ length: count }, (_, i) =>
    makeLight(type, count === 1 ? 960 : from + ((to - from) * i) / (count - 1), y, { name: `Lamp ${i + 1}` })
  );
}

// Starting setups. Lamp counts and placings are approximate, for a starting point.
export const TRADITIONS = {
  tholpavakoothu: {
    label: "Tholpavakoothu (Kerala)",
    style: "real",
    cloth: "#f1e6cf",
    // Small earthen or coconut-shell lamps in a row on the beam, each with one flame.
    // The lamp beam stands about 1.3 m up, so the flames show at the figures' middle.
    lights: () => lampRow("koothu", 21, 700),
    view: "audience",
    // The koothumadam is about 42 ft (11.4 m) long and the cloth runs its length; the cloth height is an estimate.
    screen: { w: 11.4, h: 2.4, figure: 55, note: "Stage about 42 ft (11.4 m) long, with the cloth along its length. Cloth height estimated." },
    about: "Tholpavakoothu takes its name from thol, leather, pava, doll, and koothu, play. It is shadow puppetry practised in Kerala and Tamil Nadu; in Kerala, in the Palakkad, Thrissur and Malappuram districts, it is played as an offering to the goddess Bhadrakali. It is performed in a temple theatre, the koothumadam, a long stage with a white cloth stretched across it. Behind the cloth, 21 lamps of halved coconut shell or clay sit evenly along a wooden beam, the vilakku madam, and the puppets are held flat against the cloth on two sticks, one for the body and a thinner one for a limb. The text is the Kamba Ramayana, sung by the pulavar, the lead puppeteer.",
    link: "https://en.wikipedia.org/wiki/Tholpavakoothu",
  },
  wayang: {
    label: "Wayang kulit (Java, Bali)",
    style: "real",
    cloth: "#efe6d4",
    lights: () => [makeLight("oil", 960, 380, { name: "Blencong", size: 260, intensity: 150 })],
    screen: { w: 5, h: 1.6, figure: 70, note: "Estimate: screen sizes vary by troupe." },
    about: "Shadow theatre of flat, finely perforated and painted hide figures. The dalang performs behind a white screen (kelir) lit by a single oil lamp, the blencong, hung above.",
    link: "https://en.wikipedia.org/wiki/Wayang_kulit",
  },
  chinese: {
    label: "Chinese shadow play (piying)",
    style: "translucent",
    cloth: "#f5efe2",
    lights: () => [makeLight("bulb", 700, 640), makeLight("bulb", 1220, 640)],
    screen: { w: 1.8, h: 1.2, figure: 60, note: "Estimate: screen sizes vary by troupe." },
    about: "Figures cut from thin, translucent, coloured leather with jointed limbs, worked on rods against a lit screen, so the colours show through.",
    link: "https://en.wikipedia.org/wiki/Shadow_play",
  },
  karagoz: {
    label: "Karagöz (Ottoman, Turkish)",
    style: "translucent",
    cloth: "#f3ecdc",
    lights: () => [makeLight("oil", 960, 560, { size: 220, intensity: 140 })],
    screen: { w: 1.1, h: 0.8, figure: 55, note: "About 1 to 1.1 m wide by 0.6 to 0.8 m high." },
    about: "Comic shadow play built around Karagöz and Hacivat, with translucent, coloured hide figures held on rods against a white screen lit from behind.",
    link: "https://en.wikipedia.org/wiki/Karag%C3%B6z_and_Hacivat",
  },
  tholu: {
    label: "Tholu bommalata (Andhra Pradesh)",
    style: "translucent",
    cloth: "#f4ead6",
    lights: () => lampRow("oil", 3, 900, 480, 1440),
    screen: { w: 5, h: 2, figure: 75, note: "Estimate: screen sizes vary by troupe." },
    about: "Leather shadow theatre of Andhra Pradesh with large, translucent, brightly coloured figures, telling stories from the epics.",
    link: "https://en.wikipedia.org/wiki/Tholu_bommalata",
  },
  togalu: {
    label: "Togalu gombeyaata (Karnataka)",
    style: "translucent",
    cloth: "#f4ead6",
    lights: () => lampRow("oil", 3, 900, 480, 1440),
    screen: { w: 4, h: 1.6, figure: 70, note: "Estimate: screen sizes vary by troupe." },
    about: "Leather shadow theatre of Karnataka, with coloured, translucent figures.",
    link: "https://en.wikipedia.org/wiki/Togalu_gombeyaata",
  },
  ravanachhaya: {
    label: "Ravanachhaya (Odisha)",
    style: "real",
    cloth: "#efe5d2",
    lights: () => [makeLight("oil", 960, 860, { size: 160 })],
    screen: { w: 3, h: 1.5, figure: 60, note: "Estimate: screen sizes vary by troupe." },
    about: "Shadow theatre of Odisha, with undyed leather figures that cast dark shadows, telling stories from the Ramayana.",
    link: "https://en.wikipedia.org/wiki/Ravanachhaya",
  },
  custom: {
    label: "Custom",
    style: "real",
    cloth: "#f4efe6",
    lights: () => [makeLight("led", 960, 700)],
    screen: { w: 3.2, h: 1.8, figure: 80, note: "Your own size." },
    about: "Set up your own screen, lights and figures.",
    link: "",
  },
};

export function screenFor(key) {
  const tr = TRADITIONS[key];
  return {
    cloth: tr.cloth, style: tr.style, master: 100, captions: false, view: tr.view || "audience",
    w: tr.screen.w, h: tr.screen.h, figure: tr.screen.figure,
  };
}

export function emptyProject(key = "tholpavakoothu") {
  return {
    version: 3,
    title: "Untitled show",
    synopsis: "",
    tradition: key,
    duration: 60,
    screen: screenFor(key),
    audio: { master: 80 },
    assets: {},
    items: [],
    lights: TRADITIONS[key].lights(),
    scenes: [],
    motors: { baud: 115200, send: true, outputs: [], inputs: [] },
  };
}

// ── Items ───────────────────────────────────────────────
export function makePuppet(asset, name, colorIndex, props = {}, opts = {}) {
  return {
    id: uid("item"),
    kind: "puppet",
    name,
    asset,
    color: PALETTE[colorIndex % PALETTE.length],
    clip: { start: opts.start ?? 0, end: opts.end ?? 30, offset: 0 },
    enabled: true,
    locked: false,
    flip: Boolean(opts.flip),
    render: opts.render || "real",
    parts: [],
    props: makeProps("puppet", props),
  };
}

export function makeFx(type, start, end) {
  return {
    id: uid("item"),
    kind: "fx",
    fx: type,
    name: FX_TYPES[type].label,
    color: FX_TYPES[type].color,
    clip: { start, end, offset: 0 },
    enabled: true,
    locked: false,
    props: makeProps("fx"),
  };
}

// A title card: the UAL CCI logo, a small heading, a title and body lines, set in gold.
// In body text, *words* are set in capitals as names.
export function makeTitle(name, card, start, end) {
  return {
    id: uid("item"),
    kind: "title",
    name,
    card: { logo: false, kicker: "", title: "", body: "", ...card },
    color: "#c9a24a",
    clip: { start, end, offset: 0 },
    enabled: true,
    locked: false,
    props: makeProps("title"),
  };
}

// Fade in, hold, fade out across a clip.
export function fadeCard(it, fade = 0.7) {
  const { start, end } = it.clip;
  it.props.opacity.keys = [K(start, [0]), K(start + fade, [100]), K(end - fade, [100]), K(end, [0])];
  return it;
}

export function makeAudio(asset, name, start, end, loop, volume = 100) {
  return {
    id: uid("item"),
    kind: "audio",
    name,
    asset,
    color: "#3d9a5f",
    clip: { start, end, offset: 0 },
    enabled: true,
    locked: false,
    loop,
    props: makeProps("audio", { volume: [volume] }),
  };
}

// The default show: a 28-second study following documented practice. The night opens with an invocation to
// Ganapati; figures enter and leave from the wings and stay pressed to the cloth, except Ravana, who comes in
// from near the lamps, his shadow huge and soft, and sharpens as he reaches the cloth. The lamps are lit at the
// start and burn low at the end. Scene timings match the background score in audio.js.
export function defaultProject() {
  const Y = 770; // figures stand on the lower edge of the cloth
  const OFF_RIGHT = 2420; // just off the cloth, right wing
  const OFF_LEFT = -460; // just off the cloth, left wing

  const ganesh = makePuppet("img:ganesh", "Ganapati", 3, { position: [960, 640] }, { start: 0, end: 7 });
  ganesh.props.opacity.keys = [K(0.4, [0]), K(2.4, [100]), K(5.4, [100]), K(7, [0])];
  ganesh.props.depth.keys = [K(5.4, [0]), K(7, [50])];
  ganesh.props.rotation.keys = [K(2.4, [0]), K(3.4, [2]), K(4.4, [-2]), K(5.4, [0])];

  const rama = makePuppet("img:rama", "Rama", 0, { position: [620, Y] }, { start: 6.6, end: 28 });
  rama.props.position.keys = [
    K(7, [OFF_LEFT, Y]), K(9.6, [620, Y]), K(21.2, [620, Y]), K(21.7, [800, Y]), K(22.4, [700, Y]),
    K(24.4, [700, Y]), K(25.2, [800, Y - 12]), K(26, [900, Y]), K(26.8, [1000, Y - 12]), K(27.6, [1100, Y]),
  ];
  rama.props.rotation.keys = [K(21.2, [0]), K(21.7, [7]), K(22.4, [0]), K(24.4, [0]), K(25.2, [2]), K(26, [-1]), K(26.8, [2]), K(27.6, [0])];

  const sita = makePuppet("img:sita", "Sita", 2, { position: [1250, Y] }, { start: 7, end: 23.4, flip: true });
  sita.props.position.keys = [K(7.6, [OFF_RIGHT, Y]), K(10.2, [1250, Y]), K(19.8, [1250, Y]), K(21.4, [1700, Y - 40]), K(23.2, [OFF_RIGHT, Y - 20])];
  sita.props.rotation.keys = [K(11, [0]), K(11.7, [-10]), K(12.4, [-10]), K(13.1, [0]), K(16.6, [0])];
  for (let i = 0; i <= 10; i++) sita.props.rotation.keys.push(K(16.7 + i * 0.1, [i === 10 ? 0 : i % 2 ? 2.5 : -2.5], "linear"));

  const ravana = makePuppet("img:ravana", "Ravana", 1, { position: [1620, Y] }, { start: 14.4, end: 24, flip: true });
  ravana.props.position.keys = [K(14.4, [OFF_RIGHT, Y]), K(16.6, [1620, Y]), K(18.6, [1620, Y]), K(19.3, [1440, Y]), K(20, [1460, Y]), K(23.8, [OFF_RIGHT + 100, Y])];
  ravana.props.depth.keys = [K(14.4, [75]), K(17.2, [0])];
  ravana.props.rotation.keys = [K(18.6, [0]), K(19.3, [-6]), K(20, [0])];

  // The opening cards come first; the show starts when they end.
  const O = INTRO;
  for (const it of [ganesh, rama, sita, ravana]) shiftItem(it, O);

  const lights = TRADITIONS.tholpavakoothu.lights();
  for (const lamp of lights) {
    lamp.props.intensity.keys = [K(0, [14]), K(O, [25]), K(O + 3, [110]), K(O + 25.6, [110]), K(O + 28, [45])];
  }

  const titles = [
    // The gold logo animation rendered for the Joy intro (VP9 with alpha, 5.2 s).
    makeTitle("UAL Creative Computing Institute", { logo: true, video: "assets/ual_cci_logo_gold.webm", kicker: "London" }, 0, 5.4),
    makeTitle("With thanks", {
      kicker: "With thanks",
      body: "*Vipin Viswanathan Pulavar*, fifteenth-generation Tholpavakoothu artist, for the first lessons and his mentoring\n*Hooman Samani*, UAL Creative Computing Institute, for guidance on robotics",
    }, 5.4, 10.4),
    makeTitle("With respect", {
      kicker: "With respect",
      body: "To the pulavars, puppeteers and lamp keepers of Kerala's koothumadams,\nwho made this art and have carried it, night after night, for generations",
    }, 10.4, 13.8),
    makeTitle("Title", { kicker: "Silhouette.ai · Rahul Raj", title: "Tholpavakoothu", body: "Sita is taken" }, 13.8, O),
  ].map((t) => fadeCard(t, t.card.video ? 0.25 : 0.7)); // the logo animation draws itself on, so it barely fades

  // Music: the real Tholpavakoothu recording, faded in and out.
  const recording = recordingTrack(O + 28);

  return {
    version: 3,
    title: "Sita is taken",
    synopsis: "A short study after the Ramayana episode, opening with thanks: the invocation to Ganapati, Rama and Sita in the forest, Ravana's coming, and Rama left alone as the lamps burn low.",
    tradition: "tholpavakoothu",
    duration: O + 28,
    screen: { ...screenFor("tholpavakoothu"), captions: true },
    audio: { master: 85 },
    assets: {},
    items: [ganesh, rama, sita, ravana, ...titles, recording],
    lights,
    scenes: [
      { id: uid("scene"), title: "Opening", start: 0, end: O, narration: "" },
      { id: uid("scene"), title: "Invocation (before the story)", start: O, end: O + 7, narration: "The lamps are lit and Ganapati is called first, so that the night can begin." },
      { id: uid("scene"), title: "Rama and Sita", start: O + 7, end: O + 14.4, narration: "Rama and Sita in their forest home." },
      { id: uid("scene"), title: "Ravana", start: O + 14.4, end: O + 24, narration: "Ravana comes, his shadow looming over the cloth, and carries Sita away." },
      { id: uid("scene"), title: "Rama alone", start: O + 24, end: O + 28, narration: "Rama is left to search for her as the lamps burn low." },
    ],
    motors: { baud: 115200, send: true, outputs: [], inputs: [] },
  };
}

// Length of the opening cards, in seconds; the score in audio.js uses the same value.
export const INTRO = 17;
// When each opening card appears; the generated score marks them with a soft cymbal.
export const CARD_CUES = [0.2, 5.4, 10.4, 13.8];

export function recordingTrack(length) {
  const rec = makeAudio("snd:recording", "Tholpavakoothu recording", 0, length, true, 90);
  rec.props.volume.keys = [K(0, [0]), K(1.5, [90]), K(length - 2, [90]), K(length, [0])];
  return rec;
}

// Lamps are named "Lamp 1" … in order; rename the long names older shows gave them ("Oil lamp 3").
export function tidyLights(p) {
  const labels = Object.values(LIGHT_TYPES).map((t) => t.label);
  for (const L of p.lights) {
    const m = /^(.*) (\d+)$/.exec(L.name);
    if (m && labels.includes(m[1])) L.name = `Lamp ${m[2]}`;
  }
  return p;
}

// Every show plays the real recording: add it to a show saved before it existed, and mute generated music there.
export function withRecording(p) {
  if (p.items.some((it) => it.asset === "snd:recording")) return p;
  for (const it of p.items) if (it.kind === "audio" && String(it.asset).startsWith("snd:")) it.enabled = false;
  p.items.push(recordingTrack(p.duration));
  return p;
}

function shiftItem(it, dt) {
  it.clip.start += dt;
  it.clip.end += dt;
  for (const p of Object.values(it.props)) for (const k of p.keys) k.t += dt;
}

// ── Movements ───────────────────────────────────────────
const offscreen = (x) => x < -200 || x > FW + 200;

export const MOVES = [
  { id: "enter-left", label: "Enter from left", dur: 2.5, run(m) {
    const [x, y] = m.cur("position");
    m.key("position", 0, [-460, y]);
    m.key("position", 2.5, [offscreen(x) ? 560 : x, y]);
  } },
  { id: "enter-right", label: "Enter from right", dur: 2.5, run(m) {
    const [x, y] = m.cur("position");
    m.key("position", 0, [FW + 460, y]);
    m.key("position", 2.5, [offscreen(x) ? 1360 : x, y]);
  } },
  { id: "exit-left", label: "Exit to left", dur: 2.5, run(m) {
    const [x, y] = m.cur("position");
    m.key("position", 0, [x, y]);
    m.key("position", 2.5, [-460, y]);
  } },
  { id: "exit-right", label: "Exit to right", dur: 2.5, run(m) {
    const [x, y] = m.cur("position");
    m.key("position", 0, [x, y]);
    m.key("position", 2.5, [FW + 460, y]);
  } },
  { id: "walk", label: "Walk", dur: 4, run(m) {
    const [x, y] = m.cur("position");
    const [r] = m.cur("rotation");
    const d = m.toward();
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      m.key("position", f * 4, [x + d * 420 * f, y - (i % 2 ? 14 : 0)]);
      m.key("rotation", f * 4, [i === 8 ? r : r + (i % 2 ? 2 : -1) * d]);
    }
  } },
  { id: "bow", label: "Bow", dur: 1.8, run(m) {
    const [x, y] = m.cur("position");
    const [r] = m.cur("rotation");
    const d = m.toward();
    m.key("rotation", 0, [r]);
    m.key("rotation", 0.7, [r + 14 * d]);
    m.key("rotation", 1.1, [r + 14 * d]);
    m.key("rotation", 1.8, [r]);
    m.key("position", 0, [x, y]);
    m.key("position", 0.7, [x, y + 24]);
    m.key("position", 1.8, [x, y]);
  } },
  { id: "strike", label: "Strike (lunge)", dur: 1.2, run(m) {
    const [x, y] = m.cur("position");
    const [r] = m.cur("rotation");
    const d = m.toward();
    m.key("position", 0, [x, y]);
    m.key("position", 0.15, [x - 30 * d, y]);
    m.key("position", 0.45, [x + 150 * d, y]);
    m.key("position", 1.2, [x, y]);
    m.key("rotation", 0, [r]);
    m.key("rotation", 0.45, [r + 7 * d]);
    m.key("rotation", 1.2, [r]);
  } },
  { id: "recoil", label: "Struck (recoil)", dur: 1.4, run(m) {
    const [x, y] = m.cur("position");
    const [dp] = m.cur("depth");
    const d = m.toward();
    m.key("depth", 0, [dp]);
    m.key("depth", 0.3, [Math.min(100, dp + 50)]);
    m.key("depth", 1.4, [dp]);
    m.key("position", 0, [x, y]);
    m.key("position", 0.3, [x - 70 * d, y]);
    m.key("position", 1.4, [x, y]);
  } },
  { id: "loom", label: "Loom (draw back from cloth)", dur: 1.2, run(m) {
    const [dp] = m.cur("depth");
    m.key("depth", 0, [dp]);
    m.key("depth", 1.2, [70]);
  } },
  { id: "press", label: "Press to the cloth", dur: 0.8, run(m) {
    const [dp] = m.cur("depth");
    m.key("depth", 0, [dp]);
    m.key("depth", 0.8, [0]);
  } },
  { id: "fly", label: "Fly across", dur: 3, run(m) {
    const [x, y] = m.cur("position");
    const [r] = m.cur("rotation");
    const d = m.toward();
    m.key("position", 0, [x, y]);
    m.key("position", 1.5, [x + 450 * d, y - 260]);
    m.key("position", 3, [x + 900 * d, y]);
    m.key("rotation", 0, [r]);
    m.key("rotation", 1.5, [r - 6 * d]);
    m.key("rotation", 3, [r]);
  } },
  { id: "tremble", label: "Tremble", dur: 1.2, run(m) {
    const [r] = m.cur("rotation");
    for (let i = 0; i <= 12; i++) m.key("rotation", i * 0.1, [i === 12 ? r : r + (i % 2 ? 2.5 : -2.5)], "linear");
  } },
  { id: "sway", label: "Sway", dur: 4, run(m) {
    const [r] = m.cur("rotation");
    [0, 2, 0, -2, 0].forEach((dr, i) => m.key("rotation", i, [r + dr]));
  } },
  { id: "fade-in", label: "Fade in", dur: 1.5, run(m) {
    const [o] = m.cur("opacity");
    m.key("opacity", 0, [0]);
    m.key("opacity", 1.5, [o > 0 ? o : 100]);
  } },
  { id: "fade-out", label: "Fade out", dur: 1.5, run(m) {
    const [o] = m.cur("opacity");
    m.key("opacity", 0, [o]);
    m.key("opacity", 1.5, [0]);
  } },
  { id: "swing-parts", label: "Swing jointed parts", dur: 2, needsParts: true, run(m, owner) {
    for (const part of owner.parts || []) {
      const path = `part/${part.id}/rotation`;
      const [r] = m.cur(path);
      [0, 0.5, 1, 1.5, 2].forEach((tt, i) => m.key(path, tt, [r + (i % 2 ? -35 : 0)]));
    }
  } },
];

export const LIGHT_MOVES = [
  { id: "flare", label: "Flare", dur: 0.8, run(m) {
    const [i] = m.cur("intensity");
    m.key("intensity", 0, [i]);
    m.key("intensity", 0.2, [Math.min(300, i * 2 + 20)]);
    m.key("intensity", 0.8, [i]);
  } },
  { id: "raise", label: "Raise to full", dur: 2, run(m) {
    m.key("intensity", 0, m.cur("intensity"));
    m.key("intensity", 2, [100]);
  } },
  { id: "dim", label: "Dim down", dur: 2, run(m) {
    m.key("intensity", 0, m.cur("intensity"));
    m.key("intensity", 2, [25]);
  } },
  { id: "blackout", label: "Blackout", dur: 1, run(m) {
    m.key("intensity", 0, m.cur("intensity"));
    m.key("intensity", 1, [0]);
  } },
];

// Writes a movement's keyframes from the playhead, replacing keys inside its span.
export function applyMove(owner, move) {
  const t0 = snapT(S.t);
  const touched = new Set();
  const m = {
    cur: (path) => valueAt(getProp(owner, path), t0),
    toward: () => (valueAt(getProp(owner, "position"), t0)[0] < FW / 2 ? 1 : -1),
    key(path, dt, v, i = "ease") {
      const p = getProp(owner, path);
      if (!p) return;
      if (!touched.has(path)) {
        touched.add(path);
        p.keys = p.keys.filter((k) => k.t < t0 - 1e-6 || k.t > t0 + move.dur + 1e-6);
      }
      const tt = snapT(t0 + dt);
      const existing = p.keys.find((k) => Math.abs(k.t - tt) < 1e-6);
      if (existing) {
        existing.v = v.slice();
        existing.i = i;
      } else p.keys.push(K(tt, v, i));
      sortKeys(p);
    },
  };
  move.run(m, owner);
}
