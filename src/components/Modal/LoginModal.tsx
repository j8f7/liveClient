import React from "react";
import {
  Modal,
  Button,
  Alert,
  TextInput,
  PasswordInput,
  Divider,
} from "@mantine/core";
import { loadFirebase } from "../../utils/firebase";
import {
  IconBrandFacebookFilled,
  IconBrandGoogleFilled,
} from "@tabler/icons-react";
import config from "../../config";
import { t } from "../../i18n";

export class LoginModal extends React.Component<{
  closeModal: () => void;
}> {
  public state = {
    email: "",
    password: "",
    showCreate: false,
    showReset: false,
    error: "",
  };

  emailSignIn = async (email: string, password: string) => {
    try {
      await (await loadFirebase()).auth().signInWithEmailAndPassword(email, password);

      this.props.closeModal();
    } catch (e: any) {
      // handle exceptions
      this.setState({ error: e.message });
    }
  };

  // emailLinkSignIn = async () => {
  //   await firebase.auth().sendSignInLinkToEmail(this.state.email, {
  //     url: window.location.href,
  //     handleCodeInApp: true,
  //   });
  // };

  facebookSignIn = async () => {
    const firebase = await loadFirebase();
    const provider = new firebase.auth.FacebookAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  };

  googleSignIn = async () => {
    const firebase = await loadFirebase();
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  };

  render() {
    const { closeModal } = this.props;
    const enabledOptions = config.VITE_FIREBASE_SIGNIN_METHODS.split(",");
    return (
      <>
        {this.state.showCreate && (
          <CreateModal
            closeModal={() => this.setState({ showCreate: false })}
          />
        )}
        {this.state.showReset && (
          <ResetModal closeModal={() => this.setState({ showReset: false })} />
        )}
        <Modal opened onClose={closeModal} title={t("login.title")} size="auto" centered>
          <div>
            <div style={{ display: "flex", gap: "4px" }}>
              {enabledOptions.includes("facebook") && (
                <Button
                  leftSection={<IconBrandFacebookFilled />}
                  onClick={this.facebookSignIn}
                >
                  Facebook
                </Button>
              )}
              {enabledOptions.includes("google") && (
                <Button
                  leftSection={<IconBrandGoogleFilled />}
                  onClick={this.googleSignIn}
                >
                  Google
                </Button>
              )}
            </div>
            {enabledOptions.includes("email") && (
              <>
                <Divider
                  label={t("login.orEmail")}
                  labelPosition="center"
                  my="lg"
                />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    this.emailSignIn(this.state.email, this.state.password);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {this.state.error && (
                    <Alert color="red" title={t("app.alertError")}>
                      {this.state.error}
                    </Alert>
                  )}
                  <TextInput
                    label={t("login.email")}
                    placeholder={t("login.email")}
                    value={this.state.email}
                    onChange={(e) => this.setState({ email: e.target.value })}
                  />
                  <PasswordInput
                    label={t("login.password")}
                    placeholder={t("login.password")}
                    value={this.state.password}
                    onChange={(e) =>
                      this.setState({ password: e.target.value })
                    }
                  />
                  <Button type="submit">{t("login.submit")}</Button>
                </form>
                <Divider label={t("login.or")} labelPosition="center" my="lg" />
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    justifyContent: "center",
                  }}
                >
                  <Button
                    size="xs"
                    onClick={() => this.setState({ showCreate: true })}
                  >
                    {t("login.createAccount")}
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => this.setState({ showReset: true })}
                  >
                    {t("login.resetPassword")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      </>
    );
  }
}

export class CreateModal extends React.Component<{
  closeModal: () => void;
}> {
  public state = { email: "", password: "", error: "" };

  createAccount = async (email: string, password: string) => {
    try {
      await (await loadFirebase()).auth().createUserWithEmailAndPassword(email, password);
    } catch (e: any) {
      // handle exceptions
      this.setState({ error: e.message });
    }
  };

  render() {
    const { closeModal } = this.props;
    return (
      <Modal
        opened
        onClose={closeModal}
        title={t("login.createTitle")}
        size="auto"
        centered
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            this.createAccount(this.state.email, this.state.password);
          }}
          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
          {this.state.error && (
            <Alert color="red" title={t("app.alertError")}>
              {this.state.error}
            </Alert>
          )}
          <TextInput
            label={t("login.email")}
            placeholder={t("login.email")}
            value={this.state.email}
            onChange={(e) => this.setState({ email: e.target.value })}
          />
          <PasswordInput
            label={t("login.password")}
            placeholder={t("login.password")}
            value={this.state.password}
            onChange={(e) => this.setState({ password: e.target.value })}
          />
          <Button type="submit">{t("login.createSubmit")}</Button>
        </form>
      </Modal>
    );
  }
}

export class ResetModal extends React.Component<{
  closeModal: () => void;
}> {
  public state = { email: "", password: "", error: "" };

  resetPassword = async () => {
    try {
      await (await loadFirebase()).auth().sendPasswordResetEmail(this.state.email);
      this.props.closeModal();
    } catch (e: any) {
      // handle exceptions
      this.setState({ error: e.message });
    }
  };

  render() {
    const { closeModal } = this.props;
    return (
      <Modal opened onClose={closeModal} title={t("login.resetTitle")} centered>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            this.resetPassword();
          }}
          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
          {this.state.error && (
            <Alert color="red" title={t("app.alertError")}>
              {this.state.error}
            </Alert>
          )}
          <TextInput
            label={t("login.email")}
            placeholder={t("login.email")}
            value={this.state.email}
            onChange={(e) => this.setState({ email: e.target.value })}
          />
          <Button type="submit">{t("login.resetSubmit")}</Button>
        </form>
      </Modal>
    );
  }
}
