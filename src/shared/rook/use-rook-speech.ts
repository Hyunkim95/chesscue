import { useEffect, useRef, useState } from "react";
import { isSidePanel } from "../navigation/side-panel";

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
  onaudiostart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track?: MediaStreamTrack): void;
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
  | { readonly status: "permission" }
  | { readonly status: "ready" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly onlineRetry?: boolean;
    };

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

interface SpeechInputOptions {
  readonly useMicrophoneTrack?: boolean;
  readonly onInputLevel?: (level: number) => void;
}

export function useRookSpeech(
  onMessage: (text: string) => void,
  { useMicrophoneTrack, onInputLevel }: SpeechInputOptions = {},
) {
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
    let microphone: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    let levelTimer: number | undefined;
    let sampledInput = false;
    let peakLevel = 0;
    function releaseMicrophone() {
      window.clearInterval(levelTimer);
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
        audioContext = undefined;
      }
      onInputLevel?.(0);
      for (const track of microphone?.getTracks() ?? []) track.stop();
      microphone = undefined;
    }
    controller.signal.addEventListener("abort", releaseMicrophone, {
      once: true,
    });

    function done(next: SpeechState) {
      if (request.current !== controller || controller.signal.aborted)
        return false;
      request.current = null;
      finish.current = null;
      releaseMicrophone();
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
        const available = await Recognition.available(localOptions).catch(
          () => "unavailable",
        );
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
            ? { status: "ready" }
            : {
                status: "error",
                message:
                  "The offline speech pack couldn’t be downloaded. Try again online.",
              },
        );
        return;
      }
      if (controller.signal.aborted) return;
      let microphoneTrack: MediaStreamTrack | undefined;
      const needsTrack = isSidePanel || useMicrophoneTrack === true;
      if (isSidePanel) {
        const permission = await navigator.permissions
          .query({ name: "microphone" })
          .catch(() => null);
        controller.signal.throwIfAborted();
        if (permission && permission.state !== "granted") {
          done({ status: "permission" });
          return;
        }
      }
      if (needsTrack) {
        try {
          microphone = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          controller.signal.throwIfAborted();
        } catch (error) {
          releaseMicrophone();
          done(
            error instanceof DOMException && error.name === "NotAllowedError"
              ? isSidePanel
                ? { status: "permission" }
                : {
                    status: "error",
                    message:
                      "Allow microphone access in this browser, then tap Speak.",
                  }
              : {
                  status: "error",
                  message:
                    "Chrome couldn’t open your microphone. Check that it’s connected and selected in Chrome.",
                },
          );
          return;
        }
        microphoneTrack = microphone
          .getAudioTracks()
          .find((track) => track.readyState === "live");
        if (!microphoneTrack) {
          done({
            status: "error",
            message: "Chrome couldn’t find an active microphone.",
          });
          return;
        }
        if (onInputLevel) {
          try {
            audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            audioContext.createMediaStreamSource(microphone).connect(analyser);
            const samples = new Float32Array(analyser.fftSize);
            void audioContext.resume().catch(() => undefined);
            levelTimer = window.setInterval(() => {
              if (audioContext?.state !== "running") return;
              analyser.getFloatTimeDomainData(samples);
              sampledInput = true;
              const energy = samples.reduce(
                (sum, value) => sum + value * value,
                0,
              );
              const level = Math.min(1, 4 * Math.sqrt(energy / samples.length));
              peakLevel = Math.max(peakLevel, level);
              onInputLevel(level);
            }, 50);
          } catch {
            // Speech recognition can continue if the meter is unavailable.
          }
        }
      }
      if ("processLocally" in recognition)
        recognition.processLocally = mode === "local";
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = true;
      let transcript = "";
      let endTimer: number | undefined;
      function clearTimers() {
        window.clearTimeout(audioTimer);
        window.clearTimeout(timer);
        window.clearTimeout(endTimer);
      }
      function noTranscript() {
        if (sampledInput && peakLevel < 0.025) {
          done({
            status: "error",
            message:
              "The mic opened, but its input stayed quiet. Check your input device or try Speak again.",
          });
          return;
        }
        done({
          status: "error",
          message: sampledInput
            ? "The mic picked up sound, but speech recognition returned no words."
            : "Speech recognition ended without a transcript.",
          ...(useMicrophoneTrack && mode === "local" && { onlineRetry: true }),
        });
      }

      function complete() {
        clearTimers();
        if (transcript) {
          if (done({ status: "idle" })) send.current(transcript);
        } else {
          noTranscript();
        }
      }
      const onAudio = () => {
        window.clearTimeout(audioTimer);
        if (request.current === controller)
          setState({ status: "listening", text: "" });
      };
      if (needsTrack) recognition.onaudiostart = onAudio;
      else recognition.onstart = onAudio;
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
        } else if (heard && endTimer === undefined) {
          setState({ status: "listening", text: transcript });
        }
      };
      recognition.onend = complete;
      recognition.onerror = ({ error }) => {
        clearTimers();
        if (error === "no-speech") {
          noTranscript();
        } else if (error === "not-allowed" && isSidePanel) {
          done({ status: "permission" });
        } else if (
          error === "language-not-supported" ||
          error === "language-unavailable" ||
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
                : error === "audio-capture"
                  ? "Chrome couldn’t capture microphone audio. Check the selected input and try again."
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
      const audioTimer = needsTrack
        ? window.setTimeout(() => {
            clearTimers();
            if (
              done({
                status: "error",
                message:
                  "Chrome opened the microphone but speech recognition didn’t receive audio. Check the selected input and try again.",
              })
            )
              recognition.abort();
          }, 8_000)
        : undefined;
      try {
        if (microphoneTrack) recognition.start(microphoneTrack);
        else recognition.start();
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
