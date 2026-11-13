// Firebase sign-in is optional. It is loaded on demand so a build without
// VITE_FIREBASE_CONFIG never downloads it (about 80 KB gzip).
import type firebaseNs from "firebase/compat/app";
import config from "../config";

export type FirebaseUser = firebaseNs.User;

export const firebaseEnabled = Boolean(config.VITE_FIREBASE_CONFIG);

let loading: Promise<typeof firebaseNs> | undefined;

export const loadFirebase = (): Promise<typeof firebaseNs> =>
  (loading ??= Promise.all([
    import("firebase/compat/app"),
    import("firebase/compat/auth"),
  ]).then(([mod]) => {
    const firebase = mod.default;
    if (!firebase.apps.length) {
      firebase.initializeApp(JSON.parse(config.VITE_FIREBASE_CONFIG));
    }
    return firebase;
  }));
