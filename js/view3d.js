// Figure in 3D: the selected figure as a leather plate in space, with its thickness, its sticks and its cut parts,
// seen from any side (drag to orbit). The sidebar sets its turn, tilt and thickness and every part's angle at the
// playhead, exactly as Effect Controls does; the cloth follows as you go.
import { $, S, checkpoint, clamp, commit, emit, esc, getProp, round1, selectedOwner, setValue, valueAt } from "./core.js";
import { CUTS, cutFigure, cutParts, figureHTML, poseParts } from "./rig.js";
import { imageURL } from "./stage.js";

const LAYERS = 9; // slices through the leather: the faces in colour, the ones between dark, as its cut edge
let orbit = { x: -8, y: -28 };
let it = null;
let editing = false; // a checkpoint is open for the slider being dragged

const dlg = () => $("dlg-3d");

export function openFigure3D() {
  const owner = selectedOwner();
  if (!owner || owner.kind !== "puppet") return;
  it = owner;
  build();
  if (!dlg().open) dlg().showModal();
}

function slider(key, label, min, max, value, unit = "°", step = 0.5) {
  return `<label class="v3-row"><span class="v3-l">${esc(label)}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-v3="${esc(key)}">
    <span class="v3-v" data-v3-val="${esc(key)}">${round1(value)}${unit}</span></label>`;
}

function build() {
  const src = imageURL(it.asset);
  const t = S.t;
  const layers = Array.from({ length: LAYERS }, (_, i) =>
    `<div class="v3-layer${i === 0 || i === LAYERS - 1 ? " face" : " edge"}" data-i="${i}">${figureHTML(it, src, "", i === 0)}</div>`).join("");
  const parts = cutParts(it);
  dlg().innerHTML = `<div class="dlg-head">Figure in 3D · ${esc(it.name)}<button class="ib" data-v3-act="close" title="Close">✕</button></div>
    <div class="v3">
      <div class="v3-view" id="v3-view" title="Drag to look around the figure; double-click to face it">
        <div class="v3-floor"></div>
        <div class="v3-obj" id="v3-obj">
          <div class="v3-fig" id="v3-fig">${layers}<span class="v3-rod main"></span></div>
        </div>
        <p class="v3-tip">Drag to look around · double-click to face it</p>
      </div>
      <aside class="v3-side">
        <h3>In space</h3>
        ${slider("turn", "Turn", -85, 85, valueAt(getProp(it, "turn"), t)[0])}
        ${slider("tilt", "Tilt", -60, 60, valueAt(getProp(it, "tilt"), t)[0])}
        ${slider("thick", "Leather", 0, 12, it.thick ?? 3, " px", 0.5)}
        <h3>Parts</h3>
        ${parts.length ? parts.map((p) => slider(`part:${p.id}`, p.name, -180, 180, valueAt(p.props.rotation, t)[0])).join("") :
          '<p class="v3-note">No parts yet. Cut the figure into parts that move on their joints.</p>'}
        <select class="select" data-v3-cut><option value="">Cut a part from the figure…</option>${Object.entries(CUTS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join("")}</select>
        ${parts.length ? '<button class="btn sm" data-v3-act="shape">Shape the parts on the screen</button>' : ""}
        <p class="v3-note">Values are set at the playhead; with a property's stopwatch on, they become keyframes.</p>
      </aside>
    </div>`;
  pose();
}

// Put the figure in its pose: orbit, its own turn and tilt, the layers through its thickness, and its parts.
function pose() {
  const obj = $("v3-obj");
  const fig = $("v3-fig");
  if (!obj || !fig) return;
  const t = S.t;
  const turn = valueAt(getProp(it, "turn"), t)[0];
  const tilt = valueAt(getProp(it, "tilt"), t)[0];
  const thick = (it.thick ?? 3) * 1.6; // shown a little thicker than life, to read at this size
  obj.style.transform = `rotateX(${orbit.x}deg) rotateY(${orbit.y}deg)`;
  const hand = it.hand || [16, 14];
  fig.style.setProperty("--hx", `${hand[0]}%`);
  fig.style.setProperty("--hy", `${hand[1]}%`);
  fig.style.transform = `rotateY(${turn}deg) rotateX(${tilt}deg) scaleX(${it.flip ? -1 : 1})`;
  for (const layer of fig.querySelectorAll(".v3-layer")) {
    const i = Number(layer.dataset.i);
    layer.style.transform = `translateZ(${(thick / 2 - (i * thick) / (LAYERS - 1)).toFixed(2)}px)`;
    poseParts(layer, it, (p) => valueAt(p.props.rotation, t)[0]);
  }
  const rod = fig.querySelector(".v3-rod.main");
  rod.style.transform = `translateX(-50%) translateZ(${(-thick / 2 - 3).toFixed(1)}px)`;
}

function setFrom(input) {
  const key = input.dataset.v3;
  const v = Number(input.value);
  if (!editing) {
    checkpoint();
    editing = true;
  }
  if (key === "thick") it.thick = clamp(v, 0, 12);
  else if (key.startsWith("part:")) setValue(it, `part/${key.slice(5)}/rotation`, [v]);
  else setValue(it, key, [v]);
  const out = dlg().querySelector(`[data-v3-val="${key}"]`);
  if (out) out.textContent = `${round1(v)}${key === "thick" ? " px" : "°"}`;
  pose();
  emit("live");
}

export function initFigure3D() {
  const d = dlg();
  d.addEventListener("input", (e) => {
    if (e.target.matches("[data-v3]")) setFrom(e.target);
  });
  d.addEventListener("change", (e) => {
    if (e.target.matches("[data-v3]")) {
      editing = false;
      commit();
    } else if (e.target.matches("[data-v3-cut]") && e.target.value) {
      checkpoint();
      cutFigure(it, e.target.value);
      S.rigEdit = null;
      commit();
      build();
    }
  });
  d.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v3-act]");
    if (!b) return;
    if (b.dataset.v3Act === "close") d.close();
    if (b.dataset.v3Act === "shape") {
      d.close();
      const first = cutParts(it)[0];
      if (first) S.rigEdit = { item: it.id, part: first.id };
      emit("refresh");
    }
  });
  let drag = null;
  d.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#v3-view")) return;
    drag = { x: e.clientX, y: e.clientY, o: { ...orbit } };
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    orbit = { y: drag.o.y + (e.clientX - drag.x) * 0.45, x: clamp(drag.o.x - (e.clientY - drag.y) * 0.3, -70, 70) };
    pose();
  });
  window.addEventListener("pointerup", () => { drag = null; });
  d.addEventListener("dblclick", (e) => {
    if (!e.target.closest("#v3-view")) return;
    orbit = { x: 0, y: 0 };
    pose();
  });
  // Keep the view in step with the playhead and with undo while it is open.
  d.addEventListener("close", () => { it = null; });
}

// Set the angle the figure is seen from (used by the film renderer for a slow orbit).
export function setOrbit(x, y) {
  orbit = { x, y };
  pose();
}

export function refreshFigure3D() {
  if (!it || !dlg().open) return;
  if (!S.project.items.includes(it)) {
    const again = S.project.items.find((x) => x.id === it.id);
    if (!again) return dlg().close();
    it = again;
  }
  if (editing) return pose();
  build();
}
