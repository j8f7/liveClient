/** Room-local coordinates, independent of screen size. No profile data is stored. */
export interface AudiencePosition {
  x: number;
  y: number;
}

export type AudiencePose = "stand" | "floor" | "sofa";
export type AudienceGesture = "wave" | "cheer";
export interface AudienceParticipant extends AudiencePosition {
  arrivalAt?: number;
  departureAt?: number;
  pose: AudiencePose;
  color: AudienceColor;
  expression: AudienceExpression;
  seatId?: string;
  gesture?: AudienceGesture;
  /** Server epoch milliseconds; ignore animations older than AUDIENCE_GESTURE_MS. */
  gestureAt?: number;
}
export type AudienceSnapshot = Record<string, AudienceParticipant>;
export interface AudienceMove extends AudienceParticipant {
  id: string;
}

export const AUDIENCE_EXPRESSIONS = [
  { id: "happy", label: "Happy" },
  { id: "sleepy", label: "Sleepy" },
  { id: "excited", label: "Excited" },
  { id: "surprised", label: "Surprised" },
  { id: "sad", label: "Sad" },
  { id: "grumpy", label: "Grumpy" },
  { id: "wink", label: "Wink" },
] as const;
export type AudienceExpression = typeof AUDIENCE_EXPRESSIONS[number]["id"];

export const AUDIENCE_COLORS = [
  { id: "mint", label: "Mint", hex: "#79dcb5" },
  { id: "sky", label: "Sky", hex: "#81cafa" },
  { id: "rose", label: "Rose", hex: "#f3a3bf" },
  { id: "lavender", label: "Lavender", hex: "#bca5ed" },
  { id: "peach", label: "Peach", hex: "#ffbd91" },
  { id: "lemon", label: "Lemon", hex: "#f0dc7d" },
] as const;
export type AudienceColor = typeof AUDIENCE_COLORS[number]["id"];
export const AUDIENCE_RADIUS = 0.36;
export const AUDIENCE_CAPACITY = 64;
export const AUDIENCE_SPEED = 2.5;
export const AUDIENCE_PUSH_SPEED = 0.6;
export const AUDIENCE_TICK_MS = 50;
export const AUDIENCE_TARGET_TIMEOUT_MS = 1500;
export const AUDIENCE_SOFA_OBSTACLES = [-13.5, -4.5, 4.5, 13.5].map(x => ({ x, z: 1.1, width: 4.2, depth: 1.64 }));
/** Floor pillows scattered along the one long lounge (world x/z). Drawn by createRoomFurniture. */
export const AUDIENCE_CUSHIONS = [
  { x: -10.45, z: -1.3 }, { x: -7.6, z: -1.65 }, { x: -8.85, z: 2.3 }, { x: -1.2, z: 2.3 },
  { x: 7.55, z: -1.3 }, { x: 10.4, z: -1.65 }, { x: 9.15, z: 2.3 }, { x: 1.3, z: -0.9 },
];
/** Solid boxes: only the sofa arms and backs. Seats and pillows are stood on, not walked around. */
export const AUDIENCE_BOX_OBSTACLES = AUDIENCE_SOFA_OBSTACLES.flatMap(sofa => [
  { x: sofa.x - 1.94, z: sofa.z, width: 0.32, depth: sofa.depth },
  { x: sofa.x + 1.94, z: sofa.z, width: 0.32, depth: sofa.depth },
  { x: sofa.x, z: sofa.z + 0.64, width: sofa.width, depth: 0.36 },
]);
/** Raised surfaces a slime hops onto: sofa seats (entered from the open front) and floor pillows. */
export const AUDIENCE_PLATFORMS = [
  ...AUDIENCE_SOFA_OBSTACLES.map(sofa => ({ x: sofa.x, z: sofa.z - 0.18, width: 3.56, depth: 1.28, height: 0.55 })),
  ...AUDIENCE_CUSHIONS.map(cushion => ({ ...cushion, width: 1.12, depth: 1, height: 0.29 })),
];
/** Height of whatever is under a room position: 0 on the floor. Purely derived, never sent. */
export function audienceSurfaceHeight(position: AudiencePosition): number {
  const x = (position.x - 0.5) * AUDIENCE_ROOM_WIDTH, z = (position.y - 0.5) * AUDIENCE_ROOM_DEPTH;
  for (const platform of AUDIENCE_PLATFORMS) {
    if (Math.abs(x - platform.x) <= platform.width / 2 && Math.abs(z - platform.z) <= platform.depth / 2) return platform.height;
  }
  return 0;
}
/** Solid round footprints at both ends of the room: side tables, floor-lamp bases, plant pots. */
export const AUDIENCE_ROUND_OBSTACLES = [-1, 1].flatMap(side => [
  { x: side * 16.05, z: -0.45, radius: 0.67 },
  { x: side * 16.25, z: 2.3, radius: 0.36 },
  { x: side * 16.6, z: -2.6, radius: 0.36 },
]);
export const AUDIENCE_ROOM_WIDTH = 36;
export const AUDIENCE_ROOM_DEPTH = 9;
export const AUDIENCE_SOFA_SEATS = [
  { id: "left-1", x: 0.18, y: 0.62 },
  { id: "left-2", x: 0.25, y: 0.62 },
  { id: "left-3", x: 0.32, y: 0.62 },
  { id: "right-1", x: 0.68, y: 0.62 },
  { id: "right-2", x: 0.75, y: 0.62 },
  { id: "right-3", x: 0.82, y: 0.62 },
] as const;
export const AUDIENCE_GESTURE_MS = 1800;
export const AUDIENCE_GESTURE_INTERVAL_MS = 900;
export const AUDIENCE_MOVE_INTERVAL_MS = 120;
export const AUDIENCE_BUBBLE_MS = 6000;
export const AUDIENCE_DEPARTURE_DELAY_MS = 50 * 60 * 1000;
export const AUDIENCE_ARRIVAL_MS = 1400;
export const AUDIENCE_BUBBLE_LIMIT = 120;

