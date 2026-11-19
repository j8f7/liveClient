import { normalizeRoomPath, type RecentRoom } from "../../utils/roomHistory";

export type LobbyRoom = {
  path: string;
  name: string;
  saved: boolean;
  visitedAt?: number;
};

export type SavedRoom = {
  path: string;
  alternatePath: string | null;
  name: string;
  /** Server-relative lobby picture (/covers/<room>.jpg?v=<n>), when the server has one. */
  cover?: string;
};

const COVER_PATH = /^\/covers\/[A-Za-z0-9_-]+\.jpg(\?v=\d+)?$/;

/** Select only safe display fields from the authenticated owner's room response. */
export function parseSavedRooms(data: unknown): SavedRoom[] {
  if (!Array.isArray(data)) throw new Error("Invalid room list");
  return data.flatMap((item: unknown): SavedRoom[] => {
    if (!item || typeof item !== "object") return [];
    const room = item as {
      roomId?: unknown;
      vanity?: unknown;
      roomTitle?: unknown;
      cover?: unknown;
    };
    if (typeof room.roomId !== "string") return [];
    const id = room.roomId.replace(/^\//, "");
    const alternatePath = normalizeRoomPath(`/watch/${encodeURIComponent(id)}`);
    const vanity = typeof room.vanity === "string" ? room.vanity : "";
    const path =
      (vanity && normalizeRoomPath(`/r/${encodeURIComponent(vanity)}`)) ||
      alternatePath;
    if (!path) return [];
    const title =
      typeof room.roomTitle === "string" ? room.roomTitle.trim() : "";
    const cover =
      typeof room.cover === "string" && COVER_PATH.test(room.cover) ? room.cover : undefined;
    return [{ path, alternatePath, name: title || vanity || id, ...(cover ? { cover } : {}) }];
  });
}

export function mergeLobbyRooms(
  savedRooms: SavedRoom[],
  recentRooms: RecentRoom[],
): LobbyRoom[] {
  const rooms = new Map<string, LobbyRoom>();
  const mergedRecent = new Set<string>();
  for (const saved of savedRooms) {
    const visits = recentRooms.filter(
      (room) => room.path === saved.path || room.path === saved.alternatePath,
    );
    const recent = visits.sort((a, b) => b.visitedAt - a.visitedAt)[0];
    visits.forEach((visit) => mergedRecent.add(visit.path));
    rooms.set(saved.path, {
      path: saved.path,
      name: recent?.name || saved.name,
      saved: true,
      visitedAt: recent?.visitedAt,
    });
  }
  for (const recent of recentRooms) {
    if (!mergedRecent.has(recent.path) && !rooms.has(recent.path)) {
      rooms.set(recent.path, {
        path: recent.path,
        name: recent.name,
        visitedAt: recent.visitedAt,
        saved: false,
      });
    }
  }
  return [...rooms.values()].sort(
    (a, b) => (b.visitedAt || 0) - (a.visitedAt || 0),
  );
}
