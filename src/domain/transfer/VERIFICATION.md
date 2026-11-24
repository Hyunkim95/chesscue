# Curated transfer pack verification

Verified on 2026-11-24 with the shipped `stockfish-19-lite-single.js` browser worker, `MultiPV 3`, and `go movetime 700` from each recorded FEN.

| Exercise                      | Best move | Candidate scores (centipawns)           | Accepted moves                                  |
| ----------------------------- | --------- | --------------------------------------- | ----------------------------------------------- |
| attacked bishop close         | `b5a4`    | `b5a4 37`, `b5c6 18`, `b5c4 -6`         | `b5a4`, `b5c6`                                  |
| bishop pressure unlabeled     | `g5f6`    | `g5f6 128`, `g5f4 7`, `g5h4 0`          | `g5f6`                                          |
| f7 mate close                 | `h5f7`    | `h5f7 mate 1`, `h5g5 -241`, `h5h4 -302` | `h5f7`                                          |
| back-rank mate unlabeled      | `e1e8`    | `e1e8 mate 1`, `g2g4 710`, `g2g3 678`   | `e1e8`                                          |
| queen's gambit close          | `c4d5`    | `c4d5 26`, `c1g5 24`, `g1f3 16`         | all three                                       |
| slav tension unlabeled        | `e2e3`    | `e2e3 27`, `c1g5 23`, `d1d3 19`         | all three                                       |
| castle close                  | `e1g1`    | `e1g1 13`, `b2b3 12`, `b1d2 8`          | `e1g1` for the explicit king-safety instruction |
| opening safety unlabeled      | `a2a4`    | `a2a4 31`, `e1g1 30`, `b1c3 29`         | all three                                       |
| open-center development close | `d2d4`    | `d2d4 33`, `f1b5 32`, `f1c4 21`         | all three                                       |
| first pieces unlabeled        | `g1f3`    | `g1f3 30`, `b1c3 13`, `d2d4 -3`         | all three                                       |

Mate scores are stored as `99_999`, matching the product analysis adapter. Every accepted move is legal and present in the recorded MultiPV output. Accepted alternatives remain within the exercise tolerance of 35 centipawns, except that explicitly labeled exercises may intentionally accept only the verified move that satisfies the stated instructional goal.

This pack is a manually curated prototype, not an independent chess-instruction audit. The behavioral test should measure transfer value before the registry expands or position generation is introduced.
