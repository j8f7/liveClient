import type firebase from "firebase/compat/app";
import React from "react";
import { parseFeatures } from "./utils/features";

export const DEFAULT_STATE = {
  user: undefined as firebase.User | undefined,
  isSubscriber: undefined as boolean | undefined,
  streamPath: undefined as string | undefined,
  beta: false,
  features: parseFeatures(undefined),
};

export const MetadataContext = React.createContext(DEFAULT_STATE);
