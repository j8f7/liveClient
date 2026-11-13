import React, { useCallback, useContext, useRef, useState } from "react";
import { serverPath, getUserImage, softWhite } from "../../utils/utils";
import { ActionIcon, Avatar, Button, Menu, Text } from "@mantine/core";
import type firebase from "firebase/compat/app";
import { LoginModal } from "../Modal/LoginModal";
import { SubscribeButton } from "../SubscribeButton/SubscribeButton";
import { ProfileModal } from "../Modal/ProfileModal";
import Announce from "../Announce/Announce";
import { InviteButton } from "../InviteButton/InviteButton";
import appStyles from "../App/App.module.css";
import { MetadataContext } from "../../MetadataContext";
import config from "../../config";
import {
  IconBrandDiscord,
  IconBrandFacebookFilled,
  IconBrandGithub,
  IconBrandGoogleFilled,
  IconCirclePlusFilled,
  IconDatabase,
  IconLogin,
  IconMailFilled,
  IconTrash,
  IconPlayerPlayFilled,
  IconDots,
} from "@tabler/icons-react";
import styles from "./TopBar.module.css";
import { t, getLang, saveLang, LANG_OPTIONS } from "../../i18n";

export async function createRoom(
  user: firebase.User | undefined,
  openNewTab: boolean | undefined,
  video: string = "",
) {
  const flagsResponse = await fetch(serverPath + "/features");
  if (!flagsResponse.ok || (await flagsResponse.json())?.roomCreation !== true) {
    throw new Error(t("room.createDisabled"));
  }
  const uid = user?.uid;
  const token = await user?.getIdToken();
  const response = await fetch(serverPath + "/createRoom", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uid,
      token,
      video,
    }),
  });
  if (!response.ok) {
    throw new Error(t("room.createRetry"));
  }
  const data = await response.json();
  const { name } = data;
  if (typeof name !== "string" || !/^\/[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(t("room.invalidServer"));
  }
  if (openNewTab) {
    window.open("/watch" + name);
  } else {
    window.location.assign("/watch" + name);
  }
}

