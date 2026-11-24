import type {
  TelemetryContext,
  TelemetryEnvelope,
  TelemetryEvent,
  TelemetrySink,
} from "./events";

export class BufferedTelemetry {
  readonly #context: TelemetryContext;
  readonly #sink: TelemetrySink;
  readonly #clock: () => Date;
  #events: TelemetryEnvelope[] = [];

  constructor(
    context: TelemetryContext,
    sink: TelemetrySink,
    clock: () => Date = () => new Date(),
  ) {
    this.#context = context;
    this.#sink = sink;
    this.#clock = clock;
  }

  record(event: TelemetryEvent): void {
    this.#events.push({
      occurredAt: this.#clock().toISOString(),
      context: this.#context,
      event,
    });
  }

  pendingCount(): number {
    return this.#events.length;
  }

  async flush(): Promise<void> {
    if (this.#events.length === 0) return;
    const batch = this.#events;
    this.#events = [];
    try {
      await this.#sink.send(batch);
    } catch (error: unknown) {
      this.#events = [...batch, ...this.#events];
      throw error;
    }
  }
}
