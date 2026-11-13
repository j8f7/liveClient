export default {
  // Server origin from VITE_SERVER_HOST in .env (trailing slash dropped); empty = same host as the page.
  VITE_SERVER_HOST: ((import.meta.env.VITE_SERVER_HOST as string | undefined) ?? "").replace(/\/+$/, ""),
  // Dev only: the server port, taken from PORT in .env by vite.config.
  // Room opened at "/" instead of the lobby (VITE_DEFAULT_ROOM in .env); empty = show the lobby.
  VITE_DEFAULT_ROOM: ((import.meta.env.VITE_DEFAULT_ROOM as string | undefined) ?? "").replace(/^\/+/, ""),
  VITE_SERVER_PORT: (import.meta.env.VITE_SERVER_PORT as string | undefined) || "8080",
  VITE_OAUTH_REDIRECT_HOSTNAME:
    import.meta.env.VITE_OAUTH_REDIRECT_HOSTNAME ?? "https://www.watchparty.me",
  VITE_FIREBASE_CONFIG:
    import.meta.env.VITE_FIREBASE_CONFIG ?? "",
  VITE_FIREBASE_SIGNIN_METHODS: "facebook,google,email",
  NODE_ENV: import.meta.env.DEV ? "development" : "production",
};
