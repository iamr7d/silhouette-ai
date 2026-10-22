// Wiring: start-up, pointer gestures, keyboard, menus, transport and the frame loop.
import {
  $, S, FPS, FW, FH, ICON, LAYOUT, checkpoint, clamp, commit, dropCheckpoint, emit, getProp, isProject, keyTimesOf,
  loadProject, on, ownerOf, redo, renderDocState, round1, save, selectedOwner, setValue, snapT, sortKeys, tc, toast,
  undo, valueAt, itemById, kindOf,
} from "./core.js";
import { defaultProject, emptyProject, tidyLights, withRecording } from "./library.js";
import { applyScreen, initStage, renderStage, syncPuppets } from "./stage.js";
import { buildSynths, loadBuiltinFiles, resumeAudio, startAudio, stopAudio, updateAudio } from "./audio.js";
import { bindMotors, buildMotors, tickMotors, tickMotorsUI } from "./motors.js";
import { HEAD_W, buildTimeline, renderPlayheads } from "./timeline.js";
import {
  addSceneAtPlayhead, buildEffects, editLampModal, buildLights, buildProject, buildShow, buildStory, handleAct, hideCtx, hotSpec, onSet, onUi,
  rangeOf, renderLanes, setPrFilter, setProjectTab, showKeyMenu, showTab, startTyping, tickEffects, tickHots,
} from "./panels.js";
import { initRigEditor } from "./rig.js";
import { initFigure3D, openFigure3D, refreshFigure3D } from "./view3d.js";
import { addPart, exportShow, importFiles, importShow, loadUserAssets, removeSelected, select, setClip } from "./actions.js";

let lastFrame = performance.now();
let shownPlaying = null;

// ── Rendering passes ────────────────────────────────────
function tickAll() {
  tickHots(S.gesture && S.gesture.type === "hot" ? S.gesture.el : null);
  tickEffects();
  renderPlayheads();
  $("pm-tc").textContent = tc(S.t);
  $("pm-dur").textContent = tc(S.project.duration);
  if ($("tl-tc")) $("tl-tc").textContent = tc(S.t);
  if (shownPlaying !== S.playing) {
    shownPlaying = S.playing;
    $("btn-play").innerHTML = S.playing ? ICON.stop : ICON.play;
  }
  const back = S.project.screen.view === "backstage";
  $("view-back").classList.toggle("on", back);
  $("view-front").classList.toggle("on", !back);
  $("btn-loop").classList.toggle("on", S.loop);
  $("btn-safe").classList.toggle("on", !$("safe").hidden);
  tickMotorsUI();
}

// During a drag: redraw what moves and keep the element under the pointer.
function live() {
  applyScreen();
  renderStage(S.t);
  renderLanes();
  buildTimeline();
  tickAll();
}

function refresh() {
  applyScreen();
  syncPuppets();
  buildProject();
  buildEffects();
  buildShow();
  buildStory();
  buildLights();
  buildMotors();
  buildTimeline();
  renderStage(S.t);
  tickAll();
  renderDocState();
  refreshFigure3D();
  if (S.playing && S.rate === 1) startAudio(S.t);
}

function setTime(v) {
  S.t = clamp(v, 0, S.project.duration);
  renderStage(S.t);
  tickAll();
}

// ── Transport ───────────────────────────────────────────
async function play(rate = 1) {
  S.rate = rate;
  if (rate > 0 && S.t >= S.project.duration - 1e-6) S.t = 0;
  S.playing = true;
  lastFrame = performance.now();
  if (rate === 1) {
    try {
      await resumeAudio();
    } catch (err) {
      // Audio may be blocked until the next click; the picture still plays.
    }
    startAudio(S.t);
  } else stopAudio();
  tickAll();
}

function stopPlay() {
  S.playing = false;
  S.rate = 1;
  stopAudio();
  if (S.recording) commit();
  tickAll();
}

function togglePlay() {
  if (S.playing && S.rate === 1) stopPlay();
  else play(1);
}

function shuttle(dir) {
  const rate = !S.playing || Math.sign(S.rate) !== dir ? dir : clamp(S.rate * 2, -8, 8);
  play(rate);
  toast(`${rate > 0 ? "Forward" : "Reverse"} ${Math.abs(rate)}×`);
}

