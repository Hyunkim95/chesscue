# Third-party notices

ChessCue is distributed under Apache-2.0. Its dependencies retain their own licenses.

## Stockfish

ChessCue redistributes Stockfish 19 Lite as a separate Web Worker build.

- License: GNU General Public License v3.0
- Packaged license: [`public/stockfish/Copying.txt`](public/stockfish/Copying.txt)
- Build and source notice: [`public/stockfish/SOURCE.md`](public/stockfish/SOURCE.md)
- Stockfish source: <https://github.com/official-stockfish/Stockfish/tree/sf_19>
- Stockfish.js source: <https://github.com/nmrugg/stockfish.js>

The public repository contains the corresponding integration source and the exact redistributed asset checksums.

## Fonts

DM Sans and Newsreader are distributed through Fontsource packages under the SIL Open Font License 1.1.

- <https://fontsource.org/fonts/dm-sans>
- <https://fontsource.org/fonts/newsreader>

## JavaScript dependencies

Firebase, React, chess.js, idb, Zod, Vite, Workbox, Playwright, Vitest, and their transitive dependencies are used under the licenses declared in `package.json`, `pnpm-lock.yaml`, and their package metadata. A dependency-license inventory can be generated with:

```bash
pnpm licenses list
```
