import { serverPath } from "./utils";
export interface GuestIdentity { name: string; token: string }
const KEY = "watchparty-guest-identity";
let pending: Promise<GuestIdentity> | undefined;
// Issued by the server: kept for the rest of the page.
let confirmed: GuestIdentity | undefined;
// Offline stand-in (the saved label, else a generated guest_worldmelonNNNN): returned while
// the server is unreachable, but the next call asks the server again, so a reconnect after
// the server recovers gets the server-issued (regional) name instead of keeping this one.
let fallback: GuestIdentity | undefined;
const listeners = new Set<(identity: GuestIdentity) => void>();
/** Called when the server issues the identity (e.g. after an offline start); returns unsubscribe. */
export function onGuestIdentity(listener: (identity: GuestIdentity) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function readSaved(): GuestIdentity | undefined {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (value && typeof value.name === "string" && value.name.length <= 50 && typeof value.token === "string" && value.token.length <= 1024) return value;
  } catch { /* Storage may be disabled. */ }
}
export function getGuestIdentity(): Promise<GuestIdentity> {
  if (confirmed) return Promise.resolve(confirmed);
  if (pending) return pending;
  pending = (async () => {
    const saved = readSaved();
    try {
      const response = await fetch(serverPath + "/guestIdentity", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: saved?.token || fallback?.token || undefined }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Guest identity unavailable");
      const identity: GuestIdentity = await response.json();
      if (typeof identity.name !== "string" || !identity.name || identity.name.length > 50 || typeof identity.token !== "string") throw new Error("Invalid guest identity");
      confirmed = identity;
      fallback = undefined;
      try { window.localStorage.setItem(KEY, JSON.stringify(identity)); } catch { /* Cookie and memory still work. */ }
      for (const listener of listeners) listener(identity);
      return identity;
    } catch {
      // Preserve the previous browser label while offline (the same one on every retry).
      // The server validates its token next time; it never grants account/session access.
      if (fallback) return fallback;
      if (saved) return fallback = saved;
      const bytes = new Uint32Array(1);
      window.crypto.getRandomValues(bytes);
      fallback = { name: `guest_worldmelon${1000 + bytes[0] % 9000}`, token: "" };
      try { window.localStorage.setItem(KEY, JSON.stringify(fallback)); } catch { /* Memory fallback. */ }
      return fallback;
    }
  })().finally(() => { pending = undefined; });
  return pending;
}
