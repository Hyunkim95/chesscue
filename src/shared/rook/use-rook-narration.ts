import { useCallback, useEffect, useRef, useState } from "react";

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// Reads Rook's words aloud with an on-device English voice when one exists.
export function useRookNarration() {
  const [speaking, setSpeaking] = useState(false);
  const narration = useRef<SpeechSynthesisUtterance | null>(null);

  const cancel = useCallback(() => {
    narration.current = null;
    setSpeaking(false);
    stopSpeaking();
  }, []);

  const readAloud = useCallback(
    (text: string, afterSpeaking?: () => void) => {
      if (!("speechSynthesis" in window)) return;
      cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      const englishVoices = window.speechSynthesis
        .getVoices()
        .filter(({ lang, localService }) => localService && lang === "en-US");
      const preferredVoice =
        englishVoices.find(({ name }) => /premium/i.test(name)) ??
        englishVoices.find(({ name }) => /enhanced/i.test(name));
      if (preferredVoice) utterance.voice = preferredVoice;
      narration.current = utterance;
      utterance.onstart = () => {
        if (narration.current === utterance) setSpeaking(true);
      };
      utterance.onend = () => {
        if (narration.current !== utterance) return;
        narration.current = null;
        setSpeaking(false);
        afterSpeaking?.();
      };
      utterance.onerror = () => {
        if (narration.current !== utterance) return;
        narration.current = null;
        setSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
    },
    [cancel],
  );

  // Chrome loads its voice list lazily; ask early so the first read has one.
  const prepare = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  useEffect(
    () => () => {
      narration.current = null;
      stopSpeaking();
    },
    [],
  );

  return { speaking, readAloud, cancel, prepare };
}
