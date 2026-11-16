import { GuestIdentityLabel } from "../GuestIdentity/GuestIdentityLabel";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@mantine/core";
import {
  IconArrowRight,
  IconBookmark,
  IconBrandDiscordFilled,
  IconCheck,
  IconClock,
  IconHeart,
  IconLayoutGrid,
  IconLink,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { createRoom } from "../TopBar/TopBar";
import styles from "./Home.module.css";
import { MetadataContext } from "../../MetadataContext";
import { serverPath } from "../../utils/utils";
import {
  clearRecentRooms,
  getRecentRooms,
  normalizeRoomPath,
  removeRecentRoom,
  ROOM_HISTORY_EVENT,
  ROOM_HISTORY_KEY,
  type RecentRoom,
} from "../../utils/roomHistory";
import beyondArt from "./assets/beyond.svg";
import lofiArt from "./assets/lofi.svg";
import animeArt from "./assets/anime.svg";
import racingArt from "./assets/racing.svg";
import {
  mergeLobbyRooms,
  parseSavedRooms,
  type LobbyRoom,
  type SavedRoom,
} from "./roomDirectory";
import { t, getLang, type MessageKey } from "../../i18n";
import config from "../../config";

type RoomFilter = "all" | "saved" | "recent";
type SavedRoomsState = {
  uid?: string;
  rooms: SavedRoom[];
  status: "idle" | "loading" | "ready" | "error";
};

const roomArtwork = [lofiArt, animeArt, racingArt, beyondArt];
const filters: { value: RoomFilter; labelKey: MessageKey; Icon: typeof IconClock }[] =
  [
    { value: "all", labelKey: "home.filter.all", Icon: IconLayoutGrid },
    { value: "saved", labelKey: "home.filter.saved", Icon: IconBookmark },
    { value: "recent", labelKey: "home.filter.recent", Icon: IconClock },
  ];

function artworkFor(path: string): string {
  const hash = [...path].reduce((value, char) => value + char.charCodeAt(0), 0);
  return roomArtwork[hash % roomArtwork.length];
}

function visitDate(timestamp?: number): string {
  if (!timestamp) return t("home.savedToAccount");
  const date = new Intl.DateTimeFormat(getLang(), { month: "short", day: "numeric" }).format(timestamp);
  return t("home.visited", { date });
}

export const Home = () => {
  const { features } = useContext(MetadataContext);
  if (config.VITE_LOBBY_ROOMS_ONLY) return <PublicLobby roomsOnly />;
  return <><GuestIdentityLabel />{features.roomCreation ? <LegacyHome /> : <PublicLobby />}</>;
};

const PublicLobby = ({ roomsOnly = false }: { roomsOnly?: boolean }) => {
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch(`${serverPath}/lobbyRooms`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Unavailable"); return response.json(); })
      .then((data) => { setRooms(parseSavedRooms(data)); setStatus("ready"); })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [refresh]);
  const visible = rooms.filter((room) => room.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <main className={`${styles.lobby} ${roomsOnly ? styles.roomsOnly : ""}`}>
    {!roomsOnly && <section className={styles.intro}><div>
      <div className={styles.eyebrow}>{t("home.tagline")}</div>
      <h1>{t("home.lobby.title")}</h1>
      <p>{t("home.lobby.intro")}</p>
    </div></section>}
    <section className={styles.discover} aria-label={t("home.available")}>
      {!roomsOnly && <div className={styles.sectionHeading}>
        <h2 id="rooms-title">{t("home.available")}</h2>
        <label className={styles.searchField}><IconSearch size={17} aria-hidden="true" />
          <input aria-label={t("home.findRoom")} type="search" placeholder={t("home.findRoom")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className={styles.secondaryButton} onClick={() => setRefresh((value) => value + 1)} disabled={status === "loading"}><IconRefresh size={16} /> {t("home.refresh")}</button>
      </div>}
      {status === "loading" && <p role="status">{t("home.loadingRooms")}</p>}
      {status === "error" && <p role="alert">{t("home.loadRoomsError")}</p>}
      {status === "ready" && (visible.length ? <div className={styles.roomGrid}>
        {visible.map((room) => <article key={room.path} className={styles.roomCard}>
          <a href={room.path} aria-label={t("home.joinAria", { name: room.name })}>
            <div className={styles.cardImage}><img src={artworkFor(room.path)} alt="" loading="lazy" /><span className={styles.cardPlay}><IconPlayerPlay size={18} /></span></div>
            <div className={styles.cardInfo}><h3>{room.name}</h3></div>
            <div className={styles.cardBottom}><span>{t("home.joinRoom")}</span><IconArrowRight size={16} /></div>
          </a>
        </article>)}
      </div> : <div className={styles.emptyState}><h3>{query ? t("home.noMatch") : t("home.noRooms")}</h3><p>{query ? t("home.tryAnotherName") : t("home.checkBack")}</p></div>)}
    </section>
  </main>;
};

const LegacyHome = () => {
  const { user } = useContext(MetadataContext);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>(getRecentRooms);
  const [savedState, setSavedState] = useState<SavedRoomsState>({
    rooms: [],
    status: "idle",
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [query, setQuery] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [joinError, setJoinError] = useState("");
  const [createError, setCreateError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const joinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => setRecentRooms(getRecentRooms());
    const resume = () => {
      update();
      creatingRef.current = false;
      setCreating(false);
    };
    const storageUpdate = (event: StorageEvent) => {
      if (event.key === ROOM_HISTORY_KEY || event.key === null) update();
    };
    window.addEventListener(ROOM_HISTORY_EVENT, update);
    window.addEventListener("storage", storageUpdate);
    window.addEventListener("pageshow", resume);
    return () => {
      window.removeEventListener(ROOM_HISTORY_EVENT, update);
      window.removeEventListener("storage", storageUpdate);
      window.removeEventListener("pageshow", resume);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!user) {
      setSavedState({ rooms: [], status: "idle" });
      return () => controller.abort();
    }
    setSavedState({ uid: user.uid, rooms: [], status: "loading" });
    const load = async () => {
      try {
        const token = await user.getIdToken();
        if (!active) return;
        const params = new URLSearchParams({ uid: user.uid, token });
        const response = await fetch(`${serverPath}/listRooms?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not load rooms");
        const rooms = parseSavedRooms(await response.json());
        if (active) setSavedState({ uid: user.uid, rooms, status: "ready" });
      } catch {
        if (active)
          setSavedState({ uid: user.uid, rooms: [], status: "error" });
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [user, refreshKey]);

  // Never display the previous account's saved rooms while authentication changes.
  const savedRooms = savedState.uid === user?.uid ? savedState.rooms : [];
  const savedStatus =
    user && savedState.uid === user.uid ? savedState.status : "idle";
  const allRooms = useMemo(
    () => mergeLobbyRooms(savedRooms, recentRooms),
    [savedRooms, recentRooms],
  );
  const visibleRooms = allRooms.filter((room) => {
    const inFilter =
      filter === "all" ||
      (filter === "saved" ? room.saved : Boolean(room.visitedAt));
    return (
      inFilter &&
      `${room.name} ${room.path}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    );
  });
  const lastRoom = recentRooms[0];

  const handleCreate = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setCreateError("");
    try {
      await createRoom(user, false);
    } catch {
      setCreateError(t("home.createError"));
      creatingRef.current = false;
      setCreating(false);
    }
  };
  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    const path = normalizeRoomPath(joinLink);
    if (!path) {
      setJoinError(t("home.joinInvalid"));
      joinInputRef.current?.focus();
      return;
    }
    setJoinError("");
    window.location.assign(path);
  };
  const showRooms = (nextFilter: RoomFilter) => {
    setFilter(nextFilter);
    document.getElementById("rooms")?.scrollIntoView({ block: "start" });
  };
  const removeVisit = (room: LobbyRoom) => {
    const saved = savedRooms.find((entry) => entry.path === room.path);
    const paths = recentRooms.filter(
      (entry) =>
        entry.path === room.path || entry.path === saved?.alternatePath,
    );
    const success = paths
      .map((entry) => removeRecentRoom(entry.path))
      .every(Boolean);
    setHistoryError(
      success ? "" : t("home.historyUpdateError"),
    );
  };

  return (
    <main className={styles.lobby}>
      <section className={styles.intro} aria-labelledby="lobby-title">
        <div>
          <div className={styles.eyebrow}>
            <span /> {t("home.tagline")}
          </div>
          <h1 id="lobby-title">
            {t("home.lobbyHero.line1")}
            <br />
            {t("home.lobbyHero.line2")}<span>.</span>
          </h1>
          <p>{t("home.heroIntro")}</p>
        </div>
        <button
          type="button"
          className={`${styles.primaryButton} ${styles.introCreate}`}
          onClick={handleCreate}
          disabled={creating}
        >
          <IconPlus size={18} aria-hidden="true" />{" "}
          {creating ? t("home.creating") : t("room.create")}
        </button>
      </section>

      <section className={styles.featured} aria-labelledby="featured-title">
        <img className={styles.featureArt} src={beyondArt} alt="" />
        <div className={styles.featureShade} />
        <div className={styles.featuredContent}>
          <div className={styles.featureKicker}>
            <span className={styles.featureTag}>
              {lastRoom ? (
                <IconClock size={12} aria-hidden="true" />
              ) : (
                <IconPlayerPlay size={12} aria-hidden="true" />
              )}
              {lastRoom ? t("home.recentlyVisited") : t("home.betterTogether")}
            </span>
            <span>
              {lastRoom
                ? t("home.pickUp")
                : t("home.nextMovieNight")}
            </span>
          </div>
          <h2 id="featured-title">
            {lastRoom ? (
              lastRoom.name
            ) : (
              <>
                {t("home.featured.title1")}
                <br />
                {t("home.featured.title2")}
              </>
            )}
          </h2>
          <p>
            {lastRoom ? (
              t("home.returnLinkHint")
            ) : (
              <>
                {t("home.featured.body1")}
                <br className={styles.mobileBreak} /> {t("home.featured.body2")}
              </>
            )}
          </p>
          <div className={styles.featuredBottom}>
            {lastRoom ? (
              <a className={styles.primaryButton} href={lastRoom.path}>
                <IconPlayerPlay size={17} aria-hidden="true" /> {t("home.returnToRoom")}
              </a>
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCreate}
                disabled={creating}
              >
                <IconPlus size={18} aria-hidden="true" />
                {creating ? t("home.creating") : t("home.startWatchParty")}
              </button>
            )}
            <span className={styles.featureNote}>
              <IconCheck size={15} aria-hidden="true" />
              {lastRoom ? t("home.savedOnDevice") : t("home.noAccount")}
            </span>
          </div>
        </div>
        <span className={styles.featureDecoration} aria-hidden="true">
          {t("home.decorative")}
        </span>
      </section>
      {createError && (
        <p className={styles.errorMessage} role="alert">
          {createError}
        </p>
      )}

      <form className={styles.joinPanel} onSubmit={handleJoin}>
        <label htmlFor="join-room-link">
          <IconLink size={19} aria-hidden="true" />
          <span>
            {t("home.invitedQ")}<small>{t("home.dropLink")}</small>
          </span>
        </label>
        <div className={styles.joinControls}>
          <input
            ref={joinInputRef}
            id="join-room-link"
            value={joinLink}
            onChange={(event) => {
              setJoinLink(event.target.value);
              setJoinError("");
            }}
            placeholder={t("home.pasteLink")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(joinError)}
            aria-describedby={joinError ? "join-room-error" : undefined}
            required
          />
          <button type="submit" className={styles.secondaryButton}>
            {t("home.joinRoom")} <IconArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {joinError && (
          <p id="join-room-error" className={styles.joinError} role="alert">
            {joinError}
          </p>
        )}
      </form>

      <section
        id="rooms"
        className={styles.discover}
        aria-labelledby="rooms-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="rooms-title">{t("home.findNext")}</h2>
            <p>{t("home.roomsIntro")}</p>
          </div>
          <label className={styles.searchField}>
            <IconSearch size={17} aria-hidden="true" />
            <input
              aria-label={t("home.findRoom")}
              placeholder={t("home.findRoom")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
            />
          </label>
        </div>
        <div className={styles.filters}>
          <div
            className={styles.filterButtons}
            role="group"
            aria-label={t("home.filterRooms")}
          >
            {filters.map(({ value, labelKey, Icon }) => (
              <button
                type="button"
                key={value}
                className={`${styles.filter} ${filter === value ? styles.activeFilter : ""}`}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                <Icon size={15} aria-hidden="true" />
                {t(labelKey)}
              </button>
            ))}
          </div>
          <span className={styles.roomCount} aria-live="polite">
            {visibleRooms.length === 1
              ? t("home.roomCount.one", { count: visibleRooms.length })
              : t("home.roomCount.other", { count: visibleRooms.length })}
          </span>
        </div>

        {savedStatus === "loading" && (
          <div className={styles.statusMessage} role="status">
            <span className={styles.spinner} />
            {t("home.loadingSaved")}
          </div>
        )}
        {savedStatus === "error" && (
          <div className={styles.statusMessage} role="alert">
            <span>
              {t("home.savedError")}
            </span>
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
            >
              <IconRefresh size={15} aria-hidden="true" />
              {t("home.tryAgain")}
            </button>
          </div>
        )}
        {historyError && (
          <p className={styles.errorMessage} role="alert">
            {historyError}
          </p>
        )}

        {visibleRooms.length > 0 ? (
          <div className={styles.roomGrid}>
            {visibleRooms.map((room) => (
              <article key={room.path} className={styles.roomCard}>
                <a href={room.path} aria-label={t("home.openAria", { name: room.name })}>
                  <div className={styles.cardImage}>
                    <img src={artworkFor(room.path)} alt="" loading="lazy" />
                    <span className={styles.cardTag}>
                      {room.saved ? (
                        <IconBookmark size={12} aria-hidden="true" />
                      ) : (
                        <IconClock size={12} aria-hidden="true" />
                      )}
                      {room.saved ? t("home.savedRoomTag") : t("home.recentVisitTag")}
                    </span>
                    <span className={styles.cardPlay}>
                      <IconPlayerPlay size={18} aria-hidden="true" />
                    </span>
                  </div>
                  <div className={styles.cardInfo}>
                    <h3 title={room.name}>{room.name}</h3>
                    <p>{visitDate(room.visitedAt)}</p>
                  </div>
                  <div className={styles.cardBottom}>
                    <span>{room.saved ? t("home.yourRoom") : t("home.onDevice")}</span>
                    <span>
                      {t("home.openRoom")} <IconArrowRight size={13} aria-hidden="true" />
                    </span>
                  </div>
                </a>
                {room.visitedAt && (
                  <button
                    type="button"
                    className={styles.removeRecent}
                    aria-label={t("home.removeRecentAria", { name: room.name })}
                    title={t("home.removeRecentTitle")}
                    onClick={() => removeVisit(room)}
                  >
                    <IconX size={14} aria-hidden="true" />
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : savedStatus === "error" &&
          filter !== "recent" ? null : savedStatus !== "loading" ||
          filter === "recent" ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              {query ? (
                <IconSearch size={24} aria-hidden="true" />
              ) : (
                <IconPlayerPlay size={24} aria-hidden="true" />
              )}
            </span>
            <h3>
              {query
                ? t("home.noMatch")
                : filter === "saved"
                  ? user
                    ? t("home.noSaved")
                    : t("home.emptyReady")
                  : filter === "recent"
                    ? t("home.emptyRecent")
                    : t("home.emptyDefault")}
            </h3>
            <p>
              {query
                ? t("home.emptyQuery")
                : filter === "saved"
                  ? user
                    ? t("home.emptySavedSignedIn")
                    : t("home.emptySavedGuest")
                  : t("home.emptyDefaultBody")}
            </p>
            {query ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                {t("home.clearSearch")}
              </button>
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => joinInputRef.current?.focus()}
              >
                <IconLink size={16} aria-hidden="true" />
                {t("home.joinWithLink")}
              </button>
            )}
          </div>
        ) : null}

        <div className={styles.historyNotice}>
          <span>
            {user ? t("home.noticeSignedIn") : t("home.noticeGuest")}{" "}
            {t("home.availabilityNote")}
          </span>
          {recentRooms.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setHistoryError(
                  clearRecentRooms() ? "" : t("home.clearRecentError"),
                )
              }
            >
              {t("home.clearRecent")}
            </button>
          )}
        </div>
        <footer className={styles.lobbyFooter}>
          <span>{t("home.footer1")}</span>
          <span>
            {t("home.footer2")} <IconHeart size={13} aria-hidden="true" />
          </span>
        </footer>
      </section>

      <nav className={styles.mobileNav} aria-label={t("home.navAria")}>
        <button
          type="button"
          className={filter === "all" ? styles.mobileActive : ""}
          onClick={() => showRooms("all")}
        >
          <IconLayoutGrid size={20} aria-hidden="true" />
          <span>{t("home.navRooms")}</span>
        </button>
        <button type="button" onClick={handleCreate} disabled={creating}>
          <IconPlus size={21} aria-hidden="true" />
          <span>{creating ? t("home.creating") : t("home.navCreate")}</span>
        </button>
        <button
          type="button"
          className={filter === "recent" ? styles.mobileActive : ""}
          onClick={() => showRooms("recent")}
        >
          <IconClock size={20} aria-hidden="true" />
          <span>{t("home.navRecent")}</span>
        </button>
      </nav>
    </main>
  );
};

export const Hero = ({
  heroText,
  subText,
  subText2,
  action,
  image,
  color,
}: {
  heroText?: string;
  subText?: string;
  subText2?: string;
  action?: React.ReactNode;
  image?: string;
  color?: string;
}) => {
  return (
    <div className={`${styles.hero} ${color === "green" ? styles.green : ""}`}>
      <div
        style={{ flexDirection: color === "green" ? "row-reverse" : undefined }}
        className={styles.heroInner}
      >
        <div style={{ padding: "30px", flex: "1 1 0" }}>
          <div className={styles.heroText}>{heroText}</div>
          <div className={styles.subText}>{subText}</div>
          <div className={styles.subText}>{subText2}</div>
          {action}
        </div>
        <div
          style={{
            flex: "1 1 0",
          }}
        >
          <img
            alt={t("home.heroAlt")}
            style={{ width: "100%", borderRadius: "10px" }}
            src={image}
          />
        </div>
      </div>
    </div>
  );
};

export const DiscordBot = () => {
  return (
    <div>
      <Hero
        color="green"
        heroText={t("home.discord.hero")}
        subText={t("home.discord.sub1")}
        subText2={t("home.discord.sub2")}
        action={
          <Button
            leftSection={<IconBrandDiscordFilled />}
            component="a"
            size="lg"
            target="_blank"
            href="https://discord.com/api/oauth2/authorize?client_id=1071394728513380372&permissions=2147485696&scope=bot"
          >
            {t("home.discord.button")}
          </Button>
        }
        image={"/screenshot5.png"}
      />
    </div>
  );
};