export function readAudiencePosition(raw: unknown): AudiencePosition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const { x, y } = raw as AudiencePosition;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const clamp = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
  return { x: clamp(x), y: clamp(y) };
}

/** Validate untrusted socket snapshots without losing pose/animation state. */
export function readAudienceParticipant(raw: unknown): AudienceParticipant | undefined {
  const position = readAudiencePosition(raw);
  if (!position) return;
  const { pose, seatId, gesture, gestureAt, color, expression } = raw as Partial<AudienceParticipant>;
  if (pose !== "stand" || seatId !== undefined) return;
  if (!AUDIENCE_COLORS.some((entry) => entry.id === color)) return;
  if (expression !== undefined && !AUDIENCE_EXPRESSIONS.some((entry) => entry.id === expression)) return;
  // Snapshot positions retain simulation precision; target quantization is input-only.
  const source = raw as AudiencePosition;
  const result: AudienceParticipant = { x: Math.max(0, Math.min(1, source.x)), y: Math.max(0, Math.min(1, source.y)), pose, color: color!, expression: expression ?? "happy" };
  if (gesture !== undefined || gestureAt !== undefined) {
    if (gesture !== "wave" && gesture !== "cheer") return;
    if (typeof gestureAt !== "number" || !Number.isFinite(gestureAt) || gestureAt < 0) return;
    result.gesture = gesture;
    result.gestureAt = gestureAt;
  }
  for (const key of ["arrivalAt", "departureAt"] as const) {
    const value = (raw as AudienceParticipant)[key];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
      result[key] = value;
    }
  }
  return result;
}

export function audienceHash(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function audienceSpawn(id: string, index = 0): AudiencePosition {
  const seed = audienceHash(id);
  return {
    x: 0.12 + ((index * 0.61803398875 + (seed % 100) / 100) % 1) * 0.76,
    y: 0.18 + ((seed >>> 8) % 24) / 100,
  };
}

/** Live, ordinary chat only. React renders the result as text, never HTML. */
export function audienceBubble(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return;
  const message = raw as { cmd?: unknown; system?: unknown; msg?: unknown };
  if (message.cmd || message.system || typeof message.msg !== "string") return;
  const text = message.msg.trim().replace(/\s+/gu, " ");
  if (!text) return;
  const chars = Array.from(text);
  return chars.length > AUDIENCE_BUBBLE_LIMIT
    ? chars.slice(0, AUDIENCE_BUBBLE_LIMIT - 1).join("") + "…"
    : text;
}
