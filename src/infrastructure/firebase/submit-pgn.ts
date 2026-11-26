import { signInAnonymously } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { initializeFirebaseClient } from "./firebase-client";

export async function submitPgn(id: string, pgn: string) {
  const client = initializeFirebaseClient({ enableAppCheck: true });
  if (client.status !== "ready")
    throw new Error("Shared collection unavailable.");
  let services = client.services;
  await services.auth.authStateReady();
  if (!services.auth.currentUser) {
    // Keep the guest upload identity separate from the player's Google session.
    const guest = initializeFirebaseClient({
      guestSubmissions: true,
      enableAppCheck: true,
    });
    if (guest.status !== "ready")
      throw new Error("Guest submissions unavailable.");
    services = guest.services;
    await services.auth.authStateReady();
    if (!services.auth.currentUser) await signInAnonymously(services.auth);
  }
  await setDoc(doc(services.firestore, "pgnSubmissions", id), { pgn });
}
