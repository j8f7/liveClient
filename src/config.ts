export default {
  // Server origin from VITE_SERVER_HOST in .env (trailing slash dropped); empty = same host as the page.
  VITE_SERVER_HOST: ((import.meta.env.VITE_SERVER_HOST as string | undefined) ?? "").replace(/\/+$/, ""),
  // Dev only: the server port, taken from PORT in .env by vite.config.
  // Room opened at "/" instead of the lobby (VITE_DEFAULT_ROOM in .env); empty = show the lobby.
  VITE_DEFAULT_ROOM: ((import.meta.env.VITE_DEFAULT_ROOM as string | undefined) ?? "").replace(/^\/+/, ""),
  // Lobby shows only the room cards (no top bar, intro, search, footer); VITE_LOBBY_ROOMS_ONLY=false
  // in .env brings the full lobby back.
  VITE_LOBBY_ROOMS_ONLY: (import.meta.env.VITE_LOBBY_ROOMS_ONLY as string | undefined) !== "false",
  VITE_SERVER_PORT: (import.meta.env.VITE_SERVER_PORT as string | undefined) || "8080",
  VITE_OAUTH_REDIRECT_HOSTNAME:
    import.meta.env.VITE_OAUTH_REDIRECT_HOSTNAME ?? "https://www.watchparty.me",
  VITE_FIREBASE_CONFIG:
    import.meta.env.VITE_FIREBASE_CONFIG ?? "",
  VITE_FIREBASE_SIGNIN_METHODS: "facebook,google,email",
  NODE_ENV: import.meta.env.DEV ? "development" : "production",
};

/** Where links back to the lobby point: "/" would open the default room (VITE_DEFAULT_ROOM) again. */
export const lobbyHref = (import.meta.env.VITE_DEFAULT_ROOM as string | undefined) ? "/?lobby" : "/";
