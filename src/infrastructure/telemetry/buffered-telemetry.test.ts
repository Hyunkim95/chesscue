import { describe, expect, it, vi } from "vitest";

import { BufferedTelemetry } from "./buffered-telemetry";
import type { TelemetryContext, TelemetrySink } from "./events";

const context: TelemetryContext = {
  releaseVersion: "test",
  engineVersion: "19.0.1",
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  deviceClass: "standard",
};

describe("privacy-safe buffered telemetry", () => {
  it("sends bounded operational fields without game content", async () => {
    const send = vi.fn<TelemetrySink["send"]>().mockResolvedValue(undefined);
    const recorder = new BufferedTelemetry(
      context,
      { send },
      () => new Date("2026-11-24T12:00:00Z"),
    );
    recorder.record({
      type: "pgn-import",
      durationMs: 50,
      outcome: "accepted",
    });

    await recorder.flush();

    expect(send).toHaveBeenCalledWith([
      {
        occurredAt: "2026-11-24T12:00:00.000Z",
        context,
        event: { type: "pgn-import", durationMs: 50, outcome: "accepted" },
      },
    ]);
    expect(recorder.pendingCount()).toBe(0);
  });

  it("restores a batch when the sink fails", async () => {
    const send = vi
      .fn<TelemetrySink["send"]>()
      .mockRejectedValue(new Error("offline"));
    const recorder = new BufferedTelemetry(context, { send });
    recorder.record({ type: "offline-start", success: false });

    await expect(recorder.flush()).rejects.toThrow("offline");
    expect(recorder.pendingCount()).toBe(1);
  });
});
