import type MediasoupClient from "mediasoup-client";
import React from "react";
import { Alert, Loader, Menu, Overlay, Select, Title } from "@mantine/core";
import io, { Socket } from "socket.io-client";
import {
  formatSpeed,
  iceServers,
  isMobile,
  serverPath,
  serverOrigin,
  serverSocketPath,
  testAutoplay,
  openFileSelector,
  getOrCreateClientId,
  getOrCreateSessionId,
  calculateMedian,
  getUserImage,
  isYouTube,
  isMagnet,
  isHttp,
  isHls,
  isQfileStream,
  isScreenShare,
  isFileShare,
  isDirectVideoUrl,
  pickSingleLargeFile,
  isVBrowser,
  isDash,
  VIDEO_MAX_HEIGHT_CSS,
  softWhite,
  getSavedPasswords,
} from "../../utils/utils";
import { getGuestIdentity } from "../../utils/guestIdentity";
import { makeQfileSegmentLoader } from "../../utils/qfileLoader";
import { isJoinNotice } from "../../utils/joinNotice";
import { noteSegmentBytes, watchRebuffers } from "../../utils/rebufferTelemetry";
import { syncServerClock } from "../../utils/serverClock";
import {
  STARTUP_TIMEOUT_MS,
  StartupError,
  reportStartupError,
  startupFetch,
} from "../../utils/startupError";
import { generateName } from "../../utils/generateName";
import { Chat } from "../Chat/Chat";
import { ChatOverlay } from "../ChatOverlay/ChatOverlay";
import { recordRoomVisit } from "../../utils/roomHistory";
import { TopBar } from "../TopBar/TopBar";
import { VBrowser } from "../VBrowser/VBrowser";
import { VideoChat } from "../VideoChat/VideoChat";
import { getCurrentSettings } from "../Settings/LocalSettings";
import { MultiStreamModal } from "../Modal/MultiStreamModal";
import { ComboBox } from "../ComboBox/ComboBox";
import { SearchComponent } from "../SearchComponent/SearchComponent";
import { Controls } from "../Controls/Controls";
import { VBrowserModal } from "../Modal/VBrowserModal";
import { SettingsModal } from "../Settings/SettingsModal";
import { ErrorModal } from "../Modal/ErrorModal";
import { PasswordModal } from "../Modal/PasswordModal";
import { ScreenShareModal } from "../Modal/ScreenShareModal";
import { FileShareModal } from "../Modal/FileShareModal";
import {
  ClientTranscoder,
  isClientTranscodeSupported,
  type AudioTrackInfo,
} from "../../utils/clientTranscode";
import { firebaseEnabled, loadFirebase, type FirebaseUser } from "../../utils/firebase";
import { SubtitleModal } from "../Modal/SubtitleModal";
import { HTML } from "./HTML";
import { YouTube } from "./YouTube";
import styles from "./App.module.css";
import { t, tServer } from "../../i18n";
import config from "../../config";
import { MetadataContext } from "../../MetadataContext";
import ChatVideoCard from "../ChatVideoCard/ChatVideoCard";
import {
  ActionIcon,
  Badge,
  TextInput,
  Button,
  Switch,
  Tooltip,
} from "@mantine/core";
import {
  IconAntennaBars5,
  IconBrowser,
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconKeyboardFilled,
  IconList,
  IconScreenShare,
  IconSettings,
  IconUser,
  IconUserScreen,
  IconUsersGroup,
  IconVolume,
  IconX,
  IconMessage,
  IconMovie,
  IconMessageOff,
  IconPlus,
} from "@tabler/icons-react";
import { InviteButton } from "../InviteButton/InviteButton";
import type WebTorrent from "webtorrent";
import type Hls from "hls.js";
import { type MediaPlayerClass } from "dashjs";
import { type Torrent } from "webtorrent";

// The 成员 button's large member/avatar panel (VideoChat). Off for now: the
// button still shows the member count but opens nothing. Set true to restore.
const SHOW_PEOPLE_PANEL = false;
// Room heading above the player (back link, title, people count, chat toggle,
// invite). Set false to hide.
const SHOW_ROOM_HEADING = true;
// Site top bar (logo, 直播, 使用说明, menu) inside rooms. Hidden; the home page
// still shows it. Set true to restore.
const SHOW_TOP_BAR = false;
// "Now playing" caption under the slime floor; it only repeated the file name
// (e.g. index.m3u8). Hidden; set true to restore.
const SHOW_VIDEO_CAPTION = false;

declare global {
  interface Window {
    onYouTubeIframeAPIReady: any;
    YT: YT.JsApi;
    watchparty: {
      ourStream: MediaStream | undefined;
      videoRefs: HTMLVideoElementDict;
      videoPCs: PCDict;
      webtorrent?: WebTorrent.Instance;
      hls?: Hls;
      hlsQfile?: boolean;
      dash?: MediaPlayerClass;
    };
  }
}

window.watchparty = {
  ourStream: undefined,
  videoRefs: {},
  videoPCs: {},
};

const clientId = getOrCreateClientId();
const Audience3D = React.lazy(() => import("../Audience3D/Audience3D").then((module) => ({ default: module.Audience3D })));

interface AppProps {
  vanity?: string;
  urlRoomId?: string;
}

interface AppState {
  state: "starting" | "connected";
  roomMedia: string;
  roomSubtitle: string;
  roomPaused: boolean;
  roomLoop: boolean;
  participants: User[];
  rosterUpdateTS: Number;
  chat: ChatMessage[];
  /** Newest arrival notice, shown as one line under the chat (not history). */
  joinNotice?: ChatMessage;
  liveChat: ChatMessage[];
  liveChatVersion: number;
  commentsEnabled: boolean;
  showTools: boolean;
  playlist: PlaylistVideo[];
  tsMap: NumberDict;
  nameMap: StringDict;
  pictureMap: StringDict;
  myName: string;
  myPicture: string;
  loading: boolean;
  scrollTimestamp: number;
  unreadCount: number;
  fullScreen: boolean;
  controlsTimestamp: number;
  watchOptions: SearchResult[];
  isVBrowser: boolean;
  isAutoPlayable: boolean;
  // The browser refused to start the video even muted (e.g. iOS Low Power Mode): a tap is needed.
  playBlocked: boolean;
  /** The YouTube player (iframe + API script) is loaded only once YouTube media plays. */
  youtubeRequested: boolean;
  downloaded: number;
  total: number;
  speed: number;
  connections: number;
  fileSelection: {
    name: string;
    url: string;
    length: number;
    playFn?: () => void;
  }[];
  overlayMsg: string;
  // Startup error code shown with overlayMsg (utils/startupError.ts); "" for other errors.
  overlayCode: string;
  isErrorAuth: boolean;
  settings: Settings;
  vBrowserResolution: string;
  vBrowserQuality: string;
  isVBrowserLarge: boolean;
  nonPlayableMedia: boolean;
  currentTab: string;
  isSubscribeModalOpen: boolean;
  isVBrowserModalOpen: boolean;
  isScreenShareModalOpen: boolean;
  isFileShareModalOpen: boolean;
  isSubtitleModalOpen: boolean;
  isMultiSelectModalOpen: boolean;
  roomLock: string;
  controller?: string;
  savedPasswords: StringDict;
  roomId: string;
  errorMessage: string;
  successMessage: string;
  warningMessage: string;
  isChatDisabled: boolean;
  showChatColumn: boolean;
  showPeopleColumn: boolean;
  owner: string | undefined;
  vanity: string | undefined;
  password: string | undefined;
  inviteLink: string;
  roomTitle: string | undefined;
  roomDescription: string | undefined;
  roomTitleColor: string | undefined;
  mediaPath: string | undefined;
  roomPlaybackRate: number;
  isLiveStream: boolean;
  settingsModalOpen: boolean;
  convertProgress: number | undefined;
  bufferInfo?: { percent?: number; speed?: number };
  convertEnabled: boolean;
  // Audio tracks of the file being converted on this device, and which one is playing
  audioTracks: AudioTrackInfo[] | undefined;
  audioTrackId: number | undefined;
}

