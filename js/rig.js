// Rigging: a figure cut into parts from its own image. Each cut part is an outline over the figure (in % of its box),
// a joint it turns on, and optionally a parent part it hangs from (an upper arm carrying a forearm). The body shows
// everything outside the parts' outlines; each part shows the image inside its outline and turns on its joint.
// The outlines and joints are edited on the screen, with the figure in its rest pose.
import { S, checkpoint, clamp, commit, dropCheckpoint, itemById, round1, toast, uid } from "./core.js";

export const isCut = (p) => Boolean(p && p.cut);
export const cutParts = (it) => (it.parts || []).filter(isCut);
export const childrenOf = (it, id) => cutParts(it).filter((p) => (p.parent || null) === id);

const pts = (poly) => poly.map(([x, y]) => `${round1(x)} ${round1(y)}`).join(",");
// CSS clip-path for the inside of an outline.
export const clipOf = (poly) => `polygon(${poly.map(([x, y]) => `${round1(x)}% ${round1(y)}%`).join(", ")})`;
// CSS mask that hides the given outlines (the body without its parts, or a part without its own children).
export function maskOf(polys) {
  if (!polys.length) return "";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>` +
    `<rect width='100' height='100' fill='white'/>${polys.map((p) => `<polygon points='${pts(p)}' fill='black'/>`).join("")}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// The figure as body and cut parts: the body without its parts, and each part (with its children nested inside, so
// they move with it) showing the image within its outline. With rods, the arm stick rides on the part that holds it.
export function figureHTML(it, src, alt = "", rods = true) {
  const cutHTML = (p) => {
    const kids = childrenOf(it, p.id);
    const mask = maskOf(kids.map((q) => q.poly));
    const style = `clip-path:${clipOf(p.poly)};${mask ? `-webkit-mask-image:${mask};mask-image:${mask};` : ""}`;
    return `<div class="cut" data-part="${p.id}" style="transform-origin:${p.pivot[0]}% ${p.pivot[1]}%">` +
      `<img class="cutimg" src="${src}" alt="" draggable="false" style="${attr(style)}">` +
      (rods && p.stick ? '<span class="rod arm"></span>' : "") + kids.map(cutHTML).join("") + "</div>";
  };
  const top = childrenOf(it, null);
  const bodyMask = maskOf(top.map((q) => q.poly));
  const bodyStyle = bodyMask ? ` style="${attr(`-webkit-mask-image:${bodyMask};mask-image:${bodyMask};`)}"` : "";
  return `<img class="body" src="${src}" alt="${attr(alt)}" draggable="false"${bodyStyle}>` + top.map(cutHTML).join("");
}
const attr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Turn each cut part of a figure's element to its angle at time t (all at rest when `rest`), and turn the arm stick
// back so it still hangs to the puppeteer's hand.
export function poseParts(el, it, angleOf) {
  for (const part of cutParts(it)) {
    const div = el.querySelector(`.cut[data-part="${part.id}"]`);
    if (!div) continue;
    const pr = angleOf(part);
    div.style.transform = pr ? `rotate(${pr}deg)` : "";
    if (part.stick) {
      let total = 0;
      for (let q = part; q; q = q.parent && cutParts(it).find((x) => x.id === q.parent)) total += angleOf(q);
      const rod = div.querySelector(":scope > .rod.arm");
      if (rod) rod.style.transform = `translateX(-50%) rotate(${-total}deg)`;
    }
  }
}

function part(name, poly, pivot, extra = {}) {
  return { id: uid("part"), name, cut: true, poly, pivot, parent: null, stick: false, props: { rotation: { base: [0], keys: [] } }, ...extra };
}

// A strip along a limb, from a joint to its end, `w` wide on each side.
function strip(a, b, w, back = 3, over = 6) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n = [-d[1], d[0]];
  const s = [a[0] - d[0] * back, a[1] - d[1] * back];
  const e = [b[0] + d[0] * over, b[1] + d[1] * over];
  const P = (p, k) => [clamp(p[0] + n[0] * k, -5, 105), clamp(p[1] + n[1] * k, -5, 105)];
  return [P(s, w), P(e, w * 0.85), P(e, -w * 0.85), P(s, -w)];
}

