import { useState } from "react";

import type { Chip } from "../../../domain/session/types";
import { ChessBoard } from "../../../features/board/ChessBoard";
import { AppShell } from "../../navigation/AppShell";
import type { TabId } from "../../navigation/TabBar";
import { AskBar } from "../../rook/AskBar";
import { NetworkPill } from "../../rook/NetworkPill";
import { RookBubble, RookSays } from "../../rook/RookBubble";
import { RookCharacter, type RookMood } from "../../rook/RookCharacter";
import {
  Avatar,
  Button,
  ChipRow,
  Pill,
  ProgressDots,
  Ring,
  Sheet,
  StatRow,
  StatTile,
  StreakChip,
  Toggle,
  XpChip,
} from "../primitives";
import "./kit.css";

// A living reference for workstream agents: every shared primitive in the
// two shells. Open /demo/ui-kit.html with `pnpm dev`. Not shipped.
const FEN = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";
const chips: readonly Chip[] = [
  {
    id: "threats",
    label: "What are you threatening?",
    action: { kind: "threats" },
  },
  { id: "checks", label: "Any checks for me?", action: { kind: "checks" } },
  { id: "why", label: "Why not gxf4?", action: { kind: "why", uci: "g3f4" } },
  { id: "done", label: "Done ✓", action: { kind: "done" } },
];
const moods: readonly RookMood[] = [
  "idle",
  "think",
  "happy",
  "hmm",
  "warm",
  "cool",
];

export function UiKit() {
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<TabId>("today");
  const [xp, setXp] = useState(140);
  const [voice, setVoice] = useState(true);
  const [sheet, setSheet] = useState(params.get("sheet") === "1");
  if (params.get("shell") === "focus")
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel: "Leave this position",
          onExit: () => undefined,
          top: (
            <>
              <ProgressDots total={3} done={1} />
              <NetworkPill online={false} />
            </>
          ),
        }}
      >
        <h1 className="kit-prompt">
          White to move
          <small>Your game vs Ahmed · Tuesday</small>
        </h1>
        <ChessBoard
          fen={FEN}
          label="Position"
          extraArrows={[
            { from: "g3", to: "f4", kind: "ghost-missed" },
            { from: "c3", to: "b3", kind: "ghost-worse" },
          ]}
          badges={[
            { square: "e6", text: "×", tone: "coral", label: "Loose queen" },
          ]}
          outlines={[{ square: "c5", tone: "coral" }]}
          previewTag="Preview · not played"
          spotSquare="g5"
        />
        <RookSays>
          <RookCharacter mood="warm" />
          <RookBubble understood="Gemini Nano understood · threats">
            I answer <b>Kg8</b>. The position is level, so gxf4 is playable. But
            something much stronger was here.
          </RookBubble>
        </RookSays>
        <div className="kit-row">
          <Button>↺ Try again</Button>
          <Pill>Hint</Pill>
          <Pill>Show me</Pill>
        </div>
        <ChipRow chips={chips} onSelect={() => undefined} />
        <AskBar
          mode="offline"
          onAsk={() => undefined}
          onMic={() => undefined}
        />
        <Sheet
          open={sheet}
          title="You spotted it! ✨"
          onClose={() => {
            setSheet(false);
          }}
        >
          <p>Ng5+ attacks the king and the queen at once.</p>
          <Button
            wide
            onClick={() => {
              setSheet(false);
            }}
          >
            Continue
          </Button>
        </Sheet>
      </AppShell>
    );
  return (
    <AppShell
      mode={{
        kind: "tabs",
        current: tab,
        onNavigate: setTab,
        todayWaiting: true,
        start: (
          <>
            <StreakChip days={4} />
            <XpChip xp={xp} />
          </>
        ),
        end: <Avatar name="Hyun" onClick={() => undefined} />,
      }}
    >
      <div className="kit-row">
        {moods.map((mood) => (
          <RookCharacter key={mood} mood={mood} />
        ))}
      </div>
      <RookSays>
        <RookCharacter mood="idle" />
        <RookBubble tone="muted">New moments come from new games.</RookBubble>
      </RookSays>
      <div className="kit-row">
        <Ring done={1} target={3} label="1 of 3 positions today" />
        <Ring done={3} target={3} size="sm" label="Goal done" />
        <Avatar name="Hyun" size="lg" />
      </div>
      <StatRow>
        <StatTile value={2} label="ideas spotted" />
        <StatTile value={4} label="day streak" />
        <StatTile value={`+${String(xp - 100)}`} label="XP" />
      </StatRow>
      <Toggle label="Rook reads aloud" checked={voice} onChange={setVoice} />
      <Button
        wide
        onClick={() => {
          setXp((value) => value + 25);
        }}
      >
        Play it
      </Button>
      <Button variant="ghost" wide>
        Import my games
      </Button>
    </AppShell>
  );
}
