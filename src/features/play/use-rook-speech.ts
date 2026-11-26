import { useEffect, useRef, useState } from "react";

interface RecognitionOptions {
  readonly langs: readonly string[];
  readonly processLocally: true;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string } | undefined;
}
interface RookRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionConstructor {
  new (): RookRecognition;
  available?(options: RecognitionOptions): Promise<string>;
  install?(options: RecognitionOptions): Promise<boolean>;
}
type SpeechState =
  | { readonly status: "idle" | "starting" | "finishing" | "installing" }
  | { readonly status: "listening"; readonly text: string }
  | { readonly status: "setup"; readonly download: boolean }
  | { readonly status: "error"; readonly message: string };

const language = "en-US";
const localOptions: RecognitionOptions = {
  langs: [language],
  processLocally: true,
};

function browserRecognition() {
  const browser = window as Window & {
    readonly SpeechRecognition?: RecognitionConstructor;
    readonly webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

async function installOfflineSpeech(
  recognition: RecognitionConstructor,
  signal: AbortSignal,
): Promise<boolean> {
  if (!recognition.install || signal.aborted) return false;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(90_000)]);
  let poll: number | undefined;
  let cancel: (() => void) | undefined;
  let settled = false;
  const stopped = () => deadline.aborted || settled;
  try {
    const available = new Promise<boolean>((resolve) => {
      cancel = () => {
        resolve(false);
      };
      deadline.addEventListener("abort", cancel, { once: true });
      const check = async () => {
        if (stopped()) return;
        if (
          (await recognition.available?.(localOptions).catch(() => null)) ===
          "available"
        ) {
          resolve(true);
        } else if (!stopped()) {
          poll = window.setTimeout(() => {
            void check();
          }, 500);
        }
      };
      poll = window.setTimeout(() => {
        void check();
      }, 500);
    });
    return await Promise.race([recognition.install(localOptions), available]);
  } finally {
    settled = true;
    window.clearTimeout(poll);
    if (cancel) deadline.removeEventListener("abort", cancel);
  }
}

export function useRookSpeech(onMessage: (text: string) => void) {
  const [state, setState] = useState<SpeechState>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const finish = useRef<(() => void) | null>(null);
  const send = useRef(onMessage);
  useEffect(() => {
    send.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    const leave = () => {
      request.current?.abort();
      request.current = null;
      setState({ status: "idle" });
    };
    const hide = () => {
      if (document.hidden && request.current !== null) leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      request.current?.abort();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setState({ status: "idle" });
  }

  async function start(mode: "local" | "online" | "install" = "local") {
    const Recognition = browserRecognition();
    if (Recognition === undefined) {
      setState({
        status: "error",
        message:
          "This browser has no speech recognition. You can type to Rook.",
      });
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: mode === "install" ? "installing" : "starting" });
    function done(next: SpeechState) {
      if (request.current !== controller || controller.signal.aborted)
        return false;
      request.current = null;
      finish.current = null;
      setState(next);
      return true;
    }
    try {
      const recognition = new Recognition();
      if (mode !== "online" && !("processLocally" in recognition)) {
        done({ status: "setup", download: false });
        return;
      }
      if (mode === "local" && Recognition.available !== undefined) {
        const available = await Recognition.available(localOptions);
        if (available !== "available") {
          done({
            status: "setup",
            download:
              available !== "unavailable" && Recognition.install !== undefined,
          });
          return;
        }
      }
      if (mode === "install") {
        const installed = await installOfflineSpeech(
          Recognition,
          controller.signal,
        );
        done(
          installed
            ? { status: "idle" }
            : {
                status: "error",
                message:
                  "The offline speech pack couldn’t be downloaded. Try again online.",
              },
        );
        return;
      }
      if (controller.signal.aborted) return;
      if ("processLocally" in recognition)
        recognition.processLocally = mode === "local";
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = true;
      let transcript = "";
      let endTimer: number | undefined;
      function clearTimers() {
        window.clearTimeout(timer);
        window.clearTimeout(endTimer);
      }
      function complete() {
        clearTimers();
        if (transcript) {
          if (done({ status: "idle" })) send.current(transcript);
        } else {
          done({
            status: "error",
            message:
              "I didn’t catch any speech. Try the mic again or type a message.",
          });
        }
      }
      recognition.onstart = () => {
        if (request.current === controller)
          setState({ status: "listening", text: "" });
      };
      recognition.onresult = ({ results }) => {
        if (request.current !== controller) return;
        const spoken = Array.from(results);
        const heard = spoken
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
          .trim()
          .slice(0, 500);
        if (heard) transcript = heard;
        if (heard && spoken.some(({ isFinal }) => isFinal)) {
          finish.current?.();
        } else if (endTimer === undefined) {
          setState({ status: "listening", text: transcript });
        }
      };
      recognition.onend = complete;
      recognition.onerror = ({ error }) => {
        clearTimers();
        if (
          error === "language-not-supported" ||
          error === "service-not-allowed"
        ) {
          done({
            status: "setup",
            download: mode === "local" && Recognition.install !== undefined,
          });
        } else {
          done({
            status: "error",
            message:
              error === "not-allowed"
                ? "Microphone access was denied. Allow it in your browser to talk to Rook."
                : "Speech recognition couldn’t finish. Try the mic again or type a message.",
          });
        }
      };
      finish.current = () => {
        if (request.current !== controller || endTimer !== undefined) return;
        setState({ status: "finishing" });
        endTimer = window.setTimeout(() => {
          complete();
          recognition.abort();
        }, 1_500);
        try {
          recognition.stop();
        } catch {
          complete();
        }
      };
      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimers();
          finish.current = null;
          recognition.abort();
        },
        { once: true },
      );
      const timer = window.setTimeout(() => {
        finish.current?.();
      }, 30_000);
      try {
        recognition.start();
      } catch (error) {
        clearTimers();
        throw error;
      }
    } catch {
      done({
        status: "error",
        message:
          "Speech recognition couldn’t start. Try again or type a message.",
      });
    }
  }

  return {
    state,
    start,
    cancel,
    stop: () => {
      finish.current?.();
    },
  };
}
