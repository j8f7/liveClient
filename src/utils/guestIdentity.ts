import { serverPath } from "./utils";
export interface GuestIdentity { name: string; token: string }
const KEY = "watchparty-guest-identity";
let pending: Promise<GuestIdentity> | undefined;
let cached: GuestIdentity | undefined;
function readSaved(): GuestIdentity | undefined {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (value && typeof value.name === "string" && value.name.length <= 50 && typeof value.token === "string" && value.token.length <= 1024) return value;
  } catch { /* Storage may be disabled. */ }
}
export function getGuestIdentity(): Promise<GuestIdentity> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = (async () => {
    const saved = readSaved();
    try {
      const response = await fetch(serverPath + "/guestIdentity", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: saved?.token }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Guest identity unavailable");
      const identity: GuestIdentity = await response.json();
      if (typeof identity.name !== "string" || !identity.name || identity.name.length > 50 || typeof identity.token !== "string") throw new Error("Invalid guest identity");
      cached = identity;
      try { window.localStorage.setItem(KEY, JSON.stringify(identity)); } catch { /* Cookie and memory still work. */ }
      return identity;
    } catch {
      // Preserve the previous browser label while offline. The server validates
      // its token next time; it never grants account/session access.
      if (saved) return cached = saved;
      const bytes = new Uint32Array(1);
      window.crypto.getRandomValues(bytes);
      cached = { name: `guest_worldmelon${1000 + bytes[0] % 9000}`, token: "" };
      try { window.localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* Memory fallback. */ }
      return cached;
    }
  })().finally(() => { pending = undefined; });
  return pending;
}
