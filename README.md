# liveClient

Browser client for the 快乐星球直播 watch-party room (React + Vite). It connects to a separately hosted watchparty server.

```
npm install
cp .env.example .env   # VITE_SERVER_HOST defaults to the Shanghai server
npm run dev            # dev server
npm run build          # static files in build/
```

Servers (set `VITE_SERVER_HOST` in `.env`):

| Server | VITE_SERVER_HOST |
|---|---|
| Shanghai (default) | `https://1.xn--lcy176c.app:5999/watchparty` |
| Tokyo | `https://xn--fjqz24bfqeo5p.xyz/watchparty` |

Serve `build/` from any static host. Unknown paths must fall back to `index.html` so `/watch/<room>` works. Add `?log=1` to a page URL to send that device's errors to the server log.

Based on [watchparty](https://github.com/howardchung/watchparty) (MIT).
