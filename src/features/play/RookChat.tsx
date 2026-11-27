import { LoadingText } from "../../shared/loading/LoadingState";
import { starterPack } from "../../domain/material/pack";
import {
  RookMessage,
  RookBoardShelf,
  RookChatHeader,
  RookComposer,
} from "../../shared/rook/RookMessage";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { CoachMoment } from "../../domain/game/coach-moments";
import { rookReply, type RookReplyChoice } from "../../domain/game/rook-reply";
import type { GameRecord } from "../../domain/game/types";
import {
  readRookNotes,
  saveRookTurn,
  type RookNote,
} from "../../infrastructure/persistence/rook-notes";
import { ChessBoard } from "../board/ChessBoard";
import { useRookSpeech } from "../../shared/rook/use-rook-speech";
import { RookSpeechStatus } from "../../shared/rook/RookSpeechStatus";
import "./rook-chat.css";

function AudioNote({
  audio,
  label,
}: {
  readonly audio: Blob;
  readonly label: string;
}) {
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = player.current;
    if (element === null) return;
    const url = URL.createObjectURL(audio);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [audio]);
  return <audio ref={player} controls preload="metadata" aria-label={label} />;
}

function atMove(ply: number): string {
  return ply === 0
    ? "Before the first move"
    : `Move ${String(Math.ceil(ply / 2))}`;
}

