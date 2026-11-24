export type OnDeviceAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export type OnDeviceCapability =
  | { readonly status: "unsupported" }
  | { readonly status: OnDeviceAvailability }
  | { readonly status: "detection-failed"; readonly message: string };

interface ChessTutorLanguageModelExpected {
  readonly type: "text";
  readonly languages: readonly string[];
}

interface ChessTutorLanguageModelAvailabilityOptions {
  readonly expectedInputs: readonly ChessTutorLanguageModelExpected[];
  readonly expectedOutputs: readonly ChessTutorLanguageModelExpected[];
}

interface ChessTutorLanguageModelFactory {
  availability(
    options: ChessTutorLanguageModelAvailabilityOptions,
  ): Promise<string>;
}

declare global {
  interface Window {
    readonly LanguageModel?: ChessTutorLanguageModelFactory;
  }
}

const parseAvailability = (value: string): OnDeviceAvailability | null => {
  switch (value) {
    case "available":
    case "downloadable":
    case "downloading":
    case "unavailable":
      return value;
    default:
      return null;
  }
};

export const onDeviceTextOptions: ChessTutorLanguageModelAvailabilityOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export const detectOnDeviceCapability = async (
  browserWindow: Window | null = typeof window === "undefined" ? null : window,
): Promise<OnDeviceCapability> => {
  const factory = browserWindow?.LanguageModel;
  if (factory === undefined) {
    return { status: "unsupported" };
  }

  try {
    const availability = await factory.availability(onDeviceTextOptions);
    const parsed = parseAvailability(availability);
    if (parsed !== null) {
      return { status: parsed };
    }
    return {
      status: "detection-failed",
      message: `Chrome returned an unknown on-device availability value: ${availability}.`,
    };
  } catch (error: unknown) {
    return {
      status: "detection-failed",
      message:
        error instanceof Error
          ? error.message
          : "On-device capability detection failed.",
    };
  }
};
