import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Socket } from "socket.io-client";
import {
  AUDIENCE_BUBBLE_MS,
  AUDIENCE_COLORS,
  AUDIENCE_EXPRESSIONS,
  AUDIENCE_MOVE_INTERVAL_MS,
  AUDIENCE_ROOM_WIDTH,
  AUDIENCE_ROOM_DEPTH,
  AUDIENCE_RADIUS,
  type AudienceColor,
  type AudienceExpression,
  type AudienceGesture,
  audienceBubble,
  audienceHash,
  readAudienceParticipant,
  type AudienceMove,
  type AudiencePosition,
  type AudienceSnapshot,
} from "../../../shared/audience";
import { createAudienceScene, type AudienceProjection } from "./createAudienceScene";
import styles from "./Audience3D.module.css";
import { serverNow } from "../../utils/serverClock";
import { t, type MessageKey } from "../../i18n";

// Shared label lists stay English in shared/audience.ts; the client shows these translations.
const EXPRESSION_KEYS: Record<string, MessageKey> = {
  happy: "audience.expr.happy",
  sleepy: "audience.expr.sleepy",
  excited: "audience.expr.excited",
  surprised: "audience.expr.surprised",
  sad: "audience.expr.sad",
  grumpy: "audience.expr.grumpy",
  wink: "audience.expr.wink",
};
const COLOR_KEYS: Record<string, MessageKey> = {
  mint: "audience.color.mint",
  sky: "audience.color.sky",
  rose: "audience.color.rose",
  lavender: "audience.color.lavender",
  peach: "audience.color.peach",
  lemon: "audience.color.lemon",
};
function localLabel(choice: { id: string; label: string }, keys: Record<string, MessageKey>): string {
  const key = keys[choice.id];
  return key ? t(key) : choice.label;
}

export interface Audience3DProps {
  socket: Socket | null;
  participants: User[];
  nameMap: StringDict;
  clientId: string;
  isChatDisabled: boolean;
  hidden?: boolean;
  /** Development-only close-up; ordinary rooms keep the standard camera. */
  portrait?: boolean;
}

const COLOR_STORAGE = "watchparty-slime-color";
/** Floor labels drop the guest prefix ("guest_" / "访客_"); the full name stays in the tooltip. */
const shortGuestName = (name: string) => name.replace(/^(guest_|访客_)/i, "") || name;
const movementKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
const directions: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
};

