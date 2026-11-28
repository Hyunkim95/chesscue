import { z } from "zod";

export const IMPORT_USERNAMES_KEY = "username-imports";

const usernameValue = z.string().regex(/^[a-z0-9_-]{2,30}$/i);
const rememberedUsernames = z.object({
  lichess: usernameValue.optional(),
  chesscom: usernameValue.optional(),
});

export type SavedImportUsernames = Readonly<
  z.infer<typeof rememberedUsernames>
>;

export function readImportUsernames(key: string): SavedImportUsernames {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return rememberedUsernames.safeParse(raw).data ?? {};
  } catch {
    return {};
  }
}
