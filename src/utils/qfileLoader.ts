import type {
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from "hls.js";

/** Bytes received so far for the segment being downloaded, and its size (0 if unknown). */
export type SegmentProgress = (loaded: number, total: number) => void;

/**
 * Segment loader for qfile show rooms. Like hls.js's FetchLoader, but it
 * (1) fetches without a Referer, because the qfile CDN answers "invalid url"
 * to a foreign one, and (2) reports bytes as they arrive, which hls.js gives no
 * event for, so the player can show buffering progress and speed, and
 * (3) asks the server for the segment's CDN link (?link=1) and fetches that
 * directly: iOS WebKit (Safari engine, QQ's iOS browser) fails a fetch that
 * follows the server's cross-site 302 to the CDN ("Load failed"), while a
 * direct no-referrer CDN fetch works (verified with /probe, 2026-11-13).
 * hls.js classes are passed in so it stays out of the main bundle.
 */
/**
 * The CDN link for a segment, from the server's ?link=1 JSON answer. A server
 * without that answer (older release) is used through its redirect instead.
 */
async function resolveSegmentUrl(segmentUrl: string, signal: AbortSignal): Promise<string> {
  try {
    const sep = segmentUrl.includes("?") ? "&" : "?";
    const res = await fetch(segmentUrl + sep + "link=1", { cache: "no-store", signal });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) {
      const body = await res.json();
      if (typeof body?.url === "string" && body.url.startsWith("https://")) return body.url;
    }
    if (res.status === 404) {
      throw Object.assign(new Error("segment not found"), { code: 404 });
    }
  } catch (error: any) {
    if (signal.aborted || error?.code === 404) throw error;
  }
  return segmentUrl;
}

export function makeQfileSegmentLoader(
  LoadStats: new () => LoaderStats,
  onProgress: SegmentProgress,
) {
  return class QfileSegmentLoader implements Loader<LoaderContext> {
    context: LoaderContext | null = null;
    stats: LoaderStats = new LoadStats();
    private callbacks: LoaderCallbacks<LoaderContext> | null = null;
    private controller = new AbortController();
    private response: Response | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;

    load(
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>,
    ) {
      this.context = context;
      this.callbacks = callbacks;
      const stats = this.stats;
      stats.loading.start = performance.now();
      const maxLoadTimeMs = config.loadPolicy?.maxLoadTimeMs || config.timeout;
      if (maxLoadTimeMs) {
        this.timer = setTimeout(() => {
          this.controller.abort();
          this.callbacks?.onTimeout(stats, context, this.response);
        }, maxLoadTimeMs);
      }
      const headers = new Headers();
      if (context.rangeEnd) {
        headers.set("Range", `bytes=${context.rangeStart}-${context.rangeEnd - 1}`);
      }
      const signal = this.controller.signal;
      resolveSegmentUrl(context.url, signal)
        .then((url) => fetch(url, { headers, referrerPolicy: "no-referrer", signal }))
        .then(async (response) => {
          this.response = response;
          if (!response.ok || !response.body) {
            throw Object.assign(new Error(response.statusText || "bad response"), {
              code: response.status,
            });
          }
          stats.loading.first = Math.max(performance.now(), stats.loading.start);
          stats.total = Number(response.headers.get("content-length")) || 0;
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            stats.loaded += value.length;
            onProgress(stats.loaded, stats.total);
          }
          const data = new Uint8Array(stats.loaded);
          let offset = 0;
          for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
          }
          clearTimeout(this.timer);
          stats.loading.end = Math.max(performance.now(), stats.loading.first);
          stats.total = stats.loaded;
          this.callbacks?.onSuccess(
            {
              url: response.url,
              data: context.responseType === "arraybuffer"
                ? data.buffer
                : new TextDecoder().decode(data),
              code: response.status,
            },
            stats,
            context,
            response,
          );
        })
        .catch((error: { code?: number; message?: string }) => {
          clearTimeout(this.timer);
          if (stats.aborted || this.controller.signal.aborted) return;
          this.callbacks?.onError(
            { code: error?.code ?? 0, text: error?.message ?? "fetch failed" },
            context,
            this.response,
            stats,
          );
        });
    }

    abort() {
      if (this.stats.aborted || !this.context) return;
      this.stats.aborted = true;
      clearTimeout(this.timer);
      this.controller.abort();
      this.callbacks?.onAbort?.(this.stats, this.context, this.response);
    }

    destroy() {
      clearTimeout(this.timer);
      this.controller.abort();
      this.callbacks = null;
      this.context = null;
      this.response = null;
    }

    getResponseHeader(name: string) {
      return this.response?.headers.get(name) ?? null;
    }
  };
}