function seek(t) {
  if (S.playing) stopPlay();
  setTime(t);
}

function stepFrames(n) {
  seek(snapT(S.t) + n / FPS);
}

function jumpKey(dir) {
  const owner = selectedOwner();
  if (!owner) return;
  const times = keyTimesOf(owner);
  const ft = snapT(S.t);
  const target = dir < 0 ? [...times].reverse().find((k) => k < ft - 1e-6) : times.find((k) => k > ft + 1e-6);
  if (target != null) seek(target);
}

function frame(now) {
  // The frame's timestamp can be a little older than the moment play was pressed; never step backwards.
  // Catch up after a slow frame (up to half a second) so the figures stay with the music.
  const dt = clamp((now - lastFrame) / 1000, 0, 0.5);
  lastFrame = now;
  if (S.playing) {
    S.t += dt * S.rate;
    if (S.t >= S.project.duration) {
      if (S.loop && S.rate > 0) {
        S.t = 0;
        if (S.rate === 1) startAudio(0);
      } else {
        S.t = S.project.duration;
        stopPlay();
      }
    } else if (S.t < 0) {
      S.t = 0;
      stopPlay();
    }
  }
  tickMotors(S.t);
  renderStage(S.t);
  if (S.playing) updateAudio(S.t);
  tickAll();
  requestAnimationFrame(frame);
}

// ── Keyframes ───────────────────────────────────────────
function deleteSelKey() {
  const owner = selectedOwner();
  if (!S.selKey || !owner) return;
  const p = getProp(owner, S.selKey.path);
  if (!p) return;
  checkpoint();
  if (p.keys.length === 1) p.base = p.keys[0].v.slice();
  p.keys = p.keys.filter((k) => k !== S.selKey.key);
  S.selKey = null;
  commit();
}

// ── Zoom and layout ─────────────────────────────────────
function setZoom(v) {
  S.pps = clamp(v, 4, 400);
  buildTimeline();
  tickAll();
}

function zoomFit() {
  setZoom(($("tl-scroll").clientWidth - HEAD_W - 50) / S.project.duration);
  $("tl-scroll").scrollLeft = 0;
}

function loadLayout() {
  try {
    const l = JSON.parse(localStorage.getItem(LAYOUT) || "null");
    if (l && l.col) $("workspace").style.setProperty("--col", l.col);
    if (l && l.row) $("workspace").style.setProperty("--row", l.row);
  } catch (err) {
    // Default layout.
  }
}

function saveLayout() {
  const ws = $("workspace").style;
  try {
    localStorage.setItem(LAYOUT, JSON.stringify({ col: ws.getPropertyValue("--col"), row: ws.getPropertyValue("--row") }));
  } catch (err) {
    // Layout is kept for this visit only.
  }
}

// ── Commands ────────────────────────────────────────────
function newShow(project) {
  checkpoint();
  S.project = project;
  S.sel = null;
  S.selKey = null;
  S.t = 0;
  stopPlay();
  commit();
  zoomFit();
}

