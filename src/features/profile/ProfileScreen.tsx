import amethystArt from "../../assets/brand/rank-amethyst.webp";
import copperArt from "../../assets/brand/rating-rook.webp";
import crownArt from "../../assets/brand/rank-crown.webp";
import jadeArt from "../../assets/brand/rank-jade.webp";
import sapphireArt from "../../assets/brand/rank-sapphire.webp";
import type { AchievementId, Progress } from "../../domain/progress/types";
import { Avatar, Pill, Toggle } from "../../shared/ui/primitives";
import { achievementCopy, lockedAchievements } from "./achievement-copy";
import "./profile-screen.css";

// The rated ranks from src/domain/game/rank-path.ts.
export type RankName = "Copper" | "Jade" | "Sapphire" | "Amethyst" | "Crown";
export type LinkedSite = "Lichess" | "Chess.com";
export type SyncState = "signed-out" | "synced" | "syncing" | "error";

export interface ProfileScreenProps {
  readonly name: string;
  readonly avatarUrl?: string | undefined;
  readonly rank: { readonly name: RankName; readonly badgeUrl: string };
  readonly rating: number;
  // Rating change over the last 30 days.
  readonly ratingDelta: number;
  readonly nextRank:
    | { readonly name: RankName; readonly ratingNeeded: number }
    | undefined;
  readonly progress: Progress;
  readonly unitTitles: ReadonlyMap<string, string>;
  // In curriculum order; the keys are the stage ids.
  readonly stageTitles: ReadonlyMap<string, string>;
  readonly voice: { readonly enabled: boolean; readonly available: boolean };
  readonly onVoiceChange: (enabled: boolean) => void;
  readonly linkedAccounts: readonly {
    readonly site: LinkedSite;
    readonly username: string;
  }[];
  readonly syncState: SyncState;
  readonly onOpenSky: () => void;
  readonly onLink: (site: LinkedSite) => void;
}

const RANKS: readonly { readonly name: RankName; readonly art: string }[] = [
  { name: "Copper", art: copperArt },
  { name: "Jade", art: jadeArt },
  { name: "Sapphire", art: sapphireArt },
  { name: "Amethyst", art: amethystArt },
  { name: "Crown", art: crownArt },
];
const SITES: readonly LinkedSite[] = ["Lichess", "Chess.com"];

const SYNC_COPY: Record<SyncState, { readonly glyph: string; text: string }> = {
  "signed-out": {
    glyph: "○",
    text: "Not signed in. Your progress stays on this device.",
  },
  synced: { glyph: "✓", text: "Synced to your account" },
  syncing: { glyph: "↻", text: "Syncing…" },
  error: {
    glyph: "!",
    text: "Couldn't sync. Your progress is safe on this device.",
  },
};

// Design §3.7 Profile. Presentational: renders inside the tabs shell body.
export function ProfileScreen(props: ProfileScreenProps) {
  const { progress } = props;
  return (
    <div className="profile-screen">
      <ProfileHead {...props} />
      <div className="profile-tiles">
        <div className="profile-tile">
          <b
            className={`profile-tile__value profile-tile__value--flame${progress.streak.current === 0 ? " profile-tile__value--dim" : ""}`}
          >
            <span aria-hidden="true">🔥 </span>
            {progress.streak.current}
          </b>
          <small>day streak · best {String(progress.streak.best)}</small>
        </div>
        <div className="profile-tile">
          <b className="profile-tile__value profile-tile__value--brass">
            {progress.xp}
          </b>
          <small>XP · level {String(progress.level)}</small>
        </div>
        <button
          type="button"
          className="profile-tile profile-tile--link"
          onClick={props.onOpenSky}
          aria-label={`${String(progress.ideas.length)} ideas spotted. Open your sky`}
        >
          <b className="profile-tile__value profile-tile__value--jade">
            {progress.ideas.length}
          </b>
          <small>
            ideas spotted <span aria-hidden="true">✦ ›</span>
          </small>
        </button>
      </div>
      <RankPath
        current={props.rank.name}
        rating={props.rating}
        nextRank={props.nextRank}
      />
      <Achievements
        earned={progress.achievements}
        unitTitles={props.unitTitles}
        stageTitles={props.stageTitles}
      />
      <Settings {...props} />
    </div>
  );
}

function ProfileHead({
  name,
  avatarUrl,
  rank,
  rating,
  ratingDelta,
}: ProfileScreenProps) {
  return (
    <header className="profile-head">
      <Avatar
        name={name}
        imageUrl={avatarUrl}
        badgeUrl={rank.badgeUrl}
        size="lg"
      />
      <div className="profile-head__text">
        <h1 className="profile-head__name">{name}</h1>
        <p className="profile-head__rating">
          {rank.name} rank · rated <b>{rating}</b>
          {ratingDelta !== 0 && (
            <span
              className={`profile-head__delta${ratingDelta < 0 ? " profile-head__delta--down" : ""}`}
            >
              {" "}
              {ratingDelta > 0 ? "▲" : "▼"} {String(Math.abs(ratingDelta))} this
              month
            </span>
          )}
        </p>
      </div>
    </header>
  );
}