export class App extends React.Component<AppProps, AppState> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  state: AppState = {
    state: "starting",
    roomMedia: "",
    roomPaused: false,
    roomSubtitle: "",
    roomLoop: false,
    participants: [],
    rosterUpdateTS: Date.now(),
    chat: [],
    liveChat: [],
    liveChatVersion: 0,
    commentsEnabled: true,
    showTools: false,
    playlist: [],
    tsMap: {},
    nameMap: {},
    pictureMap: {},
    myName: window.localStorage.getItem("watchparty-username") ?? "",
    myPicture: "",
    loading: true,
    scrollTimestamp: 0,
    unreadCount: 0,
    fullScreen: false,
    controlsTimestamp: 0,
    watchOptions: [],
    isVBrowser: false,
    isAutoPlayable: true,
    playBlocked: false,
    youtubeRequested: false,
    downloaded: 0,
    total: 0,
    speed: 0,
    connections: 0,
    fileSelection: [],
    overlayMsg: "",
    overlayCode: "",
    isErrorAuth: false,
    settings: {},
    vBrowserResolution: "1280x720@30",
    vBrowserQuality: "1",
    isVBrowserLarge: false,
    nonPlayableMedia: false,
    currentTab:
      new URLSearchParams(window.location.search).get("tab") ?? "chat",
    isSubscribeModalOpen: false,
    isVBrowserModalOpen: false,
    isScreenShareModalOpen: false,
    isFileShareModalOpen: false,
    isSubtitleModalOpen: false,
    isMultiSelectModalOpen: false,
    roomLock: "",
    controller: "",
    roomId: "",
    savedPasswords: {},
    errorMessage: "",
    successMessage: "",
    warningMessage: "",
    isChatDisabled: false,
    showChatColumn: isMobile()
      ? true
      : Boolean(
          Number(
            window.localStorage.getItem("watchparty-showchatcolumn") ?? "1",
          ),
        ),
    showPeopleColumn: false,
    // Boolean(
    //       Number(
    //         window.localStorage.getItem('watchparty-showpeoplecolumn') ?? '0',
    //       ),
    //     ),
    owner: undefined,
    vanity: undefined,
    password: undefined,
    inviteLink: "",
    roomTitle: "",
    roomDescription: "",
    roomTitleColor: "",
    mediaPath: undefined,
    roomPlaybackRate: 0,
    isLiveStream: false,
    settingsModalOpen: false,
    convertProgress: undefined,
    convertEnabled: window.localStorage.getItem("watchparty-convert") === "1",
    audioTracks: undefined,
    audioTrackId: undefined,
  };
  socket: Socket = null!;
  mediasoupPubSocket: Socket | null = null;
  mediasoupSubSocket: Socket | null = null;
  ytDebounce = true;
  localStreamToPublish?: MediaStream;
  isLocalStreamAFile = false;
  transcoder?: ClientTranscoder;
  publisherConns: PCDict = {};
  consumerConn?: RTCPeerConnection;
  progressUpdater?: number;
  heartbeat: number | undefined = undefined;
  YouTubeInterface: YouTube = new YouTube(null);
  HTMLInterface: HTML = new HTML("leftVideo");
  Player = () => {
    if (this.usingYoutube()) {
      return this.YouTubeInterface;
    } else {
      return this.HTMLInterface;
    }
  };

  chatRef = React.createRef<Chat>();

  async componentDidMount() {
    document.addEventListener("fullscreenchange", this.onFullScreenChange);
    document.addEventListener("keydown", this.onKeydown);

    // Send heartbeat to the server
    this.heartbeat = window.setInterval(
      () => {
        fetch(serverPath + "/ping");
      },
      10 * 60 * 1000,
    );

    this.armStartupWatchdog();
    const canAutoplay = await testAutoplay();
    this.setState({ isAutoPlayable: canAutoplay });
    this.loadSettings();
    const video = document.getElementById("leftVideo");
    if (video instanceof HTMLVideoElement) {
      watchRebuffers(video, serverPath, () => ({
        room: this.state.roomId,
        media: this.state.roomMedia,
        estimateBitsPerSec: window.watchparty.hls?.bandwidthEstimate,
      }));
    }
    this.init();
    if (firebaseEnabled) {
      const firebase = await loadFirebase();
      firebase.auth().onAuthStateChanged(async (user: FirebaseUser | null) => {
        if (user) {
          this.loadSignInData(user);
        }
      });
    }
  }

  componentWillUnmount() {
    document.removeEventListener("fullscreenchange", this.onFullScreenChange);
    document.removeEventListener("keydown", this.onKeydown);
    window.clearInterval(this.heartbeat);
    window.clearInterval(this.tsInterval);
    window.clearTimeout(this.startupTimer);
    this.socket?.disconnect();
  }

  // Startup ("加载中") must end in either a connected socket or a coded error with a
  // retry button: every step below can fail or hang (see utils/startupError.ts).
  startupTimer?: number;
  tsInterval?: number;
  armStartupWatchdog = () => {
    window.clearTimeout(this.startupTimer);
    this.startupTimer = window.setTimeout(() => {
      if (this.state.state === "starting" && !this.state.overlayMsg && !this.state.isErrorAuth) {
        this.failStartup("E5", `no connection after ${STARTUP_TIMEOUT_MS / 1000}s`);
      }
    }, STARTUP_TIMEOUT_MS);
  };
  failStartup = (code: string, detail: string, message = t("app.connectFailed")) => {
    console.error("startup failed", code, detail);
    window.clearTimeout(this.startupTimer);
    const shown = `${code} ${detail}`.slice(0, 120);
    if (this.state.overlayCode === shown) return; // socket.io repeats connect_error per attempt
    this.setState({ overlayMsg: message, overlayCode: shown });
    reportStartupError(serverPath, code, detail);
  };
  retryConnect = () => {
    window.clearInterval(this.tsInterval);
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.setState({ overlayMsg: "", overlayCode: "" }, () => {
      this.armStartupWatchdog();
      this.init();
    });
  };

  init = async () => {
    try {
      let roomId = "/" + this.props.urlRoomId;
      // if a vanity name, resolve the url to a room id
      if (this.props.vanity) {
        const resp = await startupFetch("E1", serverPath + "/resolveRoom/" + this.props.vanity);
        const data = await resp.json().catch(() => null);
        if (!data?.roomId) {
          this.failStartup("E1", "room not found", t("app.loadRoomFailed"));
          return;
        }
        roomId = data.roomId;
      }
      this.setState({ roomId });
      await this.join(roomId);
    } catch (e: any) {
      if (e instanceof StartupError) this.failStartup(e.code, e.message);
      else this.failStartup("E0", `${e?.name ?? "Error"}: ${e?.message ?? e}`);
    }
  };

  join = async (roomId: string) => {
    const password = getSavedPasswords()[roomId] ?? "";
    const response = await startupFetch("E2", serverPath + "/resolveShard" + roomId);
    const shard = Number(await response.text()) || "";
    let guestIdentity: Awaited<ReturnType<typeof getGuestIdentity>> | undefined;
    if (!this.context.user) {
      try {
        guestIdentity = await getGuestIdentity();
      } catch (e: any) {
        throw new StartupError("E3", `${e?.name ?? "Error"}: ${e?.message ?? e}`);
      }
    }
    const joinName = guestIdentity?.name || this.state.myName || this.context.user?.displayName?.split(" ")[0] || "Guest";
    const socket = io(serverOrigin + roomId, {
      path: serverSocketPath,
      transports: ["websocket"],
      query: {
        clientId,
        name: joinName,
        password,
        shard,
        roomId: roomId.slice(1),
      },
      auth: {
        sessionId: getOrCreateSessionId(),
      },
    });
    this.socket = socket;
    socket.on("connect", async () => {
      window.clearTimeout(this.startupTimer);
      void syncServerClock(serverPath);
      this.setState({
        state: "connected",
        overlayMsg: "",
        overlayCode: "",
        errorMessage: "",
        successMessage: "",
        warningMessage: "",
      });
      recordRoomVisit({
        path: window.location.pathname,
        name: this.state.roomTitle || this.props.vanity || roomId.slice(1),
      });
      // Use the name in our state, generate one if empty
      this.updateName(this.context.user ? (this.state.myName || joinName) : (guestIdentity?.name || joinName));
      this.loadSignInData(this.context.user);
      // Re-join video chat if we were in it before the reconnection
      if (this.context.features.roomControls && window.watchparty.ourStream) {
        socket.emit("CMD:joinVideo");
      }
    });
    socket.on("connect_error", (err: any) => {
      console.error(err);
      if (err.message === "Invalid namespace") {
        this.failStartup("E4", "Invalid namespace", t("app.loadRoomFailed"));
      } else if (err.message === "password") {
        window.clearTimeout(this.startupTimer);
        this.setState({ isErrorAuth: true });
      } else if (this.state.state === "starting") {
        // socket.io keeps retrying; a later success clears the modal in "connect".
        this.failStartup("E4", String(err?.message ?? "connect_error"));
      } else {
        this.setState({ warningMessage: t("app.reconnecting") });
      }
    });
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        // the disconnection was initiated by the server, you need to reconnect manually
        this.setState({ overlayMsg: t("app.disconnected") });
      } else {
        // else the socket will automatically try to reconnect
        // Use the alert pill since it's less disruptive
        this.setState({ warningMessage: t("app.reconnecting") });
      }
    });
    socket.on("errorMessage", (err: string) => {
      this.setState({ errorMessage: tServer(err) });
      setTimeout(() => {
        this.setState({ errorMessage: "" });
      }, 3000);
    });
    socket.on("successMessage", (success: string) => {
      this.setState({ successMessage: tServer(success) });
      setTimeout(() => {
        this.setState({ successMessage: "" });
      }, 3000);
    });
    socket.on("kicked", () => {
      window.location.assign("/");
    });
    socket.on("REC:play", () => {
      this.localPlay();
    });
    socket.on("REC:pause", () => {
      this.localPause();
    });
    socket.on("REC:seek", (data: number) => {
      this.localSeek(data);
    });
    socket.on("REC:playbackRate", (data: number) => {
      this.setState({ roomPlaybackRate: data });
      if (data > 0) {
        this.Player().setPlaybackRate(data);
      }
    });
    socket.on("REC:subtitle", (data: string) => {
      this.setState({ roomSubtitle: data }, () => {
        this.Player().loadSubtitles(data);
      });
    });
    socket.on("REC:loop", (data: boolean) => {
      this.setState({ roomLoop: data });
    });
    socket.on("REC:changeController", (data: string) => {
      this.setState({ controller: data });
    });
    socket.on("REC:host", async (data: HostState) => {
      // qfile show rooms send a server-relative playlist path
      if (data.video && isQfileStream(data.video) && data.video.startsWith("/")) {
        data = { ...data, video: serverPath + data.video };
      }
      let currentMedia = data.video || "";
      if (this.playingScreenShare() && !isScreenShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingFileShare() && !isFileShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingVBrowser() && !isVBrowser(currentMedia)) {
        this.stopVBrowser();
      }
      if (this.playingScreenShare() && isScreenShare(currentMedia)) {
        // Ignore, it's probably a reconnection
        return;
      }
      if (this.playingFileShare() && isFileShare(currentMedia)) {
        // Ignore, it's probably a reconnection
        return;
      }
      if (
        this.playingVBrowser() &&
        this.getVBrowserHost() &&
        isVBrowser(currentMedia)
      ) {
        // Ignore, it's probably a reconnection
        return;
      }
      this.setState(
        {
          roomMedia: currentMedia,
          roomPaused: data.paused,
          roomSubtitle: data.subtitle,
          roomLoop: data.loop,
          roomPlaybackRate: data.playbackRate,
          loading: Boolean(data.video),
          bufferInfo: undefined,
          nonPlayableMedia: false,
          isVBrowserLarge: data.isVBrowserLarge,
          vBrowserResolution: "1280x720@30",
          vBrowserQuality: "1",
          controller: data.controller,
          isLiveStream: false,
        },
        async () => {
          const leftVideo = this.HTMLInterface.getVideoEl();

          // Stop all players
          // Unless the user is sharing a file, because we play it in leftVideo and capture stream
          if (!this.isLocalStreamAFile) {
            this.stopConvert();
            this.HTMLInterface.pauseVideo();
          }
          this.YouTubeInterface.stopVideo();

          if (!this.isLocalStreamAFile) {
            this.Player().clearState();
          }
          if (data.subtitle) {
            this.Player().loadSubtitles(data.subtitle);
          }
          if (data.playbackRate) {
            this.Player().setPlaybackRate(data.playbackRate);
          }

          if (
            this.playingScreenShare() ||
            this.playingFileShare() ||
            this.playingVBrowser()
          ) {
            console.log(
              "exiting REC:host since we are using webRTC (fileshare, screenshare, or vbrowser). Check setupRTCConnections()",
            );
            if (!(this.playingVBrowser() && !this.getVBrowserHost())) {
              // Remove the loader unless we're waiting for a vbrowser
              this.setLoadingFalse();
            }
            return;
          }
          if (this.usingYoutube() && !this.YouTubeInterface.isReady()) {
            console.log(
              "YT player not ready, onReady callback will retry when it is",
            );
            return;
          }
          const src = data.video;
          const time = data.videoTS;
          if (isMagnet(src)) {
            // WebTorrent
            if (!window.watchparty.webtorrent) {
              const WebTorrent = //@ts-expect-error
                (await import("webtorrent/dist/webtorrent.min.js")).default;
              window.watchparty.webtorrent = new WebTorrent();
              const reg = await navigator.serviceWorker?.register("/sw.min.js");
              const worker = reg.active || reg.waiting || reg.installing;
              const checkState = (worker: ServiceWorker | null) => {
                if (worker?.state === "activated") {
                  return window.watchparty.webtorrent?.createServer({
                    controller: reg,
                  });
                }
                return null;
              };
              if (!checkState(worker)) {
                worker?.addEventListener("statechange", ({ target }) =>
                  checkState(target as ServiceWorker),
                );
              }
            }
            await new Promise(async (resolve) => {
              const finish = (torrent: Torrent) => {
                // Got torrent metadata!
                console.log("Client is downloading:", torrent.infoHash);

                // Torrents can contain many files.
                const files = torrent.files;
                const fileIndex = new URLSearchParams(src).get("fileIndex");
                // Try to find a single large file to play
                let target;
                if (fileIndex != null && fileIndex !== "") {
                  target = files[Number(fileIndex)];
                }
                if (!target) {
                  target = pickSingleLargeFile(files);
                }
                if (!target) {
                  // Open the selector
                  // Selecting a file sets a new URL with the fileIndex set so we go through again
                  this.setMultiSelectModal(true);
                  this.setFileSelection(
                    files.map((f: WebTorrent.TorrentFile, i: number) => ({
                      name: f.name,
                      url: src + `&fileIndex=${i}`,
                      length: f.length,
                    })),
                  );
                } else {
                  //@ts-expect-error
                  target.streamTo(leftVideo);
                }
                resolve(undefined);
              };
              let target = await window.watchparty.webtorrent?.get(src);
              if (!target) {
                target = window.watchparty.webtorrent?.add(src, {
                  announce: [
                    "wss://tracker.btorrent.xyz",
                    "wss://tracker.openwebtorrent.com",
                  ],
                  destroyStoreOnDestroy: true,
                  maxWebConns: 4,
                  path: "/tmp/webtorrent/",
                  storeCacheSlots: 20,
                  strategy: "sequential",
                  // noPeersIntervalTime: 30,
                });
              }
              if (target?.ready) {
                finish(target);
              } else {
                target?.on("ready", () => {
                  finish(target);
                });
              }
            });
          } else if (isDash(src)) {
            if (!window.watchparty.dash) {
              const Dash = await import("dashjs");
              window.watchparty.dash = Dash.MediaPlayer().create();
              window.watchparty.dash.on("streamInitialized", (_e: any) => {
                // for a live stream:
                // html.currenttime is time since stream start
                // html.duration is infinite
                // html.seekable ends at the live edge (see getDuration)
                // player.duration is the size of the seekable range, not a position
                const isLiveStream = Boolean(
                  window.watchparty.dash?.isDynamic(),
                );
                console.log("DASH stream initialized: isLive %s", isLiveStream);
                this.setState({
                  isLiveStream,
                });
              });
            }
            window.watchparty.dash.initialize(leftVideo, src);
          } else if (isHls(src) && (window.MediaSource || (window as any).ManagedMediaSource)) {
            // Prefer hls.js wherever Media Source Extensions exist: iPhones (iOS 17.1+)
            // only have ManagedMediaSource, which hls.js uses. Native HLS is the
            // fallback, but it cannot play qfile shows (fake PNG headers, Referer).
            // qfile shows need their own loader settings, so switching between a
            // qfile show and other HLS sources rebuilds the player.
            const qfile = isQfileStream(src);
            if (window.watchparty.hls && window.watchparty.hlsQfile !== qfile) {
              window.watchparty.hls.destroy();
              window.watchparty.hls = undefined;
            }
            if (!window.watchparty.hls) {
              const { default: Hls, FetchLoader, LoadStats } = await import("hls.js");
              window.watchparty.hlsQfile = qfile;
              window.watchparty.hls = new Hls(
                qfile
                  ? {
                      // The qfile CDN rejects a foreign Referer ("invalid url"),
                      // so segments are fetched without one.
                      loader: FetchLoader,
                      fetchSetup: (context, init) =>
                        new Request(context.url, {
                          ...init,
                          referrerPolicy: "no-referrer",
                        }),
                      // Segments: same no-referrer fetch, plus byte progress
                      // for the buffering readout.
                      fLoader: makeQfileSegmentLoader(
                        LoadStats,
                        (loaded: number, total: number) => {
                          noteSegmentBytes(loaded);
                          this.onSegmentProgress(loaded, total);
                        },
                      ) as any,
                      // Segments are ~6 s and each costs a link lookup:
                      // load them one at a time, at most 5 ahead (hls.js
                      // starts one more segment while below this target).
                      maxBufferLength: 24,
                      maxMaxBufferLength: 24,
                      backBufferLength: 30,
                    }
                  : {},
              );
              window.watchparty.hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal || data.details !== "bufferStalledError") {
                  console.warn("HLS error", data.type, data.details, data.fatal ? "fatal" : "", data.response?.code ?? "");
                }
              });
              window.watchparty.hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
                const isLiveStream = data.details.live;
                this.setState({ isLiveStream });
                console.log("HLS level loaded: isLive %s", isLiveStream);
              });
            }
            // qfile shows: start loading at the room's position instead of the
            // first segment, so joining mid-episode downloads one segment, not two.
            window.watchparty.hls.config.startPosition =
              qfile && time > 0 ? time : -1;
            window.watchparty.hls.loadSource(src);
            window.watchparty.hls.attachMedia(leftVideo);
          }
          // else if (isMpegTs(src)) {
          //   const mpegts = (await import('mpegts.js')).default;
          //   let player = mpegts.createPlayer({
          //     type: 'mse', // could also be mpegts, m2ts, flv
          //     // isLive: true,
          //     url: src,
          //   });
          //   player.attachMediaElement(leftVideo);
          //   player.load();
          //   player.play();
          // }
          else if (
            this.state.convertEnabled &&
            isClientTranscodeSupported() &&
            isDirectVideoUrl(src)
          ) {
            await this.convertAndPlay(src, time);
          } else {
            await this.Player().setSrcAndTime(src, time);
          }
          // Start this video
          if (!data.paused) {
            this.localPlay();
          }
          // Do right before playing
          leftVideo?.addEventListener(
            "canplay",
            () => {
              this.setLoadingFalse();
              let ts = undefined;
              // WebTorrent and Hls and Dash reset position back to 0 so set it back here
              if (
                isMagnet(src) ||
                isHls(src) ||
                isDash(src) ||
                this.state.isLiveStream
              ) {
                ts = time;
              }
              // qfile shows load one ~6 s segment before starting, and the join
              // time usually falls late in it, which left ~1 s to play before a
              // full stall on the next segment. Start from the beginning of
              // that buffered segment instead, so playback has the whole
              // segment as runway while the next one downloads.
              if (isQfileStream(src) && leftVideo && ts !== undefined) {
                const buffered = leftVideo.buffered;
                for (let i = 0; i < buffered.length; i++) {
                  if (buffered.start(i) <= ts && ts <= buffered.end(i)) ts = buffered.start(i);
                }
              }
              // Resync to leader since the loading might have taken some time
              this.localSeek(ts);
              if (data.playbackRate) {
                // Set playback rate again since it might have been lost
                console.log("setting playback rate again", data.playbackRate);
                this.Player().setPlaybackRate(data.playbackRate);
              }
            },
            { once: true },
          );

          // Progress updater
          window.clearInterval(this.progressUpdater);
          this.setState({ downloaded: 0, total: 0, speed: 0 });
          if (currentMedia.includes("/stream?torrent=magnet")) {
            this.progressUpdater = window.setInterval(async () => {
              const response = await fetch(
                currentMedia.replace("/stream", "/progress"),
              );
              const data = await response.json();
              this.setState({
                downloaded: data.downloaded,
                total: data.total,
                speed: data.speed,
                connections: data.connections,
              });
            }, 1000);
          }
          if (isMagnet(currentMedia)) {
            this.progressUpdater = window.setInterval(async () => {
              const client = window.watchparty.webtorrent;
              if (client) {
                this.setState({
                  downloaded: client.torrents[0]?.downloaded,
                  total: client.torrents[0]?.length,
                  speed: client.torrents[0]?.downloadSpeed,
                  connections: client.torrents[0]?.numPeers,
                });
              }
            }, 1000);
          }
        },
      );
    });
    socket.on("REC:joinNotice", (data: ChatMessage) => this.setState({ joinNotice: data }));
    socket.on("REC:chat", (data: ChatMessage) => {
      // Older servers still send arrivals as chat: show them on the notice line.
      if (isJoinNotice(data)) {
        this.setState({ joinNotice: data });
        return;
      }
      if (
        !getCurrentSettings().disableChatSound &&
        !data.system &&
        ((document.visibilityState && document.visibilityState !== "visible") ||
          this.state.currentTab !== "chat")
      ) {
        new Audio("/clearly.mp3").play();
      }
      this.setState((state) => ({
        chat: [...state.chat, data].slice(-100),
        liveChat: [...state.liveChat, data].slice(-64),
        scrollTimestamp: Date.now(),
        unreadCount:
          state.currentTab === "chat"
            ? state.unreadCount
            : state.unreadCount + 1,
      }));
    });
    socket.on("REC:addReaction", (data: Reaction) => {
      const { chat } = this.state;
      const msgIndex = chat.findIndex(
        (m) => m.id === data.msgId && m.timestamp === data.msgTimestamp,
      );
      if (msgIndex === -1) {
        return;
      }
      const msg = chat[msgIndex];
      msg.reactions = msg.reactions || {};
      msg.reactions[data.value] = msg.reactions[data.value] || [];
      msg.reactions[data.value].push(data.user);
      this.setState({ chat }, () => {
        // if we add a reaction to the last message we need to scroll down
        // or else the reaction icon might be hidden
        if (
          msgIndex === chat.length - 1 &&
          this.chatRef.current?.state.isNearBottom
        ) {
          this.chatRef.current?.scrollToBottom();
        }
      });
    });
    socket.on("REC:removeReaction", (data: Reaction) => {
      const { chat } = this.state;
      const msg = chat.find(
        (m) => m.id === data.msgId && m.timestamp === data.msgTimestamp,
      );
      if (!msg || !msg.reactions?.[data.value]) {
        return;
      }
      msg.reactions[data.value] = msg.reactions[data.value].filter(
        (id) => id !== data.user,
      );
      this.setState({ chat });
    });
    socket.on("REC:tsMap", (data: NumberDict) => {
      this.setState({ tsMap: data }, () => {
        // Dynamic playback rate based on timestamps
        // Disable for sharing types where the users can have different timestamps
        // e.g. screenshare, fileshare, .m3u8 HLS streams
        // Also not necessary for WebRTC sharing since it should be close to realtime
        if (
          !this.state.roomPaused &&
          !this.state.isLiveStream &&
          this.hasDuration() &&
          this.state.roomPlaybackRate === 0
        ) {
          const leader = this.getLeaderTime();
          const delta = leader - data[clientId];
          // Set leader pbr to 1
          let pbr = 1;
          // Add .01 pbr for each 100ms delay
          if (delta > 0.5) {
            pbr += Number((delta / 10).toFixed(2));
            pbr = Math.min(pbr, 1.1);
          }
          // console.log(delta, pbr);
          if (this.Player().getPlaybackRate() !== pbr) {
            this.Player().setPlaybackRate(pbr);
          }
        }
        if (this.state.roomSubtitle) {
          const sharer = this.state.participants.find((p) => p.isScreenShare);
          if (sharer && sharer.id !== clientId) {
            // Sync only if someone is sharing and it's not us
            const sharerTime = this.state.tsMap[sharer.id];
            this.Player().syncSubtitles(sharerTime);
          }
        }
      });
    });
    socket.on("REC:nameMap", (data: StringDict) => {
      this.setState({ nameMap: data });
    });
    socket.on("REC:pictureMap", (data: StringDict) => {
      this.setState({ pictureMap: data });
    });
    socket.on("REC:lock", (data: string) => {
      this.setState({ roomLock: data });
    });
    socket.on("roster", (data: User[]) => {
      this.setState({ participants: data, rosterUpdateTS: Date.now() }, () => {
        this.setupRTCConnections();
      });
    });
    socket.on("chatinit", (data: ChatMessage[]) => {
      const joins = data.filter((msg) => isJoinNotice(msg));
      this.setState((state) => ({
        chat: data.filter((msg) => !isJoinNotice(msg)),
        joinNotice: joins[joins.length - 1] ?? state.joinNotice,
        liveChat: [],
        liveChatVersion: state.liveChatVersion + 1,
        scrollTimestamp: Date.now(),
      }));
    });
    socket.on("playlist", (data: PlaylistVideo[]) => {
      this.setState({ playlist: data });
    });
    socket.on(
      "signalSS",
      async (data: {
        msg: { ice: any; sdp: any };
        from: string;
        sharer: boolean;
      }) => {
        config.NODE_ENV === "development" && console.log(data);
        // Handle messages received from signaling server
        const msg = data.msg;
        const from = data.from;
        // Determine whether the message came from the sharer or the sharee
        const pc = (
          data.sharer ? this.consumerConn : this.publisherConns[from]
        ) as RTCPeerConnection;
        if (msg.ice !== undefined) {
          pc.addIceCandidate(new RTCIceCandidate(msg.ice));
        } else if (msg.sdp && msg.sdp.type === "offer") {
          // console.log('offer');
          // TODO Currently ios/Safari cannot handle this property, so remove it from the offer
          const _sdp = msg.sdp.sdp
            .split("\n")
            .filter((line: string) => {
              return line.trim() !== "a=extmap-allow-mixed";
            })
            .join("\n");
          msg.sdp.sdp = _sdp;
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          // Allow stereo audio
          answer.sdp = answer.sdp?.replace(
            "useinbandfec=1",
            "useinbandfec=1; stereo=1; maxaveragebitrate=510000",
          );
          // console.log(answer.sdp);
          // Allow multichannel audio if Chromium
          //@ts-expect-error
          const isChromium = Boolean(window.chrome);
          if (isChromium) {
            answer.sdp = answer.sdp
              ?.replace("opus/48000/2", "multiopus/48000/6")
              .replace(
                "useinbandfec=1",
                "channel_mapping=0,4,1,2,3,5; num_streams=4; coupled_streams=2;maxaveragebitrate=510000;minptime=10;useinbandfec=1",
              );
          }
          await pc.setLocalDescription(answer);
          this.sendSignalSS(from, { sdp: pc.localDescription }, !data.sharer);
        } else if (msg.sdp && msg.sdp.type === "answer") {
          pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
      },
    );
    socket.on("REC:getRoomState", this.handleRoomState);
    window.clearInterval(this.tsInterval);
    this.tsInterval = window.setInterval(() => {
      if (this.state.roomMedia) {
        const toSend = this.getRoomTSToSet(this.Player().getCurrentTime());
        this.socket.emit("CMD:ts", toSend);
      }
    }, 1000);
  };

  setFileSelection = (
    data: { name: string; url: string; length: number; playFn?: () => void }[],
  ) => {
    this.setState({ fileSelection: data });
  };

  setMultiSelectModal = (isMultiSelectModalOpen: boolean) => {
    this.setState({ isMultiSelectModalOpen });
  };

  resetMultiSelect = () => {
    this.setState({ isMultiSelectModalOpen: false, fileSelection: [] });
  };

  loadSettings = async () => {
    // Load settings from localstorage
    let settings = getCurrentSettings();
    this.setState({ settings });
  };

  loadSignInData = async (user: FirebaseUser | undefined) => {
    if (user && this.socket) {
      // NOTE: firebase auth doesn't provide the actual first name data that individual providers (G/FB) do
      // It's accessible at the time the user logs in but not afterward
      // If we want accurate surname/given name we'll need to save that somewhere
      const firstName = user.displayName?.split(" ")[0];
      if (firstName) {
        // Don't update the username if the user wants to customize their own
        // Set a flag in localstorage so we only update this once, if the user changes name manually later we won't overwrite
        // Clear the flag on logout
        if (!window.localStorage.getItem("watchparty-loginname")) {
          this.updateName(firstName);
          window.localStorage.setItem(
            "watchparty-loginname",
            Date.now().toString(),
          );
        }
      }
      const userImage = await getUserImage(user);
      if (userImage) {
        this.updatePicture(userImage);
      }
      this.updateUid(user);
    }
  };

  loadYouTube = () => {
    // This code loads the IFrame Player API code asynchronously.
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.append(tag);
    window.onYouTubeIframeAPIReady = () => {
      // Note: this fails silently if the element is not available
      const ytPlayer = new window.YT.Player("leftYt", {
        events: {
          onReady: () => {
            console.log("yt onReady");
            this.YouTubeInterface = new YouTube(ytPlayer);
            // Only clear the spinner for YouTube media: other players are still loading
            if (this.usingYoutube()) {
              this.setState({ loading: false });
            }
            // We might have failed to play YT originally, ask for the current video again
            if (this.usingYoutube()) {
              console.log("requesting host data again after ytReady");
              this.socket.emit("CMD:askHost");
            }
          },
          onStateChange: (e) => {
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.CUED
            ) {
              this.setState({ loading: false });
            }
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.ENDED
            ) {
              console.log(e.data, e.target.getVideoUrl());
              this.onVideoEnded(e.target.getVideoUrl());
            }
            if (
              this.context.features.roomControls &&
              this.ytDebounce &&
              ((e.data === window.YT?.PlayerState?.PLAYING &&
                this.state.roomPaused) ||
                (e.data === window.YT?.PlayerState?.PAUSED &&
                  !this.state.roomPaused))
            ) {
              this.ytDebounce = false;
              if (e.data === window.YT?.PlayerState?.PLAYING) {
                this.socket.emit("CMD:play");
                this.localPlay();
              } else {
                this.socket.emit("CMD:pause");
                this.localPause();
              }
              window.setTimeout(() => (this.ytDebounce = true), 500);
            }
          },
        },
      });
    };
  };

  // Functions for managing room settings
  getInviteLink = (vanity: string) => {
    if (vanity) {
      return `${window.location.origin}/r/${vanity}`;
    }
    return `${window.location.origin}/watch${this.state.roomId}`;
  };

  handleRoomState = (data: any) => {
    this.setOwner(data.owner);
    this.setVanity(data.vanity);
    this.setPassword(data.password);
    this.setInviteLink(this.getInviteLink(data.vanity));
    this.setIsChatDisabled(data.isChatDisabled);
    this.setRoomTitle(data.roomTitle);
    this.setRoomDescription(data.roomDescription);
    this.setRoomTitleColor(data.roomTitleColor);
    this.setMediaPath(data.mediaPath);
    window.history.replaceState("", "", this.getInviteLink(data.vanity));
    recordRoomVisit({
      path: this.getInviteLink(data.vanity),
      name: data.roomTitle || data.vanity || this.state.roomId.slice(1),
    });
  };

  setOwner = (owner: string) => {
    this.setState({ owner });
  };
  setVanity = (vanity: string | undefined) => {
    this.setState({ vanity });
  };
  setPassword = (password: string | undefined) => {
    this.setState({ password });
  };
  setInviteLink = (inviteLink: string) => {
    this.setState({ inviteLink });
  };
  setRoomTitle = (roomTitle: string | undefined) => {
    this.setState({ roomTitle });
  };
  setRoomDescription = (roomDescription: string | undefined) => {
    this.setState({ roomDescription });
  };
  setRoomTitleColor = (roomTitleColor: string | undefined) => {
    this.setState({ roomTitleColor });
  };
  setMediaPath = (mediaPath: string | undefined) => {
    this.setState({ mediaPath });
  };

  setRoomLock = async (locked: boolean) => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:lock", { locked });
  };

  haveLock = () => {
    if (!this.context.features.roomControls) return false;
    if (!this.state.roomLock) {
      return true;
    }
    return this.context.user?.uid === this.state.roomLock;
  };

  setIsChatDisabled = (val: boolean) => this.setState({ isChatDisabled: val });

  clearChat = async () => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:deleteChatMessages", {});
  };

  showError = (message: string) => {
    this.setState({ errorMessage: message });
    setTimeout(() => {
      this.setState({ errorMessage: "" });
    }, 3000);
  };

  // Stops client-side conversion (if running) and releases its resources
  stopConvert = () => {
    this.transcoder?.stop();
    this.transcoder = undefined;
    if (
      this.state.convertProgress !== undefined ||
      this.state.audioTracks !== undefined
    ) {
      this.setState({
        convertProgress: undefined,
        audioTracks: undefined,
        audioTrackId: undefined,
      });
    }
  };

  // Switches the audio track of the file being converted (e.g. another language). Local to this device for links,
  // for a shared file it changes what everyone hears since viewers receive the converted stream.
  localSetAudioTrack = async (id: number) => {
    try {
      await this.transcoder?.selectAudioTrack(id);
    } catch (err) {
      console.error(err);
      this.showError(
        err instanceof Error ? err.message : t("app.audioTrackFailed"),
      );
    }
  };

  createTranscoder = (
    source: File | string,
    video: HTMLMediaElement,
    startTime: number,
    onError: (err: Error) => void,
  ) => {
    const transcoder = new ClientTranscoder({
      source,
      video,
      startTime,
      onProgress: (fraction) => {
        if (this.transcoder === transcoder) {
          this.setState({ convertProgress: fraction });
        }
      },
      onAudioTracks: (audioTracks, audioTrackId) => {
        if (this.transcoder === transcoder) {
          this.setState({ audioTracks, audioTrackId });
        }
      },
      onError,
    });
    this.transcoder = transcoder;
    this.setState({ convertProgress: 0 });
    return transcoder;
  };

  // Plays a media URL in this browser after converting it with WebCodecs (see clientTranscode.ts), for formats the
  // browser can't play natively. Only affects this client: the room's media URL is unchanged.
  convertAndPlay = async (src: string, time: number) => {
    const video = this.HTMLInterface.getVideoEl();
    const transcoder = this.createTranscoder(src, video, time, (err) => {
      // Conversion failed while playing. Carry on without it.
      this.showError(
        t("app.conversionFailedPlay", { message: err.message }),
      );
      this.stopConvert();
      this.Player().setSrcAndTime(src, video.currentTime);
    });
    try {
      await transcoder.start();
    } catch (err) {
      console.error(err);
      if (this.transcoder === transcoder) {
        // Typically a CORS restriction or a link that isn't a media file
        this.stopConvert();
        const reason =
          err instanceof Error ? err.message : t("app.convertVideoFailed");
        this.showError(t("app.convertFallbackPlay", { reason }));
        await this.Player().setSrcAndTime(src, time);
      }
    }
  };

  // Shares a file from this device. With convert, the file is first transcoded in this browser using WebCodecs
  // into a format browsers can play (see clientTranscode.ts), then shared the same way as an unconverted file.
  startFileShare = async (
    useMediaSoup: boolean,
    options?: { convert?: boolean },
  ) => {
    if (!this.context.features.roomControls) return;
    const files = await openFileSelector();
    if (!files) {
      return;
    }
    const file = files[0];
    if (options?.convert && !isClientTranscodeSupported()) {
      this.showError(t("app.convertUnsupported"));
      return;
    }
    this.stopConvert();
    this.Player().clearState();
    const leftVideo = this.HTMLInterface.getVideoEl();
    if (options?.convert) {
      const transcoder = this.createTranscoder(file, leftVideo, 0, (err) => {
        // Conversion failed mid-share
        this.showError(t("app.conversionFailed", { message: err.message }));
        this.stopPublishingLocalStream();
      });
      try {
        await transcoder.start();
      } catch (err) {
        console.error(err);
        if (this.transcoder === transcoder) {
          this.stopConvert();
          this.showError(
            err instanceof Error ? err.message : t("app.convertFileFailed"),
          );
        }
        return;
      }
      if (this.transcoder !== transcoder) {
        // Cancelled while starting up
        return;
      }
    } else {
      leftVideo.src = URL.createObjectURL(file);
    }
    leftVideo.play();
    //@ts-expect-error
    this.localStreamToPublish = leftVideo?.captureStream();
    this.isLocalStreamAFile = true;
    if (this.localStreamToPublish) {
      this.socket.emit("CMD:joinScreenShare", {
        file: true,
        mediasoup: useMediaSoup,
      });
    }
  };

  startScreenShare = async (useMediaSoup: boolean) => {
    if (!this.context.features.roomControls) return;
    if (navigator.mediaDevices.getDisplayMedia) {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        //@ts-expect-error
        video: { height: 720, logicalSurface: true },
        audio: {
          autoGainControl: false,
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 48000,
          sampleSize: 16,
        },
      });
      this.localStreamToPublish = stream;
      this.isLocalStreamAFile = false;
      this.socket.emit("CMD:joinScreenShare", {
        file: false,
        mediasoup: useMediaSoup,
      });
    }
  };

  // Share the video to mediasoup
  publishMediasoup = async (mediasoupURL: string) => {
    const localStream = this.localStreamToPublish;
    let device: MediasoupClient.types.Device = null as any;
    let producerTransport: MediasoupClient.types.Transport = null as any;

    // =========== socket.io ==========
    const connectSocket = (mediasoupURL: string) => {
      return new Promise<void>((resolve, reject) => {
        this.mediasoupPubSocket = io(mediasoupURL, {
          transports: ["websocket"],
        });

        const socket = this.mediasoupPubSocket;
        socket?.on("connect", function () {
          console.log("PUBLISH: connected to socket.io");
          resolve();
        });
        socket?.on("error", function (err) {
          console.error("PUBLISH: socket.io ERROR:", err);
          reject(err);
        });
      });
    };

    const sendRequest = (type: string, data: any) => {
      return new Promise<any>((resolve, reject) => {
        const socket = this.mediasoupPubSocket;
        socket?.emit(type, data, (err: any, response: any) => {
          if (!err) {
            // Success response, so pass the mediasoup response to the local Room.
            resolve(response);
          } else {
            reject(err);
          }
        });
      });
    };

    async function publish() {
      // --- get transport info ---
      console.log("PUBLISH: --- createProducerTransport --");
      const params = await sendRequest("createProducerTransport", {});
      console.log("PUBLISH: transport params:", params);
      producerTransport = device.createSendTransport(params);
      console.log("PUBLISH: createSendTransport:", producerTransport);

      // --- join & start publish --
      producerTransport.on(
        "connect",
        async (
          {
            dtlsParameters,
          }: { dtlsParameters: MediasoupClient.types.DtlsParameters },
          callback: () => void,
          errback: (error: Error) => void,
        ) => {
          console.log("PUBLISH: --transport connect");
          sendRequest("connectProducerTransport", {
            dtlsParameters: dtlsParameters,
          })
            .then(callback)
            .catch(errback);
        },
      );

      producerTransport.on(
        "produce",
        async (
          {
            kind,
            rtpParameters,
          }: {
            kind: string;
            rtpParameters: MediasoupClient.types.RtpParameters;
          },
          callback: ({ id }: { id: string }) => void,
          errback: (error: Error) => void,
        ) => {
          console.log("PUBLISH: --transport produce");
          try {
            const { id } = await sendRequest("produce", {
              transportId: producerTransport.id,
              kind,
              rtpParameters,
            });
            callback({ id });
          } catch (err: any) {
            errback(err);
          }
        },
      );

      // producerTransport.on('connectionstatechange', (state: string) => {
      //   switch (state) {
      //     case 'connecting':
      //       console.log('PUBLISH: connecting');
      //       break;

      //     case 'connected':
      //       console.log('PUBLISH: connected');
      //       break;

      //     case 'failed':
      //       console.log('PUBLISH: failed');
      //       producerTransport.close();
      //       break;

      //     default:
      //       break;
      //   }
      // });

      const videoTrack = localStream?.getVideoTracks()[0];
      if (videoTrack) {
        const trackParams = { track: videoTrack };
        await producerTransport.produce(trackParams);
      }
      const audioTrack = localStream?.getAudioTracks()[0];
      if (audioTrack) {
        const trackParams = { track: audioTrack };
        await producerTransport.produce(trackParams);
      }
    }

    async function loadDevice(
      routerRtpCapabilities: MediasoupClient.types.RtpCapabilities,
    ) {
      const { Device } = await import("mediasoup-client");
      device = new Device();
      await device.load({ routerRtpCapabilities });
    }

    await connectSocket(mediasoupURL);
    // --- get capabilities --
    const data = await sendRequest("getRouterRtpCapabilities", {});
    console.log("PUBLISH: getRouterRtpCapabilities:", data);
    await loadDevice(data);
    await publish();
  };

  // Play the video from MediaSoup
  subscribeMediasoup = async (mediaSoupURL: string) => {
    let device: MediasoupClient.types.Device = null as any;
    let consumerTransport: MediasoupClient.types.Transport = null as any;
    // =========== socket.io ==========

    const connectSocket = () => {
      return new Promise<void>((resolve, reject) => {
        this.mediasoupSubSocket = io(mediaSoupURL, {
          transports: ["websocket"],
        });
        const socket = this.mediasoupSubSocket;
        socket?.on("connect", function () {
          console.log("SUBSCRIBE: connected to socket.io");
          resolve();
        });
        socket?.on("error", function (err) {
          console.error("SUBSCRIBE: socket.io ERROR:", err);
          reject(err);
        });
        socket?.on("newProducer", async function (message) {
          console.log("SUBSCRIBE: socket.io newProducer:", message);
          if (consumerTransport) {
            // start consume
            if (message.kind === "video") {
              await consumeAndResume(message.kind);
            } else if (message.kind === "audio") {
              await consumeAndResume(message.kind);
            }
          }
        });

        // socket?.on('producerClosed', function (message) {
        //   console.log('socket.io producerClosed:', message);
        //   const localId = message.localId;
        //   const remoteId = message.remoteId;
        //   const kind = message.kind;
        //   if (kind === 'video') {
        //     if (videoConsumer) {
        //       videoConsumer.close();
        //       videoConsumer = null;
        //     }
        //   } else if (kind === 'audio') {
        //     if (audioConsumer) {
        //       audioConsumer.close();
        //       audioConsumer = null;
        //     }
        //   }
        // });
      });
    };

    const sendRequest = (type: string, data: any) => {
      return new Promise<any>((resolve, reject) => {
        const socket = this.mediasoupSubSocket;
        socket?.emit(type, data, (err: Error, response: any) => {
          if (!err) {
            // Success response, so pass the mediasoup response to the local Room.
            resolve(response);
          } else {
            reject(err);
          }
        });
      });
    };

    // =========== media handling ==========
    const addRemoteTrack = (track: MediaStreamTrack) => {
      let video = this.HTMLInterface.getVideoEl();
      if (video.srcObject) {
        // Track already exists, add it
        (video.srcObject as MediaStream).addTrack(track);
      } else {
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        video.srcObject = mediaStream;
      }
      this.localPlay();
    };

    async function consumeAndResume(kind: string) {
      const consumer = await consume(consumerTransport, kind);
      if (consumer) {
        console.log("SUBSCRIBE: -- track exist, consumer ready. kind=" + kind);
        if (kind === "video") {
          console.log("SUBSCRIBE: -- resume kind=" + kind);
          sendRequest("resume", { kind: kind })
            .then(() => {
              console.log("SUBSCRIBE: resume OK");
              return consumer;
            })
            .catch((err) => {
              console.error("SUBSCRIBE: resume ERROR:", err);
              return consumer;
            });
        } else {
          console.log("SUBSCRIBE: -- do not resume kind=" + kind);
        }
      } else {
        console.log("SUBSCRIBE: -- no consumer yet. kind=" + kind);
        return null;
      }
    }

    async function loadDevice(
      routerRtpCapabilities: MediasoupClient.types.RtpCapabilities,
    ) {
      try {
        const { Device } = await import("mediasoup-client");
        device = new Device();
        await device.load({ routerRtpCapabilities });
      } catch (error: any) {
        if (error.name === "UnsupportedError") {
          console.error("browser not supported");
        }
      }
    }

    async function consume(
      transport: MediasoupClient.types.Transport,
      trackKind: string,
    ) {
      console.log("SUBSCRIBE: --start of consume --kind=" + trackKind);
      const { rtpCapabilities } = device;
      const data = await sendRequest("consume", {
        rtpCapabilities: rtpCapabilities,
        kind: trackKind,
      }).catch((err) => {
        console.error("SUBSCRIBE: ERROR:", err);
      });
      const { producerId, id, kind, rtpParameters } = data;

      if (producerId) {
        let codecOptions = {};
        const consumer = await transport.consume({
          id,
          producerId,
          kind,
          rtpParameters,
          //@ts-expect-error
          codecOptions,
        });

        addRemoteTrack(consumer.track);
        console.log("SUBSCRIBE: --end of consume");
        return consumer;
      } else {
        console.warn("SUBSCRIBE: ---remote producer NOT READY");
        return null;
      }
    }

    async function subscribe() {
      console.log("SUBSCRIBE: ---createConsumerTransport --");
      const params = await sendRequest("createConsumerTransport", {});
      console.log("SUBSCRIBE: transport params:", params);
      consumerTransport = device.createRecvTransport(params);
      console.log("SUBSCRIBE: createConsumerTransport:", consumerTransport);

      // --- join & start watching
      consumerTransport.on(
        "connect",
        async (
          {
            dtlsParameters,
          }: { dtlsParameters: MediasoupClient.types.DtlsParameters },
          callback: () => void,
          errback: (err: Error) => void,
        ) => {
          console.log("SUBSCRIBE: ---consumer transport connect");
          sendRequest("connectConsumerTransport", {
            dtlsParameters: dtlsParameters,
          })
            .then(callback)
            .catch(errback);
        },
      );

      // consumerTransport.on('connectionstatechange', (state: string) => {
      //   switch (state) {
      //     case 'connecting':
      //       console.log('SUBSCRIBE: connecting');
      //       break;

      //     case 'connected':
      //       console.log('SUBSCRIBE: connected');
      //       break;

      //     case 'failed':
      //       console.log('SUBSCRIBE: failed');
      //       consumerTransport.close();
      //       break;

      //     default:
      //       break;
      //   }
      // });

      await consumeAndResume("video");
      await consumeAndResume("audio");
    }

    // Clear the srcobject so we load our stream when received
    const leftVideo = this.HTMLInterface.getVideoEl();
    leftVideo.srcObject = null;
    await connectSocket();
    // --- get capabilities --
    const data = await sendRequest("getRouterRtpCapabilities", {});
    console.log("getRouterRtpCapabilities:", data);
    await loadDevice(data);
    await subscribe();
  };

  stopPublishingLocalStream = async () => {
    this.stopConvert();
    if (this.localStreamToPublish) {
      this.socket.emit("CMD:leaveScreenShare");
      // We don't actually need to unmute if it's a fileshare but this is fine
      this.localSetMute(false);
    }
    this.localStreamToPublish &&
      this.localStreamToPublish.getTracks().forEach((track) => {
        track.stop();
      });
    this.localStreamToPublish = undefined;
    if (this.consumerConn) {
      this.consumerConn.close();
      this.consumerConn = undefined;
    }
    Object.values(this.publisherConns).forEach((pc) => {
      pc.close();
    });
    this.publisherConns = {};
    this.isLocalStreamAFile = false;
    if (this.mediasoupPubSocket) {
      this.mediasoupPubSocket.close();
      this.mediasoupPubSocket = null;
    }
    if (this.mediasoupSubSocket) {
      this.mediasoupSubSocket.close();
      this.mediasoupSubSocket = null;
    }
  };

  setupRTCConnections = async () => {
    if (!this.playingScreenShare() && !this.playingFileShare()) {
      return;
    }
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    const selfId = getOrCreateClientId();
    const localTrack = this.localStreamToPublish?.getVideoTracks()[0];
    if (localTrack && !localTrack.onended) {
      // Stop sharing if the local stream stops
      localTrack.onended = () => this.stopPublishingLocalStream();
    }
    if (this.state.roomMedia.includes("@")) {
      let prefix = "screenshare://";
      if (this.playingFileShare()) {
        prefix = "fileshare://";
      }
      const unprefixed = this.state.roomMedia.replace(prefix, "");
      const mediasoupURL = unprefixed.split("@")[1];
      if (sharer?.id === selfId && this.mediasoupPubSocket == null) {
        await this.publishMediasoup(mediasoupURL);
      }
      // If we're not sharing a file, also start watching
      // avoid duplicate watching if the socket already exists
      if (!this.isLocalStreamAFile && this.mediasoupSubSocket == null) {
        await this.subscribeMediasoup(mediasoupURL);
      }
      return;
    }

    // We're the sharer, create a connection to each other member
    if (sharer?.id === selfId) {
      // Delete and close any connections that aren't in the current member list (maybe someone disconnected)
      // This allows them to rejoin later
      const clientIds = new Set(this.state.participants.map((p) => p.id));
      Object.entries(this.publisherConns).forEach(([key, value]) => {
        if (!clientIds.has(key)) {
          value.close();
          delete this.publisherConns[key];
        }
      });

      this.state.participants.forEach((user) => {
        const id = user.id;
        if (id === selfId && this.isLocalStreamAFile) {
          // Don't set up a connection to ourselves if sharing file
          return;
        }
        if (!this.publisherConns[id]) {
          // Set up the RTCPeerConnection for sharing media to each member
          const pc = new RTCPeerConnection({ iceServers: iceServers() });
          this.publisherConns[id] = pc;
          this.localStreamToPublish?.getTracks().forEach((track) => {
            if (this.localStreamToPublish != null) {
              pc.addTrack(track, this.localStreamToPublish);
            }
          });
          pc.onicecandidate = (event) => {
            // We generated an ICE candidate, send it to peer
            if (event.candidate) {
              this.sendSignalSS(id, { ice: event.candidate }, true);
            }
          };
          pc.onnegotiationneeded = async () => {
            // Start connection for peer's video
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignalSS(id, { sdp: pc.localDescription }, true);
          };
        }
      });
    }
    // We're a watcher, establish connection to sharer
    // If screensharing, sharer also does this
    // If filesharing, sharer does not do this since we use leftVideo
    if (sharer && !this.consumerConn && !this.isLocalStreamAFile) {
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      this.consumerConn = pc;
      pc.onicecandidate = (event) => {
        // We generated an ICE candidate, send it to sharer
        if (event.candidate) {
          this.sendSignalSS(sharer.id, { ice: event.candidate });
        }
      };
      pc.ontrack = (event: RTCTrackEvent) => {
        // Mount the stream from sharer
        // console.log(stream);
        const leftVideo = this.HTMLInterface.getVideoEl();
        if (leftVideo) {
          leftVideo.src = "";
          leftVideo.srcObject = event.streams[0];
          this.localPlay();
        }
      };
    }
  };

  startVBrowser = async (options: { size: string }) => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:startVBrowser", { options });
  };

  stopVBrowser = async () => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:stopVBrowser");
  };

  changeController = async (value: string | null) => {
    if (!this.context.features.roomControls) return;
    // console.log(data);
    this.socket.emit("CMD:changeController", value);
  };

  sendSignalSS = async (to: string, data: any, sharer?: boolean) => {
    // console.log('sendSS', to, data);
    this.socket.emit("signalSS", { to, msg: data, sharer });
  };

  usingYoutube = () => {
    return isYouTube(this.state.roomMedia);
  };

  componentDidUpdate() {
    // First YouTube media in this room: render its iframe, then load the API for it.
    if (!this.state.youtubeRequested && this.usingYoutube()) {
      this.setState({ youtubeRequested: true }, this.loadYouTube);
    }
  }

  usingNative = () => {
    // Anything that uses HTML Video (e.g. not YouTube, Vimeo, or other embedded JS player)
    return !this.usingYoutube();
  };

  hasDuration = () => {
    // Youtube, link, or magnet, etc. Has a defined runtime (not WebRTC)
    return isHttp(this.state.roomMedia) || isMagnet(this.state.roomMedia);
  };

  playingScreenShare = () => {
    return isScreenShare(this.state.roomMedia);
  };

  playingFileShare = () => {
    return isFileShare(this.state.roomMedia);
  };

  playingVBrowser = () => {
    return isVBrowser(this.state.roomMedia);
  };

  getVBrowserPass = () => {
    return this.state.roomMedia.replace("vbrowser://", "").split("@")[0];
  };

  getVBrowserHost = () => {
    return this.state.roomMedia.replace("vbrowser://", "").split("@")[1];
  };

  isPauseDisabled = () => {
    return this.playingScreenShare() || this.playingVBrowser();
  };

  // The duration of the media. For a live stream this is the live edge on the same timeline as the current time,
  // which is what hls.js reports as the duration. dash.js leaves it at Infinity, so use the end of the seekable range.
  // The controls and seeking math below depend on it being finite.
  getDuration = () => {
    const duration = this.Player().getDuration();
    if (this.state.isLiveStream && duration === Infinity) {
      const seekable = this.Player().getVideoEl()?.seekable;
      if (seekable?.length) {
        return seekable.end(seekable.length - 1);
      }
    }
    return duration;
  };

  localSeek = (customTime?: number) => {
    // Jump to the leader's position, or a custom one
    let target = customTime ?? this.getLeaderTime();
    // For live this is the offset from the leading edge (negative)
    if (this.state.isLiveStream) {
      target = this.getDuration() + (customTime ?? 0);
    }
    if (target >= 0 && target < Infinity) {
      console.log("syncing self to leader or custom:", target);
      this.Player().seekVideo(target);
    }
  };

  localPlay = async () => {
    if (!this.state.roomMedia) {
      return;
    }
    const canAutoplay = this.state.isAutoPlayable || (await testAutoplay());
    this.setState(
      { roomPaused: false, isAutoPlayable: canAutoplay },
      async () => {
        if (
          !this.state.isAutoPlayable ||
          (this.localStreamToPublish && !this.isLocalStreamAFile)
        ) {
          console.log("auto-muting to allow autoplay or screenshare host");
          this.localSetMute(true);
        } else {
          this.localSetMute(false);
        }
        try {
          await this.Player().playVideo();
        } catch (e: any) {
          console.warn(e, e.name);
          if (e.name === "NotSupportedError" && this.usingNative()) {
            this.setState({ loading: false, nonPlayableMedia: true });
          } else if (e.name === "NotAllowedError") {
            // The browser refused to start playback (iOS Safari refuses sound
            // without a tap, even when the autoplay test passed). Try muted and
            // show the overlay button; if even muted is refused, it says 点击播放.
            console.warn("play refused", { muted: this.Player().isMuted(), autoPlayable: this.state.isAutoPlayable });
            this.setState({ isAutoPlayable: false });
            this.localSetMute(true);
            try {
              await this.Player().playVideo();
              this.setState({ playBlocked: false });
              console.warn("playing muted");
            } catch (e2: any) {
              console.warn("muted playback refused too", e2?.name);
              this.setState({ playBlocked: true });
            }
          }
        }
      },
    );
  };

  localPause = () => {
    this.setState({ roomPaused: true }, async () => {
      this.Player().pauseVideo();
    });
  };

  localSetMute = (muted: boolean) => {
    this.Player().setMute(muted);
    this.refreshControls();
  };

  localSetVolume = (volume: number) => {
    this.Player().setVolume(volume);
    this.refreshControls();
  };

  localSubtitleModal = () => {
    // Native player uses subtitle modal.
    if (this.usingNative()) {
      this.setState({ isSubtitleModalOpen: true });
    }
  };

  roomSetPlaybackRate = (rate: number) => {
    if (!this.context.features.roomControls) return;
    // emit an event to the server
    this.socket.emit("CMD:playbackRate", rate);
  };

  roomSetLoop = (loop: boolean) => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:loop", loop);
  };

  roomTogglePlay = () => {
    if (!this.haveLock()) {
      return;
    }
    if (this.isPauseDisabled()) {
      return;
    }
    const shouldPlay = this.Player().shouldPlay();
    if (shouldPlay) {
      this.socket.emit("CMD:play");
      this.localPlay();
    } else {
      this.socket.emit("CMD:pause");
      this.localPause();
    }
  };

  roomSeek = (time: number) => {
    if (!this.context.features.roomControls) return;
    let target = time;
    target = Math.max(target, 0);
    this.Player().seekVideo(target);
    const toSend = this.getRoomTSToSet(target);
    this.socket.emit("CMD:seek", toSend);
  };

  getRoomTSToSet = (time: number) => {
    let target = time;
    // In live case, can't just send video time because clients may have different durations
    // Take the passed time and compute the offset from the end time (negative)
    // Each client should use this value to compute the time to set when starting playback
    if (this.state.isLiveStream) {
      target = time - this.getDuration();
    }
    // Otherwise just return the time
    return target;
  };

  // Phones: turn the player sideways while fullscreen. Android Chrome allows the
  // lock only in fullscreen; iPhone Safari has no lock (its native fullscreen
  // player follows the device rotation), so failures are ignored.
  lockLandscape = () => {
    if (!isMobile()) return;
    (screen.orientation as any)?.lock?.("landscape")?.catch?.(() => {});
  };

  onFullScreenChange = () => {
    if (!document.fullscreenElement) (screen.orientation as any)?.unlock?.();
    this.setState({ fullScreen: Boolean(document.fullscreenElement) });
    setTimeout(() => this.chatRef.current?.scrollToBottom(), 100);
  };

  onKeydown = (e: any) => {
    if (!document.activeElement || document.activeElement.tagName === "BODY") {
      if (e.key === " ") {
        e.preventDefault();
        this.roomTogglePlay();
      } else if (e.key === "ArrowRight") {
        this.roomSeek(this.Player().getCurrentTime() + 10);
      } else if (e.key === "ArrowLeft") {
        this.roomSeek(this.Player().getCurrentTime() - 10);
      } else if (e.key === "t") {
        this.localFullScreen(false);
      } else if (e.key === "f") {
        this.localFullScreen(true);
      } else if (e.key === "m") {
        this.localToggleMute();
      }
    }
  };

  localFullScreen = async (bVideoOnly: boolean) => {
    // Default: fullscreen the body (theater mode)
    let container = document.body as HTMLElement;
    if (bVideoOnly || isMobile()) {
      if (this.playingVBrowser() && !isMobile()) {
        // vbrowser needs to fullscreen the control wrapper div
        // Can't really control the VBrowser on mobile anyway, so just fullscreen the video
        container = document.getElementById("leftVideoParent") as HTMLElement;
      } else {
        container =
          document.getElementById("watchparty-player") ||
          this.Player().getVideoEl();
        if (!container.requestFullscreen) {
          container = this.Player().getVideoEl();
        }
      }
    }
    if (
      !container.requestFullscreen &&
      //@ts-expect-error iPhone Safari: video elements only have webkitEnterFullscreen
      container.webkitEnterFullscreen
    ) {
      // e.g. iPhone doesn't allow requestFullscreen
      //@ts-expect-error
      container.webkitEnterFullscreen();
      return;
    }
    if (!container?.requestFullscreen) {
      this.setState({
        warningMessage: t("app.fullscreenUnsupported"),
      });
      return;
    }
    if (!document.fullscreenElement) {
      // not currently in fullscreen
      await container.requestFullscreen().then(
        () => this.lockLandscape(),
        () => {
          this.setState({
            warningMessage:
              t("app.fullscreenFailed"),
          });
        },
      );
    } else {
      // e.g. switching from video fullscreen to theater mode
      const bChangeElements = document.fullscreenElement !== container;
      await document.exitFullscreen();
      if (bChangeElements) {
        await container.requestFullscreen();
      }
    }
  };

  localToggleMute = () => {
    this.localSetMute(!this.Player().isMuted());
  };

  roomSetMedia = (value: string) => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:host", value);
  };

  setConvertEnabled = (convertEnabled: boolean) => {
    window.localStorage.setItem(
      "watchparty-convert",
      convertEnabled ? "1" : "0",
    );
    this.setState({ convertEnabled });
    window.location.reload();
  };

  roomPlaylistPlay = (index: number) => {
    if (!this.context.features.roomControls) return;
    this.roomSetMedia(this.state.playlist[index]?.url);
    this.roomPlaylistDelete(index);
  };

  roomPlaylistAdd = (value: string) => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:playlistAdd", value);
  };

  roomPlaylistMove = (index: number, toIndex: number) => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:playlistMove", { index, toIndex });
  };

  roomPlaylistDelete = (index: number) => {
    if (!this.context.features.roomControls) return;
    this.socket.emit("CMD:playlistDelete", index);
  };

  updateName = (name: string) => {
    this.setState({ myName: name });
    this.socket.emit("CMD:name", name);
    window.localStorage.setItem("watchparty-username", name);
  };

  updatePicture = (url: string) => {
    this.setState({ myPicture: url });
    this.socket.emit("CMD:picture", url);
  };

  updateUid = async (user: FirebaseUser) => {
    const uid = user.uid;
    const token = await user.getIdToken();
    this.socket.emit("CMD:uid", { uid, token });
  };

  getMediaDisplayName = (input?: string) => {
    if (!input) {
      return "";
    }
    // Show the whole URL for youtube
    if (this.usingYoutube()) {
      return input;
    }
    if (input.startsWith("screenshare://")) {
      const sharer = this.state.participants.find((user) => user.isScreenShare);
      return this.state.nameMap[sharer?.id ?? ""] + "'s screen";
    }
    if (input.startsWith("fileshare://")) {
      const sharer = this.state.participants.find((user) => user.isScreenShare);
      return this.state.nameMap[sharer?.id ?? ""] + "'s file";
    }
    if (input.startsWith("vbrowser://")) {
      return t("app.virtualBrowser") + (this.state.isVBrowserLarge ? "+" : "");
    }
    if (isMagnet(input)) {
      const magnetParsed = new URLSearchParams(input);
      const index = magnetParsed.get("fileIndex");
      return magnetParsed.get("dn") + (index != null ? ` (file ${index})` : "");
    }
    if (input.includes("/stream?torrent=magnet")) {
      const search = new URL(input).search;
      const searchParsed = new URLSearchParams(search);
      const magnetUrl = searchParsed.get("torrent") ?? "";
      const magnetParsed = new URLSearchParams(magnetUrl);
      const index = searchParsed.get("fileIndex");
      return (
        (magnetParsed.get("dn") ?? searchParsed.get("dn")) +
        (index != null ? ` (file ${index})` : "")
      );
    }
    if (input.includes("/proxy")) {
      const urlParsed = new URLSearchParams(input);
      const displayName = urlParsed.get("displayName");
      if (displayName) {
        return displayName;
      }
    }
    return input;
  };

  setLoadingFalse = () => {
    this.bufferSample = undefined;
    this.setState({ loading: false, bufferInfo: undefined });
  };

  // Initial buffering readout (qfile shows): bytes since the media started loading.
  private bufferSample:
    | { firstByteAt: number; bytes: number; lastLoaded: number; shownAt: number }
    | undefined;
  onSegmentProgress = (loaded: number, total: number) => {
    if (!this.state.loading) return;
    const now = performance.now();
    const sample =
      this.bufferSample ??
      (this.bufferSample = { firstByteAt: now, bytes: 0, lastLoaded: 0, shownAt: 0 });
    // `loaded` restarts at 0 for each new segment
    sample.bytes += loaded >= sample.lastLoaded ? loaded - sample.lastLoaded : loaded;
    sample.lastLoaded = loaded;
    if (now - sample.shownAt < 250 && loaded !== total) return;
    sample.shownAt = now;
    const seconds = (now - sample.firstByteAt) / 1000;
    this.setState({
      bufferInfo: {
        percent: total ? Math.min(100, Math.floor((loaded / total) * 100)) : undefined,
        speed: seconds > 0.2 ? Math.round(sample.bytes / seconds) : undefined,
      },
    });
  };

  getLeaderTime = () => {
    if (this.state.participants.length > 2) {
      return calculateMedian(Object.values(this.state.tsMap));
    }
    return Math.max(...Object.values(this.state.tsMap));
  };

  onVideoEnded = (url: string) => {
    this.localPause();
    // check if looping is on, if so set time back to 0 and restart
    if (this.state.roomLoop) {
      this.localSeek(0);
      this.localPlay();
      return;
    }
    if (!this.context.features.roomControls) return;
    if (this.state.playlist.length) {
      // Pass the url of the video at the time this video was started
      this.socket.emit("CMD:playlistNext", url);
      return;
    }
    // Play next fileIndex
    const re = /&fileIndex=(\d+)$/;
    const match = re.exec(this.state.roomMedia);
    if (match) {
      const fileIndex = match[1];
      const nextNum = Number(fileIndex) + 1;
      const nextUrl = this.state.roomMedia.replace(
        /&fileIndex=(\d+)$/,
        `&fileIndex=${nextNum}`,
      );
      this.roomSetMedia(nextUrl);
    }
  };

  refreshControls = () => {
    this.setState({ controlsTimestamp: Date.now() });
  };

  setSettingsModalOpen = (settingsModalOpen: boolean) => {
    this.setState({ settingsModalOpen });
  };

  getMediaCaption = () => {
    if (this.usingYoutube()) return t("app.youtubeVideo");
    const name = this.getMediaDisplayName(this.state.roomMedia);
    if (/^https?:\/\//i.test(name)) {
      try {
        const url = new URL(name);
        return decodeURIComponent(
          url.pathname.split("/").filter(Boolean).pop() || url.hostname,
        );
      } catch {
        return t("app.sharedVideo");
      }
    }
    return name;
  };

  openWatchOptions = () => {
    if (!this.context.features.roomControls) return;
    this.setState({ showTools: true }, () => {
      document
        .getElementById("room-source-tools")
        ?.scrollIntoView({ block: "center" });
    });
  };

  render() {
    const roomControls = this.context.features.roomControls;
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    const playlist = this.state.playlist;
    const controls = (
      <Controls
        roomControls={roomControls}
        video={this.state.roomMedia}
        paused={this.state.roomPaused}
        roomPlaybackRate={this.state.roomPlaybackRate}
        isLiveStream={this.state.isLiveStream}
        muted={this.Player().isMuted()}
        volume={this.Player().getVolume()}
        subtitled={this.Player().isSubtitled()}
        currentTime={this.Player().getCurrentTime()}
        duration={this.getDuration()}
        disabled={!this.haveLock()}
        leaderTime={this.hasDuration() ? this.getLeaderTime() : undefined}
        isPauseDisabled={this.isPauseDisabled()}
        playbackRate={this.Player().getPlaybackRate()}
        isYouTube={this.usingYoutube()}
        timeRanges={this.Player().getTimeRanges()}
        loop={this.state.roomLoop}
        roomSetLoop={this.roomSetLoop}
        roomTogglePlay={this.roomTogglePlay}
        roomSeek={this.roomSeek}
        roomSetPlaybackRate={this.roomSetPlaybackRate}
        localFullScreen={this.localFullScreen}
        localToggleMute={this.localToggleMute}
        localSubtitleModal={this.localSubtitleModal}
        localSetVolume={this.localSetVolume}
        localSeek={this.localSeek}
        localSetSubtitleMode={this.Player().setSubtitleMode}
        roomPlaylistPlay={this.roomPlaylistPlay}
        playlist={this.state.playlist}
        commentsEnabled={this.state.commentsEnabled}
        onToggleComments={() =>
          this.setState({ commentsEnabled: !this.state.commentsEnabled })
        }
        audioTracks={this.state.audioTracks}
        audioTrackId={this.state.audioTrackId}
        localSetAudioTrack={this.localSetAudioTrack}
      />
    );
    return (
      <React.Fragment>
        {roomControls && this.state.isMultiSelectModalOpen && (
          <MultiStreamModal
            streams={this.state.fileSelection}
            setMedia={this.roomSetMedia}
            resetMultiSelect={this.resetMultiSelect}
          />
        )}
        {roomControls && this.state.isVBrowserModalOpen && (
          <VBrowserModal
            closeModal={() => this.setState({ isVBrowserModalOpen: false })}
            startVBrowser={this.startVBrowser}
          />
        )}
        {roomControls && this.state.isScreenShareModalOpen && (
          <ScreenShareModal
            closeModal={() => this.setState({ isScreenShareModalOpen: false })}
            startScreenShare={this.startScreenShare}
          />
        )}
        {roomControls && this.state.isFileShareModalOpen && (
          <FileShareModal
            closeModal={() => this.setState({ isFileShareModalOpen: false })}
            startFileShare={this.startFileShare}
          />
        )}
        {roomControls && this.state.isSubtitleModalOpen && (
          <SubtitleModal
            closeModal={() => this.setState({ isSubtitleModalOpen: false })}
            socket={this.socket}
            roomSubtitle={this.state.roomSubtitle}
            roomMedia={this.state.roomMedia}
            haveLock={this.haveLock}
            getMediaDisplayName={this.getMediaDisplayName}
            setSubtitleMode={this.Player().setSubtitleMode}
            getSubtitleMode={this.Player().getSubtitleMode}
          />
        )}
        {this.state.state === "starting" && (
          <Overlay className={styles.flexCenter}>
            <Title order={2}>{t("app.loading")}</Title>
          </Overlay>
        )}
        {this.state.overlayMsg && (
          <ErrorModal
            error={this.state.overlayMsg}
            code={this.state.overlayCode || undefined}
            onRetry={this.state.overlayCode ? this.retryConnect : undefined}
          />
        )}
        {this.state.isErrorAuth && <PasswordModal roomId={this.state.roomId} />}
        <SettingsModal
          modalOpen={this.state.settingsModalOpen}
          setModalOpen={this.setSettingsModalOpen}
          roomLock={this.state.roomLock}
          setRoomLock={this.setRoomLock}
          socket={this.socket}
          roomId={this.state.roomId}
          isChatDisabled={this.state.isChatDisabled}
          setIsChatDisabled={this.setIsChatDisabled}
          owner={this.state.owner}
          setOwner={this.setOwner}
          vanity={this.state.vanity}
          setVanity={this.setVanity}
          inviteLink={this.state.inviteLink}
          password={this.state.password}
          setPassword={this.setPassword}
          clearChat={this.clearChat}
          roomTitle={this.state.roomTitle}
          setRoomTitle={this.setRoomTitle}
          roomDescription={this.state.roomDescription}
          setRoomDescription={this.setRoomDescription}
          roomTitleColor={this.state.roomTitleColor}
          setRoomTitleColor={this.setRoomTitleColor}
          mediaPath={this.state.mediaPath}
          setMediaPath={this.setMediaPath}
        />
        {this.state.errorMessage && (
          <Alert
            title={t("app.alertError")}
            color="red"
            style={{
              position: "fixed",
              bottom: "10px",
              right: "10px",
              zIndex: 1000,
            }}
          >
            {this.state.errorMessage}
          </Alert>
        )}
        {this.state.successMessage && (
          <Alert
            title={t("app.alertSuccess")}
            color="green"
            style={{
              position: "fixed",
              bottom: "10px",
              right: "10px",
              zIndex: 1000,
            }}
          >
            {this.state.successMessage}
          </Alert>
        )}
        {this.state.warningMessage && (
          <Alert
            color="yellow"
            // header={this.state.warningMessage}
            style={{
              position: "fixed",
              top: "10px",
              left: "50%",
              transform: "translate(-50%, 0)",
              zIndex: 1000,
            }}
          >
            {this.state.warningMessage}
          </Alert>
        )}
        {SHOW_TOP_BAR && !this.state.fullScreen && <TopBar inRoom />}
        <main
          className={`${styles.roomMain} ${this.state.fullScreen ? styles.fullscreenRoom : ""}`}
        >
          {SHOW_ROOM_HEADING && <header className={styles.roomHeading}>
            <a className={styles.backLink} href="/" aria-label={t("app.backToRooms")}>
              <IconChevronLeft size={18} />
              <span>{t("home.filter.all")}</span>
            </a>
            <span className={styles.roomSymbol}>
              <IconMovie size={23} stroke={1.4} />
            </span>
            <div className={styles.roomTitle}>
              <h1 style={{ color: this.state.roomTitleColor || undefined }}>
                {this.state.roomTitle || this.state.vanity || t("app.watchRoom")}
              </h1>
              <p>
                <span className={styles.statusDot} />
                {this.state.warningMessage
                  ? t("app.reconnectingShort")
                  : this.state.state === "connected"
                    ? this.state.participants.length === 1
                      ? t("app.peopleInRoom.one", { count: this.state.participants.length })
                      : t("app.peopleInRoom.other", { count: this.state.participants.length })
                    : t("app.connecting")}
                {this.state.roomDescription &&
                  ` · ${this.state.roomDescription}`}
              </p>
            </div>
            <div className={styles.roomActions}>
              {roomControls && <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<IconPlus size={16} />}
                onClick={this.openWatchOptions}
                aria-expanded={this.state.showTools || !this.state.roomMedia}
                aria-controls="room-source-tools"
              >
                {t("app.watchOptions")}
              </Button>}
              <ActionIcon
                className={styles.collapseChat}
                variant="subtle"
                aria-label={
                  this.state.showChatColumn
                    ? t("app.hideChatPanel")
                    : t("app.showChatPanel")
                }
                aria-expanded={this.state.showChatColumn}
                onClick={() =>
                  this.setState({ showChatColumn: !this.state.showChatColumn })
                }
              >
                <IconMessage size={20} />
              </ActionIcon>
              <InviteButton />
            </div>
          </header>}
          <div
            className={`${styles.roomLayout} ${!this.state.showChatColumn ? styles.chatCollapsed : ""}`}
          >
            <section className={styles.theater} aria-label={t("app.watchTogether")}>
              <div id="watchparty-player" className={styles.playerFrame}>
                <div
                  className={styles.playerContainer}
                  data-testid="video-surface"
                >
                  {!this.state.isAutoPlayable && this.state.roomMedia && (
                    <Overlay className={styles.flexCenter}>
                      <Button
                        onClick={() => {
                          // Unmute and start inside the tap itself: iOS only allows
                          // sound and playback that a user gesture starts.
                          this.localSetMute(false);
                          this.localSetVolume(1);
                          this.Player()
                            .playVideo()
                            ?.catch?.((e: any) => console.warn("tap play refused", e?.name));
                          this.setState({ isAutoPlayable: true, playBlocked: false });
                        }}
                        leftSection={<IconVolume />}
                        size="xl"
                      >
                        {this.state.playBlocked ? t("controls.tapToPlay") : t("controls.unmute")}
                      </Button>
                    </Overlay>
                  )}
                  {(this.state.loading ||
                    !this.state.roomMedia ||
                    this.state.nonPlayableMedia) &&
                    !this.state.isLiveStream && (
                      <div
                        id="loader"
                        className={`${styles.videoContent} ${styles.flexCenter}`}
                      >
                        {this.state.loading && (
                          <div
                            className={styles.flexCenter}
                            style={{
                              flexDirection: "column",
                            }}
                          >
                            <Loader />
                            <div>
                              {this.playingVBrowser()
                                ? t("app.launchingVBrowser")
                                : ""}
                            </div>
                            {this.state.bufferInfo && (
                              <div
                                className={styles.bufferInfo}
                                aria-live="polite"
                              >
                                {[
                                  this.state.bufferInfo.percent !== undefined &&
                                    t("app.bufferingPercent", {
                                      percent: this.state.bufferInfo.percent,
                                    }),
                                  this.state.bufferInfo.speed !== undefined &&
                                    formatSpeed(this.state.bufferInfo.speed),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </div>
                        )}
                        {!this.state.loading && !this.state.roomMedia && (
                          <div className={styles.emptyPlayer}>
                            <IconMovie size={38} stroke={1.2} />
                            <h2>{t("app.emptyPlayerTitle")}</h2>
                            <p>
                              {roomControls ? t("app.emptyPlayerBody") : t("app.emptyPlayerWaiting")}
                            </p>
                            {roomControls && <Button
                              onClick={this.openWatchOptions}
                              leftSection={<IconPlus size={16} />}
                            >
                              {t("app.chooseSomething")}
                            </Button>}
                          </div>
                        )}
                        {!this.state.loading && this.state.nonPlayableMedia && (
                          <Alert
                            color="red"
                            title={t("app.notMediaTitle")}
                          >
                            {t("app.notMediaBody")}
                          </Alert>
                        )}
                      </div>
                    )}
                  {this.state.youtubeRequested && (
                    <iframe
                      style={{
                        display:
                          this.usingYoutube() && !this.state.loading
                            ? "block"
                            : "none",
                      }}
                      title={t("app.youtubeFrameTitle")}
                      id="leftYt"
                      className={styles.videoContent}
                      allowFullScreen
                      frameBorder="0"
                      allow="autoplay; encrypted-media"
                      src="https://www.youtube.com/embed/?enablejsapi=1&controls=0&rel=0"
                    />
                  )}
                  {this.playingVBrowser() &&
                  this.getVBrowserPass() &&
                  this.getVBrowserHost() ? (
                    <VBrowser
                      username={clientId}
                      password={this.getVBrowserPass()}
                      hostname={this.getVBrowserHost()}
                      controlling={roomControls && this.state.controller === clientId}
                      resolution={this.state.vBrowserResolution}
                      quality={this.state.vBrowserQuality}
                      doPlay={this.localPlay}
                      setResolution={(data: string) =>
                        this.setState({ vBrowserResolution: data })
                      }
                      setQuality={(data: string) => {
                        this.setState({ vBrowserQuality: data });
                      }}
                      isMobile={isMobile()}
                    />
                  ) : (
                    <video
                      style={{
                        display:
                          this.usingNative() && !this.state.loading
                            ? "block"
                            : "none",
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                      id="leftVideo"
                      onEnded={(e) => this.onVideoEnded(e.currentTarget.src)}
                      playsInline
                      onClick={this.roomTogglePlay}
                    ></video>
                  )}
                  <div
                    style={{
                      color: softWhite,
                      fontWeight: 400,
                      fontSize: 10,
                      lineHeight: "8px",
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      zIndex: 1,
                    }}
                  >
                    {[
                      Boolean(this.state.total) &&
                        t("app.downloadedPct", {
                          percent: Math.min(
                            (this.state.downloaded / this.state.total) * 100,
                            100,
                          ).toFixed(2),
                        }),
                      Boolean(this.state.total) &&
                        formatSpeed(this.state.speed),
                      Boolean(this.state.total) &&
                        t("app.connectionsCount", { count: this.state.connections }),
                      this.state.convertProgress !== undefined &&
                        t("app.convertedPct", { percent: (this.state.convertProgress * 100).toFixed(1) }),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </div>
                  <ChatOverlay
                    key={this.state.liveChatVersion}
                    messages={this.state.liveChat}
                    nameMap={this.state.nameMap}
                    enabled={
                      this.state.commentsEnabled && !this.state.isChatDisabled
                    }
                  />
                </div>

                {this.state.roomMedia && (
                  <div className={styles.playerControls}>{controls}</div>
                )}
              </div>
              {!this.state.fullScreen && <React.Suspense fallback={null}>
                <Audience3D socket={this.socket} participants={this.state.participants} nameMap={this.state.nameMap} clientId={clientId} isChatDisabled={this.state.isChatDisabled} />
              </React.Suspense>}
              {SHOW_VIDEO_CAPTION && <div className={styles.videoCaption}>
                <div>
                  <span className={styles.eyebrow}>
                    {this.state.roomMedia
                      ? t("app.nowPlaying")
                      : t("app.makeYourselfAtHome")}
                  </span>
                  <h2>
                    {this.state.roomMedia
                      ? this.getMediaCaption()
                      : t("home.tagline")}
                  </h2>
                  <p>
                    {this.state.roomMedia
                      ? t("app.playbackShared")
                      : t("app.bringPeople")}
                  </p>
                </div>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  aria-label={
                    this.state.commentsEnabled
                      ? t("app.hideComments")
                      : t("app.showComments")
                  }
                  title={
                    this.state.commentsEnabled
                      ? t("app.hideComments")
                      : t("app.showComments")
                  }
                  aria-pressed={this.state.commentsEnabled}
                  onClick={() =>
                    this.setState({
                      commentsEnabled: !this.state.commentsEnabled,
                    })
                  }
                >
                  {this.state.commentsEnabled ? (
                    <IconMessage size={21} />
                  ) : (
                    <IconMessageOff size={21} />
                  )}
                </ActionIcon>
              </div>}
              {roomControls && <section
                id="room-source-tools"
                className={styles.sourceTools}
                hidden={!this.state.showTools && Boolean(this.state.roomMedia)}
              >
                <div className={styles.sectionHeading}>
                  <h2>{t("app.whatWatching")}</h2>
                  {this.state.roomMedia && (
                    <ActionIcon
                      variant="subtle"
                      aria-label={t("app.closeWatchOptions")}
                      onClick={() => this.setState({ showTools: false })}
                    >
                      <IconX size={18} />
                    </ActionIcon>
                  )}
                </div>
                <React.Fragment>
                  <div className={styles.sourceRow}>
                    <ComboBox
                      roomSetMedia={this.roomSetMedia}
                      playlistAdd={this.roomPlaylistAdd}
                      roomMedia={this.state.roomMedia}
                      getMediaDisplayName={this.getMediaDisplayName}
                      mediaPath={this.state.mediaPath}
                      disabled={!this.haveLock()}
                    />
                  </div>
                  <div className={styles.sourceRow}>
                    {this.localStreamToPublish && (
                      <Button
                        color="red"
                        onClick={this.stopPublishingLocalStream}
                        leftSection={<IconX />}
                      >
                        {t("app.stopShare")}
                      </Button>
                    )}
                    {!this.localStreamToPublish &&
                      !sharer &&
                      !this.playingVBrowser() && (
                        <Button
                          className={styles.shareButton}
                          color="blue"
                          disabled={!this.haveLock()}
                          onClick={() => {
                            this.setState({
                              isScreenShareModalOpen: true,
                            });
                          }}
                          leftSection={<IconScreenShare />}
                        >
                          {t("app.screenshare")}
                        </Button>
                      )}
                    {!this.localStreamToPublish &&
                      !sharer &&
                      !this.playingVBrowser() && (
                        <Button
                          className={styles.shareButton}
                          disabled={!this.haveLock()}
                          color="green"
                          onClick={() => {
                            this.setState({
                              isVBrowserModalOpen: true,
                            });
                          }}
                          leftSection={<IconBrowser />}
                        >
                          VBrowser
                        </Button>
                      )}
                    {this.playingVBrowser() && (
                      <>
                        <Button
                          color="red"
                          disabled={!this.haveLock()}
                          onClick={this.stopVBrowser}
                          leftSection={<IconX />}
                        >
                          {t("app.stopVBrowser")}
                        </Button>
                        <Select
                          leftSection={<IconKeyboardFilled />}
                          value={this.state.controller}
                          placeholder={t("app.noController")}
                          clearable
                          onChange={this.changeController}
                          disabled={!this.haveLock()}
                          data={this.state.participants.map((p) => ({
                            label: this.state.nameMap[p.id] || p.id,
                            value: p.id,
                          }))}
                        ></Select>
                        <Select
                          leftSection={<IconUserScreen />}
                          disabled={!this.haveLock()}
                          value={this.state.vBrowserResolution}
                          onChange={(value) =>
                            this.setState({
                              vBrowserResolution: value!,
                            })
                          }
                          data={[
                            {
                              label: t("app.res1080"),
                              value: "1920x1080@30",
                              disabled: !this.state.isVBrowserLarge,
                            },
                            {
                              label: "720p",
                              value: "1280x720@30",
                            },
                            {
                              label: "576p",
                              value: "1024x576@60",
                            },
                            {
                              label: "486p",
                              value: "864x486@60",
                            },
                            {
                              label: "360p",
                              value: "640x360@60",
                            },
                          ]}
                        ></Select>
                        <Select
                          leftSection={<IconAntennaBars5 />}
                          disabled={!this.haveLock()}
                          value={this.state.vBrowserQuality}
                          onChange={(value) => {
                            this.setState({
                              vBrowserQuality: value!,
                            });
                          }}
                          data={[
                            {
                              label: t("app.qualityEco"),
                              value: "0.25",
                            },
                            {
                              label: t("app.qualityLow"),
                              value: "0.5",
                            },
                            {
                              label: t("app.qualityStandard"),
                              value: "1",
                            },
                            {
                              label: t("app.qualityHigh"),
                              value: "1.5",
                            },
                            {
                              label: t("app.qualityUltra"),
                              value: "2",
                            },
                          ]}
                        ></Select>
                      </>
                    )}
                    {!this.localStreamToPublish &&
                      !sharer &&
                      !this.playingVBrowser() && (
                        <Button
                          className={styles.shareButton}
                          color="violet"
                          disabled={!this.haveLock()}
                          onClick={() => {
                            this.setState({
                              isFileShareModalOpen: true,
                            });
                          }}
                          leftSection={<IconFile />}
                        >
                          {t("app.file")}
                        </Button>
                      )}
                    {false && (
                      <SearchComponent
                        setMedia={this.roomSetMedia}
                        playlistAdd={this.roomPlaylistAdd}
                        type={"youtube"}
                        setShowMultiSelect={this.setMultiSelectModal}
                        setFileSelection={this.setFileSelection}
                        disabled={!this.haveLock()}
                      />
                    )}
                    {Boolean(this.context.streamPath) && (
                      <SearchComponent
                        setMedia={this.roomSetMedia}
                        playlistAdd={this.roomPlaylistAdd}
                        type={"stream"}
                        setShowMultiSelect={this.setMultiSelectModal}
                        setFileSelection={this.setFileSelection}
                        disabled={!this.haveLock()}
                      />
                    )}
                    <Menu>
                      <Menu.Target>
                        <Button
                          color="grey"
                          leftSection={<IconList />}
                          rightSection={<Badge circle>{playlist.length}</Badge>}
                          className={styles.shareButton}
                        >
                          {t("app.playlist")}
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown
                        style={{
                          overflowY: playlist.length > 0 ? "scroll" : undefined,
                          maxHeight: 400,
                          maxWidth: isMobile() ? 400 : 600,
                        }}
                      >
                        {playlist.length === 0 && (
                          <Menu.Item disabled>
                            {t("app.playlistEmpty")}
                          </Menu.Item>
                        )}
                        {playlist.map((item: PlaylistVideo, index: number) => {
                          if (Boolean(item.img)) {
                            item.type = "youtube";
                          }
                          return (
                            <Menu.Item key={index}>
                              <ChatVideoCard
                                video={item}
                                index={index}
                                controls
                                onPlay={this.roomPlaylistPlay}
                                onPlayNext={(index) => {
                                  this.roomPlaylistMove(index, 0);
                                }}
                                onRemove={(index) => {
                                  this.roomPlaylistDelete(index);
                                }}
                                disabled={!this.haveLock()}
                              />
                            </Menu.Item>
                          );
                        })}
                      </Menu.Dropdown>
                    </Menu>
                    {isClientTranscodeSupported() && (
                      <Tooltip
                        multiline
                        w={280}
                        refProp="rootRef"
                        label={t("app.convertTooltip")}
                      >
                        <Switch
                          label={t("app.convert")}
                          checked={this.state.convertEnabled}
                          onChange={(e) =>
                            this.setConvertEnabled(e.currentTarget.checked)
                          }
                          style={{ flexShrink: 0, alignSelf: "center" }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </React.Fragment>
              </section>}
              {roomControls && <section className={styles.queuePanel} aria-label={t("app.watchQueue")}>
                <div className={styles.sectionHeading}>
                  <h2>{t("app.comingUp")}</h2>
                  <span>{t("app.queuedCount", { count: playlist.length })}</span>
                </div>
                {playlist.length ? (
                  playlist.slice(0, 3).map((item, index) => (
                    <ChatVideoCard
                      key={`${item.url}-${index}`}
                      video={{
                        ...item,
                        type: item.img ? "youtube" : item.type,
                      }}
                      index={index}
                      controls
                      onPlay={this.roomPlaylistPlay}
                      onPlayNext={(index) => this.roomPlaylistMove(index, 0)}
                      onRemove={this.roomPlaylistDelete}
                      disabled={!this.haveLock()}
                    />
                  ))
                ) : (
                  <p>{t("app.addFromOptions")}</p>
                )}
                {playlist.length > 3 && (
                  <Button variant="subtle" onClick={this.openWatchOptions}>
                    {t("app.viewFullPlaylist")}
                  </Button>
                )}
              </section>}
            </section>
            <aside
              className={styles.rightColumn}
              aria-label={t("app.roomConversation")}
            >
              <div className={styles.conversationHeading}>
                <h2>{t("home.betterTogether")}</h2>
                <span>{this.state.participants.length}</span>
              </div>
              <p className={styles.conversationNote}>
                {t("app.scrollNote")}
              </p>
              <div className={styles.identityRow}>
                <TextInput
                  aria-label={t("app.displayName")}
                  style={{
                    flexGrow: 1,
                  }}
                  value={this.state.myName}
                  onChange={(e) => {
                    this.updateName(e.target.value);
                  }}
                  onFocus={(e) => e.target.select()}
                  leftSection={<IconUser />}
                  rightSectionWidth={70}
                  rightSection={
                    <Button
                      size="compact-xs"
                      onClick={async () =>
                        this.updateName(await generateName())
                      }
                    >
                      {t("app.random")}
                    </Button>
                  }
                />
                <InviteButton />
              </div>
              <div className={styles.sidebarActions}>
                <Button
                  color="grey"
                  onClick={() =>
                    SHOW_PEOPLE_PANEL &&
                    this.setState({
                      showPeopleColumn: !this.state.showPeopleColumn,
                    })
                  }
                  fullWidth
                  leftSection={<IconUsersGroup />}
                  rightSection={
                    <Badge circle>{this.state.participants.length}</Badge>
                  }
                >
                  {t("app.people")}
                </Button>
                <Button
                  color="grey"
                  title={t("app.settings")}
                  fullWidth
                  onClick={() => {
                    this.setSettingsModalOpen(true);
                  }}
                  leftSection={<IconSettings />}
                >
                  {t("app.settings")}
                </Button>
              </div>
              {SHOW_PEOPLE_PANEL && this.state.state === "connected" && (
                <div
                  className={`${styles.peoplePanel} ${this.state.showPeopleColumn ? styles.peopleOpen : ""}`}
                >
                  <VideoChat
                    socket={this.socket}
                    participants={this.state.participants}
                    nameMap={this.state.nameMap}
                    pictureMap={this.state.pictureMap}
                    tsMap={this.state.tsMap}
                    rosterUpdateTS={this.state.rosterUpdateTS}
                    owner={this.state.owner}
                    getLeaderTime={this.getLeaderTime}
                  />
                </div>
              )}
              <Chat
                chat={this.state.chat}
                joinNotice={this.state.joinNotice}
                nameMap={this.state.nameMap}
                pictureMap={this.state.pictureMap}
                socket={this.socket}
                scrollTimestamp={this.state.scrollTimestamp}
                getMediaDisplayName={this.getMediaDisplayName}
                isChatDisabled={this.state.isChatDisabled}
                owner={this.state.owner}
                ref={this.chatRef}
                className={styles.roomChat}
              />
            </aside>
          </div>
        </main>
      </React.Fragment>
    );
  }
}
