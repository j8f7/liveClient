/** Bounded, live-only presentation queue. The full transcript lives in Chat. */
export const MAX_INCOMING_COMMENTS = 64;
export const MAX_PENDING_COMMENTS = 12;
export const MAX_VISIBLE_COMMENTS = 6;
export const MAX_REMEMBERED_COMMENTS = 512;
export const PENDING_LIFETIME_MS = 10000;
export const REDUCED_MOTION_LIFETIME_MS = 4500;

interface IncomingComment {
  id: string;
  timestamp: string;
  msg?: string;
  cmd?: string;
  system?: boolean;
}

interface PendingComment {
  key: string;
  userId: string;
  text: string;
  receivedAt: number;
}

export interface OverlayComment extends PendingComment {
  lane: number;
  width: number;
  travel: number;
  duration: number;
  expiresAt: number;
  reducedMotion: boolean;
}

export interface OverlayGeometry {
  width: number;
  height: number;
}

/** Normalize whitespace and truncate by Unicode code point, not UTF-16 halves. */
export function overlayText(input: string, limit = 140): string {
  const characters = Array.from(input.replace(/\s+/gu, " ").trim());
  return characters.length > limit
    ? `${characters.slice(0, limit - 1).join("")}…`
    : characters.join("");
}

export function overlayLaneCount(height: number): number {
  return height >= 64 ? 2 : 1;
}

export class OverlayQueue {
  private pending: PendingComment[] = [];
  private active: OverlayComment[] = [];
  private seen = new Map<string, number>();
  private forgottenThrough = -Infinity;
  private laneReadyAt = [0, 0];

  /** Call even when disabled so toggling back on never replays missed messages. */
  ingest(messages: readonly IncomingComment[], now: number, enabled: boolean) {
    for (const message of messages.slice(-MAX_INCOMING_COMMENTS)) {
      const timestamp = Date.parse(message.timestamp);
      if (!Number.isFinite(timestamp)) continue;
      const key = JSON.stringify([message.id, message.timestamp]);
      if (this.seen.has(key) || timestamp <= this.forgottenThrough) continue;
      this.seen.set(key, timestamp);
      while (this.seen.size > MAX_REMEMBERED_COMMENTS) {
        const oldest = this.seen.entries().next().value;
        if (!oldest) break;
        this.forgottenThrough = Math.max(this.forgottenThrough, oldest[1]);
        this.seen.delete(oldest[0]);
      }
      if (!enabled || message.system || message.cmd || !message.msg) continue;
      const text = overlayText(message.msg);
      if (!text) continue;
      this.pending.push({ key, userId: message.id, text, receivedAt: now });
    }
    // During a burst, prioritize recent comments rather than a delayed backlog.
    this.pending = this.pending.slice(-MAX_PENDING_COMMENTS);
  }

  advance(now: number, geometry: OverlayGeometry, reducedMotion: boolean) {
    this.pending = this.pending.filter(
      (comment) => now - comment.receivedAt < PENDING_LIFETIME_MS,
    );
    if (this.active.some((comment) => comment.expiresAt <= now)) {
      this.active = this.active.filter((comment) => comment.expiresAt > now);
    }
    if (geometry.width <= 0 || geometry.height <= 0) return this.active;

    const lanes = overlayLaneCount(geometry.height);
    // Reserving the same width for each comment keeps following comments from
    // catching up, even with emoji, long names, or different system fonts.
    const width = Math.min(560, geometry.width * 0.76);
    const travel = geometry.width + width + 16;
    const speed = Math.max(80, geometry.width / 9);
    const duration = reducedMotion
      ? REDUCED_MOTION_LIFETIME_MS
      : Math.ceil((travel / speed) * 1000);

    for (let lane = 0; lane < lanes; lane++) {
      if (!this.pending.length || this.active.length >= MAX_VISIBLE_COMMENTS)
        break;
      if (this.laneReadyAt[lane] > now) continue;
      if (reducedMotion && this.active.some((comment) => comment.lane === lane))
        continue;
      const comment = this.pending.shift()!;
      this.active = [
        ...this.active,
        {
          ...comment,
          lane,
          width,
          travel,
          duration,
          expiresAt: now + duration,
          reducedMotion,
        },
      ];
      this.laneReadyAt[lane] =
        now + (reducedMotion ? duration : ((width + 48) / speed) * 1000);
    }
    return this.active;
  }

  hasWork() {
    return this.pending.length > 0 || this.active.length > 0;
  }

  nextWakeAt(now: number, height: number) {
    const times = this.active.map((comment) => comment.expiresAt);
    if (this.pending.length) {
      times.push(this.pending[0].receivedAt + PENDING_LIFETIME_MS);
      if (this.active.length < MAX_VISIBLE_COMMENTS) {
        for (let lane = 0; lane < overlayLaneCount(height); lane++) {
          times.push(Math.max(now + 16, this.laneReadyAt[lane]));
        }
      }
    }
    return Math.min(...times);
  }

  clear() {
    this.pending = [];
    this.active = [];
    this.laneReadyAt = [0, 0];
    // Keep deduplication state through disable, hidden tabs, and resizes.
    return this.active;
  }
}
