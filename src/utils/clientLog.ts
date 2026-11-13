// Opt-in remote error log for devices without a reachable console (phones).
// Open any page with ?log=1: uncaught errors, console.warn/error, <video> errors
// and a device summary are sent to the server, which prints them as [clientlog].
const MAX_LINE = 500;
let queue: string[] = [];
let timer: number | undefined;

export function startClientLog(serverPath: string) {
  const send = () => {
    timer = undefined;
    if (!queue.length) return;
    const lines = queue.splice(0, 40);
    fetch(`${serverPath}/clientlog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
      keepalive: true,
    }).catch(() => {});
    if (queue.length) timer = window.setTimeout(send, 1000);
  };
  const log = (kind: string, ...parts: unknown[]) => {
    const text = parts
      .map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === "string" ? p : safeJson(p)))
      .join(" ");
    queue.push(`${new Date().toISOString().slice(11, 23)} ${kind} ${text}`.slice(0, MAX_LINE));
    if (queue.length > 200) queue = queue.slice(-200);
    if (timer === undefined) timer = window.setTimeout(send, 1500);
  };

  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => { original(...args); log(level, ...args); };
  }
  window.addEventListener("error", (e) => log("uncaught", e.message, `${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => log("rejection", e.reason));
  // Media errors don't bubble; listen in the capture phase.
  document.addEventListener("error", (e) => {
    const el = e.target as HTMLMediaElement | null;
    if (el && (el.tagName === "VIDEO" || el.tagName === "AUDIO")) {
      log("media", `code=${el.error?.code} ${el.error?.message ?? ""}`, String(el.currentSrc || el.src).slice(0, 120));
    }
  }, true);

  const w = window as any;
  log("device", navigator.userAgent, {
    secureContext: window.isSecureContext,
    MediaSource: Boolean(w.MediaSource),
    ManagedMediaSource: Boolean(w.ManagedMediaSource),
    nativeHls: document.createElement("video").canPlayType("application/vnd.apple.mpegurl"),
    screen: `${screen.width}x${screen.height}`,
  });
}

function safeJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
