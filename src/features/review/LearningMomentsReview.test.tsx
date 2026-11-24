import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LearningMomentsReview } from "./LearningMomentsReview";

afterEach(cleanup);

describe("LearningMomentsReview", () => {
  it("renders only traceable supplied facts", () => {
    render(
      <LearningMomentsReview
        moments={[
          {
            id: "game-1:9:hanging-piece",
            gameId: "game-1",
            ply: 9,
            fenBefore: "fen",
            playedMoveUci: "f3g5",
            playedMoveSan: "Ng5",
            candidateMoveUci: "b1c3",
            candidateMoveSan: "Nc3",
            impactCp: 180,
            theme: "hanging-piece",
            phase: "opening",
            analysisVersion: "analysis-1",
            trace: {
              evaluationBeforeCp: 20,
              evaluationAfterCp: -160,
              recurrence: 2,
              curricularRelevance: 80,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("hanging piece")).toBeVisible();
    expect(screen.getByText(/You played/)).toHaveTextContent(
      "You played Ng5. Review Nc3",
    );
    expect(screen.getByText(/Engine impact/)).toHaveTextContent(
      "180 centipawns",
    );
  });
});
