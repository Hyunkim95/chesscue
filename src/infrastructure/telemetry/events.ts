export interface TelemetryContext {
  readonly releaseVersion: string;
  readonly engineVersion: string;
  readonly curriculumVersion: string;
  readonly configurationVersion: string;
  readonly deviceClass: "low" | "standard" | "high" | "unknown";
}

export type TelemetryEvent =
  | {
      readonly type: "player-move-persisted";
      readonly durationMs: number;
      readonly success: boolean;
    }
  | {
      readonly type: "cpu-reply";
      readonly durationMs: number;
      readonly success: boolean;
      readonly level: "beginner" | "intermediate" | "advanced";
    }
  | {
      readonly type: "coaching-result";
      readonly durationMs: number;
      readonly source: "on-device" | "cloud" | "deterministic";
      readonly validation: "accepted" | "rejected" | "not-generated";
    }
  | {
      readonly type: "pgn-import";
      readonly durationMs: number;
      readonly outcome: "accepted" | "rejected" | "duplicate";
    }
  | {
      readonly type: "sync-result";
      readonly durationMs: number;
      readonly outcome: "created" | "already-present" | "failed";
    }
  | {
      readonly type: "offline-start";
      readonly success: boolean;
    };

export interface TelemetryEnvelope {
  readonly occurredAt: string;
  readonly context: TelemetryContext;
  readonly event: TelemetryEvent;
}

export interface TelemetrySink {
  send(events: readonly TelemetryEnvelope[]): Promise<void>;
}
