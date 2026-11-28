import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";

import { Button, Pill } from "../../shared/ui/primitives";

export type GeminiKeySave =
  | "saved"
  | "invalid"
  | "rejected"
  | "unreachable"
  | "unsaved";

export interface GeminiKeyProps {
  // The saved key's last four characters, or undefined without a key.
  readonly lastFour: string | undefined;
  readonly onSave: (key: string) => Promise<GeminiKeySave>;
  readonly onRemove: () => void;
}

type Editing =
  | { readonly status: "closed" }
  | { readonly status: "open" | "checking"; readonly error?: string };

const ERRORS: Record<Exclude<GeminiKeySave, "saved">, string> = {
  invalid: "That doesn't look like a Gemini key. It starts with AIza.",
  rejected: "Google didn't accept this key. Check it and try again.",
  unreachable: "Couldn't reach Google. Check your connection and try again.",
  unsaved: "This browser blocked saving the key. Check its site settings.",
};

// The player's own Gemini key: Rook's online explanations run on it, billed
// to the player by Google. Without one, Rook explains from the board.
export function GeminiKeySetting({
  lastFour,
  onSave,
  onRemove,
}: GeminiKeyProps) {
  const [editing, setEditing] = useState<Editing>({ status: "closed" });
  const [text, setText] = useState("");
  const field = useId();
  const note = useId();
  const input = useRef<HTMLInputElement>(null);
  const open = editing.status === "open";
  // Opening the form puts the cursor in the field, and so does an error.
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, editing]);

  if (lastFour !== undefined)
    return (
      <li className="profile-setting">
        <span className="profile-setting__glyph" aria-hidden="true">
          ✦
        </span>
        <span className="profile-setting__text profile-setting__account">
          <small>Gemini key</small>
          <b>Saved · ends in {lastFour}</b>
        </span>
        <Pill onClick={onRemove} aria-label="Remove Gemini key">
          Remove
        </Pill>
      </li>
    );

  if (editing.status === "closed")
    return (
      <li className="profile-setting">
        <span className="profile-setting__glyph" aria-hidden="true">
          ✦
        </span>
        <span className="profile-setting__text profile-setting__account">
          <small>Gemini key</small>
          <span className="profile-setting__text--quiet">
            Richer explanations online
          </span>
        </span>
        <Pill
          onClick={() => {
            setEditing({ status: "open" });
          }}
          aria-label="Add Gemini key"
        >
          Add
        </Pill>
      </li>
    );

  const checking = editing.status === "checking";
  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (checking) return;
    setEditing({ status: "checking" });
    const result = await onSave(text);
    if (result === "saved") {
      setText("");
      setEditing({ status: "closed" });
      return;
    }
    setEditing({ status: "open", error: ERRORS[result] });
  }

  return (
    <li className="profile-setting profile-setting--key">
      <form
        className="profile-key"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label className="profile-key__label" htmlFor={field}>
          Your Gemini API key
        </label>
        <input
          ref={input}
          id={field}
          className="profile-key__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-describedby={note}
          aria-invalid={editing.error !== undefined}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <small
          id={note}
          className={`profile-setting__note${editing.error ? " profile-key__error" : ""}`}
          role="status"
        >
          {editing.error ??
            "Stays in this browser. Google bills your key for Rook's online explanations."}
        </small>
        <div className="profile-key__actions">
          <Button
            variant="ghost"
            onClick={() => {
              setText("");
              setEditing({ status: "closed" });
            }}
            disabled={checking}
          >
            Cancel
          </Button>
          <Button type="submit" busy={checking} disabled={text.trim() === ""}>
            Save
          </Button>
        </div>
      </form>
    </li>
  );
}