export function RookChat({
  game,
  moments,
  scope,
  inline,
  boardFeedback,
  conversationOpen,
  onConversationOpen,
  observations,
  onObservations,
  onClose,
}: {
  readonly game: GameRecord;
  readonly moments: readonly CoachMoment[];
  readonly scope: string;
  readonly inline: boolean;
  readonly boardFeedback?: ReactNode;
  readonly conversationOpen: boolean;
  readonly onConversationOpen: () => void;
  readonly observations: boolean;
  readonly onObservations: (enabled: boolean) => void;
  readonly onClose: () => void;
}) {
  const thread = JSON.stringify([scope, game.id]);
  const [notes, setNotes] = useState<readonly RookNote[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [replay, setReplay] = useState<{
    moment: CoachMoment;
    ply: number;
  } | null>(null);
  const voicePly = useRef(0);
  const composing = useRef<AbortController | null>(null);
  const live = useRef(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    live.current = true;
    void readRookNotes(thread).then(
      (saved) => {
        if (live.current)
          setNotes((previous) =>
            Array.from(
              new Map(
                [...saved, ...previous].map((note) => [note.id, note]),
              ).values(),
            ),
          );
      },
      () => {
        if (live.current) setNotice("Saved notes couldn’t be loaded.");
      },
    );
    return () => {
      live.current = false;
      composing.current?.abort();
    };
  }, [thread]);
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [moments, notes, conversationOpen]);

  async function sendText(text: string, atPly: number) {
    if (composing.current !== null || !text.trim()) return;
    if (inline) onConversationOpen();
    const operation = new AbortController();
    composing.current = operation;
    setSaving(true);
    setNotice("");
    const note: Extract<RookNote, { kind: "text" }> = {
      ...noteIdentity(atPly),
      kind: "text",
      text: text.trim().slice(0, 500),
    };
    const checked = moments.filter(({ ply }) => ply <= atPly).slice(-6);
    try {
      let choice: RookReplyChoice | undefined;
      if (checked.length > 0) {
        const signal = AbortSignal.any([
          operation.signal,
          AbortSignal.timeout(2_500),
        ]);
        const candidate = import("../../infrastructure/ai/rook-reply-gemini")
          .then((provider) =>
            provider.chooseRookReply(note.text, checked, signal),
          )
          .catch(() => undefined);
        choice = await Promise.race([
          candidate,
          new Promise<undefined>((resolve) => {
            if (signal.aborted) resolve(undefined);
            else
              signal.addEventListener(
                "abort",
                () => {
                  resolve(undefined);
                },
                { once: true },
              );
          }),
        ]);
      }
      const reply: Extract<RookNote, { kind: "reply" }> = {
        ...noteIdentity(atPly),
        ...rookReply(note.text, checked, choice),
        packRun: starterPack.runId,
        source: choice?.question ? "on-device" : "local-facts",
        kind: "reply",
      };
      await saveRookTurn(note, reply);
      if (!live.current) return;
      setNotes((previous) => [...previous, note, reply]);
      setMessage("");
    } catch {
      if (live.current) {
        setMessage(note.text);
        setNotice("This message couldn’t be saved. Try sending it again.");
      }
    } finally {
      composing.current = null;
      if (live.current) setSaving(false);
    }
  }

  function noteIdentity(ply: number) {
    return {
      id: crypto.randomUUID(),
      thread,
      ply,
      createdAt: new Date().toISOString(),
    };
  }
  const voice = useRookSpeech((text) => {
    setMessage(text);
    void sendText(text, voicePly.current);
  });

  const entries = [
    ...moments.map((moment) => ({
      kind: "coach" as const,
      ply: moment.ply,
      createdAt: game.moves[moment.ply - 1]?.playedAt ?? game.createdAt,
      moment,
    })),
    ...notes,
  ].toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.ply - b.ply);
  const recording = voice.state.status === "listening";
  const requestingVoice =
    voice.state.status === "starting" || voice.state.status === "installing";
  const finishingVoice = voice.state.status === "finishing";
  const replayMove = game.moves[(replay?.ply ?? 0) - 1];
  const observationSetting = (
    <label className="rook-chat__setting">
      <input
        type="checkbox"
        checked={observations}
        onChange={(event) => {
          onObservations(event.currentTarget.checked);
        }}
      />
      Flag learning moments
    </label>
  );

  const composer = (
    <RookComposer
      value={message}
      onFocus={inline ? onConversationOpen : undefined}
      onChange={setMessage}
      disabled={saving || recording || finishingVoice}
      onSend={() => {
        void sendText(message.trim(), game.moves.length);
      }}
    >
      <button
        className="rook-chat__icon"
        type="button"
        aria-label={recording ? "Finish speaking" : "Talk to Rook"}
        title={recording ? "Finish speaking" : "Talk to Rook"}
        data-recording={recording}
        disabled={requestingVoice || finishingVoice || saving}
        onClick={() => {
          if (recording) {
            voice.stop();
            return;
          }
          if (inline) onConversationOpen();
          voicePly.current = game.moves.length;
          void voice.start();
        }}
      >
        <span
          className={recording ? "rook-chat__stop" : "rook-chat__mic"}
          aria-hidden="true"
        />
        {recording && (
          <span aria-hidden="true" className="rook-chat__stop-label">
            Done
          </span>
        )}
      </button>
    </RookComposer>
  );
  const conversation = (
    <>
      {conversationOpen && (
        <div
          className="rook-chat__messages"
          role="log"
          aria-label="Messages with Rook"
          ref={log}
        >
          {entries.map((entry) =>
            entry.kind === "coach" ? (
              <RookMessage
                key={`coach-${String(entry.ply)}`}
                context={atMove(entry.ply)}
              >
                <strong>{entry.moment.title}</strong>
                <p>{entry.moment.detail}</p>
                <button
                  className="rook-chat__link"
                  type="button"
                  onClick={() => {
                    setReplay({
                      moment: entry.moment,
                      ply: entry.moment.replayPly,
                    });
                  }}
                >
                  Replay this moment
                </button>
              </RookMessage>
            ) : entry.kind === "reply" ? (
              <RookMessage key={entry.id} context={atMove(entry.ply)}>
                <p>{entry.text}</p>
                {moments.find(({ ply }) => ply === entry.momentPly) && (
                  <button
                    className="rook-chat__link"
                    type="button"
                    onClick={() => {
                      const moment = moments.find(
                        ({ ply }) => ply === entry.momentPly,
                      );
                      if (moment) setReplay({ moment, ply: moment.replayPly });
                    }}
                  >
                    Show on the board
                  </button>
                )}
              </RookMessage>
            ) : (
              <RookMessage player key={entry.id} context={atMove(entry.ply)}>
                {entry.kind === "text" ? (
                  <p>{entry.text}</p>
                ) : (
                  <>
                    <strong>Voice note</strong>
                    <AudioNote audio={entry.audio} label="Saved voice note" />
                  </>
                )}
              </RookMessage>
            ),
          )}
        </div>
      )}
    </>
  );
  const speechStatus = (
    <RookSpeechStatus
      voice={voice}
      downloadLabel="Download offline speech"
      onOnline={() => {
        voicePly.current = game.moves.length;
      }}
    />
  );
  return (
    <>
      {!inline && (
        <RookChatHeader>
          <button
            className="rook-chat__icon"
            type="button"
            aria-label="Close Rook chat"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </RookChatHeader>
      )}
      {inline ? (
        <RookBoardShelf
          open={conversationOpen}
          conversation={conversation}
          composer={composer}
          inputStatus={speechStatus}
          guidance={boardFeedback}
        />
      ) : (
        conversation
      )}
      {conversationOpen && replay !== null && (
        <section className="rook-chat__replay" aria-label="Rook’s replay">
          <ChessBoard
            label="Sideline replay board"
            fen={replayMove?.fenAfter ?? game.initialFen}
            orientation={game.playerColor ?? "white"}
            lastMoveUci={replayMove?.uci}
          />
          {replay.ply > replay.moment.replayPly && (
            <button
              className="rook-chat__icon graphic-control"
              type="button"
              aria-label="Back one move"
              title="Back one move"
              onClick={() => {
                setReplay({ ...replay, ply: replay.ply - 1 });
              }}
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
          {replay.ply < replay.moment.ply && (
            <button
              className="rook-chat__icon graphic-control"
              type="button"
              aria-label="Show next move"
              title="Show next move"
              onClick={() => {
                setReplay({ ...replay, ply: replay.ply + 1 });
              }}
            >
              <span aria-hidden="true">›</span>
            </button>
          )}
          <button
            className="rook-chat__icon graphic-control"
            type="button"
            aria-label="Close replay"
            title="Close replay"
            onClick={() => {
              setReplay(null);
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </section>
      )}
      {!inline && speechStatus}
      {!inline && composer}
      {(notice || saving) && (
        <p className="rook-chat__status" aria-live="polite">
          {saving ? <LoadingText>Rook is thinking…</LoadingText> : notice}
        </p>
      )}
      {inline ? (
        <details className="board-reference">
          <summary>Rook settings</summary>
          {observationSetting}
        </details>
      ) : (
        observationSetting
      )}
    </>
  );
}
