// Stall detector: when the video should be playing but has neither moved its playhead nor
// received any media bytes for STALL_MS, the room shows a 重新加载 (reload) button next to
// the viewer count. Clicking it tears the player down and builds it again (App.reloadPlayer).
//
// Console: window.watchparty.stall() prints the detector state; [stall] lines log each change.

export const STALL_MS = 5000;

/** Pure decision, kept separate for tests: stalled once nothing happened for STALL_MS. */
export function isStalled(shouldWatch: boolean, now: number, lastActivity: number, stallMs = STALL_MS) {
  return shouldWatch && now - lastActivity >= stallMs;
}

let lastActivity = 0;
const now = () => Date.now();

/** Any sign of life: segment bytes arriving (qfile loader), playhead moving, data loaded. */
export function noteMediaActivity() {
  lastActivity = now();
}

/**
 * Watches a <video>. `shouldWatch` says whether it ought to be playing right now (media set,
 * room not paused, not blocked on a tap); `onChange` gets each stalled/unstalled switch.
 * Returns a stop function.
 */
export function watchStalls(
  video: HTMLVideoElement,
  shouldWatch: () => boolean,
  onChange: (stalled: boolean) => void,
  stallMs = STALL_MS,
) {
  let lastTime = video.currentTime;
  let watching = false;
  let stalled = false;
  noteMediaActivity();
  const onTime = () => {
    if (Math.abs(video.currentTime - lastTime) > 0.01) {
      lastTime = video.currentTime;
      noteMediaActivity();
    }
  };
  const onData = () => noteMediaActivity();
  const events = ["progress", "loadeddata", "canplay", "playing", "seeked", "emptied", "loadstart"];
  video.addEventListener("timeupdate", onTime);
  for (const e of events) video.addEventListener(e, onData);
  const timer = setInterval(() => {
    const should = shouldWatch();
    // Starting to watch (new media, unpaused) counts as activity: the 5 s run from here.
    if (should && !watching) noteMediaActivity();
    watching = should;
    const next = isStalled(should, now(), lastActivity, stallMs);
    if (next !== stalled) {
      stalled = next;
      console.log("[stall] %s at %ss (%s)", stalled ? "stalled" : "playing again",
        video.currentTime.toFixed(1), video.currentSrc ? "src set" : "no src");
      onChange(stalled);
    }
  }, 1000);
  (window as any).watchparty = (window as any).watchparty || {};
  (window as any).watchparty.stall = () => ({
    watching, stalled, idleMs: Math.round(now() - lastActivity), currentTime: video.currentTime,
    readyState: video.readyState, paused: video.paused,
  });
  return () => {
    clearInterval(timer);
    video.removeEventListener("timeupdate", onTime);
    for (const e of events) video.removeEventListener(e, onData);
  };
}