function RankPath({
  current,
  rating,
  nextRank,
}: {
  readonly current: RankName;
  readonly rating: number;
  readonly nextRank: ProfileScreenProps["nextRank"];
}) {
  const currentIndex = RANKS.findIndex(({ name }) => name === current);
  return (
    <section className="profile-section" aria-labelledby="profile-rank-path">
      <h2 className="profile-label" id="profile-rank-path">
        Rank path
      </h2>
      <ol className="profile-ranks">
        {RANKS.map(({ name, art }, index) => {
          const state =
            index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "ahead";
          return (
            <li
              key={name}
              className={`profile-ranks__item profile-ranks__item--${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <img className="profile-ranks__art" src={art} alt="" />
              <span className="profile-ranks__name">{name}</span>
            </li>
          );
        })}
      </ol>
      <p className="profile-rank-line">
        {nextRank === undefined ? (
          <>Crown is the top rank. You made it.</>
        ) : (
          <>
            {nextRank.name} at <b>{nextRank.ratingNeeded}</b> ·{" "}
            {String(Math.max(0, nextRank.ratingNeeded - rating))} rating points
            to go
          </>
        )}
      </p>
    </section>
  );
}

function Achievements({
  earned,
  unitTitles,
  stageTitles,
}: {
  readonly earned: readonly AchievementId[];
  readonly unitTitles: ReadonlyMap<string, string>;
  readonly stageTitles: ReadonlyMap<string, string>;
}) {
  const titles = { unitTitles, stageTitles };
  const locked = lockedAchievements(earned, [...stageTitles.keys()]);
  const items = [
    ...earned.map((id) => ({ id, locked: false })),
    ...locked.map((id) => ({ id, locked: true })),
  ];
  return (
    <section className="profile-section" aria-labelledby="profile-achievements">
      <h2 className="profile-label" id="profile-achievements">
        Achievements{" "}
        <span className="profile-label__count">
          {String(earned.length)} earned
        </span>
      </h2>
      <ul className="profile-achievements">
        {items.map(({ id, locked: isLocked }) => {
          const copy = achievementCopy(id, titles);
          return (
            <li
              key={id}
              className={`profile-achievement${isLocked ? " profile-achievement--locked" : ""}`}
            >
              <span className="profile-achievement__medal" aria-hidden="true">
                {isLocked ? <LockShape /> : copy.glyph}
              </span>
              <b className="profile-achievement__title">
                {isLocked && <span className="profile-hidden">Locked: </span>}
                {copy.title}
              </b>
              <small className="profile-achievement__line">
                {copy.description}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LockShape() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function Settings({
  voice,
  onVoiceChange,
  linkedAccounts,
  syncState,
  onLink,
}: ProfileScreenProps) {
  const sync = SYNC_COPY[syncState];
  const unlinked = SITES.filter(
    (site) => !linkedAccounts.some((account) => account.site === site),
  );
  return (
    <section className="profile-section" aria-labelledby="profile-settings">
      <h2 className="profile-label" id="profile-settings">
        Settings
      </h2>
      <ul className="profile-settings">
        <li className="profile-setting profile-setting--voice">
          <Toggle
            label="Rook reads aloud"
            checked={voice.available && voice.enabled}
            disabled={!voice.available}
            onChange={onVoiceChange}
          />
          {!voice.available && (
            <small className="profile-setting__note">
              This browser has no voice for Rook yet.
            </small>
          )}
        </li>
        {linkedAccounts.map(({ site, username }) => (
          <li key={site} className="profile-setting">
            <span className="profile-setting__glyph" aria-hidden="true">
              ♟
            </span>
            <span className="profile-setting__text profile-setting__account">
              <small>{site}</small>
              <b title={username}>{username}</b>
            </span>
            <span className="profile-setting__status">
              <span aria-hidden="true">✓ </span>Linked
            </span>
          </li>
        ))}
        {unlinked.map((site) => (
          <li key={site} className="profile-setting">
            <span className="profile-setting__glyph" aria-hidden="true">
              ♟
            </span>
            <span className="profile-setting__text profile-setting__text--quiet">
              {site} · not linked
            </span>
            <Pill
              onClick={() => {
                onLink(site);
              }}
              aria-label={`Link ${site}`}
            >
              Link
            </Pill>
          </li>
        ))}
        <li
          className={`profile-setting profile-setting--sync-${syncState}`}
          role="status"
        >
          <span className="profile-setting__glyph" aria-hidden="true">
            {sync.glyph}
          </span>
          <span className="profile-setting__text">{sync.text}</span>
        </li>
      </ul>
    </section>
  );
}