export function Audience3D({ socket, participants, nameMap, clientId, isChatDisabled, hidden = false, portrait = false }: Audience3DProps) {
  const mount = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createAudienceScene>>();
  const [available, setAvailable] = useState(true);
  const [positions, setPositions] = useState<AudienceSnapshot>({});
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const [projections, setProjections] = useState<AudienceProjection[]>([]);
  const [bubbles, setBubbles] = useState<Record<string, { text: string; until: number }>>({});
  const [, refreshPresence] = useState(0);
  const presenceBubble = (id: string) => {
    const body = positions[id];
    const at = body?.departureAt ?? body?.arrivalAt;
    const age = serverNow() - (at ?? 0);
    if (at === undefined || age < 0 || age >= AUDIENCE_BUBBLE_MS) return "";
    return body.departureAt !== undefined ? "我溜啦！" : "我来啦！";
  };
  const bubbleText = (id: string) => presenceBubble(id) || (!isChatDisabled ? bubbles[id]?.text : "");
  const bubbleKey = participants.map((participant) => (bubbleText(participant.id) ? 1 : 0)).join("");
  const [connected, setConnected] = useState(socket?.connected ?? false);
  const [notice, setNotice] = useState("");
  const [pendingExpression, setPendingExpression] = useState<AudienceExpression>();
  const target = useRef<AudiencePosition>();
  const progress = useRef<{ x: number; y: number; at: number }>();
  const colorTimer = useRef<ReturnType<typeof setTimeout>>();
  const expressionTimer = useRef<ReturnType<typeof setTimeout>>();
  const keys = useRef(new Set<string>());
  const lastMove = useRef(0);
  const pointerStart = useRef<{ x: number; y: number }>();
  const participantsRef = useRef(participants);
  participantsRef.current = participants;
  const chatDisabledRef = useRef(isChatDisabled);
  chatDisabledRef.current = isChatDisabled;

  const stopMoving = () => {
    target.current = undefined;
    progress.current = undefined;
    keys.current.clear();
    if (socket?.connected) socket.emit("CMD:audienceStop", {});
  };
  const sendMovement = () => {
    if (!socket?.connected || hidden || document.hidden || !participantsRef.current.some((p) => p.id === clientId)) return;
    const current = positionsRef.current[clientId];
    if (!current) return;
    let next = target.current;
    if (keys.current.size) {
      let dx = 0; let dy = 0;
      for (const key of keys.current) { dx += directions[key][0]; dy += directions[key][1]; }
      const magnitude = Math.hypot(dx, dy);
      if (!magnitude) {
        socket.emit("CMD:audienceStop", {});
        return;
      }
      next = {
        x: Math.max(0, Math.min(1, current.x + dx / magnitude * 1.8 / AUDIENCE_ROOM_WIDTH)),
        y: Math.max(0, Math.min(1, current.y + dy / magnitude * 1.8 / AUDIENCE_ROOM_DEPTH)),
      };
    }
    if (!next) return;
    if (!keys.current.size) {
      const last = progress.current;
      if (!last || Math.hypot((current.x - last.x) * AUDIENCE_ROOM_WIDTH, (current.y - last.y) * AUDIENCE_ROOM_DEPTH) > 0.02) {
        progress.current = { ...current, at: Date.now() };
      } else if (Date.now() - last.at > 1000) {
        stopMoving();
        return;
      }
    }
    if (!keys.current.size && Math.hypot((next.x - current.x) * AUDIENCE_ROOM_WIDTH, (next.y - current.y) * AUDIENCE_ROOM_DEPTH) < 0.045) {
      stopMoving();
      return;
    }
    if (Date.now() - lastMove.current < AUDIENCE_MOVE_INTERVAL_MS + 20) return;
    lastMove.current = Date.now();
    socket.emit("CMD:audienceMove", next);
  };

  useEffect(() => {
    if (!mount.current || hidden) return;
    setAvailable(true);
    let renderer: ReturnType<typeof createAudienceScene>;
    try {
      renderer = createAudienceScene(mount.current, setProjections, () => setAvailable(false), { portrait });
      scene.current = renderer;
    } catch { setAvailable(false); return; }
    return () => { renderer.dispose(); scene.current = undefined; };
  }, [hidden, portrait]);

  useEffect(() => {
    if (!socket) return;
    let syncRetry: ReturnType<typeof setTimeout> | undefined;
    const clearIntent = () => { target.current = undefined; keys.current.clear(); lastMove.current = 0; };
    const sync = () => {
      clearTimeout(syncRetry);
      clearIntent();
      setConnected(true);
      setPendingExpression(undefined);
      setBubbles({});
      syncRetry = setTimeout(() => { if (socket.connected) socket.emit("CMD:audienceSync"); }, 1100);
      socket.emit("CMD:audienceSync");
      try {
        const saved = localStorage.getItem(COLOR_STORAGE);
        if (AUDIENCE_COLORS.some((color) => color.id === saved)) socket.emit("CMD:audienceColor", { color: saved });
      } catch { /* Storage may be disabled in private browsing. */ }
    };
    const snapshot = (raw: unknown) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const entries = Object.entries(raw);
      if (entries.length > 1024) return;
      clearTimeout(syncRetry);
      const next: AudienceSnapshot = {};
      for (const [id, value] of entries) {
        if (!id || id.length > 128) continue;
        const position = readAudienceParticipant(value);
        if (position) Object.defineProperty(next, id, { value: position, enumerable: true, configurable: true, writable: true });
      }
      // A physics frame contains every affected slime together, never one half of a push.
      setPositions(next);
    };
    const move = (raw: AudienceMove) => {
      if (!raw || typeof raw.id !== "string" || raw.id.length > 128) return;
      const position = readAudienceParticipant(raw);
      if (position) setPositions((current) => ({ ...current, [raw.id]: position }));
    };
    const chat = (message: ChatMessage) => {
      if (chatDisabledRef.current || !message || typeof message.id !== "string" || !participantsRef.current.some((p) => p.id === message.id)) return;
      const text = audienceBubble(message);
      if (text) setBubbles((current) => ({ ...current, [message.id]: { text, until: Date.now() + AUDIENCE_BUBBLE_MS } }));
    };
    const disconnect = () => { setConnected(false); setBubbles({}); clearIntent(); clearTimeout(syncRetry); };
    const clearBubbles = () => setBubbles({});
    const notify = (raw: { message?: unknown }) => { if (typeof raw?.message === "string") setNotice(raw.message.slice(0, 160)); };
    socket.on("connect", sync); socket.on("disconnect", disconnect);
    socket.on("REC:audience", snapshot); socket.on("REC:audienceMove", move);
    socket.on("REC:chat", chat); socket.on("chatinit", clearBubbles); socket.on("REC:audienceNotice", notify);
    if (socket.connected) sync();
    return () => {
      stopMoving(); clearTimeout(syncRetry); clearTimeout(colorTimer.current); clearTimeout(expressionTimer.current);
      socket.off("connect", sync); socket.off("disconnect", disconnect);
      socket.off("REC:audience", snapshot); socket.off("REC:audienceMove", move);
      socket.off("REC:chat", chat); socket.off("chatinit", clearBubbles); socket.off("REC:audienceNotice", notify);
    };
  }, [socket, clientId]);

  useEffect(() => {
    if (hidden) { stopMoving(); return; }
    const timer = setInterval(sendMovement, AUDIENCE_MOVE_INTERVAL_MS + 50);
    const stopOnHidden = () => { if (document.hidden) stopMoving(); };
    window.addEventListener("blur", stopMoving);
    document.addEventListener("visibilitychange", stopOnHidden);
    return () => {
      clearInterval(timer); stopMoving();
      window.removeEventListener("blur", stopMoving);
      document.removeEventListener("visibilitychange", stopOnHidden);
    };
  }, [socket, clientId, hidden]);

  useEffect(() => { if (isChatDisabled || hidden) setBubbles({}); }, [isChatDisabled, hidden]);
  useEffect(() => {
    const expiry = window.setInterval(() => { refreshPresence(value => value + 1); setBubbles((current) => {
      const valid = Object.entries(current).filter(([id, bubble]) => bubble.until > Date.now() && participantsRef.current.some((p) => p.id === id));
      return valid.length === Object.keys(current).length ? current : Object.fromEntries(valid);
    }); }, 500);
    return () => clearInterval(expiry);
  }, []);
  useEffect(() => {
    scene.current?.setActors(participants.map((participant, index) => ({ participant, index }))
      .filter(({ participant }) => positions[participant.id]).map(({ participant, index }) => {
        const local = participant.id === clientId;
        return {
          id: participant.id, local, position: positions[participant.id],
          label: local ? t("audience.you") : shortGuestName(nameMap[participant.id] || t("audience.viewer", { n: index + 1 })),
          // A speech or arrival bubble replaces the tag while it shows.
          status: bubbleText(participant.id) ? undefined : t("audience.watching"),
        };
      }));
    // Bubbles come and go on timers, so their on/off pattern is a dependency too.
  }, [participants, positions, clientId, hidden, nameMap, bubbleKey]);

  function requestMove(position: AudiencePosition) {
    if (!socket?.connected) return;
    keys.current.clear();
    target.current = {
      x: Math.max(AUDIENCE_RADIUS / AUDIENCE_ROOM_WIDTH, Math.min(1 - AUDIENCE_RADIUS / AUDIENCE_ROOM_WIDTH, position.x)),
      y: Math.max(AUDIENCE_RADIUS / AUDIENCE_ROOM_DEPTH, Math.min(1 - AUDIENCE_RADIUS / AUDIENCE_ROOM_DEPTH, position.y)),
    };
    const current = positionsRef.current[clientId];
    progress.current = current ? { ...current, at: Date.now() } : undefined;
    setNotice(""); sendMovement();
  }
  function color(color: AudienceColor) {
    if (!socket?.connected) return;
    clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(() => {
      if (socket.connected) socket.emit("CMD:audienceColor", { color });
    }, 220);
    try { localStorage.setItem(COLOR_STORAGE, color); } catch { /* Optional preference only. */ }
  }
  function expression(expression: AudienceExpression) {
    if (!socket?.connected) return;
    setPendingExpression(expression);
    clearTimeout(expressionTimer.current);
    expressionTimer.current = setTimeout(() => {
      if (socket.connected) socket.emit("CMD:audienceExpression", { expression });
    }, 220);
  }
  useEffect(() => {
    if (positions[clientId]?.expression === pendingExpression) setPendingExpression(undefined);
  }, [positions, clientId, pendingExpression]);
  function gesture(gesture: AudienceGesture) { if (socket?.connected) socket.emit("CMD:audienceGesture", { gesture }); }

  if (hidden) return null;
  const ownColor = positions[clientId]?.color;
  const projectionById = new Map(projections.map((point) => [point.id, point]));
  return (
    <section className={styles.audience} aria-label={t("audience.section")}>
      <div className={styles.stage} role="group" aria-label={t("audience.stageAria")} tabIndex={connected ? 0 : -1}
        onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
        onPointerCancel={() => { pointerStart.current = undefined; }}
        onPointerUp={(event) => {
          const start = pointerStart.current; pointerStart.current = undefined;
          if (event.button !== 0 || !available || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
          event.currentTarget.focus({ preventScroll: true });
          const position = scene.current?.positionFromPointer(event.clientX, event.clientY);
          if (position) requestMove(position);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); stopMoving(); return; }
          const key = movementKey(event.key);
          if (!directions[key] || event.metaKey || event.ctrlKey || event.altKey) return;
          event.preventDefault(); target.current = undefined; keys.current.add(key); sendMovement();
        }}
        onKeyUp={(event) => { const key = movementKey(event.key); if (directions[key]) { event.preventDefault(); keys.current.delete(key); if (!keys.current.size) stopMoving(); } }}
        onBlur={stopMoving}
      >
        <div ref={mount} className={styles.canvas} style={!available ? { visibility: "hidden" } : undefined} />
        {available ? participants.map((participant, index) => {
          const projection = projectionById.get(participant.id);
          if (!projection?.visible) return null;
          const local = participant.id === clientId;
          const name = nameMap[participant.id] || t("audience.viewer", { n: index + 1 });
          return <div key={participant.id} className={styles.overlay} data-participant-id={participant.id} data-color={positions[participant.id]?.color} data-expression={positions[participant.id]?.expression}>
            {!scene.current?.labelsIn3D && <span className={`${styles.name} ${local ? styles.localName : ""}`} style={{ left: projection.x, top: projection.footY + 1 }} title={name}>{local ? t("audience.you") : shortGuestName(name)}</span>}
            {bubbleText(participant.id) && <span className={styles.bubble} style={{ left: Math.max(85, Math.min((mount.current?.clientWidth ?? 300) - 85, projection.x)), top: Math.max(65, projection.headY - 8) }}>{bubbleText(participant.id)}</span>}
            {!scene.current?.labelsIn3D && !bubbleText(participant.id) && projection.watching && <span className={styles.status} style={{ left: projection.x, top: projection.headY - 4 }}>{t("audience.watching")}</span>}
          </div>;
        }) : <div className={styles.fallback}>
          {participants.map((participant, index) => <div className={styles.fallbackPerson} key={participant.id}>
            <span style={{ background: AUDIENCE_COLORS.find((c) => c.id === positions[participant.id]?.color)?.hex ?? AUDIENCE_COLORS[audienceHash(participant.id) % AUDIENCE_COLORS.length].hex }} aria-hidden="true">•ᴗ•</span>
            <span>{participant.id === clientId ? t("audience.you") : nameMap[participant.id] || t("audience.viewer", { n: index + 1 })}</span>
            {bubbleText(participant.id) && <span className={styles.fallbackBubble}>{bubbleText(participant.id)}</span>}
          </div>)}
          <small>{t("audience.no3d")}</small>
        </div>}
        {!participants.length && <p className={styles.empty}>{t("audience.emptyFriends")}</p>}
      </div>
      <div className={styles.actions} aria-label={t("audience.yourSlime")}>
        <div className={styles.colorButtons} role="group" aria-label={t("audience.colorGroupAria")}>
          <span className={styles.colorLabel}>{t("audience.yourColor")}</span>
          {AUDIENCE_COLORS.map((choice) => <button key={choice.id} type="button" className={styles.colorSwatch} style={{ "--slime-color": choice.hex } as CSSProperties} disabled={!connected} aria-label={t("audience.slimeLabel", { label: localLabel(choice, COLOR_KEYS) })} title={localLabel(choice, COLOR_KEYS)} aria-pressed={ownColor === choice.id} onClick={() => color(choice.id)}><span aria-hidden="true">{ownColor === choice.id ? "✓" : ""}</span></button>)}
        </div>
        <label className={styles.expressionControl}>
          <span>{t("audience.face")}</span>
          <select aria-label={t("audience.expressionAria")} disabled={!connected} value={pendingExpression ?? positions[clientId]?.expression ?? "happy"} onChange={(event) => expression(event.target.value as AudienceExpression)}>
            {AUDIENCE_EXPRESSIONS.map((choice) => <option key={choice.id} value={choice.id}>{localLabel(choice, EXPRESSION_KEYS)}</option>)}
          </select>
        </label>
        <div className={styles.gestureButtons}>
          <button type="button" disabled={!connected} onClick={() => gesture("wave")} aria-label={t("audience.wiggleAria")}>〰 <span>{t("audience.wiggle")}</span></button>
          <button type="button" disabled={!connected} onClick={() => gesture("cheer")} aria-label={t("audience.hopAria")}>✦ <span>{t("audience.hop")}</span></button>
          <button type="button" disabled={!connected} onClick={stopMoving} aria-label={t("audience.stopAria")}>■ <span>{t("audience.stop")}</span></button>
        </div>
      </div>
      <div className={styles.footer}><span className={styles.heading}><span className={styles.online} /> {t("audience.together")} <span className={styles.count}>{participants.length}</span></span><span role="status">{notice || (connected ? t("audience.nudge") : t("audience.waitReconnect"))}</span><span className={styles.cameraHint}>{t("audience.cameraHint")}</span></div>
    </section>
  );
}