function run(cmd) {
  switch (cmd) {
    case "save": save(); toast("Saved"); break;
    case "new-empty":
      if (confirm("Start an empty show? The current one is replaced; you can undo this.")) newShow(emptyProject());
      break;
    case "new-sample":
      if (confirm("Load the sample show? The current one is replaced; you can undo this.")) newShow(defaultProject());
      break;
    case "import-media": $("media-file").click(); break;
    case "import-show": $("show-file").click(); break;
    case "export": exportShow().then(() => toast("Show exported with its media")); break;
    case "undo": undo(); break;
    case "redo": redo(); break;
    case "delete": if (S.selKey) deleteSelKey(); else removeSelected(); break;
    case "play": togglePlay(); break;
    case "start": seek(0); break;
    case "end": seek(S.project.duration); break;
    case "prev-frame": stepFrames(-1); break;
    case "next-frame": stepFrames(1); break;
    case "loop": S.loop = !S.loop; toast(S.loop ? "Loop on" : "Loop off"); tickAll(); break;
    case "safe": $("safe").hidden = !$("safe").hidden; tickAll(); break;
    case "snap": S.snap = !S.snap; toast(S.snap ? "Snap on" : "Snap off"); buildTimeline(); tickAll(); break;
    case "zoom-in": setZoom(S.pps * 1.25); break;
    case "zoom-out": setZoom(S.pps / 1.25); break;
    case "zoom-fit": zoomFit(); break;
    case "scene-add": addSceneAtPlayhead(); break;
    case "view-front":
    case "view-back": {
      const view = cmd === "view-back" ? "backstage" : "audience";
      if (S.project.screen.view === view) break;
      checkpoint();
      S.project.screen.view = view;
      commit();
      toast(view === "backstage" ? "Back view: the puppeteers' side, mirrored, lamps in front" : "Front view: the audience side, shadows on the cloth");
      break;
    }
    case "reset-layout":
      $("workspace").style.removeProperty("--col");
      $("workspace").style.removeProperty("--row");
      saveLayout();
      break;
    case "shortcuts": $("dlg-help").showModal(); break;
    case "figure-3d":
      if (kindOf(S.sel) !== "puppet") return toast("Select a character to see it in 3D");
      openFigure3D();
      break;
    case "close-dialog": $("dlg-help").close(); break;
    default:
      if (cmd.startsWith("tab-")) showTab(cmd.slice(4));
  }
}

function closeMenus() {
  document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
}

// ── Events ──────────────────────────────────────────────
on("refresh", refresh);
on("live", live);
on("motors", buildMotors);
on("seek", seek);
on("cmd", run);
on("delete-key", deleteSelKey);
on("tick", tickAll);

document.addEventListener("click", (e) => {
  const menuBtn = e.target.closest(".menu-btn");
  if (menuBtn) {
    const m = menuBtn.parentElement;
    const wasOpen = m.classList.contains("open");
    closeMenus();
    if (!wasOpen) m.classList.add("open");
    return;
  }
  if (!e.target.closest(".menu")) closeMenus();
  if (!e.target.closest(".ctx")) hideCtx();
  if (e.target.closest("#tab-motors")) return; // the Motors panel handles its own clicks
  const cmd = e.target.closest("[data-cmd]");
  if (cmd) {
    closeMenus();
    run(cmd.dataset.cmd);
    return;
  }
  if (e.target.closest("input, select, textarea, label")) return;
  const act = e.target.closest("[data-act]");
  if (act) {
    handleAct(act);
    return;
  }
  const tab = e.target.closest(".tab[data-tab]");
  if (tab) {
    showTab(tab.dataset.tab);
    return;
  }
  const ptab = e.target.closest(".ptab[data-ptab]");
  if (ptab) setProjectTab(ptab.dataset.ptab);
});

// Double-click a lamp on the rail or in the list to edit it.
document.addEventListener("dblclick", (e) => {
  const lamp = e.target.closest("#tab-lights [data-light]");
  if (lamp && !e.target.closest("input, .hot")) editLampModal(lamp.dataset.light);
  // Double-click a figure on the screen to see it in 3D (not while its parts are being shaped).
  const fig = e.target.closest("#puppets .puppet");
  if (fig && !S.rigEdit) {
    select("item", fig.dataset.id);
    openFigure3D();
  }
});

document.addEventListener("mouseover", (e) => {
  const m = e.target.closest(".menu");
  if (m && document.querySelector(".menu.open") && !m.classList.contains("open")) {
    closeMenus();
    m.classList.add("open");
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.closest("#tab-motors")) return;
  if (el.id === "media-file") {
    await importFiles([...el.files]);
    el.value = "";
  } else if (el.id === "part-file") {
    if (S.sel) await addPart(S.sel.id, el.files[0]);
    el.value = "";
  } else if (el.id === "show-file") {
    try {
      await importShow(el.files[0], isProject);
      toast("Show opened");
      zoomFit();
    } catch (err) {
      alert("That file is not a Silhouette.ai show.");
    }
    el.value = "";
  } else if (el.id === "pm-zoom") {
    $("screen").style.setProperty("--pmz", el.value);
  } else if (el.dataset.set) onSet(el);
  else if (el.dataset.ui) onUi(el);
});

