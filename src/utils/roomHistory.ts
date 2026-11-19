/** Only room navigation metadata is persisted, never room contents or credentials. */
export interface RecentRoom {
  path: string;
  name: string;
  visitedAt: number;
}

export const ROOM_HISTORY_KEY = "watchparty.recentRooms.v1";
export const ROOM_HISTORY_EVENT = "watchparty:room-history-changed";
const MAX_RECENT_ROOMS = 12;
const MAX_NAME_LENGTH = 80;

/** Accept only a room path on this app, never an external navigation target. */
export function normalizeRoomPath(
  input: string,
  origin = typeof window === "undefined"
    ? "https://watchparty.invalid"
    : window.location.origin,
  hashPathname?: string,
): string | null {
  if (
    typeof input !== "string" ||
    !input.trim() ||
    /[\\\u0000-\u001f\u007f]/.test(input)
  ) {
    return null;
  }
  const value = input.trim();
  if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return null;
  if (value.startsWith("//")) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password)
      return null;
    const path = url.pathname === hashPathname && url.hash.startsWith("#/")
      ? url.hash.slice(1).split(/[?#]/, 1)[0]
      : url.pathname;
    const match = path.match(/^\/(watch|r)\/([^/]+)\/?$/);
    if (!match) return null;
    const id = decodeURIComponent(match[2]);
    if (
      !id.trim() ||
      id.length > 200 ||
      id === "." ||
      id === ".." ||
      !/^[\p{L}\p{N}_ .-]+$/u.test(id)
    )
      return null;
    return `/${match[1]}/${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

function roomName(name: unknown, path: string): string {
  const fallback = decodeURIComponent(path.split("/")[2]);
  return (
    (typeof name === "string"
      ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim()
      : ""
    ).slice(0, MAX_NAME_LENGTH) || fallback
  );
}

export function getRecentRooms(): RecentRoom[] {
  try {
    if (typeof window === "undefined") return [];
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(ROOM_HISTORY_KEY) || "[]",
    );
    if (!Array.isArray(stored)) return [];
    const seen = new Set<string>();
    return stored
      .flatMap((item: unknown): RecentRoom[] => {
        if (!item || typeof item !== "object") return [];
        const value = item as Partial<RecentRoom>;
        const path =
          typeof value.path === "string" ? normalizeRoomPath(value.path) : null;
        if (
          !path ||
          typeof value.visitedAt !== "number" ||
          !Number.isFinite(value.visitedAt) ||
          value.visitedAt <= 0 ||
          value.visitedAt > Date.now() + 60_000
        )
          return [];
        return [
          {
            path,
            name: roomName(value.name, path),
            visitedAt: value.visitedAt,
          },
        ];
      })
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .filter((item) => {
        if (seen.has(item.path)) return false;
        seen.add(item.path);
        return true;
      })
      .slice(0, MAX_RECENT_ROOMS);
  } catch {
    // Private browsing or blocked local storage must never prevent entering a room.
    return [];
  }
}

function saveRecentRooms(rooms: RecentRoom[]): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(rooms));
    window.dispatchEvent(new Event(ROOM_HISTORY_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function recordRoomVisit(room: { path: string; name: string }): boolean {
  const path = normalizeRoomPath(room.path);
  if (!path) return false;
  const recent = getRecentRooms().filter((entry) => entry.path !== path);
  return saveRecentRooms(
    [
      { path, name: roomName(room.name, path), visitedAt: Date.now() },
      ...recent,
    ].slice(0, MAX_RECENT_ROOMS),
  );
}

export function removeRecentRoom(path: string): boolean {
  const normalized = normalizeRoomPath(path);
  if (!normalized) return false;
  return saveRecentRooms(
    getRecentRooms().filter((room) => room.path !== normalized),
  );
}

export function clearRecentRooms(): boolean {
  return saveRecentRooms([]);
}
