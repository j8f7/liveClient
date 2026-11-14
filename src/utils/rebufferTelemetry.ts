// Rebuffer telemetry: reports each stall that happens after playback has started
// (the first load of a video, and loads after a seek, are not counted). The server
// adds the viewer's IP from the request and logs it as a [rebuffer] line.
//
// Speeds come from the qfile segment loader's byte progress (noteSegmentBytes),
// because the CDN sends no Timing-Allow-Origin header, so browser resource
// timings report 0 bytes for its segments.

type Sample = { at: number; bytes: number };

const RECENT_WINDOW_MS = 10_000;
const MIN_STALL_MS = 250;

let samples: Sample[] = [];
let totalBytes = 0;
let lastLoaded = 0;

/** Called with the loader's `loaded` value; it restarts at 0 for each new segment. */
export function noteSegmentBytes(loaded: number) {
  const delta = loaded >= lastLoaded ? loaded - lastLoaded : loaded;
  lastLoaded = loaded;
  if (delta <= 0) return;
  totalBytes += delta;
  const now = performance.now();
  samples.push({ at: now, bytes: totalBytes });
  while (samples.length > 2 && now - samples[0].at > RECENT_WINDOW_MS) samples.shift();
}

/** Bytes per second over the last ~10 s of segment downloads (null without data). */
function recentBps(now: number) {
  const first = samples.find((s) => now - s.at <= RECENT_WINDOW_MS);
  if (!first) return null;
  const seconds = (now - first.at) / 1000;
  return seconds >= 0.5 ? (totalBytes - first.bytes) / seconds : null;
}

function bufferAhead(video: HTMLVideoElement) {
  const t = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= t + 0.1 && video.buffered.end(i) >= t) {
      return video.buffered.end(i) - t;
    }
  }
  return 0;
}

/**
 * Watches a <video> element. `context` supplies the room, media URL and the hls.js
 * bandwidth estimate (bits/s) at report time.
 */
export function watchRebuffers(
  video: HTMLVideoElement,
  serverPath: string,
  context: () => { room: string; media: string; estimateBitsPerSec?: number },
) {
  let started = false; // playback has begun for the current media
  let seeking = false;
  let stall: { at: number; bytesAtStart: number; recentBps: number | null; bufferAhead: number } | null = null;
  let count = 0;

  const send = (stallMs: number, ongoing: boolean) => {
    if (!stall) return;
    const now = performance.now();
    const seconds = (now - stall.at) / 1000;
    const ctx = context();
    count++;
    const body = JSON.stringify({
      kind: "rebuffer",
      room: ctx.room,
      media: ctx.media,
      videoTime: video.currentTime,
      stallMs,
      ongoing,
      stallBps: seconds > 0.2 ? (totalBytes - stall.bytesAtStart) / seconds : null,
      recentBps: stall.recentBps,
      estimateBps: ctx.estimateBitsPerSec ? ctx.estimateBitsPerSec / 8 : null,
      bufferAhead: stall.bufferAhead,
      count,
    });
    const url = `${serverPath}/telemetry`;
    // text/plain needs no CORS preflight, so it also works from sendBeacon on exit.
    if (ongoing && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
    } else {
      fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body, keepalive: true }).catch(() => {});
    }
  };

  const reset = () => {
    started = false;
    stall = null;
  };

  video.addEventListener("emptied", reset);
  video.addEventListener("loadstart", reset);
  video.addEventListener("seeking", () => {
    seeking = true;
    stall = null; // buffering after a seek is not a rebuffer
  });
  video.addEventListener("seeked", () => {
    seeking = false;
  });
  video.addEventListener("waiting", () => {
    if (!started || seeking || video.seeking || video.paused || stall) return;
    const now = performance.now();
    stall = { at: now, bytesAtStart: totalBytes, recentBps: recentBps(now), bufferAhead: bufferAhead(video) };
  });
  video.addEventListener("playing", () => {
    if (!started) {
      started = true;
      return;
    }
    if (!stall) return;
    const stallMs = performance.now() - stall.at;
    if (stallMs >= MIN_STALL_MS) send(stallMs, false);
    stall = null;
  });
  // A pause during a stall ends it without a report (the viewer chose to stop).
  video.addEventListener("pause", () => {
    stall = null;
  });
  // Leaving while still stalled is the worst case: report it as ongoing.
  window.addEventListener("pagehide", () => {
    if (stall) send(performance.now() - stall.at, true);
  });
}
