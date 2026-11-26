import { z } from "zod";
import { sha256 } from "../../shared/sha256";
import { parsePgnBatch } from "../../domain/import/pgn-parser";
import { signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
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

const source = z.object({
  schemaVersion: z.literal(1),
  pgn: z.string().max(1_000_000),
});
export async function readSubmittedGame(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid source game.");
  const client = initializeFirebaseClient({ enableAppCheck: true });
  if (client.status !== "ready")
    throw new Error("Shared collection unavailable.");
  const data = source.parse(
    (await getDoc(doc(client.services.firestore, "sharedGames", id))).data(),
  );
  if ((await sha256(data.pgn)) !== id) throw new Error("Invalid score.");
  const parsed = parsePgnBatch(data.pgn);
  const item = parsed.ok && parsed.items.length === 1 && parsed.items[0];
  if (!item || item.status !== "parsed") throw new Error("Invalid score.");
  return item.game;
}
