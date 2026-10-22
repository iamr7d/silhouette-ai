// Panels: Effect Controls, Show, Story, Lights, the Project bin and Library, and the blue editable values.
import {
  $, S, FPS, FW, FH, GROUPS, ICON, K, checkpoint, clamp, commit, dropCheckpoint, emit, esc, getProp, itemById, keyIndexAt, kindOf,
  lightById, ownerOf, parseTc, propDef, propDefault, round1, selectedOwner, setValue, snapT, sortKeys, tc, toast, uid, valueAt,
} from "./core.js";
import { BUILTIN_IMAGES, FX_TYPES, LIGHT_MOVES, LIGHT_TYPES, MOVES, PALETTE, SOUNDS, TRADITIONS, applyMove, makeLight } from "./library.js";
import {
  addAudio, addFx, addLight, addLightRow, addPuppet, addTitle, applyTradition, moveTrack, removeSelected, select, setClip,
} from "./actions.js";
import { imageURL } from "./stage.js";
import { CUTS, canParent, cutFigure, cutParts, isCut, removePart } from "./rig.js";
import { previewSound } from "./audio.js";

// ── Blue values: drag to change, click to type ──────────
const FIELDS = {
  master: { step: 0.5, min: 0, max: 300, digits: 0, get: () => S.project.screen.master, set: (v) => { S.project.screen.master = Math.round(v); } },
  audioMaster: { step: 0.5, min: 0, max: 200, digits: 0, get: () => S.project.audio.master, set: (v) => { S.project.audio.master = Math.round(v); } },
  duration: { step: 1 / FPS, min: 5, max: 600, tc: true, get: () => S.project.duration, set: (v) => { S.project.duration = snapT(v); } },
  screenW: { step: 0.01, min: 0.3, max: 30, digits: 2, get: () => S.project.screen.w, set: (v) => { S.project.screen.w = Math.round(v * 100) / 100; } },
  screenH: { step: 0.01, min: 0.2, max: 10, digits: 2, get: () => S.project.screen.h, set: (v) => { S.project.screen.h = Math.round(v * 100) / 100; } },
  figure: { step: 0.25, min: 10, max: 100, digits: 0, get: () => S.project.screen.figure, set: (v) => { S.project.screen.figure = Math.round(v); } },
};

const LOOKS = [
  ["real", "Real colour"],
  ["translucent", "Translucent, lit from behind"],
  ["silhouette", "Shadow only"],
];
const lookOptions = (cur) => LOOKS.map(([v, l]) => `<option value="${v}"${(cur === "colour" ? "translucent" : cur) === v ? " selected" : ""}>${l}</option>`).join("");
const PART_FIELDS = { pivotX: ["pivot", 0], pivotY: ["pivot", 1], anchorX: ["anchor", 0], anchorY: ["anchor", 1] };

function ownerFor(el) {
  const ref = el.dataset.owner;
  if (!ref) return selectedOwner();
  const [type, id] = ref.split(":");
  return type === "light" ? lightById(id) : itemById(id);
}

export function hotSpec(el) {
  const kind = el.dataset.hot;
  if (kind === "prop") {
    const owner = ownerFor(el);
    const path = el.dataset.path;
    if (!owner || !getProp(owner, path)) return null;
    const dim = Number(el.dataset.dim || 0);
    const d = path.startsWith("part/") ? { step: 0.5, digits: 1, min: -360, max: 360 } : propDef(path);
    return {
      step: d.step,
      fmt: (v) => v.toFixed(d.digits),
      get: () => valueAt(getProp(owner, path), S.t)[dim],
      set: (v) => {
        const cur = valueAt(getProp(owner, path), S.t);
        cur[dim] = round1(clamp(v, d.min, d.max));
        setValue(owner, path, cur);
      },
    };
  }
  if (kind === "clip") {
    const it = selectedOwner();
    if (!it || !it.clip) return null;
    const w = el.dataset.which;
    return { step: 1 / FPS, fmt: tc, parse: parseTc, get: () => it.clip[w] || 0, set: (v) => setClip(it, w, v) };
  }
  if (kind === "field") {
    const f = FIELDS[el.dataset.field];
    return { step: f.step, fmt: f.tc ? tc : (v) => v.toFixed(f.digits), parse: f.tc ? parseTc : null, get: f.get, set: (v) => f.set(clamp(v, f.min, f.max)) };
  }
  if (kind === "part") {
    const it = selectedOwner();
    const part = it && (it.parts || []).find((p) => p.id === el.dataset.part);
    if (!part) return null;
    if (el.dataset.field === "size") {
      return { step: 0.25, fmt: (v) => v.toFixed(1), get: () => part.size, set: (v) => { part.size = round1(clamp(v, 1, 300)); } };
    }
    const [key, i] = PART_FIELDS[el.dataset.field];
    return { step: 0.25, fmt: (v) => v.toFixed(1), get: () => part[key][i], set: (v) => { part[key][i] = round1(clamp(v, -50, 150)); } };
  }
  if (kind === "hand") {
    const it = selectedOwner();
    if (!it || it.kind !== "puppet") return null;
    const i = Number(el.dataset.i);
    return {
      step: 0.25, fmt: (v) => v.toFixed(1), get: () => (it.hand || [16, 14])[i],
      set: (v) => { it.hand = (it.hand || [16, 14]).slice(); it.hand[i] = round1(clamp(v, -20, 120)); },
    };
  }
  if (kind === "scene") {
    const sc = S.project.scenes.find((s) => s.id === el.dataset.scene);
    if (!sc) return null;
    const w = el.dataset.which;
    return {
      step: 1 / FPS, fmt: tc, parse: parseTc, get: () => sc[w],
      set: (v) => {
        const x = snapT(clamp(v, 0, S.project.duration));
        if (w === "start") sc.start = Math.min(x, sc.end - 1 / FPS);
        else sc.end = Math.max(x, sc.start + 1 / FPS);
      },
    };
  }
  return null;
}

export function tickHots(active) {
  document.querySelectorAll(".hot").forEach((el) => {
    if (el === active || el.classList.contains("editing")) return;
    const s = hotSpec(el);
    if (s) el.textContent = s.fmt(s.get());
  });
}

