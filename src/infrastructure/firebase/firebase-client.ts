import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  type Auth,
} from "firebase/auth";
import { usesExtensionGoogleSignIn } from "./extension-google";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

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
  readonly guestSubmissions?: boolean;
  readonly environment?: unknown;
  readonly enableAppCheck?: boolean;
  readonly appCheckDebug?: boolean;
}

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
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
    if (
      options.appCheckDebug === true ||
      (options.enableAppCheck === true &&
        import.meta.env.MODE === "extension" &&
        import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true")
    ) {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN ??= true;
    }
    const appName = options.guestSubmissions
      ? APP_NAME + "-submissions"
      : APP_NAME;
    const existingApp = getApps().find((app) => app.name === appName);
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
        appName,
      );

    const auth =
      usesExtensionGoogleSignIn() && existingApp === undefined
        ? initializeAuth(app, {
            persistence: [indexedDBLocalPersistence, browserLocalPersistence],
          })
        : getAuth(app);
    const firestore = getFirestore(app);
    const emulated =
      import.meta.env.VITE_ACCOUNT_EMULATORS === "true" &&
      configResult.value.projectId.startsWith("demo-") &&
      (globalThis.location.hostname === "127.0.0.1" ||
        globalThis.location.protocol === "chrome-extension:");
    if (emulated && existingApp === undefined) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    }

    const appCheck =
      !emulated &&
      options.enableAppCheck === true &&
      configResult.value.appCheckSiteKey !== undefined
        ? initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(
              configResult.value.appCheckSiteKey,
            ),
            isTokenAutoRefreshEnabled: true,
          })
        : null;

    return {
      status: "ready",
      services: {
        app: existingApp === undefined ? app : getApp(appName),
        auth,
        firestore,
        appCheck,
      },
    };
  } catch (error: unknown) {
    return { status: "failed", message: messageFrom(error) };
  }
};
