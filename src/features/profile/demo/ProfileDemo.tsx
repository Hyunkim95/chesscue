import { useState, type ReactNode } from "react";

import { GamesEmpty } from "../../import-games/GamesEmpty";
import { ReadingGames } from "../../import-games/ReadingGames";
import { AppShell } from "../../../shared/navigation/AppShell";
import type { TabId } from "../../../shared/navigation/TabBar";
import { Avatar, StreakChip, XpChip } from "../../../shared/ui/primitives";
import { ProfileScreen, type ProfileScreenProps } from "../ProfileScreen";
import { activeProfile, newProfile, topProfile } from "./fixtures";

// Not shipped. Open /demo/profile.html?state=... with `pnpm exec vite`.
// States: profile, profile-new, profile-top, games-empty, reading,
// reading-start.
const READING_FEN =
  "r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8";

function Tabs({
  current,
  profile,
  children,
}: {
  readonly current: TabId | undefined;
  readonly profile: ProfileScreenProps;
  readonly children: ReactNode;
}) {
  const [tab, setTab] = useState(current);
  return (
    <AppShell
      mode={{
        kind: "tabs",
        current: tab,
        onNavigate: setTab,
        start: (
          <>
            <StreakChip days={profile.progress.streak.current} />
            <XpChip xp={profile.progress.xp} />
          </>
        ),
        end: (
          <Avatar
            name={profile.name}
            badgeUrl={profile.rank.badgeUrl}
            onClick={() => undefined}
          />
        ),
      }}
    >
      {children}
    </AppShell>
  );
}

function LiveProfile({ base }: { readonly base: ProfileScreenProps }) {
  const [voice, setVoice] = useState(base.voice);
  return (
    <ProfileScreen
      {...base}
      voice={voice}
      onVoiceChange={(enabled) => {
        setVoice({ ...voice, enabled });
      }}
    />
  );
}

export function ProfileDemo({ state }: { readonly state: string }) {
  switch (state) {
    case "profile-new":
      return (
        <Tabs current={undefined} profile={newProfile}>
          <LiveProfile base={newProfile} />
        </Tabs>
      );
    case "profile-top":
      return (
        <Tabs current={undefined} profile={topProfile}>
          <LiveProfile base={topProfile} />
        </Tabs>
      );
    case "games-empty":
      return (
        <Tabs current="games" profile={newProfile}>
          <GamesEmpty onImport={() => undefined} onAdd={() => undefined} />
        </Tabs>
      );
    case "reading":
    case "reading-start":
      return (
        <AppShell
          mode={{
            kind: "focus",
            exitLabel: "Leave, Rook keeps reading",
            onExit: () => undefined,
          }}
        >
          {state === "reading" ? (
            <ReadingGames
              gameIndex={2}
              total={5}
              opponent="Ahmed"
              move={23}
              fen={READING_FEN}
              momentsFound={1}
            />
          ) : (
            <ReadingGames
              gameIndex={1}
              total={5}
              opponent="Lina"
              move={3}
              fen="rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"
              momentsFound={0}
            />
          )}
        </AppShell>
      );
    default:
      return (
        <Tabs current={undefined} profile={activeProfile}>
          <LiveProfile base={activeProfile} />
        </Tabs>
      );
  }
}
