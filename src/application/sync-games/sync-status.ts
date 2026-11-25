export interface SyncStatus {
  message: string;
  pending: number;
  conflicts: readonly string[];
  lastAck: number | null;
}
export const initialSync: SyncStatus = {
  message: "Checking saved games",
  pending: 0,
  conflicts: [],
  lastAck: null,
};
