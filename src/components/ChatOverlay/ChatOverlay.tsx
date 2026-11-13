import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ChatOverlay.module.css";
import { t } from "../../i18n";
import {
  OverlayQueue,
  overlayLaneCount,
  overlayText,
  type OverlayComment,
  type OverlayGeometry,
} from "./overlayQueue";

export interface ChatOverlayProps {
  /** A rolling buffer of newly received chat messages, never loaded history. */
  messages: readonly ChatMessage[];
  nameMap: StringDict;
  enabled: boolean;
}

const EMPTY_GEOMETRY = { width: 0, height: 0 };
const AUTHOR_COLORS = ["#afdcc7", "#efc8ad", "#d5c3ea"];

function authorColor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return AUTHOR_COLORS[(hash >>> 0) % AUTHOR_COLORS.length];
}

/** Mount inside a position:relative player. The accessible transcript is Chat. */
export function ChatOverlay({ messages, nameMap, enabled }: ChatOverlayProps) {
  const element = useRef<HTMLDivElement>(null);
  const queue = useRef(new OverlayQueue());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const lastLayout = useRef({ ...EMPTY_GEOMETRY, reducedMotion: false });
  const [geometry, setGeometry] = useState<OverlayGeometry>(EMPTY_GEOMETRY);
  const [comments, setComments] = useState<OverlayComment[]>([]);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );

  const stopTimer = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const clearPlayback = useCallback(() => {
    stopTimer();
    setComments(queue.current.clear());
  }, [stopTimer]);

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      setGeometry((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!preference) return;
    const onChange = () => setReducedMotion(preference.matches);
    onChange();
    preference.addEventListener("change", onChange);
    return () => preference.removeEventListener("change", onChange);
  }, []);

  // Reflow never restarts an in-flight comment with new animation geometry.
  useEffect(() => {
    const previous = lastLayout.current;
    if (
      previous.width > 0 &&
      (previous.width !== geometry.width ||
        previous.height !== geometry.height ||
        previous.reducedMotion !== reducedMotion)
    ) {
      clearPlayback();
    }
    lastLayout.current = { ...geometry, reducedMotion };
  }, [geometry, reducedMotion, clearPlayback]);

  const pump = useCallback(() => {
    stopTimer();
    if (!enabled || document.hidden) {
      setComments(queue.current.clear());
      return;
    }
    const now = performance.now();
    setComments(queue.current.advance(now, geometry, reducedMotion));
    if (queue.current.hasWork() && geometry.width > 0 && geometry.height > 0) {
      const delay = queue.current.nextWakeAt(now, geometry.height) - now;
      timer.current = setTimeout(pump, Math.max(16, delay));
    }
  }, [enabled, geometry, reducedMotion, stopTimer]);

  useEffect(() => {
    queue.current.ingest(
      messages,
      performance.now(),
      enabled && !document.hidden,
    );
    pump();
    return stopTimer;
  }, [messages, enabled, pump, stopTimer]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) clearPlayback();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTimer();
    };
  }, [clearPlayback, stopTimer]);

  const lanes = overlayLaneCount(geometry.height);
  return (
    <div
      ref={element}
      className={styles.Overlay}
      aria-hidden="true"
      data-enabled={enabled}
      data-lanes={lanes}
      data-reduced-motion={reducedMotion}
    >
      {enabled &&
        comments.map((comment) => (
          <div
            className={`${styles.Comment} ${comment.reducedMotion ? styles.Still : ""}`}
            key={comment.key}
            style={
              {
                top: `${((comment.lane + 0.5) / lanes) * 100}%`,
                width: `${comment.width}px`,
                "--comment-travel": `${comment.travel}px`,
                "--comment-duration": `${comment.duration}ms`,
              } as React.CSSProperties
            }
          >
            <span className={styles.Bubble}>
              <b
                className={styles.Author}
                style={{ color: authorColor(comment.userId) }}
              >
                {overlayText(nameMap[comment.userId] || t("guest.fallback"), 24)}
              </b>
              <span className={styles.Text}>{comment.text}</span>
            </span>
          </div>
        ))}
    </div>
  );
}
