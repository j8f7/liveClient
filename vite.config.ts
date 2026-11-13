import { loadEnvFile } from "node:process";
import fs from "node:fs";

try {
  loadEnvFile();
} catch {
  // No .env: use the defaults (see .env.example).
}

export default {
  // The dev UI finds the server on PORT from .env (VITE_SERVER_HOST, when set, wins).
  define: {
    "import.meta.env.VITE_SERVER_PORT": JSON.stringify(process.env.PORT || "8080"),
  },
  build: {
    outDir: "build",
    // sourcemap: true,
  },
  server: {
    https:
      process.env.SSL_CRT_FILE && process.env.SSL_KEY_FILE
        ? {
            key: fs.readFileSync(process.env.SSL_KEY_FILE),
            cert: fs.readFileSync(process.env.SSL_CRT_FILE),
          }
        : null,
    allowedHosts: true,
  },
};
