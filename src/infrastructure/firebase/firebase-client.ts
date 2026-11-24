import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

import { loadFirebaseClientConfig } from "../config/firebase-environment";

export interface FirebaseClientServices {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly appCheck: AppCheck | null;
}

export type FirebaseClientAvailability =
  | { readonly status: "disabled"; readonly reason: "not-configured" }
  | { readonly status: "ready"; readonly services: FirebaseClientServices }
  | { readonly status: "failed"; readonly message: string };

export interface InitializeFirebaseOptions {
  readonly environment?: unknown;
  readonly enableAppCheck?: boolean;
}

const APP_NAME = "adaptive-chess-tutor";

const messageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : "Firebase initialization failed.";

export const initializeFirebaseClient = (
  options: InitializeFirebaseOptions = {},
): FirebaseClientAvailability => {
  const configResult = loadFirebaseClientConfig(options.environment);
  if (!configResult.ok) {
    return { status: "failed", message: configResult.error.message };
  }
  if (configResult.value === null) {
    return { status: "disabled", reason: "not-configured" };
  }

  try {
    const existingApp = getApps().find((app) => app.name === APP_NAME);
    const app =
      existingApp ??
      initializeApp(
        {
          apiKey: configResult.value.apiKey,
          authDomain: configResult.value.authDomain,
          projectId: configResult.value.projectId,
          storageBucket: configResult.value.storageBucket,
          messagingSenderId: configResult.value.messagingSenderId,
          appId: configResult.value.appId,
          ...(configResult.value.measurementId === undefined
            ? {}
            : { measurementId: configResult.value.measurementId }),
        },
        APP_NAME,
      );

    const appCheck =
      options.enableAppCheck === true &&
      configResult.value.appCheckSiteKey !== undefined
        ? initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(
              configResult.value.appCheckSiteKey,
            ),
            isTokenAutoRefreshEnabled: true,
          })
        : null;

    return {
      status: "ready",
      services: {
        app: existingApp === undefined ? app : getApp(APP_NAME),
        auth: getAuth(app),
        firestore: getFirestore(app),
        appCheck,
      },
    };
  } catch (error: unknown) {
    return { status: "failed", message: messageFrom(error) };
  }
};
