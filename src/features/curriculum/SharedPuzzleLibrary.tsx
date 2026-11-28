import { SkeletonLines } from "../../shared/loading/LoadingState";
import { EmptyState } from "../../shared/empty-state/EmptyState";
import { useEffect, useState } from "react";

import { z } from "zod";
import { useEntryState } from "../../shared/navigation/history-entry";
import type { LibraryPuzzle } from "../../domain/material/puzzle-library";
import { installed, merge, puzzlesByRating } from "./puzzle-catalog";

type OpenPuzzle = (puzzle: LibraryPuzzle) => void;

function PuzzleButtons({
  puzzles,
  onPractice,
}: {
  readonly puzzles: readonly LibraryPuzzle[];
  readonly onPractice: OpenPuzzle;
}) {
  return (
    <ol className="practice-puzzles" aria-label="Puzzles by rating">
      {puzzles.map((puzzle, index) => {
        const rating =
          puzzle.rating === null
            ? "unrated"
            : "rating " + String(puzzle.rating);
        return (
          <li key={puzzle.id}>
            <button
              type="button"
              aria-label={`Open puzzle ${String(index + 1)}, ${rating}`}
              onClick={() => {
                onPractice(puzzle);
              }}
            >
              <span aria-hidden="true">▷</span> {puzzle.rating ?? "Unrated"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function SharedPuzzleLibrary({
  onPractice,
}: {
  readonly onPractice: OpenPuzzle;
}) {
  const [expanded, setExpanded] = useEntryState(
    "library.open",
    z.boolean(),
    false,
  );
  const [selectedId, setSelectedId] = useEntryState(
    "library.motif",
    z.string().nullable(),
    null,
  );
  const [catalog, setCatalog] = useState({
    motifs: installed.motifs,
    curricula: installed.curricula,
  });
  const [puzzles, setPuzzles] = useState(installed.puzzles);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    void import("../../infrastructure/firebase/puzzle-library")
      .then(({ readLibraryCatalog }) => readLibraryCatalog())
      .then(({ motifs, curricula }) => {
        if (cancelled) return;
        setCatalog({
          motifs: merge(installed.motifs, motifs),
          curricula: merge(installed.curricula, curricula),
        });
      })
      .catch(() => {
        // The installed catalog is available if Firestore cannot be reached.
      });
    return () => {
      cancelled = true;
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded || selectedId === null) return;
    let cancelled = false;
    void import("../../infrastructure/firebase/puzzle-library")
      .then(({ readLibraryPuzzles }) => readLibraryPuzzles(selectedId))
      .then((updates) => {
        if (!cancelled) setPuzzles((previous) => merge(previous, updates));
      })
      .catch(() => {
        // Installed puzzles remain available offline.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, selectedId]);

  const selected = catalog.motifs.find(({ id }) => id === selectedId);
  const course = catalog.curricula.find(
    (item) =>
      item.motifId === selected?.id && item.motifVersion === selected.version,
  );
  const available = puzzles.filter(
    (item) =>
      item.motifId === selected?.id && item.motifVersion === selected.version,
  );
  const byId = new Map(available.map((puzzle) => [puzzle.id, puzzle]));
  const ordered = [
    ...(course?.puzzleIds.flatMap((id) => byId.get(id) ?? []) ?? []),
    ...puzzlesByRating(
      available.filter((item) => !course?.puzzleIds.includes(item.id)),
    ),
  ];

  return (
    <details
      className="shared-puzzle-library"
      open={expanded}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
      }}
    >
      <summary>Shared puzzle library</summary>
      <div
        className="shared-puzzle-library__choices"
        role="group"
        aria-label="Puzzle motifs"
      >
        {catalog.motifs.map((motif) => (
          <button
            key={motif.id}
            type="button"
            aria-pressed={motif.id === selected?.id}
            onClick={() => {
              if (selected?.id === motif.id) return;
              setLoading(true);
              setSelectedId(motif.id);
            }}
          >
            {motif.name}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <h2>{course?.title ?? selected.name}</h2>
          {course && <p>{course.goal}</p>}
          {ordered.length > 0 ? (
            <>
              <p className="practice-ratings-label">Puzzle ratings</p>
              <PuzzleButtons puzzles={ordered} onPractice={onPractice} />
            </>
          ) : loading ? (
            <SkeletonLines lines={3}>Loading puzzles…</SkeletonLines>
          ) : (
            <EmptyState
              art="practice"
              title="No puzzles for this motif"
              description="Choose another motif to keep practicing."
            />
          )}
        </>
      )}
    </details>
  );
}
