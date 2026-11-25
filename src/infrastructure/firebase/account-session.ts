import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
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
  const firebase = initializeFirebaseClient({
    enableAppCheck: true,
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
