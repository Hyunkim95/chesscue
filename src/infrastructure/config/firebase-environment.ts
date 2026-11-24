import { err, ok, type Result } from "../../shared/result/result";

export interface FirebaseClientConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
  readonly measurementId?: string;
  readonly appCheckSiteKey?: string;
}

export interface FirebaseConfigFailure {
  readonly code: "partial-configuration" | "invalid-environment";
  readonly message: string;
}

const requiredKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const readString = (
  environment: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = environment[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export const loadFirebaseClientConfig = (
  environment: unknown = import.meta.env,
): Result<FirebaseClientConfig | null, FirebaseConfigFailure> => {
  if (
    typeof environment !== "object" ||
    environment === null ||
    Array.isArray(environment)
  ) {
    return err({
      code: "invalid-environment",
      message: "Firebase environment must be an object.",
    });
  }

  const values = environment as Record<string, unknown>;
  const requiredValues = requiredKeys.map((key) => readString(values, key));
  const configuredCount = requiredValues.filter(
    (value) => value !== undefined,
  ).length;

  if (configuredCount === 0) {
    return ok(null);
  }

  if (configuredCount !== requiredKeys.length) {
    const missing = requiredKeys.filter(
      (key) => readString(values, key) === undefined,
    );
    return err({
      code: "partial-configuration",
      message: `Firebase configuration is incomplete. Missing: ${missing.join(", ")}.`,
    });
  }

  const [
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  ] = requiredValues;
  if (
    apiKey === undefined ||
    authDomain === undefined ||
    projectId === undefined ||
    storageBucket === undefined ||
    messagingSenderId === undefined ||
    appId === undefined
  ) {
    return err({
      code: "partial-configuration",
      message: "Firebase configuration is incomplete.",
    });
  }

  const measurementId = readString(values, "VITE_FIREBASE_MEASUREMENT_ID");
  const appCheckSiteKey = readString(
    values,
    "VITE_FIREBASE_APP_CHECK_SITE_KEY",
  );

  return ok({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    ...(measurementId === undefined ? {} : { measurementId }),
    ...(appCheckSiteKey === undefined ? {} : { appCheckSiteKey }),
  });
};
