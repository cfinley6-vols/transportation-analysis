// One shared animation clock (in seconds) for every map on the page.
// Pausing freezes it; resuming continues from where it stopped.
// Motion starts paused if the operating system asks for reduced motion.

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const state = { playing: !reducedMotion, pausedAt: performance.now(), pausedTotal: 0 };

export const isPlaying = () => state.playing;

export function setPlaying(playing) {
  if (playing === state.playing) return;
  const now = performance.now();
  if (playing) state.pausedTotal += now - state.pausedAt;
  else state.pausedAt = now;
  state.playing = playing;
}

export function clock() {
  const now = state.playing ? performance.now() : state.pausedAt;
  return (now - state.pausedTotal) / 1000;
}
