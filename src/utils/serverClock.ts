// The server's clock as seen from this device. Audience events (gestures, joins,
// leaves) carry server timestamps; a phone or PC whose clock is a few seconds off
// would otherwise judge them as future or long past and skip their animations.
let offsetMs = 0;
let bestRoundTripMs = Number.POSITIVE_INFINITY;

/** Server epoch milliseconds now (the device clock until a sync has succeeded). */
export const serverNow = () => Date.now() + offsetMs;

/** Measures the offset against `<base>/time` a few times and keeps the fastest round trip. */
export async function syncServerClock(base: string, samples = 3) {
  for (let i = 0; i < samples; i++) {
    try {
      const sent = Date.now();
      const response = await fetch(`${base}/time`, { cache: "no-store" });
      const received = Date.now();
      const server = Number(await response.json());
      if (!response.ok || !Number.isFinite(server)) return;
      const roundTrip = received - sent;
      if (roundTrip < bestRoundTripMs) {
        bestRoundTripMs = roundTrip;
        offsetMs = server - (sent + received) / 2;
      }
    } catch {
      return; // Keep the last good offset (or none); animations then use the device clock.
    }
  }
}
