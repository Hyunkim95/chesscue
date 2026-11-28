import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useRookSpeech } from "./use-rook-speech";

it("only submits final hands-free speech and reports silence as retryable", async () => {
  let hear: (text: string, final: boolean) => void = () => undefined;
  let end: () => void = () => undefined;
  class Recognition {
    processLocally = true;
    onstart?: () => void;
    onend?: () => void;
    onresult?: (event: {
      results: { 0: { transcript: string }; isFinal: boolean }[];
    }) => void;

    start() {
      hear = (transcript, isFinal) => {
        this.onresult?.({ results: [{ 0: { transcript }, isFinal }] });
      };
      end = () => {
        this.onend?.();
      };
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }

    abort() {
      this.onend?.();
    }
  }

  vi.stubGlobal("SpeechRecognition", Recognition);
  const submit = vi.fn();
  const { result, unmount } = renderHook(() =>
    useRookSpeech(submit, { handsFree: true }),
  );
  try {
    await act(() => result.current.start());
    act(() => {
      hear("Move", false);
      end();
    });
    expect(result.current.state.status).toBe("silent");
    expect(submit).not.toHaveBeenCalled();

    await act(() => result.current.start());
    act(() => {
      hear("Move", true);
    });
    expect(result.current.state.status).toBe("idle");
    expect(submit).toHaveBeenCalledExactlyOnceWith("Move");
  } finally {
    unmount();
    vi.unstubAllGlobals();
  }
});
