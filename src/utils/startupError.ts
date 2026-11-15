// Startup failures on the room page get a short code (shown to the viewer, who sends it
// to the admin) and one best-effort [clientlog] line on the server.
//   E1 resolveRoom (vanity name)   E2 resolveShard   E3 guest identity
//   E4 socket connect_error        E5 nothing answered within STARTUP_TIMEOUT_MS
export const STARTUP_TIMEOUT_MS = 15000;
const FETCH_TIMEOUT_MS = 10000;

export class StartupError extends Error {
  constructor(public code: string, detail: string) {
    super(detail);
  }
}

// fetch that fails with a coded StartupError on network error, timeout or non-2xx.
export async function startupFetch(code: string, url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!resp.ok) throw new StartupError(code, `HTTP ${resp.status}`);
    return resp;
  } catch (e: any) {
    if (e instanceof StartupError) throw e;
    throw new StartupError(code, ctrl.signal.aborted ? "timeout" : `${e?.name ?? "Error"}: ${e?.message ?? e}`);
  } finally {
    window.clearTimeout(timer);
  }
}

export function reportStartupError(serverPath: string, code: string, detail: string) {
  const line = `startup ${code} ${detail} path=${location.pathname} online=${navigator.onLine} ua=${navigator.userAgent}`;
  try {
    fetch(`${serverPath}/clientlog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: [line.slice(0, 500)] }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best effort only
  }
}
