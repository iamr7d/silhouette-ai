// A virtual clock for recording a page frame by frame (used by tools/record_demo.py).
// Capturing a frame takes the browser far longer than a frame lasts, so on the real clock every animation would leap
// ahead by uneven amounts between captures and play back fast and jerky. Here the page's time stands still until
// the recorder calls window.__advance(ms): timers and intervals fire in order, animation-frame callbacks run once, and
// CSS animations and transitions are set to the same moment. Each captured frame is then exactly ms later than the
// last, so the motion plays back at its true speed.
(() => {
  let now = 0;
  const epoch = Date.now();
  const RealDate = Date;
  performance.now = () => now;
  Date.now = () => epoch + now;
  window.Date = class extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [epoch + now]));
    }
    static now() {
      return epoch + now;
    }
  };

  let frames = [];
  let frameId = 0;
  window.requestAnimationFrame = (cb) => {
    frames.push([++frameId, cb]);
    return frameId;
  };
  window.cancelAnimationFrame = (id) => {
    frames = frames.filter((f) => f[0] !== id);
  };

  let timers = [];
  let timerId = 0;
  window.setTimeout = (cb, ms = 0, ...args) => {
    timers.push({ id: ++timerId, at: now + Math.max(0, Number(ms) || 0), cb, args });
    return timerId;
  };
  window.setInterval = (cb, ms = 0, ...args) => {
    const every = Math.max(1, Number(ms) || 0);
    timers.push({ id: ++timerId, at: now + every, cb, args, every });
    return timerId;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    timers = timers.filter((t) => t.id !== id);
  };

  const born = new WeakMap();
  window.__advance = (ms) => {
    const target = now + ms;
    for (let guard = 0; guard < 10000; guard++) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > target) break;
      now = t.at;
      if (t.every) t.at += t.every;
      else timers.shift();
      try {
        typeof t.cb === "function" ? t.cb(...t.args) : null;
      } catch (e) {
        console.error(e);
      }
    }
    now = target;
    const due = frames;
    frames = [];
    for (const [, cb] of due) {
      try {
        cb(now);
      } catch (e) {
        console.error(e);
      }
    }
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, now - (Number(a.currentTime) || 0));
      a.pause();
      a.currentTime = Math.max(0, now - born.get(a));
    }
    return now;
  };
})();