export function startTyping(el) {
  const spec = hotSpec(el);
  if (!spec) return;
  const input = document.createElement("input");
  input.className = "hot-input";
  input.value = el.textContent;
  el.classList.add("editing");
  el.after(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    if (ok) {
      const v = spec.parse ? spec.parse(input.value) : parseFloat(input.value);
      if (v != null && Number.isFinite(v)) {
        checkpoint();
        spec.set(v);
        input.remove();
        commit();
        return;
      }
    }
    input.remove();
    el.classList.remove("editing");
    emit("tick");
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

// ── Tabs ────────────────────────────────────────────────
const TABS = ["effects", "show", "story", "lights", "motors"];
export function showTab(name) {
  document.querySelectorAll(".tab[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  for (const n of TABS) $(`tab-${n}`).hidden = n !== name;
  emit("tick");
}

// ── Effect Controls ─────────────────────────────────────
export function rangeOf(sel, owner) {
  return sel.type === "light" ? [0, S.project.duration] : [owner.clip.start, owner.clip.end];
}

function groupHead(id, label, fx) {
  return `<div class="ec-row grp${S.collapsed[id] ? " collapsed" : ""}"><div class="ec-l">
    <button class="ib xs chev" data-act="group" data-group="${id}" title="Show or hide">${ICON.chevron}</button>
    ${fx ? '<span class="fxb">fx</span>' : ""}<span>${label}</span>
    ${fx ? `<button class="ib xs push" data-act="reset-group" data-group="${id}" title="Reset effect">${ICON.reset}</button>` : ""}
  </div><div class="ec-r"></div></div>`;
}

function propRow(owner, path, label) {
  const p = getProp(owner, path);
  const isPart = path.startsWith("part/");
  const def = propDef(path);
  const on = p.keys.length > 0;
  const dims = isPart ? 1 : def.dims;
  const unit = isPart ? "°" : def.unit;
  const vals = Array.from({ length: dims }, (_, d) => `<span class="hot" data-hot="prop" data-path="${path}" data-dim="${d}"></span>`).join("");
  return `<div class="ec-row ec-prop"><div class="ec-l">
    <button class="ib xs sw${on ? " on" : ""}" data-act="anim" data-path="${path}" title="Toggle animation">${ICON.stopwatch}</button>
    <span class="ec-label">${esc(label || def.label)}</span>
    <span class="ec-vals">${vals}${unit ? `<span class="unit">${unit}</span>` : ""}</span>
    <span class="kf-nav${on ? "" : " off"}">
      <button class="ib xs" data-act="kprev" data-path="${path}" title="Go to previous keyframe">${ICON.kprev}</button>
      <button class="ib xs kf-toggle" data-act="ktoggle" data-path="${path}" title="Add or remove keyframe">${ICON.diamond}</button>
      <button class="ib xs" data-act="knext" data-path="${path}" title="Go to next keyframe">${ICON.knext}</button>
    </span>
    <button class="ib xs" data-act="reset" data-path="${path}" title="Reset parameter">${ICON.reset}</button>
  </div><div class="ec-r"><div class="lane" data-lane="${path}"></div></div></div>`;
}

const plainRow = (inner) => `<div class="ec-row ec-prop"><div class="ec-l">${inner}</div><div class="ec-r"></div></div>`;
const check = (set, on, label) => `<label class="chk"><input type="checkbox" data-set="${set}"${on ? " checked" : ""}> ${label}</label>`;

function clipSettings(it, kind) {
  let html =
    plainRow('<span class="ec-label">In</span><span class="hot" data-hot="clip" data-which="start"></span>') +
    plainRow('<span class="ec-label">Out</span><span class="hot" data-hot="clip" data-which="end"></span>');
  if (kind === "audio") {
    html += plainRow('<span class="ec-label">Source in</span><span class="hot" data-hot="clip" data-which="offset"></span>');
    html += plainRow(check("item-loop", it.loop, "Loop the sound"));
  }
  html += plainRow(`<span class="ec-label">Name</span><input class="text grow" data-set="item-name" value="${esc(it.name)}">`);
  if (kind === "title") {
    const c = it.card;
    html += plainRow(check("title-logo", c.logo, "UAL CCI logo, in gold"));
    html += plainRow(`<span class="ec-label">Heading</span><input class="text grow" data-set="title-kicker" value="${esc(c.kicker)}">`);
    html += plainRow(`<span class="ec-label">Title</span><input class="text grow" data-set="title-main" value="${esc(c.title)}">`);
    html += `<div class="ec-row ec-prop tall"><div class="ec-l"><span class="ec-label">Lines</span>
      <textarea class="text grow" rows="3" data-set="title-body" placeholder="One line each; *Name* is set in capitals">${esc(c.body)}</textarea></div><div class="ec-r"></div></div>`;
  }
  if (kind === "puppet") {
    html += plainRow(`<span class="ec-label">Look</span><select class="select" data-set="item-render">${lookOptions(it.render)}</select>`);
    html += plainRow(check("item-flip", it.flip, "Face the other way"));
    html += plainRow(`${check("item-armstick", it.armStick !== false, "Arm stick at")}
      <span class="hot" data-hot="hand" data-i="0"></span><span class="hot" data-hot="hand" data-i="1"></span><span class="unit">% of the figure</span>`);
  }
  html += plainRow(check("item-enabled", it.enabled, kind === "audio" ? "Play this sound" : "Show on screen"));
  html += plainRow(check("item-lock", it.locked, "Lock track"));
  html += plainRow(`<button class="btn sm" data-act="track-up">${ICON.up} Track up</button>
    <button class="btn sm" data-act="track-down">${ICON.down} Track down</button>
    <button class="btn sm danger" data-act="item-remove">${ICON.trash} Remove</button>`);
  return html;
}

function lightSettings(L) {
  return (
    plainRow(`<span class="ec-label">Name</span><input class="text grow" data-set="light-name" value="${esc(L.name)}">`) +
    plainRow(`<span class="ec-label">Type</span><select class="select" data-set="light-type">${Object.entries(LIGHT_TYPES)
      .map(([k, t]) => `<option value="${k}"${k === L.type ? " selected" : ""}>${t.label}</option>`).join("")}</select>`) +
    plainRow(`<span class="ec-label">Colour</span><input type="color" data-set="light-color" value="${L.color}">`) +
    plainRow(check("light-enabled", L.enabled, "Lamp lit")) +
    plainRow(`<button class="btn sm danger" data-act="item-remove">${ICON.trash} Remove light</button>`)
  );
}

export function buildEffects() {
  const host = $("tab-effects");
  const owner = ownerOf(S.sel);
  if (!owner) {
    host.innerHTML = `<div class="empty-big">${ICON.move}<p>Select a character, effect, sound or light to edit it here.</p>
      <p class="muted">Click a figure on the screen, a clip on the timeline, or a lamp in the Lights tab.</p></div>`;
    return;
  }
  const kind = kindOf(S.sel);
  const kindLabel = { puppet: "Character", fx: "Effect", audio: "Sound", light: "Light", title: "Title card" }[kind];
  const moves = kind === "puppet" ? MOVES.filter((m) => !m.needsParts || (owner.parts || []).length) : kind === "light" ? LIGHT_MOVES : [];
  let html = `<div class="ec" id="ec">
    <div class="ec-row ec-top">
      <div class="ec-l"><span class="kind-tag">${kindLabel}</span><span class="ec-seq">${esc(owner.name)}</span>
        ${moves.length ? `<select class="select move-select" data-set="move" title="Add a movement at the playhead"><option value="">Add movement…</option>${moves.map((m) => `<option value="${m.id}">${m.label}</option>`).join("")}</select>` : ""}
      </div>
      <div class="ec-r ec-ruler" id="ec-ruler"><span class="ec-tc l" id="ec-in"></span><span class="ec-tc r" id="ec-out"></span>
        <div class="ec-clipbar" style="--clip:${owner.color || "#c9a35a"}">${esc(owner.name)}</div></div>
    </div>`;
  for (const g of GROUPS[kind]) {
    html += groupHead(g.id, g.label, true);
    if (S.collapsed[g.id]) continue;
    for (const path of g.paths) html += propRow(owner, path);
    if (g.id === "space") {
      html += plainRow(`<span class="ec-label">Leather</span><input class="text num" type="number" min="0" max="20" step="0.5" data-set="item-thick" value="${owner.thick ?? 3}"><span class="unit">px thick</span>
        <button class="btn sm push" data-act="open-3d" title="See the figure in 3D and move its parts (or double-click it on the screen)">${ICON.move} Open in 3D</button>`);
    }
  }
  if (kind === "puppet") {
    html += groupHead("parts", "Jointed parts", false);
    if (!S.collapsed.parts) {
      const ed = S.rigEdit && S.rigEdit.item === owner.id ? S.rigEdit.part : null;
      for (const part of owner.parts || []) {
        html += propRow(owner, `part/${part.id}/rotation`, part.name);
        if (isCut(part)) {
          // A part cut from the figure: shape it on the screen, and choose what it hangs from.
          const others = cutParts(owner).filter((q) => q !== part && canParent(owner, part, q.id));
          html += plainRow(`<button class="btn sm${ed === part.id ? " on" : ""}" data-act="part-edit" data-part="${part.id}">${ICON.edit} ${ed === part.id ? "Done" : "Shape"}</button>
            <span class="mini">Hangs from</span><select class="select" data-set="part-parent" data-part="${part.id}">
              <option value="">Body</option>${others.map((q) => `<option value="${q.id}"${part.parent === q.id ? " selected" : ""}>${esc(q.name)}</option>`).join("")}</select>
            <label class="chk"><input type="checkbox" data-set="part-stick" data-part="${part.id}"${part.stick ? " checked" : ""}> Holds the arm stick</label>
            <button class="ib xs" data-act="remove-part" data-part="${part.id}" title="Remove part">${ICON.trash}</button>`);
          if (ed === part.id) {
            html += plainRow('<span class="ec-hint">Drag the white points to fit the outline, and the gold ring to the joint. Double-click the outline to add a point, a point to remove it. Click another outline to shape that part. Esc when done.</span>');
          }
          continue;
        }
        const hp = (f) => `<span class="hot" data-hot="part" data-part="${part.id}" data-field="${f}"></span>`;
        html += plainRow(`<span class="mini">Pivot</span>${hp("pivotX")}${hp("pivotY")}<span class="mini">Joint</span>${hp("anchorX")}${hp("anchorY")}<span class="mini">Size</span>${hp("size")}
          <select class="select" data-set="part-z" data-part="${part.id}"><option value="front"${part.z !== "back" ? " selected" : ""}>Front</option><option value="back"${part.z === "back" ? " selected" : ""}>Behind</option></select>
          <button class="ib xs" data-act="remove-part" data-part="${part.id}" title="Remove part">${ICON.trash}</button>`);
      }
      html += plainRow(`<select class="select" data-set="part-cut" title="Cut a part from this figure's own image"><option value="">Cut a part from the figure…</option>${Object.entries(CUTS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join("")}</select>
        <button class="btn sm" data-act="add-part">${ICON.plus} Add part image…</button>`);
      html += plainRow('<span class="muted">Cut parts move on their joints and are keyframed like any value. An added image turns on the body.</span>');
    }
  }
  if (kind === "light") {
    html += groupHead("settings", "Lamp", false);
    if (!S.collapsed.settings) html += lightSettings(owner);
  } else {
    html += groupHead("settings", kind === "audio" ? "Clip and sound" : "Clip", false);
    if (!S.collapsed.settings) html += clipSettings(owner, kind);
  }
  html += '<div class="ec-ph" id="ec-ph"></div></div>';
  host.innerHTML = html;
  renderLanes();
}

export function renderLanes() {
  const owner = ownerOf(S.sel);
  if (!owner) return;
  const [start, end] = rangeOf(S.sel, owner);
  const span = Math.max(end - start, 1 / FPS);
  document.querySelectorAll("#ec .lane").forEach((lane) => {
    const p = getProp(owner, lane.dataset.lane);
    if (!p) return;
    lane.innerHTML = p.keys
      .map((k, i) => {
        if (k.t < start - 1e-6 || k.t > end + 1e-6) return "";
        const sel = S.selKey && S.selKey.key === k ? " sel" : "";
        return `<span class="kf ${k.i}${sel}" data-idx="${i}" style="left:${(((k.t - start) / span) * 100).toFixed(3)}%"></span>`;
      })
      .join("");
  });
}

export function tickEffects() {
  const owner = ownerOf(S.sel);
  if (!owner || !$("ec")) return;
  document.querySelectorAll("#ec .kf-toggle").forEach((b) => {
    const p = getProp(owner, b.dataset.path);
    if (p) b.classList.toggle("at", keyIndexAt(p, S.t) >= 0);
  });
  const [start, end] = rangeOf(S.sel, owner);
  const f = (S.t - start) / Math.max(end - start, 1 / FPS);
  const ph = $("ec-ph");
  ph.hidden = f < 0 || f > 1;
  ph.style.setProperty("--p", clamp(f, 0, 1));
  $("ec-in").textContent = tc(start);
  $("ec-out").textContent = tc(end);
}

// ── Show ────────────────────────────────────────────────
export function buildShow() {
  const P = S.project;
  const tr = TRADITIONS[P.tradition] || TRADITIONS.custom;
  $("tab-show").innerHTML = `<div class="form">
    <div class="sec-h">Tradition</div>
    <div class="frow">
      <select class="select grow" data-set="tradition">${Object.entries(TRADITIONS).map(([k, t]) => `<option value="${k}"${k === P.tradition ? " selected" : ""}>${t.label}</option>`).join("")}</select>
      <button class="btn" data-act="apply-tradition" title="Replace the lights, cloth colour and figure style with this tradition's setup">Apply setup</button>
    </div>
    <p class="about">${esc(tr.about)} ${tr.link ? `<a href="${tr.link}" target="_blank" rel="noopener">Read more</a>` : ""}</p>
    <p class="muted small">A setup is a starting point for lamp count, placing and figure style. Adjust it to your own stage.</p>
    <div class="sec-h">Screen</div>
    <div class="prow"><span>Cloth size</span><span><span class="hot" data-hot="field" data-field="screenW"></span><span class="unit">m</span>
      <span class="muted"> × </span><span class="hot" data-hot="field" data-field="screenH"></span><span class="unit">m</span></span></div>
    <p class="muted small pad">${esc((tr.screen && tr.screen.note) || "")}</p>
    <div class="prow"><span>Figure height</span><span><span class="hot" data-hot="field" data-field="figure"></span><span class="unit">% of the cloth</span></span></div>
    <div class="prow"><span>View</span><select class="select" data-set="screen-view">
      <option value="audience"${P.screen.view !== "backstage" ? " selected" : ""}>Front: audience side, shadows on the cloth</option>
      <option value="backstage"${P.screen.view === "backstage" ? " selected" : ""}>Back: puppeteers' side, mirrored, lamps in front</option></select></div>
    <div class="prow">${check("screen-sticks", P.screen.sticks !== false, "Show the puppeteers' sticks")}</div>
    <div class="prow">${check("screen-natural", P.screen.natural !== false, "Hand-held motion: figures bob as they walk, lean into a move and never hold quite still")}</div>
    <div class="prow"><span>Cloth colour</span><input type="color" data-set="screen-cloth" value="${P.screen.cloth}"></div>
    <div class="prow"><span>Figure look (all characters)</span><select class="select" data-set="screen-style">${lookOptions(P.screen.style)}</select></div>
    <div class="prow"><span>All lights</span><span><span class="hot" data-hot="field" data-field="master"></span><span class="unit">%</span></span></div>
    <div class="prow"><span>Sequence length</span><span class="hot" data-hot="field" data-field="duration"></span></div>
    <div class="sec-h">Sound</div>
    <div class="prow"><span>Master volume</span><span><span class="hot" data-hot="field" data-field="audioMaster"></span><span class="unit">%</span></span></div>
    <div class="sec-h">Credits</div>
    <div class="about credits">
      <p><b>With thanks</b> to Vipin Viswanathan Pulavar, fifteenth-generation Tholpavakoothu artist, for the first lessons and his
        mentoring, and to Hooman Samani, UAL Creative Computing Institute, for guidance on robotics.</p>
      <p><b>With respect</b> to the pulavars, puppeteers and lamp keepers of Kerala's koothumadams, who made this art and
        have carried it for generations.</p>
      <p><b>Figures</b>: Tholpavakoothu puppets in the Museu do Oriente, Lisbon, photographed by Daderot,
        <a href="https://commons.wikimedia.org/wiki/Category:Tolpava_Koothu_in_the_Museu_do_Oriente" target="_blank" rel="noopener">Wikimedia Commons</a>, CC0 1.0.</p>
      <p><b>Music</b>: the Tholpavakoothu recording played on the ShadowStage portfolio page (performers and source to be added).
        The alternative score, "Koothu night", is generated in code, following the ezhupara and ilathalam accompaniment.</p>
      <p><b>Facts and staging</b>: <a href="https://en.wikipedia.org/wiki/Tholpavakoothu" target="_blank" rel="noopener">Wikipedia</a>,
        <a href="https://keralamuseum.org/article/tthe-koonathara-shadow-puppeteers/" target="_blank" rel="noopener">Museum of Kerala History</a>,
        <a href="https://keralatourism.org/artforms/tholppavakkoothu-shadow-puppetry/9" target="_blank" rel="noopener">Kerala Tourism</a>,
        <a href="https://www.aljazeera.com/features/2021/7/5/technology-meets-tradition-keralas-robotic-leather-puppets" target="_blank" rel="noopener">Al Jazeera</a>,
        <a href="https://imp-art.org/article/tholpavakoothu/" target="_blank" rel="noopener">IMP-ART</a>,
        <a href="https://mapacademy.io/?p=3666" target="_blank" rel="noopener">MAP Academy</a>,
        <a href="https://wepa.unima.org/en/?p=7100" target="_blank" rel="noopener">UNIMA</a>.</p>
      <p><b>Visual references</b>: Kerala Tourism's Tholpavakoothu film and other performance footage, looked at for the look of the
        screen, lamps and sticks; nothing from them is reused.</p>
      <p><b>Type</b>: Marcellus by Astigmatic; Geist by Vercel; Cinzel by Natanael Gama; Cormorant Garamond by Christian Thalmann; Malayalam in Manjari
        by Santhosh Thottingal and Rachana by Hussain K. H. and Rachana Akshara Vedi (Swathanthra Malayalam Computing).
        All under the SIL Open Font License.</p>
      <p><a href="CREDITS.md" target="_blank" rel="noopener">Full credits</a></p>
    </div>
  </div>`;
}

// ── Story ───────────────────────────────────────────────
export function buildStory() {
  const P = S.project;
  const scenes = [...P.scenes].sort((a, b) => a.start - b.start);
  const list = scenes.map((sc, i) => `<div class="scene${S.t >= sc.start && S.t < sc.end ? " now" : ""}" data-scene="${sc.id}">
      <div class="scene-top"><span class="sdot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <input class="text grow" data-set="scene-title" data-scene="${sc.id}" value="${esc(sc.title)}">
        <span class="hot" data-hot="scene" data-scene="${sc.id}" data-which="start"></span><span class="muted">–</span>
        <span class="hot" data-hot="scene" data-scene="${sc.id}" data-which="end"></span>
        <button class="ib xs" data-act="scene-go" data-scene="${sc.id}" title="Go to this scene">${ICON.play}</button>
        <button class="ib xs" data-act="scene-remove" data-scene="${sc.id}" title="Remove scene">${ICON.trash}</button></div>
      <textarea class="text" rows="2" placeholder="Narration, dialogue or the verse sung here" data-set="scene-narration" data-scene="${sc.id}">${esc(sc.narration || "")}</textarea>
    </div>`).join("");
  $("tab-story").innerHTML = `<div class="form">
    <label class="fl">Title<input class="text" data-set="title" value="${esc(P.title || "")}"></label>
    <label class="fl">Synopsis<textarea class="text" rows="2" data-set="synopsis">${esc(P.synopsis || "")}</textarea></label>
    ${check("screen-captions", P.screen.captions, "Show narration on the screen as subtitles")}
    <div class="sec-h">Scenes <span class="grow"></span><button class="btn" data-act="scene-add" title="Add a scene at the playhead (M)">${ICON.plus} Add scene at playhead</button></div>
    ${list || '<p class="empty">No scenes yet. Scenes mark the story on the timeline ruler and can carry narration.</p>'}
  </div>`;
}

// ── Lights ──────────────────────────────────────────────
const typeOptions = (cur, keep = false) =>
  (keep ? '<option value="">Keep each lamp\'s type</option>' : "") +
  Object.entries(LIGHT_TYPES).map(([k, t]) => `<option value="${k}"${k === cur ? " selected" : ""}>${t.label}</option>`).join("");
const shortType = (L) => (LIGHT_TYPES[L.type] || {}).short || (LIGHT_TYPES[L.type] || {}).label || L.type;
const lampsInOrder = () => [...S.project.lights].sort((a, b) => a.props.position.base[0] - b.props.position.base[0] || 0);

// Set a lamp's level. With keyframes, scale them all so fades and flares keep their shape.
function setLevel(L, prop, v) {
  const p = L.props[prop];
  if (!p.keys.length) p.base = [v];
  else {
    const cur = valueAt(p, S.t)[0] || 1;
    for (const k of p.keys) k.v = [round1(k.v[0] * (v / cur))];
  }
}

export function buildLights() {
  const P = S.project;
  const lamps = lampsInOrder();
  const sel = (L) => Boolean(S.sel && S.sel.type === "light" && S.sel.id === L.id);
  const level = (L) => clamp(valueAt(L.props.intensity, S.t)[0], 0, 300);
  // The vilakku madam: every lamp in its place on the beam, its flame sized by how bright it burns.
  const rail = lamps.map((L, i) => {
    const s = L.enabled ? clamp(0.35 + level(L) / 140, 0.35, 1.6) : 0;
    return `<button class="rail-lamp${sel(L) ? " sel" : ""}${L.enabled ? "" : " off"}" data-act="light-select" data-light="${L.id}"
      title="${esc(L.name)} · ${Math.round(level(L))}% · double-click to edit"><i class="rl-flame" style="--s:${s.toFixed(2)};--c:${L.color}"></i><i class="rl-bowl"></i><b>${i + 1}</b></button>`;
  }).join("");
  const rows = lamps.map((L, i) => `<div class="lrow${sel(L) ? " sel" : ""}${L.enabled ? "" : " off"}" data-act="light-select" data-light="${L.id}">
      <span class="lnum">${i + 1}</span>
      <span class="ldot" style="background:${L.color}"></span>
      <span class="nm" title="${esc(shortType(L))}">${esc(L.name)}</span>
      <span class="lbar" title="Brightness at the playhead"><i style="width:${Math.min(100, level(L) / 2)}%"></i></span>
      <span class="lval"><span class="hot" data-hot="prop" data-owner="light:${L.id}" data-path="intensity" data-dim="0"></span><span class="unit">%</span></span>
      <button class="ib xs${L.enabled ? " on" : " off"}" data-act="light-eye" data-light="${L.id}" title="Lamp lit or out">${L.enabled ? ICON.eye : ICON.eyeOff}</button>
      <button class="ib xs" data-act="light-edit" data-light="${L.id}" title="Edit lamp">${ICON.edit}</button>
      <button class="ib xs" data-act="light-remove" data-light="${L.id}" title="Remove lamp">${ICON.trash}</button>
    </div>`).join("");
  const types = [...new Set(P.lights.map(shortType))];
  $("tab-lights").innerHTML = `<div class="form">
    <div class="lhead">
      <div><div class="lh-title">Vilakku madam</div>
        <div class="muted small">${P.lights.length} lamp${P.lights.length === 1 ? "" : "s"}${types.length ? ` · ${esc(types.join(", "))}` : ""}</div></div>
      <span class="grow"></span>
      <span class="muted">All</span><span class="hot" data-hot="field" data-field="master"></span><span class="unit">%</span>
    </div>
    <div class="rail">${rail || '<span class="muted small">No lamps on the beam</span>'}<span class="rail-beam"></span></div>
    <div class="frow">
      <button class="btn" data-act="lamps-add">${ICON.plus} Add lamps…</button>
      <button class="btn" data-act="lamps-edit-all"${P.lights.length ? "" : " disabled"}>${ICON.edit} Edit all…</button>
      <span class="grow"></span>
      <button class="btn" data-act="light-clear"${P.lights.length ? "" : " disabled"}>Remove all</button>
    </div>
    <div class="lights">${rows || '<p class="empty">No lamps. Add a row, or apply a tradition\'s setup in the Show tab.</p>'}</div>
    <p class="muted small pad">The lamps stand behind the cloth. More lamps give a brighter screen, and a wide flame softens the shadow of a figure held back from the cloth. Select a lamp to animate it in Effect Controls, or map it to a real lamp in Motors.</p>
  </div>`;
}

// ── Modals ──────────────────────────────────────────────
export function openModal(title, body, onApply, applyLabel = "Apply") {
  const dlg = $("dlg-form");
  dlg.innerHTML = `<form class="mform" novalidate>
    <div class="dlg-head">${esc(title)}<button type="button" class="ib" data-close title="Close">${ICON.close}</button></div>
    <div class="mbody">${body}</div>
    <div class="mfoot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">${esc(applyLabel)}</button></div>
  </form>`;
  const form = dlg.querySelector("form");
  dlg.querySelectorAll("[data-close]").forEach((b) => { b.onclick = () => dlg.close(); });
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    for (const cb of form.querySelectorAll("input[type=checkbox]")) data[cb.name] = cb.checked;
    dlg.close();
    onApply(data);
  };
  dlg.showModal();
  const first = form.querySelector(".mbody input, .mbody select");
  if (first) first.focus();
}

const mrow = (label, control, hint = "") =>
  `<label class="mrow"><span class="ml">${label}</span><span class="mc">${control}</span>${hint ? `<span class="mh">${hint}</span>` : ""}</label>`;
const num = (name, value, min, max, step = 1) =>
  `<input class="num" type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}">`;
const pctX = (L) => round1((valueAt(L.props.position, S.t)[0] / FW) * 100);
const pctY = (L) => round1((valueAt(L.props.position, S.t)[1] / FH) * 100);

function addLampsModal() {
  openModal("Add lamps", `
    ${mrow("Lamp", `<select class="select" name="type">${typeOptions("koothu")}</select>`)}
    ${mrow("How many", num("count", 21, 1, 60), "Tholpavakoothu uses 21")}
    ${mrow("Height", `${num("height", 65, 0, 100)} % down the cloth`, "The beam stands about 1.3 m up")}
    ${mrow("Across", `${num("from", 8, 0, 100)} % to ${num("to", 92, 0, 100)} %`, "Evenly spaced between these")}
    ${mrow("Brightness", `${num("intensity", 110, 0, 300)} %`)}
    ${mrow("Flicker", `${num("flicker", 30, 0, 100)} %`)}
    <label class="mrow chk"><input type="checkbox" name="replace"${S.project.lights.length ? "" : " checked"}> Replace the lamps already on the beam</label>`,
  (d) => {
    const n = clamp(Math.round(Number(d.count)) || 1, 1, 60);
    const from = (clamp(Number(d.from), 0, 100) / 100) * FW;
    const to = (clamp(Number(d.to), 0, 100) / 100) * FW;
    const y = (clamp(Number(d.height), 0, 100) / 100) * FH;
    checkpoint();
    if (d.replace) {
      S.project.lights = [];
      if (S.sel && S.sel.type === "light") S.sel = null;
    }
    const start = S.project.lights.length;
    for (let i = 0; i < n; i++) {
      const L = makeLight(d.type, n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1), y, {
        name: `Lamp ${start + i + 1}`, intensity: clamp(Number(d.intensity), 0, 300),
      });
      L.props.flicker.base = [clamp(Number(d.flicker), 0, 100)];
      S.project.lights.push(L);
    }
    commit();
    toast(`${n} lamp${n === 1 ? "" : "s"} added`);
  }, "Add lamps");
}

export function editLampModal(id) {
  const L = lightById(id);
  if (!L) return;
  openModal(`Edit ${L.name}`, `
    ${mrow("Name", `<input class="text" name="name" value="${esc(L.name)}">`)}
    ${mrow("Lamp", `<select class="select" name="type">${typeOptions(L.type)}</select>`)}
    ${mrow("Colour", `<input type="color" name="color" value="${L.color}">`)}
    ${mrow("Brightness", `${num("intensity", Math.round(valueAt(L.props.intensity, S.t)[0]), 0, 300)} %`, L.props.intensity.keys.length ? "Keyframes are scaled to match" : "")}
    ${mrow("Spread", `${num("size", Math.round(valueAt(L.props.size, S.t)[0]), 5, 400)} %`)}
    ${mrow("Flicker", `${num("flicker", Math.round(valueAt(L.props.flicker, S.t)[0]), 0, 100)} %`)}
    ${mrow("Position", `${num("x", pctX(L), -20, 120, 0.1)} % across, ${num("y", pctY(L), -20, 120, 0.1)} % down`)}
    <label class="mrow chk"><input type="checkbox" name="enabled"${L.enabled ? " checked" : ""}> Lamp lit</label>`,
  (d) => {
    checkpoint();
    L.name = String(d.name).trim() || L.name;
    if (d.type !== L.type) {
      L.type = d.type;
      if (d.color === L.color) L.color = LIGHT_TYPES[d.type].color;
      else L.color = d.color;
    } else L.color = d.color;
    setLevel(L, "intensity", clamp(Number(d.intensity), 0, 300));
    setLevel(L, "size", clamp(Number(d.size), 5, 400));
    setLevel(L, "flicker", clamp(Number(d.flicker), 0, 100));
    setValue(L, "position", [round1((clamp(Number(d.x), -20, 120) / 100) * FW), round1((clamp(Number(d.y), -20, 120) / 100) * FH)]);
    L.enabled = Boolean(d.enabled);
    commit();
  }, "Save lamp");
}

function editAllModal() {
  const lamps = lampsInOrder();
  const n = lamps.length;
  const avg = (fn) => Math.round(lamps.reduce((s, L) => s + fn(L), 0) / n);
  openModal("Edit all lamps", `
    ${mrow("Lamps", `${num("a", 1, 1, n)} to ${num("b", n, 1, n)}`, "Numbered along the beam, left to right")}
    ${mrow("Lamp", `<select class="select" name="type">${typeOptions("", true)}</select>`)}
    ${mrow("Colour", `<input type="color" name="color" value="${lamps[0].color}"> <label class="chk"><input type="checkbox" name="setColor"> set</label>`)}
    ${mrow("Brightness", `<input class="num" type="number" name="intensity" min="0" max="300" placeholder="${avg((L) => valueAt(L.props.intensity, S.t)[0])}"> %`, "Leave empty to keep")}
    ${mrow("Flicker", `<input class="num" type="number" name="flicker" min="0" max="100" placeholder="${avg((L) => valueAt(L.props.flicker, S.t)[0])}"> %`, "Leave empty to keep")}
    ${mrow("Height", `<input class="num" type="number" name="height" min="0" max="100" placeholder="${avg(pctY)}"> % down the cloth`, "Leave empty to keep")}
    <label class="mrow chk"><input type="checkbox" name="space"> Space them evenly from ${num("from", 8, 0, 100)} % to ${num("to", 92, 0, 100)} % across</label>
    <label class="mrow chk"><input type="checkbox" name="light" checked> Light them all</label>`,
  (d) => {
    const a = clamp(Math.round(Number(d.a)) || 1, 1, n);
    const b = clamp(Math.round(Number(d.b)) || n, a, n);
    const chosen = lamps.slice(a - 1, b);
    checkpoint();
    chosen.forEach((L, i) => {
      if (d.type) L.type = d.type;
      if (d.setColor) L.color = d.color;
      else if (d.type) L.color = LIGHT_TYPES[d.type].color;
      if (d.intensity !== "") setLevel(L, "intensity", clamp(Number(d.intensity), 0, 300));
      if (d.flicker !== "") setLevel(L, "flicker", clamp(Number(d.flicker), 0, 100));
      const [x, y] = L.props.position.base;
      let nx = x;
      let ny = y;
      if (d.space) {
        const from = (clamp(Number(d.from), 0, 100) / 100) * FW;
        const to = (clamp(Number(d.to), 0, 100) / 100) * FW;
        nx = chosen.length === 1 ? (from + to) / 2 : from + ((to - from) * i) / (chosen.length - 1);
      }
      if (d.height !== "") ny = (clamp(Number(d.height), 0, 100) / 100) * FH;
      if (nx !== x || ny !== y) L.props.position.base = [round1(nx), round1(ny)];
      if (d.light) L.enabled = true;
    });
    commit();
    toast(`${chosen.length} lamp${chosen.length === 1 ? "" : "s"} changed`);
  }, "Apply to lamps");
}

export function onUi() {
  // Kept for the change handler; the Lights tab now uses modals.
}

// ── Project bin and Library ─────────────────────────────
let prTab = "project";
let prView = "list";
let prFilter = "";
export const setPrFilter = (v) => { prFilter = v; buildProject(); };
export const setProjectTab = (tab) => { prTab = tab; buildProject(); };

function libraryHTML() {
  const P = S.project;
  const f = prFilter.toLowerCase();
  const match = (name) => name.toLowerCase().includes(f);
  const userImgs = Object.values(P.assets).filter((a) => a.kind === "image");
  const userSnd = Object.values(P.assets).filter((a) => a.kind === "audio");
  const tile = (id, name, src) => match(name) ? `<button class="lib-tile" data-act="lib-add" data-lib="${id}" title="Add ${esc(name)} to the sequence">
      <span class="pr-thumb"><img src="${src}" alt=""></span><span class="nm">${esc(name)}</span></button>` : "";
  const row = (icon, name, sub, attrs, extra = "") => match(name) ? `<div class="lib-row"><span class="lib-ic">${icon}</span><span class="nm">${esc(name)}</span>
      <span class="muted">${sub}</span>${extra}<button class="ib xs" ${attrs} title="Add">${ICON.plus}</button></div>` : "";
  return `<div class="lib">
    <div class="lib-h">Characters <button class="link" data-act="import-media">Import image…</button></div>
    ${[...new Set(BUILTIN_IMAGES.map((b) => b.source))].map((src) => {
      const tiles = BUILTIN_IMAGES.filter((b) => b.source === src).map((b) => tile(b.id, b.name, b.src)).join("");
      return tiles ? `<div class="lib-sub">${esc(src.replace(" figure", "").replace("Indian shadow puppet", "Other Indian shadow puppets"))}</div><div class="lib-grid">${tiles}</div>` : "";
    }).join("")}
    ${userImgs.length ? `<div class="lib-sub">Imported</div><div class="lib-grid">${userImgs.map((a) => tile(a.id, a.name, imageURL(a.id))).join("")}</div>` : ""}
    <div class="lib-h">Sound and music <button class="link" data-act="import-media">Import audio…</button></div>
    ${[...SOUNDS, ...userSnd].map((s) => row(ICON.note, s.name, s.loop ? "Loop" : tc(s.length || 0), `data-act="lib-add" data-lib="${s.id}"`,
      `<button class="ib xs" data-act="lib-preview" data-lib="${s.id}" title="Listen">${ICON.play}</button>`)).join("")}
    <div class="lib-h">Effects</div>
    ${row(ICON.seq, "Title card", "Gold type, optional logo", 'data-act="lib-add" data-lib="title:card"')}
    ${Object.entries(FX_TYPES).map(([k, fx]) => row(ICON.seq, fx.label, "Clip at the playhead", `data-act="lib-add" data-lib="fx:${k}"`)).join("")}
    <div class="lib-h">Lights</div>
    ${Object.entries(LIGHT_TYPES).map(([k, l]) => row(`<span class="swatch" style="background:${l.color}"></span>`, l.label, "Behind the cloth", `data-act="lib-add" data-lib="light:${k}"`)).join("")}
    <div class="lib-h">Movements <span class="muted">for the selected character, at the playhead</span></div>
    ${MOVES.map((m) => row(ICON.move, m.label, `${m.dur} s`, `data-act="lib-move" data-move="${m.id}"`)).join("")}
  </div>`;
}

export function buildProject() {
  document.querySelectorAll(".ptab").forEach((b) => b.classList.toggle("active", b.dataset.ptab === prTab));
  $("pr-view-list").classList.toggle("on", prView === "list");
  $("pr-view-grid").classList.toggle("on", prView === "grid");
  const host = $("pr-items");
  if (prTab === "library") {
    host.innerHTML = libraryHTML();
    $("pr-foot").textContent = "Click + to add at the playhead · drop image or audio files anywhere to import";
    return;
  }
  const P = S.project;
  const f = prFilter.toLowerCase();
  const KIND = { puppet: "Character", fx: "Effect", audio: "Sound", title: "Title card" };
  const rows = [
    ...P.items.map((it) => ({
      type: "item", id: it.id, name: it.name, kind: KIND[it.kind], info: `${tc(it.clip.start)} – ${tc(it.clip.end)}`,
      thumb: it.kind === "puppet" ? imageURL(it.asset) : "", icon: it.kind === "audio" ? ICON.note : ICON.seq,
    })),
    ...P.lights.map((L) => ({ type: "light", id: L.id, name: L.name, kind: "Light", info: LIGHT_TYPES[L.type].label, swatch: L.color })),
    ...Object.values(P.assets).map((a) => ({
      type: "asset", id: a.id, name: a.name, kind: a.kind === "image" ? "Imported image" : "Imported sound",
      info: a.kind === "audio" ? tc(a.length || 0) : `${a.w} × ${a.h}`, thumb: a.kind === "image" ? imageURL(a.id) : "", icon: ICON.note,
    })),
  ].filter((r) => r.name.toLowerCase().includes(f));
  const isSel = (r) => S.sel && r.type !== "asset" && S.sel.id === r.id;
  const ic = (r) => (r.thumb ? `<img src="${r.thumb}" alt="">` : r.swatch ? `<span class="swatch" style="background:${r.swatch}"></span>` : r.icon);
  if (prView === "list") {
    host.innerHTML = '<div class="pr-hdr"><span></span><span>Name</span><span>Type</span><span>Info</span></div>' +
      rows.map((r) => `<div class="pr-row${isSel(r) ? " sel" : ""}" data-act="pr-row" data-row-type="${r.type}" data-id="${r.id}" title="${r.type === "asset" ? "Click to add to the sequence" : ""}">
        <span class="pr-ic${r.thumb ? " img" : ""}">${ic(r)}</span><span class="nm">${esc(r.name)}</span><span class="ty">${r.kind}</span><span class="inf">${esc(r.info)}</span></div>`).join("");
  } else {
    host.innerHTML = '<div class="pr-grid">' + rows.map((r) => `<div class="pr-tile${isSel(r) ? " sel" : ""}" data-act="pr-row" data-row-type="${r.type}" data-id="${r.id}">
        <div class="pr-thumb">${ic(r)}</div><span class="nm">${esc(r.name)}</span></div>`).join("") + "</div>";
  }
  const counts = `${P.items.length} clip${P.items.length === 1 ? "" : "s"} · ${P.lights.length} light${P.lights.length === 1 ? "" : "s"} · ${Object.keys(P.assets).length} imported`;
  $("pr-foot").textContent = counts;
}

function libAdd(id) {
  if (id.startsWith("title:")) return addTitle();
  if (id.startsWith("fx:")) return addFx(id.slice(3));
  if (id.startsWith("light:")) return addLight(id.slice(6));
  if (id.startsWith("img:") || (S.project.assets[id] && S.project.assets[id].kind === "image")) return addPuppet(id);
  return addAudio(id);
}

// ── Keyframe menu ───────────────────────────────────────
export function hideCtx() {
  $("ctx").hidden = true;
}

export function showKeyMenu(x, y) {
  const k = S.selKey.key;
  const item = (mode, label) => `<button data-act="interp" data-mode="${mode}"><span>${label}</span><span class="check">${k.i === mode ? "✓" : ""}</span></button>`;
  const ctx = $("ctx");
  ctx.innerHTML = item("linear", "Linear") + item("ease", "Ease in and out") + item("hold", "Hold") +
    '<hr><button data-act="ctx-delete"><span>Delete keyframe</span><kbd>Delete</kbd></button>';
  ctx.hidden = false;
  ctx.style.left = `${Math.min(x, innerWidth - 200)}px`;
  ctx.style.top = `${Math.min(y, innerHeight - 140)}px`;
}

// ── Actions from panels ─────────────────────────────────
export function addSceneAtPlayhead() {
  const P = S.project;
  checkpoint();
  const start = Math.min(snapT(S.t), P.duration - 1);
  P.scenes.push({ id: uid("scene"), title: `Scene ${P.scenes.length + 1}`, start, end: Math.min(P.duration, start + 5), narration: "" });
  commit();
  toast(`Scene added at ${tc(start)}`);
}

function applyMoveTo(owner, list, id) {
  const mv = list.find((m) => m.id === id);
  if (!mv) return;
  if (mv.needsParts && !(owner.parts || []).length) return toast("This character has no jointed parts yet");
  checkpoint();
  applyMove(owner, mv);
  commit();
  toast(`${mv.label} added at ${tc(S.t)}`);
}

export function handleAct(el) {
  const act = el.dataset.act;
  const owner = selectedOwner();
  const P = S.project;
  const path = el.dataset.path;
  switch (act) {
    case "group":
      S.collapsed[el.dataset.group] = !S.collapsed[el.dataset.group];
      buildEffects();
      emit("tick");
      return;
    case "reset-group": {
      const kind = kindOf(S.sel);
      const g = GROUPS[kind].find((x) => x.id === el.dataset.group);
      checkpoint();
      for (const p of g.paths) {
        const prop = getProp(owner, p);
        prop.keys = [];
        prop.base = propDefault(kind, p);
      }
      return commit();
    }
    case "anim": {
      const p = getProp(owner, path);
      if (p.keys.length) {
        if (!confirm("Turn off animation? This deletes this property's keyframes.")) return;
        checkpoint();
        p.base = valueAt(p, S.t);
        p.keys = [];
      } else {
        checkpoint();
        p.keys = [K(snapT(S.t), p.base)];
      }
      S.selKey = null;
      return commit();
    }
    case "ktoggle": {
      const p = getProp(owner, path);
      checkpoint();
      const i = keyIndexAt(p, S.t);
      if (i >= 0) {
        if (p.keys.length === 1) p.base = p.keys[0].v.slice();
        p.keys.splice(i, 1);
      } else {
        p.keys.push(K(snapT(S.t), valueAt(p, S.t)));
        sortKeys(p);
      }
      S.selKey = null;
      return commit();
    }
    case "kprev":
    case "knext": {
      const p = getProp(owner, path);
      const ft = snapT(S.t);
      const k = act === "kprev" ? [...p.keys].reverse().find((x) => x.t < ft - 1e-6) : p.keys.find((x) => x.t > ft + 1e-6);
      if (k) emit("seek", k.t);
      return;
    }
    case "reset":
      checkpoint();
      setValue(owner, path, propDefault(kindOf(S.sel), path));
      return commit();
    case "add-part":
      $("part-file").click();
      return;
    case "remove-part":
      checkpoint();
      removePart(owner, el.dataset.part);
      return commit();
    case "open-3d":
      emit("cmd", "figure-3d");
      return;
    case "part-edit":
      S.rigEdit = S.rigEdit && S.rigEdit.part === el.dataset.part ? null : { item: owner.id, part: el.dataset.part };
      emit("refresh");
      return;
    case "item-remove":
      return removeSelected();
    case "track-up":
      return moveTrack(owner.kind === "audio" ? -1 : 1);
    case "track-down":
      return moveTrack(owner.kind === "audio" ? 1 : -1);
    case "lib-add":
      return libAdd(el.dataset.lib);
    case "lib-preview":
      return previewSound(el.dataset.lib);
    case "lib-move":
      if (!owner || kindOf(S.sel) !== "puppet") return toast("Select a character first");
      return applyMoveTo(owner, MOVES, el.dataset.move);
    case "import-media":
      $("media-file").click();
      return;
    case "view-list":
      prView = "list";
      return buildProject();
    case "view-grid":
      prView = "grid";
      return buildProject();
    case "pr-row": {
      const type = el.dataset.rowType;
      if (type === "item") return select("item", el.dataset.id);
      if (type === "light") return select("light", el.dataset.id);
      const a = P.assets[el.dataset.id];
      return a.kind === "image" ? addPuppet(a.id) : addAudio(a.id);
    }
    case "apply-tradition": {
      const tr = TRADITIONS[P.tradition];
      if (!confirm(`Replace the lights, cloth colour and figure style with the ${tr.label} setup? Characters, sounds and keyframes stay, and you can undo this.`)) return;
      return applyTradition(P.tradition);
    }
    case "lamps-add":
      return addLampsModal();
    case "lamps-edit-all":
      return editAllModal();
    case "light-edit":
      return editLampModal(el.dataset.light);
    case "light-clear":
      if (!confirm("Remove all lights? You can undo this.")) return;
      checkpoint();
      P.lights = [];
      if (S.sel && S.sel.type === "light") S.sel = null;
      return commit();
    case "light-select":
      return select("light", el.dataset.light);
    case "light-eye": {
      const L = lightById(el.dataset.light);
      checkpoint();
      L.enabled = !L.enabled;
      return commit();
    }
    case "light-remove":
      checkpoint();
      P.lights = P.lights.filter((l) => l.id !== el.dataset.light);
      if (S.sel && S.sel.id === el.dataset.light) S.sel = null;
      return commit();
    case "scene-add":
      return addSceneAtPlayhead();
    case "scene-go": {
      const sc = P.scenes.find((s) => s.id === el.dataset.scene);
      if (sc) emit("seek", sc.start);
      return;
    }
    case "scene-remove":
      checkpoint();
      P.scenes = P.scenes.filter((s) => s.id !== el.dataset.scene);
      return commit();
    case "interp":
      if (S.selKey) {
        checkpoint();
        S.selKey.key.i = el.dataset.mode;
        commit();
      }
      hideCtx();
      return;
    case "ctx-delete":
      hideCtx();
      emit("delete-key");
      return;
    case "tl-lock":
    case "tl-eye": {
      const it = itemById(el.closest("[data-item]").dataset.item);
      checkpoint();
      if (act === "tl-lock") it.locked = !it.locked;
      else it.enabled = !it.enabled;
      return commit();
    }
    case "snap":
      emit("cmd", "snap");
      return;
    case "lights-tab":
      showTab("lights");
      return;
  }
}

// Inputs, selects and checkboxes marked data-set.
export function onSet(el) {
  const key = el.dataset.set;
  const P = S.project;
  const val = el.type === "checkbox" ? el.checked : el.value;
  const owner = el.dataset.light ? lightById(el.dataset.light) : selectedOwner();
  if (key === "move") {
    el.value = "";
    if (!val || !owner) return;
    return applyMoveTo(owner, kindOf(S.sel) === "light" ? LIGHT_MOVES : MOVES, val);
  }
  const scene = el.dataset.scene ? P.scenes.find((s) => s.id === el.dataset.scene) : null;
  checkpoint();
  switch (key) {
    case "item-name":
    case "light-name":
      owner.name = String(val).trim() || owner.name;
      break;
    case "item-render": owner.render = val; break;
    case "item-flip": owner.flip = val; break;
    case "item-armstick": owner.armStick = val; break;
    case "title-logo": owner.card.logo = val; break;
    case "title-kicker": owner.card.kicker = val; break;
    case "title-main": owner.card.title = val; break;
    case "title-body": owner.card.body = val; break;
    case "screen-sticks": P.screen.sticks = val; break;
    case "screen-natural": P.screen.natural = val; break;
    case "item-enabled":
    case "light-enabled":
      owner.enabled = val;
      break;
    case "item-lock": owner.locked = val; break;
    case "item-loop":
      owner.loop = val;
      if (!val) setClip(owner, "end", owner.clip.end);
      break;
    case "light-type":
      owner.type = val;
      owner.color = LIGHT_TYPES[val].color;
      break;
    case "light-color": owner.color = val; break;
    case "part-z": {
      const part = owner.parts.find((p) => p.id === el.dataset.part);
      part.z = val;
      break;
    }
    case "part-cut":
      el.value = "";
      if (!val) return dropCheckpoint();
      cutFigure(owner, val);
      break;
    case "part-parent": {
      const part = owner.parts.find((p) => p.id === el.dataset.part);
      part.parent = val || null;
      break;
    }
    case "part-stick": {
      // One part holds the arm stick at a time.
      for (const p of owner.parts) if (isCut(p)) p.stick = val && p.id === el.dataset.part;
      break;
    }
    case "item-thick": owner.thick = clamp(Number(val) || 0, 0, 20); break;
    case "tradition": P.tradition = val; break;
    case "screen-cloth": P.screen.cloth = val; break;
    case "screen-view": P.screen.view = val; break;
    case "screen-style":
      P.screen.style = val;
      for (const it of P.items) if (it.kind === "puppet") it.render = val;
      break;
    case "screen-captions": P.screen.captions = val; break;
    case "title": P.title = val; break;
    case "synopsis": P.synopsis = val; break;
    case "scene-title": scene.title = val; break;
    case "scene-narration": scene.narration = val; break;
  }
  commit();
}
