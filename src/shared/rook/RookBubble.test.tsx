import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { RookBubble } from "./RookBubble";

afterEach(cleanup);

it("replays the fade-in for a new line but not for a re-render of the same one", () => {
  const { rerender } = render(<RookBubble>Let me see…</RookBubble>);
  const first = screen.getByText("Let me see…");
  rerender(
    <RookBubble>
      <>Let me see…</>
    </RookBubble>,
  );
  expect(screen.getByText("Let me see…")).toBe(first);
  rerender(
    <RookBubble>
      I answer <b>Kg8</b>.
    </RookBubble>,
  );
  const answer = screen.getByText("Kg8").closest(".rook-bubble__line");
  expect(answer).not.toBe(first);
  expect(answer).toHaveTextContent("I answer Kg8.");
});
