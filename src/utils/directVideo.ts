// Plain video files (mp4 and similar) played straight from a URL by the HTML player.
//
// Signed CDN links behind netdisk resolver URLs (NFD /parser, lanzou, iCloud) expire
// (iCloud 15 min, lanzou under an hour). When the browser then asks for a new byte
// range it gets 403/410 and the <video> fires "error". Setting the same src again
// re-requests the resolver URL, which redirects to a fresh link, and playback resumes
// at this viewer's own position. Syncing to the room stays manual (sync button).

/** Reload attempts allowed per window before giving up (error stays visible). */
export const MAX_RELOADS = 4;
export const RELOAD_WINDOW_MS = 5 * 60_000;

/** Reload attempts still allowed, given the times of earlier attempts. */
export function reloadsLeft(attempts: number[], nowMs: number): number {
  return MAX_RELOADS - attempts.filter((t) => nowMs - t < RELOAD_WINDOW_MS).length;
}

export type DirectVideoState = {
  src: string;
  reloads: number;
  lastError?: string;
  gaveUp: boolean;
  log: string[];
};

type Options = {
  /** Whether the room is playing (resume playback after the reload). */
  shouldPlay: () => boolean;
};

let detachCurrent: (() => void) | undefined;

/**
 * Watch `video` while it plays `src`; on a media error, reload the same src at the
 * resume time (backoff 1 s, 2 s, 4 s, 8 s; at most MAX_RELOADS per RELOAD_WINDOW_MS).
 * Replaces any earlier watcher. State is readable at window.watchparty.directVideo.
 */
export function watchDirectVideo(video: HTMLVideoElement, src: string, opts: Options): () => void {
  detachCurrent?.();
  const state: DirectVideoState = { src, reloads: 0, gaveUp: false, log: [] };
  (window as any).watchparty.directVideo = state;
  const attempts: number[] = [];
  let lastTime = video.currentTime || 0;
  let timer: number | undefined;
  const note = (line: string) => {
    state.log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
    if (state.log.length > 50) state.log.shift();
    console.log("[directvideo]", line);
  };
  const ours = () => video.getAttribute("src") === src;
  const onTime = () => {
    if (ours() && video.currentTime > 0) lastTime = video.currentTime;
  };
  const onError = () => {
    if (!ours() || timer !== undefined) return;
    const code = video.error?.code;
    state.lastError = `code=${code} ${video.error?.message ?? ""}`.trim();
    const now = Date.now();
    if (reloadsLeft(attempts, now) <= 0) {
      state.gaveUp = true;
      note(`error ${state.lastError} at t=${lastTime.toFixed(1)}; gave up after ${attempts.length} reloads`);
      return;
    }
    attempts.push(now);
    const wait = 1000 * 2 ** Math.min(attempts.length - 1, 3);
    note(`error ${state.lastError} at t=${lastTime.toFixed(1)}; reload #${attempts.length} in ${wait} ms`);
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!ours()) return;
      const at = lastTime;
      state.reloads++;
      video.removeAttribute("src");
      video.load();
      video.src = src;
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.currentTime = at;
          note(`reloaded, resumed at t=${at.toFixed(1)}`);
          if (opts.shouldPlay()) video.play().catch((e) => note(`play after reload failed: ${e}`));
        },
        { once: true },
      );
    }, wait);
  };
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("error", onError);
  const detach = () => {
    video.removeEventListener("timeupdate", onTime);
    video.removeEventListener("error", onError);
    if (timer !== undefined) window.clearTimeout(timer);
    if (detachCurrent === detach) detachCurrent = undefined;
  };
  detachCurrent = detach;
  return detach;
}

/** Stop watching (another kind of media started). */
export function stopWatchingDirectVideo() {
  detachCurrent?.();
}
