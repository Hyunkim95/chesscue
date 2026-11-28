import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import {
  requestGoogleAccessToken,
  usesExtensionGoogleSignIn,
} from "./extension-google";
import { initializeFirebaseClient } from "./firebase-client";
import { createRaceStore } from "./race-store";
import { startAccountSync } from "./account-sync";
import type { SyncStatus } from "../../application/sync-games/sync-status";
import type { PlayerHistory } from "../persistence/player-history";

export interface AccountIdentity {
  uid: string;
  name: string | null;
  email: string | null;
}
export function openAccountSession() {
  const nativeGoogle = usesExtensionGoogleSignIn();
  const firebase = initializeFirebaseClient({
    // The Chrome account adapter uses Firebase Auth and owner-scoped Firestore.
    // The web App Check provider cannot load its remote script in the extension.
    enableAppCheck: !nativeGoogle,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (firebase.status !== "ready")
    throw new Error(
      "Google sign-in is unavailable. Your games are saved on this device.",
    );
  const { auth, firestore } = firebase.services;
  return {
    races: createRaceStore(firebase.services),
    observe(listener: (user: AccountIdentity | null) => void) {
      return onAuthStateChanged(auth, (user) => {
        listener(
          user
            ? { uid: user.uid, name: user.displayName, email: user.email }
            : null,
        );
      });
    },
    async signIn() {
      if (nativeGoogle) {
        const token = await requestGoogleAccessToken();
        try {
          await signInWithCredential(
            auth,
            GoogleAuthProvider.credential(null, token),
          );
        } catch (error) {
          try {
            await chrome.identity.removeCachedAuthToken({ token });
          } catch {
            // Keep Firebase's original failure as the cause.
          }
          throw new Error("Could not finish Google sign-in. Try again.", {
            cause: error,
          });
        }
        return;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    },
    signOut: () => signOut(auth),
    sync(
      history: PlayerHistory,
      report: (state: SyncStatus) => void,
      changed: () => void,
    ) {
      const uid = history.uid;
      if (uid === null || uid !== auth.currentUser?.uid) return undefined;
      return startAccountSync(firestore, uid, history, report, changed);
    },
  };
}
export type AccountSession = ReturnType<typeof openAccountSession>;