$("pr-search").addEventListener("input", (e) => setPrFilter(e.target.value));
$("tl-zoom").addEventListener("input", (e) => setZoom(Number(e.target.value)));

// Drop image or audio files anywhere to import them.
window.addEventListener("dragover", (e) => {
  if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault();
});
window.addEventListener("drop", (e) => {
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault();
  importFiles([...e.dataTransfer.files]);
});

document.addEventListener("contextmenu", (e) => {
  const kf = e.target.closest("#ec .kf");
  if (!kf) return;
  e.preventDefault();
  const path = kf.closest(".lane").dataset.lane;
  S.selKey = { path, key: getProp(selectedOwner(), path).keys[Number(kf.dataset.idx)] };
  renderLanes();
  showKeyMenu(e.clientX, e.clientY);
});

// ── Pointer gestures ────────────────────────────────────
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const tgt = e.target;
  let el;

  if ((el = tgt.closest(".hot")) && !el.classList.contains("editing")) {
    const spec = hotSpec(el);
    if (!spec) return;
    e.preventDefault();
    checkpoint();
    S.gesture = { type: "hot", el, spec, x0: e.clientX, v0: spec.get(), moved: false };
    return;
  }
  if ((el = tgt.closest("[data-split]"))) {
    e.preventDefault();
    S.gesture = { type: "split", which: el.dataset.split };
    return;
  }
  if ((el = tgt.closest(".puppet .h")) || (el = tgt.closest(".puppet"))) {
    const pel = el.closest(".puppet");
    const id = pel.dataset.id;
    const it = itemById(id);
    if (!S.sel || S.sel.id !== id) select("item", id);
    if (!it || it.locked) return;
    e.preventDefault();
    checkpoint();
    const rect = $("screen").getBoundingClientRect();
    const pos = valueAt(it.props.position, S.t);
    if (el.classList.contains("h")) {
      const fx = S.project.screen.view === "backstage" ? 1 - pos[0] / FW : pos[0] / FW; // the back view is mirrored
      const cx = rect.left + fx * rect.width;
      const cy = rect.top + (pos[1] / FH) * rect.height;
      S.gesture = { type: "scale", it, cx, cy, moved: false, d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, s0: valueAt(it.props.scale, S.t)[0] };
    } else {
      S.gesture = { type: "move", it, x0: e.clientX, y0: e.clientY, pos0: pos, rect, moved: false };
    }
    return;
  }
  if ((el = tgt.closest("#ec .kf"))) {
    e.preventDefault();
    const owner = selectedOwner();
    const lane = el.closest(".lane");
    const path = lane.dataset.lane;
    const p = getProp(owner, path);
    const key = p.keys[Number(el.dataset.idx)];
    const [start, end] = rangeOf(S.sel, owner);
    S.selKey = { path, key };
    checkpoint();
    S.gesture = { type: "ekey", p, key, x0: e.clientX, moved: false, rect: lane.getBoundingClientRect(), start, span: Math.max(end - start, 1 / FPS) };
    renderLanes();
    return;
  }
  if ((el = tgt.closest("#ec-ruler, #ec .lane"))) {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const [start, end] = rangeOf(S.sel, selectedOwner());
    if (S.playing) stopPlay();
    S.gesture = { type: "scrub", toT: (x) => start + ((x - rect.left) / rect.width) * (end - start) };
    setTime(snapT(S.gesture.toT(e.clientX)));
    return;
  }
  if ((el = tgt.closest(".tl-scene"))) {
    const sc = S.project.scenes.find((s) => s.id === el.dataset.scene);
    if (sc) seek(sc.start);
    showTab("story");
    return;
  }
  if ((el = tgt.closest("#tl-ruler"))) {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    if (S.playing) stopPlay();
    S.gesture = { type: "scrub", toT: (x) => (x - rect.left) / S.pps };
    setTime(snapT(S.gesture.toT(e.clientX)));
    return;
  }
  if ((el = tgt.closest(".clip"))) {
    const id = el.dataset.clip;
    const mode = tgt.classList.contains("clip-trim") ? (tgt.classList.contains("l") ? "l" : "r") : "move";
    if (!S.sel || S.sel.id !== id) select("item", id);
    const it = itemById(id);
    if (it.locked) return;
    e.preventDefault();
    checkpoint();
    S.gesture = { type: "clip", it, mode, x0: e.clientX, s0: it.clip.start, e0: it.clip.end, o0: it.clip.offset || 0, moved: false };
    return;
  }
  if ((el = tgt.closest(".tl-lane"))) {
    const rect = el.getBoundingClientRect();
    const row = el.closest(".tl-row");
    if (S.playing) stopPlay();
    S.t = clamp(snapT((e.clientX - rect.left) / S.pps), 0, S.project.duration);
    if (row.dataset.item && (!S.sel || S.sel.id !== row.dataset.item)) select("item", row.dataset.item);
    else {
      renderStage(S.t);
      tickAll();
    }
  }
});

