import "@mantine/core/styles.css";
import "./index.css";

import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Redirect } from "react-router-dom";

import { App } from "./components/App/App";
import { Home } from "./components/Home/Home";
import { Privacy, Terms, FAQ } from "./components/Pages/Pages";
import { TopBar } from "./components/TopBar/TopBar";
import { Footer } from "./components/Footer/Footer";
import { firebaseEnabled, loadFirebase, type FirebaseUser } from "./utils/firebase";
import { serverPath, softWhite } from "./utils/utils";
import { startClientLog } from "./utils/clientLog";
import { Create } from "./components/Create/Create";
import { Discord } from "./components/Discord/Discord";
import config from "./config";
import { parseFeatures } from "./utils/features";
import { DEFAULT_STATE, MetadataContext } from "./MetadataContext";
import { createTheme, MantineProvider } from "@mantine/core";
import { t } from "./i18n";

const theme = createTheme({
  fontFamily: "Arial, Helvetica, sans-serif",
  primaryColor: "peach",
  primaryShade: 6,
  defaultRadius: "md",
  colors: {
    peach: [
      "#fff4ed",
      "#ffe5d4",
      "#ffd2b7",
      "#f7bf9f",
      "#f2b38e",
      "#edac85",
      "#eaa580",
      "#d78d68",
      "#b9704e",
      "#925338",
    ],
    dark: [
      "#f4f3ed",
      "#c9ced0",
      "#939da8",
      "#64717e",
      "#34404c",
      "#28323d",
      "#192129",
      "#131920",
      "#0c1015",
      "#080c10",
    ],
  },
  white: softWhite,
});

const Debug = lazy(() => import("./components/Debug/Debug"));

// ?log=1 sends errors and a device summary to the server log (for phones).
if (new URLSearchParams(window.location.search).has("log")) startClientLog(serverPath);

// The page title and description follow the active language (zh-CN by default).
document.title = t("meta.title");
document
  .querySelector('meta[name="description"]')
  ?.setAttribute("content", t("meta.description"));

// Redirect old-style URLs
if (window.location.hash && window.location.pathname === "/") {
  const hashRoomId = window.location.hash.substring(1);
  window.location.href = "/watch/" + hashRoomId;
}

class WatchParty extends React.Component {
  public state = DEFAULT_STATE;
  async componentDidMount() {
    // Fail closed: unavailable or malformed flags never expose host controls.
    void fetch(serverPath + "/features")
      .then((response) => { if (!response.ok) throw new Error("Unavailable"); return response.json(); })
      .then((data) => this.setState({ features: parseFeatures(data) }))
      .catch(() => {});
    if (firebaseEnabled) {
      const firebase = await loadFirebase();
      firebase.auth().onAuthStateChanged(async (user: FirebaseUser | null) => {
        if (user) {
          // console.log(user);
          this.setState({ user });
          const token = await user.getIdToken();
          const response = await window.fetch(
            serverPath + `/metadata?uid=${user.uid}&token=${token}`,
          );
          const data = await response.json();
          this.setState({
            isSubscriber: data.isSubscriber,
            streamPath: data.streamPath,
            beta: data.beta,
          });
        }
      });
    } else {
      // Firebase isn't set up so enable subscriber features
      this.setState({
        isSubscriber: true,
      });
    }
  }
  render() {
    return (
      // <React.StrictMode>
      <MantineProvider theme={theme} forceColorScheme="dark">
        <MetadataContext.Provider value={this.state}>
          <BrowserRouter>
            <Route
              path="/"
              exact
              render={(props) => {
                // The default room opens at "/" only on arrival: links back from a room carry
                // ?lobby (see lobbyHref) so the lobby stays reachable.
                if (config.VITE_DEFAULT_ROOM && !new URLSearchParams(props.location.search).has("lobby")) {
                  return <Redirect to={`/watch/${config.VITE_DEFAULT_ROOM}`} />;
                }
                if (config.VITE_LOBBY_ROOMS_ONLY) return <Home />;
                return (
                  <React.Fragment>
                    <TopBar hideNewRoom />
                    <Home />
                    <Footer />
                  </React.Fragment>
                );
              }}
            />
            <Route
              path="/create"
              exact
              render={() => {
                return this.state.features.roomCreation ? <Create /> : <Redirect to="/" />;
              }}
            />
            <Route
              path="/watch/:roomId"
              exact
              render={(props) => {
                return <App urlRoomId={props.match.params.roomId} />;
              }}
            />
            <Route
              path="/r/:vanity"
              exact
              render={(props) => {
                return <App vanity={props.match.params.vanity} />;
              }}
            />
            <Route path="/terms">
              <TopBar />
              <Terms />
              <Footer />
            </Route>
            <Route path="/privacy">
              <TopBar />
              <Privacy />
              <Footer />
            </Route>
            <Route path="/faq">
              <TopBar />
              <FAQ />
              <Footer />
            </Route>
            <Route path="/discord/auth" exact>
              {this.state.features.roomCreation ? <Discord /> : <Redirect to="/" />}
            </Route>
            <Route path="/debug">
              <TopBar />
              <Suspense fallback={null}>
                {this.state.features.roomControls ? <Debug /> : <Redirect to="/" />}
              </Suspense>
              <Footer />
            </Route>
          </BrowserRouter>
        </MetadataContext.Provider>
      </MantineProvider>
      // </React.StrictMode>
    );
  }
}
const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<WatchParty />);
