# Board-first prototype

Clickable, throwaway prototype approved on 27 November 2026. It is the visual reference for [docs/design/board-first-redesign.md](../../../docs/design/board-first-redesign.md), not product code: it uses no app modules, scripts its one position, and stands in for Nano and Flash with keyword matching.

Run `pnpm exec vite`, then open:

- `/demo/prototypes/board-first/` for directions A and B side by side
- `/demo/prototypes/board-first/proto.html?theme=a&screen=<screen>` for one screen, where `<screen>` is `home`, `moment`, `map`, `play`, `games`, `profile`, `recap`, `empty`, `analyzing`, `caughtup` or `emptysky`

`evals.json` holds Stockfish 19 Lite's rating of every legal move in the example position (Lichess puzzle 0Uxzm, 3 s, all lines), used for the feedback tiers.