// Outlines traced for the built-in figures, so their parts come away whole (in % of the figure's image).
const TRACED = {
  "img:rama": {
    // the raised forearm and hand, turning at the elbow; the arm stick is at the hand
    arm: { name: "Forearm", poly: [[3, 8], [9, 0], [23, 0], [26, 9], [24.5, 18], [24.5, 27], [21, 32.5], [10, 34], [6.5, 29], [8.5, 21], [6.5, 15], [3, 11.5]], pivot: [15, 32], hand: [16, 14] },
    // the head with its crown, ear ornaments and the hair falling behind, turning at the neck
    head: { name: "Head", poly: [[41, 4], [48, 0], [58, 0], [64, 7], [80, 11], [84, 19], [77, 26], [65, 29], [55, 31], [46, 30], [41.5, 23], [40.5, 12]], pivot: [53, 29] },
  },
};

// The ways to cut a figure. Each returns the new parts; they are rough starting outlines to adjust on the screen
// (or, for the built-in figures with traced outlines, ready to use).
export const CUTS = {
  head: {
    label: "Head",
    make: (it) => {
      const tr = (TRACED[it.asset] || {}).head;
      if (tr) return [part(tr.name, tr.poly.map((p) => p.slice()), tr.pivot.slice())];
      return [part("Head", [[30, 0], [70, 0], [72, 21], [61, 27], [39, 27], [28, 21]], [50, 26])];
    },
  },
  arm: {
    label: "Arm, to the hand stick",
    make: (it) => {
      const tr = (TRACED[it.asset] || {}).arm;
      if (tr) {
        it.hand = tr.hand.slice(); // the stick goes to the traced hand
        return [part(tr.name, tr.poly.map((p) => p.slice()), tr.pivot.slice(), { stick: true })];
      }
      const hand = it.hand || [16, 14];
      const shoulder = [hand[0] < 50 ? 44 : 56, 32];
      return [part("Arm", strip(shoulder, hand, 7), shoulder, { stick: true })];
    },
  },
  elbow: {
    label: "Elbow (splits the arm)",
    make: (it) => {
      const arm = cutParts(it).find((p) => p.stick);
      if (!arm) {
        toast("Cut the arm first, then split it at the elbow");
        return [];
      }
      const hand = it.hand || [16, 14];
      const elbow = [(arm.pivot[0] + hand[0]) / 2, (arm.pivot[1] + hand[1]) / 2];
      arm.stick = false;
      return [part("Forearm", strip(elbow, hand, 6, 2), elbow, { parent: arm.id, stick: true })];
    },
  },
  legs: {
    label: "Legs",
    make: () => [
      part("Front leg", [[16, 70], [50, 70], [50, 100], [12, 100]], [36, 72]),
      part("Back leg", [[50, 70], [84, 70], [88, 100], [50, 100]], [64, 72]),
    ],
  },
  free: { label: "Free shape", make: () => [part("Part", [[40, 40], [60, 40], [60, 60], [40, 60]], [50, 42])] },
};

export function cutFigure(it, kind) {
  const made = CUTS[kind].make(it);
  if (!made.length) return;
  it.parts = it.parts || [];
  for (const p of made) {
    let name = p.name;
    for (let n = 2; it.parts.some((q) => q.name === name); n++) name = `${p.name} ${n}`;
    p.name = name;
    it.parts.push(p);
  }
  S.rigEdit = { item: it.id, part: made[made.length - 1].id };
  toast(`${made.map((p) => p.name).join(" and ")} cut from ${it.name}. Drag the points and the joint on the screen to fit`);
}

export function removePart(it, id) {
  // A removed part's children hang from its parent instead.
  const gone = it.parts.find((p) => p.id === id);
  for (const p of it.parts) if (p.parent === id) p.parent = gone ? gone.parent : null;
  if (gone && gone.stick) {
    const up = gone.parent && it.parts.find((p) => p.id === gone.parent);
    if (up) up.stick = true;
  }
  it.parts = it.parts.filter((p) => p.id !== id);
  if (S.rigEdit && S.rigEdit.part === id) S.rigEdit = null;
}

