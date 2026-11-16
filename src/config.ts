const config = {
  // Server origin from VITE_SERVER_HOST in .env (trailing slash dropped); empty = same host as the page.
  VITE_SERVER_HOST: ((import.meta.env.VITE_SERVER_HOST as string | undefined) ?? "").replace(/\/+$/, ""),
  // Dev only: the server port, taken from PORT in .env by vite.config.
  // Room opened at "/" instead of the lobby (VITE_DEFAULT_ROOM in .env); empty = show the lobby.
  VITE_DEFAULT_ROOM: ((import.meta.env.VITE_DEFAULT_ROOM as string | undefined) ?? "").replace(/^\/+/, ""),
  // Lobby shows only the room cards (no top bar, intro, search, footer); VITE_LOBBY_ROOMS_ONLY=false
  // in .env brings the full lobby back.
  VITE_LOBBY_ROOMS_ONLY: (import.meta.env.VITE_LOBBY_ROOMS_ONLY as string | undefined) !== "false",
  // Hash routes ("#/watch/room") for hosts that serve the app from a sub-path and can't send
  // deep links to index.html (VITE_HASH_ROUTER=true in .env). Every in-app link goes through appHref.
  VITE_HASH_ROUTER: (import.meta.env.VITE_HASH_ROUTER as string | undefined) === "true",
  VITE_SERVER_PORT: (import.meta.env.VITE_SERVER_PORT as string | undefined) || "8080",
  VITE_OAUTH_REDIRECT_HOSTNAME:
    import.meta.env.VITE_OAUTH_REDIRECT_HOSTNAME ?? "https://www.watchparty.me",
  VITE_FIREBASE_CONFIG:
    import.meta.env.VITE_FIREBASE_CONFIG ?? "",
  VITE_FIREBASE_SIGNIN_METHODS: "facebook,google,email",
  NODE_ENV: import.meta.env.DEV ? "development" : "production",
};

export default config;

/**
 * href for an in-app path ("/watch/room", "/?lobby"). With hash routing a bare "/watch/room" leaves
 * the app (the host's root, e.g. "page not found"), so it becomes "#/watch/room".
 */
export const appHref = (path: string) => (config.VITE_HASH_ROUTER ? "#" + path : path);

/** Where links back to the lobby point: "/" would open the default room (VITE_DEFAULT_ROOM) again. */
export const lobbyHref = appHref(config.VITE_DEFAULT_ROOM ? "/?lobby" : "/");