function snapPoint(v, self) {
  if (!S.snap) return v;
  const targets = [0, S.project.duration, S.t];
  for (const it of S.project.items) if (it !== self) targets.push(it.clip.start, it.clip.end);
  for (const sc of S.project.scenes) targets.push(sc.start, sc.end);
  const th = 8 / S.pps;
  let best = v;
  let bestD = th;
  for (const x of targets) {
    const d = Math.abs(x - v);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

window.addEventListener("pointermove", (e) => {
  const g = S.gesture;
  if (!g) return;
  switch (g.type) {
    case "hot": {
      const dx = e.clientX - g.x0;
      if (!g.moved && Math.abs(dx) < 3) return;
      g.moved = true;
      const mult = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 0.1 : 1;
      g.spec.set(g.v0 + dx * g.spec.step * mult);
      g.el.textContent = g.spec.fmt(g.spec.get());
      live();
      break;
    }
    case "split": {
      const ws = $("workspace");
      const r = ws.getBoundingClientRect();
      if (g.which === "col") ws.style.setProperty("--col", `${clamp(e.clientX - r.left, 340, r.width - 380)}px`);
      else ws.style.setProperty("--row", `${clamp(e.clientY - r.top, 220, r.height - 170)}px`);
      break;
    }
    case "move": {
      // In the mirrored back view, dragging right moves the figure left on the audience's cloth.
      const dx = (e.clientX - g.x0) * (S.project.screen.view === "backstage" ? -1 : 1);
      const dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) < 2) return;
      g.moved = true;
      setValue(g.it, "position", [round1(g.pos0[0] + (dx / g.rect.width) * FW), round1(g.pos0[1] + (dy / g.rect.height) * FH)]);
      live();
      break;
    }
    case "scale": {
      g.moved = true;
      const d = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      setValue(g.it, "scale", [round1(clamp((g.s0 * d) / g.d0, 1, 800))]);
      live();
      break;
    }
    case "ekey": {
      if (!g.moved && Math.abs(e.clientX - g.x0) < 3) return;
      g.moved = true;
      let nt = snapT(g.start + ((e.clientX - g.rect.left) / g.rect.width) * g.span);
      if (S.snap && (Math.abs(nt - S.t) / g.span) * g.rect.width < 6) nt = snapT(S.t);
      g.key.t = clamp(nt, 0, S.project.duration);
      sortKeys(g.p);
      renderLanes();
      renderStage(S.t);
      tickAll();
      break;
    }
    case "scrub":
      setTime(snapT(g.toT(e.clientX)));
      break;
    case "clip": {
      const dxp = e.clientX - g.x0;
      if (!g.moved && Math.abs(dxp) < 3) return;
      g.moved = true;
      const dt = dxp / S.pps;
      const it = g.it;
      const len = g.e0 - g.s0;
      if (g.mode === "move") {
        let ns = clamp(g.s0 + dt, 0, S.project.duration - len);
        const s1 = snapPoint(ns, it);
        if (s1 !== ns) ns = s1;
        else {
          const e1 = snapPoint(ns + len, it);
          if (e1 !== ns + len) ns = e1 - len;
        }
        ns = clamp(snapT(ns), 0, S.project.duration - len);
        it.clip.start = ns;
        it.clip.end = snapT(ns + len);
      } else {
        it.clip.start = g.s0;
        it.clip.end = g.e0;
        it.clip.offset = g.o0;
        if (g.mode === "l") setClip(it, "start", snapPoint(g.s0 + dt, it));
        else setClip(it, "end", snapPoint(g.e0 + dt, it));
      }
      live();
      break;
    }
  }
});

