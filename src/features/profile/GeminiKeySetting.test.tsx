import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { GeminiKeySetting, type GeminiKeySave } from "./GeminiKeySetting";

afterEach(cleanup);

function setting(
  lastFour: string | undefined,
  results: readonly GeminiKeySave[] = [],
) {
  const onSave = vi.fn<(key: string) => Promise<GeminiKeySave>>();
  for (const result of results) onSave.mockResolvedValueOnce(result);
  const onRemove = vi.fn();
  render(
    <ul>
      <GeminiKeySetting
        lastFour={lastFour}
        onSave={onSave}
        onRemove={onRemove}
      />
    </ul>,
  );
  return { onSave, onRemove };
}

it("adds a key only once Google accepts it, saying why it did not", async () => {
  const { onSave } = setting(undefined, ["rejected", "saved"]);
  expect(screen.getByText("Richer explanations online")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add Gemini key" }));

  const field = screen.getByLabelText("Your Gemini API key");
  expect(field).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Stays in this browser. Google bills your key",
  );

  fireEvent.change(field, { target: { value: "AIza-typo" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByText(
      "Google didn't accept this key. Check it and try again.",
    ),
  ).toBeVisible();
  expect(field).toHaveAttribute("aria-invalid", "true");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByRole("button", { name: "Add Gemini key" }),
  ).toBeVisible();
  expect(onSave).toHaveBeenCalledWith("AIza-typo");
});

it("cancels without saving", () => {
  const { onSave } = setting(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Add Gemini key" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Add Gemini key" })).toBeVisible();
  expect(onSave).not.toHaveBeenCalled();
});

it("shows only the end of a saved key and removes it", () => {
  const { onRemove } = setting("Q9xz");
  expect(screen.getByText("Saved · ends in Q9xz")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Remove Gemini key" }));
  expect(onRemove).toHaveBeenCalledOnce();
});
