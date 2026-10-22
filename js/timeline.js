// The sequence timeline: scenes on the ruler, video tracks, the lighting row and audio tracks.
import { $, S, ICON, esc, keyTimesOf, tc } from "./core.js";
import { PALETTE } from "./library.js";
import { buffers, waves } from "./audio.js";

export const HEAD_W = 210;

function tickSteps() {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120];
  const major = steps.find((s) => s * S.pps >= 96) || 120;
  return { major, minor: major / 5 };
}

function trackRow(it, label) {
  const pps = S.pps;
  const sel = Boolean(S.sel && S.sel.type === "item" && S.sel.id === it.id);
  const times = keyTimesOf(it);
  const left = it.clip.start * pps;
  const width = Math.max((it.clip.end - it.clip.start) * pps, 3);
  const marks = times
    .filter((k) => k >= it.clip.start && k <= it.clip.end)
    .map((k) => `<i style="left:${(k - it.clip.start) * pps}px"></i>`)
    .join("");
  const isAudio = it.kind === "audio";
  let wave = "";
  if (isAudio && waves[it.asset] && buffers[it.asset]) {
    const bd = buffers[it.asset].duration;
    wave = `background-image:url(${waves[it.asset]});background-size:${bd * pps}px 100%;` +
      `background-position:${-(it.clip.offset || 0) * pps}px 0;background-repeat:${it.loop ? "repeat-x" : "no-repeat"};`;
  }
  const toggle = isAudio ? (it.enabled ? ICON.speaker : ICON.speakerOff) : it.enabled ? ICON.eye : ICON.eyeOff;
  return `<div class="tl-row${sel ? " sel" : ""}${isAudio ? " audio" : ""}" data-item="${it.id}">
    <div class="tl-head" style="width:${HEAD_W}px">
      <button class="ib xs${it.locked ? " on" : ""}" data-act="tl-lock" title="Toggle track lock">${it.locked ? ICON.lock : ICON.unlock}</button>
      <span class="tl-v">${label}</span><span class="tl-name">${esc(it.name)}</span>
      <button class="ib xs${it.enabled ? "" : " off"}" data-act="tl-eye" title="${isAudio ? "Mute track" : "Toggle track output"}">${toggle}</button>
    </div>
    <div class="tl-lane" style="width:${S.project.duration * pps + 40}px">
      <div class="clip ${it.kind}${it.enabled ? "" : " muted"}${sel ? " sel" : ""}" data-clip="${it.id}" style="left:${left}px;width:${width}px;--clip:${it.color};${wave}">
        <span class="clip-fx${times.length ? " on" : ""}">fx</span><span class="clip-name">${esc(it.name)}</span>
        <span class="clip-marks">${marks}</span><span class="clip-trim l"></span><span class="clip-trim r"></span>
      </div>
    </div></div>`;
}

export function buildTimeline() {
  const P = S.project;
  const pps = S.pps;
  const W = P.duration * pps;
  const { major, minor } = tickSteps();
  let labels = "";
  for (let s = 0; s <= P.duration + 1e-9; s += major) labels += `<span class="tl-tick" style="left:${s * pps}px">${tc(s)}</span>`;
  const scenes = [...P.scenes].sort((a, b) => a.start - b.start);
  const band = scenes.map((sc, i) =>
    `<div class="tl-scene" data-scene="${sc.id}" title="${esc(sc.title)}" style="left:${sc.start * pps}px;width:${Math.max(3, (sc.end - sc.start) * pps)}px;--c:${PALETTE[i % PALETTE.length]}"><span>${esc(sc.title)}</span></div>`).join("");

  const ruler = `<div class="tl-rrow">
    <div class="tl-corner" style="width:${HEAD_W}px"><span class="tc tc-blue tc-big" id="tl-tc"></span>
      <button class="ib${S.snap ? " on" : ""}" data-act="snap" title="Snap (S)">${ICON.magnet}</button></div>
    <div class="tl-ruler" id="tl-ruler" style="width:${W + 40}px;--minor:${minor * pps}px;--major:${major * pps}px">
      ${band}${labels}<div class="tl-endmark" style="left:${W}px"></div><div class="tl-phead" id="tl-phead"></div>
    </div></div>`;

  const visual = P.items.filter((i) => i.kind !== "audio");
  const audio = P.items.filter((i) => i.kind === "audio");
  const vRows = visual.map((it, i) => trackRow(it, `V${i + 1}`)).reverse().join("");
  const lightTimes = new Set();
  for (const L of P.lights) for (const k of keyTimesOf(L)) lightTimes.add(k);
  const lRow = `<div class="tl-row lights-row">
    <div class="tl-head" style="width:${HEAD_W}px"><span class="tl-v">L</span>
      <span class="tl-name">${P.lights.length} light${P.lights.length === 1 ? "" : "s"}</span>
      <button class="ib xs" data-act="lights-tab" title="Open the Lights tab">${ICON.lamp}</button></div>
    <div class="tl-lane lights-lane" style="width:${W + 40}px">${[...lightTimes].map((k) => `<i style="left:${k * pps}px"></i>`).join("")}</div>
  </div>`;
  const aRows = audio.map((it, i) => trackRow(it, `A${i + 1}`)).join("");

  const grid = $("tl-grid");
  grid.style.width = `${HEAD_W + W + 40}px`;
  grid.innerHTML = ruler + vRows + lRow + aRows + '<div class="tl-pline" id="tl-pline"></div>';
  $("tl-zoom").value = pps;
}

export function renderPlayheads() {
  const x = S.t * S.pps;
  const ph = $("tl-phead");
  if (ph) ph.style.left = `${x}px`;
  const pl = $("tl-pline");
  if (pl) pl.style.left = `${HEAD_W + x}px`;
  if (S.playing) {
    const sc = $("tl-scroll");
    const px = HEAD_W + x;
    if (px > sc.scrollLeft + sc.clientWidth - 30 || px < sc.scrollLeft + HEAD_W) sc.scrollLeft = px - HEAD_W - 60;
  }
}
