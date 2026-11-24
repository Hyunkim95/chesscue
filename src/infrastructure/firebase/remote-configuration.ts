import {
  fetchAndActivate,
  getString,
  type RemoteConfig,
} from "firebase/remote-config";

import type { Result } from "../../shared/result/result";
import {
  parseRuntimeConfiguration,
  type RuntimeConfiguration,
  type RuntimeConfigurationFailure,
} from "../config/runtime-configuration";

export interface RemoteConfigurationResult {
  readonly configuration: RuntimeConfiguration;
  readonly source: "remote" | "last-validated";
  readonly warning: string | null;
}

const RUNTIME_CONFIGURATION_KEY = "runtime_configuration";

export const loadRemoteConfiguration = async (
  remoteConfig: RemoteConfig,
  lastValidated: RuntimeConfiguration,
): Promise<RemoteConfigurationResult> => {
  try {
    await fetchAndActivate(remoteConfig);
    const raw = getString(remoteConfig, RUNTIME_CONFIGURATION_KEY);
    const parsedJson: unknown = JSON.parse(raw);
    const result: Result<RuntimeConfiguration, RuntimeConfigurationFailure> =
      parseRuntimeConfiguration(parsedJson);
    if (!result.ok) {
      return {
        configuration: lastValidated,
        source: "last-validated",
        warning: result.error.message,
      };
    }
    return { configuration: result.value, source: "remote", warning: null };
  } catch (error: unknown) {
    return {
      configuration: lastValidated,
      source: "last-validated",
      warning:
        error instanceof Error
          ? error.message
          : "Remote Config is unavailable.",
    };
  }
};