export const NewRoomButton = (props: {
  size?: string;
  openNewTab?: boolean;
}) => {
  const context = useContext(MetadataContext);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const onClick = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    setError("");
    try {
      await createRoom(context.user, props.openNewTab);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t("room.createFailed"),
      );
    } finally {
      pending.current = false;
      setCreating(false);
    }
  }, [context.user, props.openNewTab]);
  if (!context.features.roomCreation) return null;
  return (
    <div className={styles.createAction}>
      <Button
        size={props.size}
        onClick={onClick}
        loading={creating}
        leftSection={<IconCirclePlusFilled size={18} />}
      >
        {t("room.create")}
      </Button>
      {error && (
        <span className={styles.createError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

type SignInButtonProps = {};

export class SignInButton extends React.Component<SignInButtonProps> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  public state = { isLoginOpen: false, isProfileOpen: false, userImage: null };

  async componentDidUpdate(prevProps: SignInButtonProps) {
    if (this.context.user && !this.state.userImage) {
      this.setState({ userImage: await getUserImage(this.context.user) });
    }
  }

  render() {
    if (this.context.user) {
      return (
        <div
          style={{
            margin: "4px",
            minWidth: "40px",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Avatar
            src={this.state.userImage}
            onClick={() => this.setState({ isProfileOpen: true })}
          />
          {this.state.isProfileOpen && this.context.user && (
            <ProfileModal
              userImage={this.state.userImage}
              close={() => this.setState({ isProfileOpen: false })}
            />
          )}
        </div>
      );
    }
    return (
      <React.Fragment>
        {this.state.isLoginOpen && (
          <LoginModal
            closeModal={() => this.setState({ isLoginOpen: false })}
          />
        )}
        <Button
          leftSection={<IconLogin />}
          onClick={() => this.setState({ isLoginOpen: true })}
        >
          {t("auth.signIn")}
        </Button>
      </React.Fragment>
    );
  }
}

export class ListRoomsButton extends React.Component<{}> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  public state = { rooms: [] as PersistentRoom[] };

  componentDidMount() {
    this.refreshRooms();
  }

  refreshRooms = async () => {
    if (this.context.user) {
      const token = await this.context.user.getIdToken();
      const response = await fetch(
        serverPath + `/listRooms?uid=${this.context.user?.uid}&token=${token}`,
      );
      this.setState({ rooms: await response.json() });
    }
  };

  deleteRoom = async (roomId: string) => {
    if (!this.context.features.roomControls) return;
    if (this.context.user) {
      const token = await this.context.user.getIdToken();
      await fetch(
        serverPath +
          `/deleteRoom?uid=${this.context.user?.uid}&token=${token}&roomId=${roomId}`,
        { method: "DELETE" },
      );
      this.setState({
        rooms: this.state.rooms.filter((room) => room.roomId !== roomId),
      });
      this.refreshRooms();
    }
  };

  render() {
    return (
      <Menu>
        <Menu.Target>
          <Button
            color="grey"
            onClick={this.refreshRooms}
            leftSection={<IconDatabase />}
          >
            {t("room.myRooms")}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {this.state.rooms.length === 0 && (
            <Menu.Item disabled>{t("room.noPermanent")}</Menu.Item>
          )}
          {this.state.rooms.map((room: any) => {
            return (
              <Menu.Item
                key={room.roomId}
                component="a"
                href={
                  room.vanity ? "/r/" + room.vanity : "/watch" + room.roomId
                }
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div>
                    <Text>
                      {room.vanity
                        ? `/r/${room.vanity}`
                        : `/watch${room.roomId}`}
                    </Text>
                    <Text size="xs" c="grey">
                      {room.roomId}
                    </Text>
                  </div>
                  {this.context.features.roomControls && <div style={{ marginLeft: "auto", paddingLeft: "20px" }}>
                    <ActionIcon
                      aria-label={t("room.deleteLabel")}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        e.preventDefault();
                        this.deleteRoom(room.roomId);
                      }}
                      color="red"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </div>}
                </div>
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    );
  }
}

export const TopBar = (props: {
  hideNewRoom?: boolean;
  hideSignin?: boolean;
  hideMyRooms?: boolean;
  roomTitle?: string;
  roomDescription?: string;
  roomTitleColor?: string;
  inRoom?: boolean;
}) => {
  const context = useContext(MetadataContext);
  return (
    <header className={`${styles.topbar} ${props.inRoom ? styles.inRoom : ""}`}>
      <a href="/" className={styles.brand} aria-label={t("brand.home")}>
        <span className={styles.brandMark}>
          <IconPlayerPlayFilled size={19} />
        </span>
        <span>
          watch<span className={styles.brandLight}>party</span>
          <i>.</i>
        </span>
      </a>
      <nav className={styles.navigation} aria-label={t("nav.main")}>
        <a
          href="/#rooms"
          aria-current={
            !props.inRoom && window.location.pathname === "/"
              ? "page"
              : undefined
          }
        >
          {t("nav.rooms")}
        </a>
        <a href="/faq">{t("nav.howItWorks")}</a>
      </nav>
      <div className={styles.actions}>
        {!props.hideNewRoom && (
          <div className={styles.newRoom}>
            <NewRoomButton openNewTab />
          </div>
        )}
        <details className={styles.more}>
          <summary aria-label={t("topbar.moreOptions")}>
            <IconDots size={22} />
          </summary>
          <div className={styles.moreMenu}>
            {!props.hideNewRoom && (
              <div className={styles.mobileCreate}>
                <NewRoomButton openNewTab />
              </div>
            )}
            {context.features.roomCreation && !props.hideMyRooms && context.user && <ListRoomsButton />}
            {context.features.roomControls && <SubscribeButton />}
            <a href="/faq">{t("nav.howItWorks")}</a>
            <div className={styles.langSwitch} role="group" aria-label={t("lang.label")}>
              {LANG_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  aria-pressed={getLang() === option.code}
                  onClick={() => {
                    if (getLang() === option.code) return;
                    saveLang(option.code);
                    window.location.reload();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <a
              href="https://discord.gg/3rYj5HV"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandDiscord size={18} /> Discord
            </a>
            <a
              href="https://github.com/howardchung/watchparty"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandGithub size={18} /> GitHub
            </a>
          </div>
        </details>
        {!props.hideSignin && config.VITE_FIREBASE_CONFIG && <SignInButton />}
      </div>
      <Announce />
    </header>
  );
};
