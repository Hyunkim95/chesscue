import type { Color, Square } from "chess.js";

// Hand-written ideas for the openings club players meet most. Each claim has
// arrows for the board, drawn on the position after `line`. Tests replay every
// line and trap with chess.js, so a wrong square or an unsound trap fails.

export const OPENING_IDEAS_VERSION = "opening-ideas/1";

export interface OpeningIdea {
  readonly text: string;
  readonly arrows: readonly (readonly [Square, Square])[];
}

export interface OpeningTrap {
  readonly text: string;
  // SAN from the start position; it begins with the sheet's line.
  readonly line: readonly string[];
  readonly winner: Color;
  // "material" means the winner ends the line at least two points ahead.
  readonly outcome: "mate" | "material";
}

export interface OpeningIdeas {
  // Opening names from the book that this sheet covers, as prefixes: a name
  // matches when it equals one or continues it after ":" or ",".
  readonly names: readonly string[];
  // The side whose choice defines the opening.
  readonly side: Color;
  readonly line: readonly string[];
  readonly plan: OpeningIdea;
  readonly pawnBreak?: OpeningIdea;
  readonly trap?: OpeningTrap;
}

export const OPENING_IDEAS: readonly OpeningIdeas[] = [
  {
    names: ["Italian Game"],
    side: "w",
    line: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    plan: {
      text: "White prepares a centre with c3 and d4 while the bishop on c4 aims at f7.",
      arrows: [
        ["c2", "c3"],
        ["c4", "f7"],
      ],
    },
    pawnBreak: {
      text: "d4 strikes at e5, usually once c3 has prepared it.",
      arrows: [["d2", "d4"]],
    },
    trap: {
      text: "After 3...Nd4, taking on e5 walks into 4...Qg5 and a quick mate on f3.",
      line: [
        ...["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7"],
        ...["Qxg2", "Rf1", "Qxe4+", "Be2", "Nf3#"],
      ],
      winner: "b",
      outcome: "mate",
    },
  },
  {
    names: ["Ruy Lopez"],
    side: "w",
    line: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    plan: {
      text: "The bishop pressures the knight that defends e5, and White castles to add Re1 to the pressure.",
      arrows: [
        ["b5", "c6"],
        ["e1", "g1"],
      ],
    },
    pawnBreak: {
      text: "d4, prepared by c3, challenges e5 directly.",
      arrows: [["d2", "d4"]],
    },
  },
  {
    names: ["Scotch Game"],
    side: "w",
    line: ["e4", "e5", "Nf3", "Nc6", "d4"],
    plan: {
      text: "White opens the centre at once; after exd4 the knight recaptures and stands on d4.",
      arrows: [["f3", "d4"]],
    },
    pawnBreak: {
      text: "Later, e5 gains space and drives a knight away from f6.",
      arrows: [["e4", "e5"]],
    },
  },
  {
    names: ["Petrov's Defense"],
    side: "b",
    line: ["e4", "e5", "Nf3", "Nf6"],
    plan: {
      text: "Black counterattacks e4 instead of defending e5 and aims for a solid, balanced game.",
      arrows: [["f6", "e4"]],
    },
    pawnBreak: {
      text: "...d5 frees Black's pieces and claims a share of the centre.",
      arrows: [["d7", "d5"]],
    },
    trap: {
      text: "Copying White with 3...Nxe4 runs into 4.Qe2; then 4...Nf6 allows 5.Nc6+, a discovered check that wins the queen.",
      line: [
        ...["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nxe4", "Qe2", "Nf6", "Nc6+"],
        ...["Be7", "Nxd8", "Kxd8"],
      ],
      winner: "w",
      outcome: "material",
    },
  },
  {
    names: [
      "Petrov's Defense: Stafford Gambit",
      "Petrov's Defense: Stafford Gambit Accepted",
    ],
    side: "b",
    line: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nc6"],
    plan: {
      text: "Black gives up a pawn for quick development and aims the pieces at f2 and e4.",
      arrows: [
        ["f8", "c5"],
        ["f6", "e4"],
      ],
    },
    trap: {
      text: "After 4.Nxc6 dxc6 5.d3 Bc5, the natural 6.Bg5 loses to 6...Nxe4, because 7.Bxd8 Bxf2+ 8.Ke2 Bg4 is mate.",
      line: [
        ...["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nc6", "Nxc6", "dxc6", "d3"],
        ...["Bc5", "Bg5", "Nxe4", "Bxd8", "Bxf2+", "Ke2", "Bg4#"],
      ],
      winner: "b",
      outcome: "mate",
    },
  },
  {
    names: ["Philidor Defense"],
    side: "b",
    line: ["e4", "e5", "Nf3", "d6"],
    plan: {
      text: "Black defends e5 with a pawn; the position is solid, but the pawn on d6 shuts in the bishop on f8.",
      arrows: [["f8", "e7"]],
    },
    trap: {
      text: "After 3.Bc4 Bg4 4.Nc3 g6, White can give up the queen: 5.Nxe5 Bxd1 6.Bxf7+ Ke7 7.Nd5 is mate.",
      line: [
        ...["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5"],
        ...["Bxd1", "Bxf7+", "Ke7", "Nd5#"],
      ],
      winner: "w",
      outcome: "mate",
    },
  },
  {
    names: ["Vienna Game"],
    side: "w",
    line: ["e4", "e5", "Nc3"],
    plan: {
      text: "White develops the queen's knight first, keeping the f-pawn free to advance, and often adds Bc4.",
      arrows: [["f1", "c4"]],
    },
    pawnBreak: {
      text: "f4 attacks e5 and opens the f-file for the rook.",
      arrows: [["f2", "f4"]],
    },
  },
  {
    names: ["Bishop's Opening"],
    side: "w",
    line: ["e4", "e5", "Bc4"],
    plan: {
      text: "The bishop aims at f7 at once, and White keeps the knight on g1 flexible.",
      arrows: [["c4", "f7"]],
    },
    pawnBreak: {
      text: "d4 opens the centre for the pieces, sometimes as a gambit.",
      arrows: [["d2", "d4"]],
    },
    trap: {
      text: "Against 2...Nc6, 3.Qh5 threatens Qxf7; answering with 3...Nf6 allows mate at once.",
      line: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
      winner: "w",
      outcome: "mate",
    },
  },
  {
    names: ["King's Pawn Game: Wayward Queen Attack"],
    side: "w",
    line: ["e4", "e5", "Qh5"],
    plan: {
      text: "The queen attacks e5 and eyes f7. Black can defend both and then gain time by attacking the queen.",
      arrows: [
        ["h5", "e5"],
        ["h5", "f7"],
      ],
    },
  },
  {
    names: ["Sicilian Defense"],
    side: "b",
    line: ["e4", "c5"],
    plan: {
      text: "Black fights for d4 from the side; after an exchange there, Black keeps an extra central pawn and a half-open c-file.",
      arrows: [["c5", "d4"]],
    },
    pawnBreak: {
      text: "...d5 is the freeing break; when Black achieves it safely, the opening has usually gone well.",
      arrows: [["d7", "d5"]],
    },
    trap: {
      text: "In the Smith-Morra Gambit, after 8...Ng4 the natural 9.h3 runs into 9...Nd4, and taking the knight allows Qh2 mate.",
      line: [
        ...["e4", "c5", "d4", "cxd4", "c3", "dxc3", "Nxc3", "Nc6", "Nf3"],
        ...["e6", "Bc4", "Qc7", "O-O", "Nf6", "Qe2", "Ng4", "h3", "Nd4"],
        ...["Nxd4", "Qh2#"],
      ],
      winner: "b",
      outcome: "mate",
    },
  },
  {
    names: ["French Defense"],
    side: "b",
    line: ["e4", "e6"],
    plan: {
      text: "Black prepares ...d5 to challenge e4 and accepts a solid but cramped position; the bishop on c8 is often the problem piece.",
      arrows: [["d7", "d5"]],
    },
    pawnBreak: {
      text: "...c5 attacks White's pawn chain at its base, and ...f6 attacks its head.",
      arrows: [
        ["c7", "c5"],
        ["f7", "f6"],
      ],
    },
  },
  {
    names: ["Caro-Kann Defense"],
    side: "b",
    line: ["e4", "c6"],
    plan: {
      text: "...c6 prepares ...d5, and Black often develops the bishop to f5 before closing it in with ...e6.",
      arrows: [
        ["d7", "d5"],
        ["c8", "f5"],
      ],
    },
    pawnBreak: {
      text: "...c5 later challenges White's d4 pawn.",
      arrows: [["c6", "c5"]],
    },
    trap: {
      text: "After 4...Nd7 5.Qe2, the natural 5...Ngf6 allows 6.Nd6 mate, because the e7 pawn is pinned to the king.",
      line: [
        ...["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Nd7", "Qe2"],
        ...["Ngf6", "Nd6#"],
      ],
      winner: "w",
      outcome: "mate",
    },
  },
  {
    names: ["Scandinavian Defense"],
    side: "b",
    line: ["e4", "d5", "exd5", "Qxd5", "Nc3"],
    plan: {
      text: "Black challenges e4 at once; after Nc3 hits the queen, it usually steps to a5 or d6 and Black develops around it.",
      arrows: [
        ["d5", "a5"],
        ["d5", "d6"],
      ],
    },
  },
  {
    names: ["Pirc Defense"],
    side: "b",
    line: ["e4", "d6", "d4", "Nf6", "Nc3", "g6"],
    plan: {
      text: "Black lets White build a big centre and plans to attack it later; the bishop on g7 aims straight at it.",
      arrows: [["f8", "g7"]],
    },
    pawnBreak: {
      text: "...e5 or ...c5 strikes at d4.",
      arrows: [
        ["e7", "e5"],
        ["c7", "c5"],
      ],
    },
  },
  {
    names: ["Queen's Gambit Declined"],
    side: "b",
    line: ["d4", "d5", "c4", "e6"],
    plan: {
      text: "Black holds d5 with ...e6 and develops with ...Nf6 and ...Be7, accepting a passive bishop on c8 for a solid centre.",
      arrows: [
        ["g8", "f6"],
        ["f8", "e7"],
      ],
    },
    pawnBreak: {
      text: "...c5 is the freeing break once Black has castled.",
      arrows: [["c7", "c5"]],
    },
    trap: {
      text: "6.Nxd5 looks like it wins a pawn because the knight on f6 is pinned, but 6...Nxd5 7.Bxd8 Bb4+ wins the queen back and leaves Black a piece for a pawn ahead.",
      line: [
        ...["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Nbd7", "cxd5"],
        ...["exd5", "Nxd5", "Nxd5", "Bxd8", "Bb4+", "Qd2", "Bxd2+", "Kxd2"],
        ...["Kxd8"],
      ],
      winner: "b",
      outcome: "material",
    },
  },
  {
    names: ["Queen's Gambit Accepted"],
    side: "b",
    line: ["d4", "d5", "c4", "dxc4"],
    plan: {
      text: "Black takes the pawn but usually lets it go, using the time to develop and hit the centre.",
      arrows: [["g8", "f6"]],
    },
    pawnBreak: {
      text: "...c5 challenges d4 once Black has developed.",
      arrows: [["c7", "c5"]],
    },
    trap: {
      text: "Holding the pawn with 3...b5 fails to 4.a4 c6 5.axb5 cxb5 6.Qf3, which attacks the rook on a8 along the long diagonal.",
      line: [
        ...["d4", "d5", "c4", "dxc4", "e3", "b5", "a4", "c6", "axb5", "cxb5"],
        ...["Qf3", "Nc6", "Qxc6+"],
      ],
      winner: "w",
      outcome: "material",
    },
  },
  {
    names: ["Slav Defense"],
    side: "b",
    line: ["d4", "d5", "c4", "c6"],
    plan: {
      text: "Black supports d5 with the c-pawn, which keeps the bishop on c8 free to develop to f5 or g4.",
      arrows: [
        ["c8", "f5"],
        ["c8", "g4"],
      ],
    },
    pawnBreak: {
      text: "...e5 or ...c5 challenges d4 once development is complete.",
      arrows: [
        ["e7", "e5"],
        ["c6", "c5"],
      ],
    },
  },
  {
    names: [
      "London System",
      "Queen's Pawn Game: London System",
      "Queen's Pawn Game: Accelerated London System",
      "Indian Defense: London System",
      "Indian Defense: Accelerated London System",
    ],
    side: "w",
    line: ["d4", "d5", "Bf4"],
    plan: {
      text: "White builds the same setup almost every game: Bf4, e3, Nf3, c3 and Bd3, then castles.",
      arrows: [
        ["e2", "e3"],
        ["c2", "c3"],
        ["f1", "d3"],
      ],
    },
    pawnBreak: {
      text: "c4 adds pressure on d5, and e4 opens the centre once White is ready.",
      arrows: [
        ["c2", "c4"],
        ["e2", "e4"],
      ],
    },
  },
  {
    names: ["King's Indian Defense"],
    side: "b",
    line: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6"],
    plan: {
      text: "Black castles behind the bishop on g7, lets White take the centre, and then attacks it.",
      arrows: [["e8", "g8"]],
    },
    pawnBreak: {
      text: "...e5 is the main break, often followed by ...f5 for a kingside attack.",
      arrows: [
        ["e7", "e5"],
        ["f7", "f5"],
      ],
    },
  },
  {
    names: ["English Opening"],
    side: "w",
    line: ["c4"],
    plan: {
      text: "White controls d5 from the side and often places the king's bishop on g2.",
      arrows: [
        ["c4", "d5"],
        ["g2", "g3"],
      ],
    },
    pawnBreak: {
      text: "d4 is the usual way to claim the centre later.",
      arrows: [["d2", "d4"]],
    },
  },
  {
    names: ["Englund Gambit"],
    side: "b",
    line: ["d4", "e5"],
    plan: {
      text: "Black gives up the e5 pawn hoping to win it back with ...Nc6 and ...Qe7 and to catch White in early tricks.",
      arrows: [
        ["b8", "c6"],
        ["d8", "e7"],
      ],
    },
    trap: {
      text: "After 3...Qe7, the natural 4.Bf4 allows 4...Qb4+, and 6.Bc3 walks into a mate on c1.",
      line: [
        ...["d4", "e5", "dxe5", "Nc6", "Nf3", "Qe7", "Bf4", "Qb4+", "Bd2"],
        ...["Qxb2", "Bc3", "Bb4", "Qd2", "Bxc3", "Qxc3", "Qc1#"],
      ],
      winner: "b",
      outcome: "mate",
    },
  },
];

const covers = (prefix: string, name: string) =>
  name === prefix ||
  name.startsWith(prefix + ":") ||
  name.startsWith(prefix + ",");

// The sheet whose longest name prefix matches the opening name.
export function ideasFor(name: string): OpeningIdeas | undefined {
  let best: { sheet: OpeningIdeas; length: number } | undefined;
  for (const sheet of OPENING_IDEAS)
    for (const prefix of sheet.names)
      if (covers(prefix, name) && prefix.length > (best?.length ?? -1))
        best = { sheet, length: prefix.length };
  return best?.sheet;
}
