import React from "react";
import { Modal, Button, Avatar, HoverCard, Text } from "@mantine/core";
import { loadFirebase } from "../../utils/firebase";
import { serverPath } from "../../utils/utils";
import { ManageSubButton } from "../SubscribeButton/SubscribeButton";
import config from "../../config";
import { MetadataContext } from "../../MetadataContext";
import { t } from "../../i18n";
import {
  IconBrandDiscordFilled,
  IconBrandGravatar,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconKeyFilled,
  IconLogout,
  IconTrashFilled,
} from "@tabler/icons-react";

export class ProfileModal extends React.Component<{
  close: () => void;
  userImage: string | null;
}> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  public state = {
    resetDisabled: false,
    verifyDisabled: false,
    deleteConfirmOpen: false,
    linkedDiscord: null as null | LinkAccount,
  };

  async componentDidMount() {
    const token = (await this.context.user?.getIdToken()) ?? "";
    const response = await fetch(
      serverPath +
        "/linkAccount?" +
        new URLSearchParams({
          uid: this.context.user?.uid ?? "",
          token,
        }),
    );
    const data: LinkAccount[] = await response.json();
    const linkedDiscord = data.find((d) => d.kind === "discord");
    this.setState({ linkedDiscord });
  }

  onSignOut = async () => {
    await (await loadFirebase()).auth().signOut();
    window.localStorage.removeItem("watchparty-loginname");
    window.location.reload();
  };

  resetPassword = async () => {
    try {
      if (this.context.user?.email) {
        await (await loadFirebase()).auth().sendPasswordResetEmail(this.context.user.email);
        this.setState({ resetDisabled: true });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  verifyEmail = async () => {
    try {
      if (this.context.user) {
        await this.context.user.sendEmailVerification();
        this.setState({ verifyDisabled: true });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  deleteAccountConfirm = () => {
    this.setState({ deleteConfirmOpen: true });
  };

  deleteAccount = async () => {
    const token = await this.context.user?.getIdToken();
    await fetch(serverPath + "/deleteAccount", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uid: this.context.user?.uid, token }),
    });
    window.location.reload();
  };

  authDiscord = () => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=1071707916719095908&redirect_uri=${encodeURIComponent(
      config.VITE_OAUTH_REDIRECT_HOSTNAME,
    )}%2Fdiscord%2Fauth&response_type=token&scope=identify`;
    window.open(
      url,
      "_blank",
      "toolbar=0,location=0,menubar=0,width=450,height=900",
    );
  };

  deleteDiscord = async () => {
    const token = await this.context.user?.getIdToken();
    await fetch(serverPath + "/linkAccount", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: this.context.user?.uid,
        token,
        kind: "discord",
      }),
    });
    window.location.reload();
  };

  render() {
    const { close, userImage } = this.props;
    return (
      <Modal opened onClose={close} centered>
        <Modal
          opened={this.state.deleteConfirmOpen}
          onClose={() => {
            this.setState({ deleteConfirmOpen: false });
          }}
          title={t("profile.deleteTitle")}
        >
          <p>{t("profile.deleteConfirm")}</p>
          <p>{t("profile.deleteNote", { email: "support@watchparty.me" })}</p>
          <div style={{ display: "flex", gap: "4px" }}>
            <Button
              onClick={async () => {
                await this.deleteAccount();
              }}
            >
              {t("profile.yes")}
            </Button>
            <Button
              onClick={() => {
                this.setState({ deleteConfirmOpen: false });
              }}
            >
              {t("profile.no")}
            </Button>
          </div>
        </Modal>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <Avatar src={userImage} />
          {this.context.user?.email}
          {this.context.user?.emailVerified && (
            <IconCircleCheckFilled
              title={t("profile.emailVerified")}
              color="green"
            />
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            margin: "10px",
          }}
        >
          <Button
            component="a"
            leftSection={<IconBrandGravatar />}
            href="https://gravatar.com"
            target="_blank"
            color="blue"
          >
            {t("profile.editGravatar")}
          </Button>
          <Button
            disabled={
              this.context.user?.emailVerified || this.state.verifyDisabled
            }
            leftSection={<IconCircleCheck />}
            color="purple"
            onClick={this.verifyEmail}
          >
            {t("profile.verifyEmail")}
          </Button>
          {this.context.isSubscriber && <ManageSubButton />}
          {this.state.linkedDiscord ? (
            <Button
              leftSection={<IconBrandDiscordFilled />}
              color="red"
              onClick={this.deleteDiscord}
            >
              {t("profile.unlinkDiscord")} {this.state.linkedDiscord.accountname}#
              {this.state.linkedDiscord.discriminator}
            </Button>
          ) : (
            <HoverCard>
              <HoverCard.Dropdown>
                <Text>{t("profile.linkDiscordHint")}</Text>
              </HoverCard.Dropdown>
              <HoverCard.Target>
                <Button
                  leftSection={<IconBrandDiscordFilled />}
                  color="orange"
                  onClick={this.authDiscord}
                >
                  {t("profile.linkDiscord")}
                </Button>
              </HoverCard.Target>
            </HoverCard>
          )}
          <Button
            disabled={this.state.resetDisabled}
            leftSection={<IconKeyFilled />}
            color="green"
            onClick={this.resetPassword}
          >
            {t("login.resetPassword")}
          </Button>
          <Button
            leftSection={<IconTrashFilled />}
            color="red"
            onClick={this.deleteAccountConfirm}
          >
            {t("profile.deleteAccount")}
          </Button>
          <Button leftSection={<IconLogout />} onClick={this.onSignOut}>
            {t("profile.signOut")}
          </Button>
        </div>
      </Modal>
    );
  }
}