// A part may hang from any other cut part that does not hang from it.
export function canParent(it, part, parentId) {
  for (let id = parentId; id; id = (cutParts(it).find((p) => p.id === id) || {}).parent) if (id === part.id) return false;
  return true;
}

// ── The editor on the screen ────────────────────────────
// Drawn inside the figure (so it follows its place and size); the figure is shown upright and in its rest pose.
export function editorHTML(it) {
  const ed = S.rigEdit;
  if (!ed || ed.item !== it.id) return "";
  const cur = cutParts(it).find((p) => p.id === ed.part);
  let html = '<div class="rig-edit"><svg viewBox="0 0 100 100" preserveAspectRatio="none">';
  for (const p of cutParts(it)) {
    html += `<polygon class="rig-poly${p === cur ? " cur" : ""}" data-part="${p.id}" points="${pts(p.poly)}"/>`;
  }
  html += "</svg>";
  if (cur) {
    cur.poly.forEach(([x, y], i) => {
      html += `<span class="rig-pt" data-i="${i}" style="left:${x}%;top:${y}%" title="Drag to move; double-click to remove"></span>`;
    });
    html += `<span class="rig-pivot" style="left:${cur.pivot[0]}%;top:${cur.pivot[1]}%" title="The joint: drag to move"></span>`;
  }
  return html + "</div>";
}

let drag = null;

// Where a pointer is on a figure, in % of its box (the figure is upright while editing; it may be mirrored).
function local(e, pel, it) {
  const r = pel.querySelector("img.body").getBoundingClientRect();
  let x = ((e.clientX - r.left) / r.width) * 100;
  const y = ((e.clientY - r.top) / r.height) * 100;
  if (Boolean(it.flip) !== (S.project.screen.view === "backstage")) x = 100 - x;
  return [round1(clamp(x, -10, 110)), round1(clamp(y, -10, 110))];
}

function nearestEdge(poly, [x, y]) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const u = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const d = Math.hypot(a[0] + dx * u - x, a[1] + dy * u - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function initRigEditor(onChange) {
  const host = document.getElementById("puppets");
  host.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".rig-pt, .rig-pivot, .rig-poly");
    if (!h || !S.rigEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const pel = h.closest(".puppet");
    const it = itemById(pel.dataset.id);
    if (h.classList.contains("rig-poly")) {
      // Click another part's outline to edit it instead.
      S.rigEdit = { item: it.id, part: h.dataset.part };
      onChange(false);
      return;
    }
    const part = cutParts(it).find((p) => p.id === S.rigEdit.part);
    if (!part) return;
    checkpoint();
    drag = { it, part, pel, i: h.classList.contains("rig-pt") ? Number(h.dataset.i) : -1, moved: false };
  }, true);
  host.addEventListener("dblclick", (e) => {
    if (!S.rigEdit) return;
    const pel = e.target.closest(".puppet");
    if (!pel) return;
    const it = itemById(pel.dataset.id);
    const part = it && cutParts(it).find((p) => p.id === S.rigEdit.part);
    if (!part) return;
    e.stopPropagation();
    checkpoint();
    const pt = e.target.closest(".rig-pt");
    if (pt) {
      if (part.poly.length <= 3) return toast("A part needs at least three points");
      part.poly.splice(Number(pt.dataset.i), 1);
    } else {
      const at = local(e, pel, it);
      part.poly.splice(nearestEdge(part.poly, at) + 1, 0, at);
    }
    commit();
  }, true);
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.moved = true;
    const at = local(e, drag.pel, drag.it);
    if (drag.i >= 0) drag.part.poly[drag.i] = at;
    else drag.part.pivot = at;
    onChange(true);
  });
  window.addEventListener("pointerup", () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) commit();
    else dropCheckpoint();
  });
}
