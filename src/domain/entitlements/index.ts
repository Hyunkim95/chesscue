// Features that may later need a paid account. Features ask canUse; they
// never read payment state. A later adapter answers from RevenueCat.
export type Feature = "open-chat" | "strategy-plan" | "voice";

export type Entitlements = (feature: Feature) => boolean;

// During the hackathon every feature is free.
export const canUse: Entitlements = () => true;
