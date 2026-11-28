import { useEffect, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/newsreader/latin-500.css";
import "../../app/styles.css";
import "./rook-demo.css";
import {
  evaluateReviewReply,
  type ReviewReply,
} from "../../application/analyze-game/analyze-review-reply";
import {
  legalBoardLine,
  moveArrow,
} from "../../domain/analysis/board-move-cues";
import {
  classifyExperiment,
  isMateScore,
} from "../../domain/analysis/classify-experiment";
import { boardFacts, type StudyTurn } from "../../domain/study/position";
import { ChessBoard } from "../board/ChessBoard";
import { pieceNames } from "../board/board-pieces";
import { explainCheckedLoss } from "../rook/explain-checked-loss";
import { createRookExplorationCoach } from "../../infrastructure/ai/rook-exploration-gemini";
import { StockfishAnalysisEngine } from "../../infrastructure/engine/stockfish-analysis-engine";
import { RookSpeechStatus } from "../../shared/rook/RookSpeechStatus";
import { useRookNarration } from "../../shared/rook/use-rook-narration";
import { useRookSpeech } from "../../shared/rook/use-rook-speech";

const drill =
  "r1bq1rk1/pp3ppp/2n2n2/1N1pp3/5Q2/1B1P4/PPP2PPP/R3K1NR w KQ - 0 11";
function startingPosition() {
  const supplied = new URLSearchParams(window.location.search).get("fen");
  if (!supplied) return drill;
  try {
    return new Chess(supplied).fen();
  } catch {
    return drill;
  }
}

const question = "What were you trying to do with that move?";
interface ComparedMove {
  readonly move: Move;
  readonly reply: ReviewReply;
}

interface Finding {
  readonly move: Move;
  readonly outcome: "good" | "mistake";
  readonly reply: ReviewReply | null;
  readonly explanation: string;
  readonly alternative: readonly Move[];
  readonly comparison: readonly [ComparedMove, ComparedMove] | null;
  readonly verdict: string;
  readonly nextThreat: string;
  readonly checkDifference: {
    readonly summary: string;
    readonly reason: string;
  } | null;
}

function exposedQueens(board: Chess, color: "w" | "b") {
  const enemy = color === "w" ? "b" : "w";
  return board
    .findPiece({ type: "q", color })
    .filter((square) => board.isAttacked(square, enemy));
}

function visibleScore(score: number, color: "w" | "b") {
  if (isMateScore(score)) {
    return score > 0 === (color === "w") ? "White mates" : "Black mates";
  }
  return new Intl.NumberFormat("en", {
    signDisplay: "exceptZero",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(score / 100);
}

function opponentChecks(move: Move) {
  return new Chess(move.after).moves().filter((san) => /[+#]$/.test(san));
}

function bothSaveQueen([played, candidate]: readonly [
  ComparedMove,
  ComparedMove,
]) {
  const { color, before } = played.move;
  return (
    exposedQueens(new Chess(before), color).length > 0 &&
    [played, candidate].every(
      ({ move }) => exposedQueens(new Chess(move.after), color).length === 0,
    )
  );
}

function checkDifference(comparison: readonly [ComparedMove, ComparedMove]) {
  if (!bothSaveQueen(comparison)) return null;
  const [played, candidate] = comparison;
  const alternativeReplies = new Chess(candidate.move.after).moves({
    verbose: true,
  });
  const playedCheck = new Chess(played.move.after)
    .moves({ verbose: true })
    .find(
      ({ san, lan }) =>
        /[+#]$/.test(san) &&
        !alternativeReplies.some(
          (reply) => reply.lan === lan && /[+#]$/.test(reply.san),
        ),
    );
  if (!playedCheck) return null;
  const sameReply = alternativeReplies.find(
    ({ lan }) => lan === playedCheck.lan,
  );
  const opponent = playedCheck.color === "b" ? "Black" : "White";
  const summary = `${played.move.san} saves your queen. ${opponent} can still check your king with ${playedCheck.san}.`;
  if (!sameReply)
    return {
      summary,
      reason: `After ${candidate.move.san}, ${opponent} cannot play that reply. That takes away ${playedCheck.san} while saving your queen.`,
    };
  const board = new Chess(sameReply.after);
  const [king] = board.findPiece({ type: "k", color: candidate.move.color });
  const blocker = board.get(candidate.move.to);
  if (
    king &&
    candidate.move.to !== king &&
    blocker?.color === candidate.move.color
  ) {
    board.remove(candidate.move.to);
    if (board.attackers(king, sameReply.color).includes(sameReply.to)) {
      const attacker = pieceNames[sameReply.promotion ?? sameReply.piece];
      return {
        summary,
        reason: `${candidate.move.san} puts your ${pieceNames[blocker.type]} between ${opponent}’s ${attacker} on ${sameReply.to} and your king on ${king}. That’s why ${sameReply.san} gives no check after ${candidate.move.san}.`,
      };
    }
  }
  return {
    summary,
    reason: `${opponent} can still play ${sameReply.san} after ${candidate.move.san}, but it gives no check. Both moves save the queen. ${candidate.move.san} also takes away that check.`,
  };
}

function MoveComparison({
  comparison,
}: {
  readonly comparison: readonly [ComparedMove, ComparedMove];
}) {
  const [played, candidate] = comparison;
  const color = played.move.color;
  const player = color === "w" ? "White" : "Black";
  return (
    <details className="rook-demo__comparison">
      <summary>
        Compare {played.move.san} and {candidate.move.san}
      </summary>
      {bothSaveQueen(comparison) && (
        <p>Both moves get the queen out of attack.</p>
      )}
      <table>
        <caption>
          Stockfish estimates from {player}’s side. Scores are in pawn units.
        </caption>
        <thead>
          <tr>
            <th scope="col">After</th>
            <th scope="col">Evaluation</th>
            <th scope="col">Opponent’s checks</th>
          </tr>
        </thead>
        <tbody>
          {comparison.map(({ move, reply }) => (
            <tr key={move.lan}>
              <th scope="row">{move.san}</th>
              <td>{visibleScore(-reply.evaluationCpFromSideToMove, color)}</td>
              <td>{opponentChecks(move).join(", ") || "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Checked continuations</p>
      <ul>
        {comparison.map(({ move, reply }) => (
          <li key={move.lan}>
            {[move, ...legalBoardLine(move.after, reply.line.slice(0, 2))]
              .map(({ san }) => san)
              .join(" ")}
          </li>
        ))}
      </ul>
    </details>
  );
}

function nextThreatQuestion(reply: Move | undefined, player: "w" | "b") {
  if (!reply || reply.captured === "q") return "";
  const after = new Chess(reply.after);
  if (after.isCheckmate()) {
    return `${reply.san} is checkmate. What would you change before that reply?`;
  }
  if (after.inCheck()) {
    return `After ${reply.san}, your king is in check. What would you play against the check?`;
  }
  const before = new Chess(reply.before);
  const threatened = exposedQueens(after, player).find(
    (square) =>
      !before.isAttacked(square, reply.color) &&
      after.attackers(square, reply.color).includes(reply.to),
  );
  if (!threatened) return "";
  return `After ${reply.san}, the ${pieceNames[reply.promotion ?? reply.piece]} attacks your queen again. What would you try next?`;
}

export function RookDemo() {
  const [initialFen] = useState(startingPosition);
  const [fen, setFen] = useState(initialFen);
  const [selected, select] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [intent, setIntent] = useState("");
  const [selectingReply, setSelectingReply] = useState(false);
  const [expectedReply, setExpectedReply] = useState<Move | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Finding | null>(null);
  const [preview, setPreview] = useState<Move | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [reflection, setReflection] = useState("");
  const [turns, setTurns] = useState<(StudyTurn & { readonly id: string })[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const {
    speaking,
    readAloud,
    cancel: cancelReadAloud,
    prepare: prepareNarration,
  } = useRookNarration();
  const handsFree = useRef(false);
  const [completed, setCompleted] = useState(false);
  const [retries, setRetries] = useState<Move[]>([]);
  const [source, setSource] = useState("");
  const [finished, setFinished] = useState(false);
  const engine = useRef<StockfishAnalysisEngine | null>(null);
  const coach = useRef<ReturnType<typeof createRookExplorationCoach>>(null);
  const run = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const voice = useRookSpeech(
    (text) => {
      setIntent(text);
      if (handsFree.current) {
        if (finding) void reveal(text);
        else void explore(text);
      }
    },
    { useMicrophoneTrack: true, onInputLevel: setInputLevel },
  );
  useEffect(
    () => () => {
      run.current?.abort();
      engine.current?.dispose();
      window.clearTimeout(timer.current);
    },
    [],
  );

  const board = new Chess(fen);
  const targets = selected
    ? board.moves({ square: selected, verbose: true })
    : [];

  function addTurns(...entries: StudyTurn[]) {
    const additions = entries.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
    }));
    setTurns((current) => [...current, ...additions]);
  }

  function askAloud() {
    readAloud(question, () => {
      if (handsFree.current) void voice.start();
    });
  }

  async function play(move: Move) {
    select(null);
    setFen(move.after);
    setLastMove(move.lan);
    setMessage("");
    setSource("");
    setBusy(true);
    if (coach.current === null) {
      coach.current = createRookExplorationCoach();
      void coach.current?.initialize().catch(() => undefined);
    }
    engine.current ??= new StockfishAnalysisEngine();
    const controller = new AbortController();
    run.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const after = new Chess(move.after);
    try {
      const before = await evaluateReviewReply(
        engine.current,
        move.before,
        signal,
      );
      const reply = after.isGameOver()
        ? null
        : await evaluateReviewReply(engine.current, move.after, signal);
      if (run.current !== controller) return;
      if (before === null || (reply === null && !after.isGameOver())) {
        setMessage("Rook couldn’t check the line. Try the position again.");
        setFinished(true);
        return;
      }
      const queenThreatened =
        exposedQueens(new Chess(move.before), move.color).length > 0;
      const queenExposed = exposedQueens(after, move.color).length > 0;
      const resolvedGoal = queenThreatened && !queenExposed;
      const initialMistake =
        reply !== null &&
        classifyExperiment(move.lan, before, reply) === "spot";
      const [candidate] = legalBoardLine(move.before, before.line.slice(0, 1));
      const compare =
        candidate &&
        candidate.lan !== move.lan &&
        reply &&
        (initialMistake || resolvedGoal);
      const candidateReply = compare
        ? await evaluateReviewReply(engine.current, candidate.after, signal)
        : null;
      if (run.current !== controller) return;
      const comparison =
        candidate && candidateReply && reply
          ? ([
              { move, reply },
              { move: candidate, reply: candidateReply },
            ] as const)
          : null;
      const alternative = comparison
        ? [
            comparison[1].move,
            ...legalBoardLine(
              comparison[1].move.after,
              comparison[1].reply.line,
            ),
          ]
        : candidate && candidate.lan !== move.lan
          ? legalBoardLine(move.before, before.line)
          : [];
      const reference = comparison
        ? {
            line: alternative.map(({ lan }) => lan),
            evaluationCpFromSideToMove:
              -comparison[1].reply.evaluationCpFromSideToMove,
          }
        : before;
      const mistake =
        reply !== null &&
        classifyExperiment(move.lan, reference, reply) === "spot";
      const pendingRetry = retries.some(({ before }) => before === move.before);
      if (mistake || (resolvedGoal && (!completed || pendingRetry))) {
        const explanation = mistake
          ? explainCheckedLoss(move, reply, reference)
          : "Your queen was under attack. This move leaves it out of reach.";
        const firstReply = legalBoardLine(
          move.after,
          reply?.line.slice(0, 1) ?? [],
        )[0];
        setFinding({
          move,
          nextThreat: resolvedGoal
            ? nextThreatQuestion(firstReply, move.color)
            : "",
          outcome: mistake ? "mistake" : "good",
          reply,
          explanation,
          alternative,
          comparison,
          checkDifference: comparison ? checkDifference(comparison) : null,
          verdict: mistake
            ? queenThreatened && queenExposed
              ? "Queen left exposed"
              : resolvedGoal
                ? "Queen safe · position to revisit"
                : "Move needs another try"
            : "Queen kept safe",
        });
        if (mistake) {
          setRetries((items) =>
            items.some(
              ({ before, lan }) => before === move.before && lan === move.lan,
            )
              ? items
              : [...items, move],
          );
        } else {
          setCompleted(true);
          setRetries((items) =>
            items.filter(({ before }) => before !== move.before),
          );
        }
        setMessage(question);
        addTurns({ speaker: "Study library", text: question });
        if (handsFree.current) askAloud();
        return;
      }
      const [opponentMove] = legalBoardLine(
        move.after,
        reply?.line.slice(0, 1) ?? [],
      );
      setMessage(opponentMove ? "Your move." : "Position complete.");
      if (opponentMove) {
        setFen(opponentMove.after);
        setLastMove(opponentMove.lan);
      }
      setFinished(new Chess(opponentMove?.after ?? move.after).isGameOver());
    } catch {
      if (!controller.signal.aborted) {
        setFinished(true);
        setMessage("Rook couldn’t check the line. Try the position again.");
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function reveal(answer = intent) {
    if (!finding || busy) return;
    const current = finding;
    cancelReadAloud();
    voice.cancel();
    setSelectingReply(false);
    select(null);
    setBusy(true);
    setMessage("Checking your idea…");
    setHint(null);
    const controller = new AbortController();
    run.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const prediction = expectedReply
      ? `I expected ${expectedReply.san} (${expectedReply.lan}). `
      : "";
    const learnerTurn = `${prediction}${answer.trim()}`.trim();
    setIntent("");
    if (learnerTurn) addTurns({ speaker: "You", text: learnerTurn });
    const focus =
      learnerTurn && !current.nextThreat
        ? await coach.current?.ask(
            {
              fen: current.move.after,
              moves: [current.move.lan],
              continuation: current.reply?.line ?? [],
              observation: current.explanation,
              evaluationCp: current.reply?.evaluationCpFromSideToMove,
              message: learnerTurn,
              priorTurns: turns
                .slice(-6)
                .map(({ speaker, text }) => `${speaker}: ${text}`),
              topic:
                "Queen safety. Choose a focus for the learner’s stated intention.",
            },
            signal,
          )
        : null;
    if (run.current !== controller) return;
    setSource(focus ? "Gemini Nano on device" : "Verified board feedback");
    const steps = legalBoardLine(
      current.move.after,
      current.reply?.line.slice(0, 2) ?? [],
    );
    const reply = steps[0];
    const replyText =
      reply && current.outcome === "good"
        ? `Here, the ${pieceNames[reply.piece]} ${reply.isCapture() ? "captures on" : "moves to"} ${reply.to}.`
        : "";
    const predictionText =
      expectedReply && reply
        ? expectedReply.lan === reply.lan
          ? "The checked line starts with the reply you expected."
          : "Your reply is legal. Watch what happens against this other reply."
        : "";
    const explanation = [
      predictionText,
      current.nextThreat
        ? current.explanation
        : (current.checkDifference?.summary ?? current.explanation),
      current.nextThreat || (current.checkDifference ? "" : replyText),
    ]
      .filter(Boolean)
      .join(" ");
    setResult(current);
    setMessage(explanation);
    setReflection(focus ?? "");
    addTurns({ speaker: "Study library", text: explanation });
    if (focus) addTurns({ speaker: "Gemini Nano", text: focus });
    if (handsFree.current) readAloud(`${current.verdict}. ${explanation}`);
    playPreview(steps, () => {
      setFinding(null);
      setFinished(true);
    });
  }

  async function explore(answer = intent) {
    const questionText = answer.trim();
    if (!questionText || busy || finding) return;
    const controller = new AbortController();
    run.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(9_000),
    ]);
    setBusy(true);
    setIntent("");
    cancelReadAloud();
    voice.cancel();
    addTurns({ speaker: "You", text: questionText });
    try {
      engine.current ??= new StockfishAnalysisEngine();
      const line =
        (
          result?.reply ??
          (await evaluateReviewReply(engine.current, fen, signal))
        )?.line ?? [];
      if (run.current !== controller) return;
      const facts = boardFacts(fen, line, questionText);
      const checked = facts.squareControl.length
        ? facts.squareControl.join(" ")
        : facts.engineLine.length
          ? `Stockfish’s line from this board is ${facts.engineLine.join(" ")}.`
          : `${facts.side} to move. The position is ${facts.status}.`;
      const comparison = result?.comparison;
      const comparisonLine = comparison?.map(({ move, reply }) => {
        const line = legalBoardLine(move.after, reply.line.slice(0, 2));
        return [move, ...line].map(({ san }) => san).join(" ");
      });
      const summary =
        result?.checkDifference?.reason ??
        (comparisonLine
          ? `Compare the checked replies: ${comparisonLine.join(" versus ")}.`
          : checked);
      let text = facts.squareControl.length ? checked : summary;
      const asksWhy =
        /\b(why|reason|difference|better|prefer|stronger)\b/i.test(
          questionText,
        );
      if (asksWhy && !facts.squareControl.length && result?.checkDifference) {
        addTurns({
          speaker: "Study library",
          text: result.checkDifference.reason,
        });
        if (handsFree.current) readAloud(result.checkDifference.reason);
        return;
      }
      let speaker: StudyTurn["speaker"] = "Study library";
      try {
        const { createStudyAI } =
          await import("../../infrastructure/ai/study-gemini");
        const answer = await createStudyAI()?.chat(
          {
            message: questionText,
            fen,
            facts,
            lesson: summary,
            history: turns.slice(-6),
          },
          signal,
        );
        if (answer?.action === "answer") {
          text = answer.answer;
          speaker = "Gemini Nano";
        }
      } catch {
        // Keep the checked board answer when Nano is unavailable.
      }
      if (run.current !== controller) return;
      addTurns({ speaker, text });
      if (handsFree.current) readAloud(text);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function continuePlay() {
    if (!result) return;
    const [next] = legalBoardLine(
      result.move.after,
      result.reply?.line.slice(0, 1) ?? [],
    );
    if (!next) return;
    reset(next.after);
    setLastMove(next.lan);
  }

  function playPreview(steps: readonly Move[], done?: () => void) {
    setBusy(true);
    let index = 0;
    function advance() {
      const step = steps[index++];
      if (step) {
        setPreview(step);
        timer.current = window.setTimeout(advance, 1_400);
      } else {
        setPreview(null);
        setBusy(false);
        done?.();
      }
    }
    timer.current = window.setTimeout(advance, 400);
  }

  function showHint() {
    if (!finding || busy) return;
    const [nextMove] = legalBoardLine(
      finding.move.after,
      finding.reply?.line.slice(0, 1) ?? [],
    );
    if (!nextMove) return;
    cancelReadAloud();
    voice.cancel();
    setSelectingReply(false);
    select(null);
    setHint(nextMove);
  }

  function reset(position = initialFen) {
    run.current?.abort();
    run.current = null;
    window.clearTimeout(timer.current);
    cancelReadAloud();
    voice.cancel();
    setFen(position);
    setFinding(null);
    setResult(null);
    setPreview(null);
    setHint(null);
    setReflection("");
    setFinished(false);
    setBusy(false);
    setMessage("");
    setSource("");
    setIntent("");
    setSelectingReply(false);
    setExpectedReply(null);
    setLastMove(null);
    select(null);
  }

  return (
    <main className="rook-demo">
      <header>
        <h1>Play with Rook</h1>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              handsFree.current = event.currentTarget.checked;
              cancelReadAloud();
              voice.cancel();
              if (handsFree.current) prepareNarration();
              if (handsFree.current && finding && !busy) askAloud();
            }}
          />{" "}
          Hands-free voice
        </label>
      </header>
      {(preview ?? finding ?? result) && (
        <p
          className="rook-demo__board-status"
          data-preview={preview !== null}
          aria-live="polite"
        >
          {preview
            ? preview.color === (finding ?? result)?.move.color
              ? "Rook’s preview · Example move for your side"
              : "Rook’s preview · Opponent’s reply"
            : "Board after your move"}
        </p>
      )}
      <ChessBoard
        fen={preview?.after ?? fen}
        label="Coached chessboard"
        lastMoveUci={preview?.lan ?? lastMove}
        animateMove={preview !== null || !finished}
        hintSquares={hint ? [hint.from] : []}
        moveCue={
          expectedReply && !busy && finding && !selectingReply
            ? { arrows: [moveArrow(expectedReply)] }
            : undefined
        }
        selectedSquare={selected}
        legalTargets={targets.map(({ to }) => to)}
        disabled={busy || (finding !== null && !selectingReply) || finished}
        onSquareSelect={(square) => {
          const move = targets.find(
            ({ to, promotion }) =>
              to === square && (!promotion || promotion === "q"),
          );
          if (move && selectingReply) {
            setExpectedReply(move);
            setSelectingReply(false);
            select(null);
          } else if (move) {
            void play(move);
          } else
            select(board.get(square)?.color === board.turn() ? square : null);
        }}
      />
      <section className="rook-demo__coach" aria-label="Rook">
        {speaking && (
          <span className="rook-demo__speaking" role="status">
            Rook is speaking
          </span>
        )}
        <div aria-live="polite">
          {result && (
            <h2 className="rook-demo__verdict" data-outcome={result.outcome}>
              {result.verdict}
            </h2>
          )}
          <p>{message || (busy ? "Checking your move…" : "Your move.")}</p>
        </div>
        {source && <small>{source}</small>}
        {result?.comparison && (
          <MoveComparison comparison={result.comparison} />
        )}
        {finished && reflection && <p>{reflection}</p>}
        {finding && !finished && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void reveal();
            }}
          >
            <input
              aria-label="Your idea"
              value={intent}
              disabled={busy}
              onChange={(event) => {
                setIntent(event.currentTarget.value);
              }}
              placeholder="Your idea"
            />
            {expectedReply && <p>You expected {expectedReply.san}.</p>}
            {selectingReply && <p>Select an opponent’s piece and move it.</p>}
            {hint && (
              <p role="status">
                Look at the highlighted {pieceNames[hint.piece]}. What can it
                do?
              </p>
            )}
            <div className="rook-demo__actions">
              {finding.reply && (
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={selectingReply}
                  onClick={() => {
                    cancelReadAloud();
                    voice.cancel();
                    setSelectingReply(!selectingReply);
                    select(null);
                  }}
                >
                  {selectingReply ? "Cancel reply" : "Try their reply"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  cancelReadAloud();
                  if (voice.state.status === "listening") voice.stop();
                  else void voice.start();
                }}
              >
                {voice.state.status === "listening"
                  ? "Finish speaking"
                  : "Speak"}
              </button>
              {finding.reply && !hint && (
                <button type="button" disabled={busy} onClick={showHint}>
                  Give me a hint
                </button>
              )}
              <button type="submit" disabled={busy}>
                Show replay
              </button>
            </div>
            {voice.state.status === "listening" && (
              <meter
                className="rook-demo__meter"
                aria-label="Microphone input level"
                min={0}
                max={1}
                value={inputLevel}
              />
            )}
            <RookSpeechStatus voice={voice} />
          </form>
        )}
        {finished && result && result.alternative.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              playPreview(result.alternative.slice(0, 2));
            }}
          >
            {result.alternative[0]
              ? `Replay ${result.alternative[0].san}`
              : "Replay stronger move"}
          </button>
        )}
        {finished && result?.reply?.line.length ? (
          <button type="button" disabled={busy} onClick={continuePlay}>
            Keep playing
          </button>
        ) : null}
        {finished && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              reset();
            }}
          >
            Try another move
          </button>
        )}
      </section>
      {turns.length > 0 && (
        <section
          className="rook-demo__conversation"
          aria-label="Rook transcript"
        >
          <details open>
            <summary>Conversation</summary>
            <ol aria-live="polite">
              {turns.map(({ id, speaker, text }) => (
                <li key={id}>
                  <strong>{speaker === "You" ? "You" : "Rook"}</strong> {text}
                </li>
              ))}
            </ol>
          </details>
          {!finding && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void explore();
              }}
            >
              <input
                aria-label="Ask Rook"
                placeholder="Ask Rook"
                value={intent}
                disabled={busy}
                onChange={(event) => {
                  setIntent(event.currentTarget.value);
                }}
              />
              <button type="submit" disabled={busy || !intent.trim()}>
                Ask
              </button>
            </form>
          )}
        </section>
      )}
      {(finding !== null || finished) && (completed || retries.length > 0) && (
        <section className="rook-demo__practice" aria-label="Practice">
          <h2>Practice</h2>
          <ul aria-live="polite">
            {completed && <li>✓ Queen safety · Complete</li>}
            {retries.map((move) => (
              <li key={move.before + move.lan}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    reset(move.before);
                  }}
                >
                  Retry {move.san} · Added to practice
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