function endGesture() {
  const g = S.gesture;
  if (!g) return;
  S.gesture = null;
  if (g.type === "hot") {
    if (g.moved) commit();
    else {
      dropCheckpoint();
      startTyping(g.el);
    }
  } else if (["move", "scale", "ekey", "clip"].includes(g.type)) {
    if (g.moved) commit();
    else {
      dropCheckpoint();
      refresh();
    }
  } else if (g.type === "split") saveLayout();
}
window.addEventListener("pointerup", endGesture);
window.addEventListener("pointercancel", endGesture);

document.addEventListener("keydown", (e) => {
  if (e.target instanceof Element && e.target.closest("input, textarea, select, .hot-input")) return;
  if ($("dlg-help").open || $("dlg-form").open || $("dlg-3d").open) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  if (ctrl && (k === "z" || k === "Z")) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (ctrl && (k === "y" || k === "Y")) { e.preventDefault(); redo(); return; }
  if (ctrl && (k === "s" || k === "S")) { e.preventDefault(); run("save"); return; }
  if (ctrl && (k === "i" || k === "I")) { e.preventDefault(); run("import-media"); return; }
  if (ctrl) return;
  switch (k) {
    case " ": e.preventDefault(); togglePlay(); break;
    case "j": case "J": shuttle(-1); break;
    case "k": case "K": stopPlay(); break;
    case "l": case "L": shuttle(1); break;
    case "ArrowLeft": e.preventDefault(); stepFrames(e.shiftKey ? -5 : -1); break;
    case "ArrowRight": e.preventDefault(); stepFrames(e.shiftKey ? 5 : 1); break;
    case "ArrowUp": e.preventDefault(); jumpKey(-1); break;
    case "ArrowDown": e.preventDefault(); jumpKey(1); break;
    case "Home": run("start"); break;
    case "End": run("end"); break;
    case "Delete": case "Backspace": e.preventDefault(); run("delete"); break;
    case "=": case "+": run("zoom-in"); break;
    case "-": run("zoom-out"); break;
    case "\\": run("zoom-fit"); break;
    case "s": case "S": run("snap"); break;
    case "m": case "M": run("scene-add"); break;
    case "?": run("shortcuts"); break;
    case "Escape":
      closeMenus();
      hideCtx();
      if (S.rigEdit) {
        S.rigEdit = null;
        refresh();
      }
      break;
  }
});

// ── Start ───────────────────────────────────────────────
S.project = tidyLights(withRecording(loadProject() || defaultProject()));
// The project was renamed from ShadowStage: update the title card of shows saved before.
for (const it of S.project.items) if (it.kind === "title" && it.card.kicker) it.card.kicker = it.card.kicker.replace("ShadowStage", "Silhouette.ai");
// Vipin's credit was corrected: update the thanks card of shows saved before.
for (const it of S.project.items) {
  if (it.kind === "title" && it.card.body) {
    it.card.body = it.card.body.replace("*Vipin Alathoor*, National Award-winning Tholpavakoothu artist", "*Vipin Viswanathan Pulavar*, fifteenth-generation Tholpavakoothu artist");
  }
}
const firstPuppet = S.project.items.find((i) => i.kind === "puppet");
S.sel = firstPuppet ? { type: "item", id: firstPuppet.id } : null;
document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = ICON[el.dataset.icon]; });
buildSynths();
loadLayout();
initStage();
// While a part is dragged only the screen is redrawn; the panels catch up when the drag ends.
initFigure3D();
initRigEditor((dragging) => {
  if (!dragging) return refresh();
  syncPuppets();
  renderStage(S.t);
});
bindMotors();
refresh();
requestAnimationFrame(() => {
  zoomFit();
  requestAnimationFrame(frame);
});
Promise.all([loadUserAssets(), loadBuiltinFiles()]).then(refresh);
