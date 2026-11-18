// v1 local protocol. Paths are sensitive: never synchronize them by default.
export type JobState =
  "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
export interface Destination {
  id: string;
  name: string;
  repository: string;
  /** Empty: Bakvion creates and protects the key itself. */
  passwordFile: string;
}
export type ScheduleKind = "manual" | "hourly" | "daily" | "weekly";
export interface Schedule {
  kind: ScheduleKind;
  /** Local "HH:MM" for daily and weekly. */
  time?: string;
  /** Weekdays for weekly, 0 = Sunday. */
  days?: number[];
}
export interface Retention {
  enabled: boolean;
  daily: number;
  weekly: number;
  monthly: number;
}
export interface Plan {
  id: string;
  name: string;
  sources: string[];
  exclusions: string[];
  destinations: Destination[];
  schedule: Schedule;
  retention: Retention;
  /** False by default: also copies files in normal readable format. */
  encrypted?: boolean;
  /** Opened from another PC: restore only, never backed up to. */
  restoreOnly?: boolean;
}
export interface Execution {
  id: string;
  planId: string;
  destinationId: string;
  state: JobState;
  snapshotId: string;
  startedAt: string;
  finishedAt: string | null;
  error: string;
  /** One note per line, e.g. "Old versions cleaned up", "Backup disk is 92% full (3.1 GB free)". */
  notes: string;
}
export interface Snapshot {
  id: string;
  time: string;
  paths: string[];
  hostname: string;
  tags?: string[];
}
export interface SnapshotNode {
  name: string;
  type: string;
  path: string;
  size?: number;
}
export interface AgentStatus {
  version: string;
  mode: "full" | "restore_only" | "signed_out";
  capabilities: string[];
}
export interface KitStatus {
  needed: boolean;
  savedAt: string | null;
}
export interface AgentOverview {
  status: AgentStatus;
  plans: Plan[];
  executions: Execution[];
  /** Plan id → next scheduled backup (RFC 3339). */
  nextRuns: Record<string, string>;
  kit: KitStatus;
  /** Last measured space of each destination's disk. */
  disks?: DiskUsage[];
}
export interface DiskUsage {
  planId: string;
  destinationId: string;
  usedPercent: number;
  freeBytes: number;
  totalBytes: number;
  checkedAt: string;
}
/** A Google Drive for desktop folder; only "mirror" works for backups. */
export interface DriveFolder {
  path: string;
  mode: "mirror" | "stream";
}
export interface AgentRequest {
  version: 1;
  method: string;
  params?: unknown;
}
export interface AgentError {
  code: string;
  message: string;
}
export interface AgentResponse<T> {
  version: 1;
  result?: T;
  error?: AgentError;
}
export type AccountMode = "full" | "restore_only" | "signed_out";
export type AccountReason =
  "" | "expired" | "blocked" | "clock" | "pc_limit" | "signed_out";
export interface AccountStatus {
  signedIn: boolean;
  mode: AccountMode;
  reason: AccountReason;
  clientName: string;
  expiresAt: string | null;
  daysLeft: number;
  showBadge: boolean;
  renewContact: string;
  lastSyncAt: string | null;
  daysSinceSync: number;
  syncWarning: boolean;
  installId: string;
  appVersion: string;
}
export type SignInParams =
  | { method: "password"; username: string; password: string }
  | { method: "code"; code: string };
/** Settings → About & updates. */
export interface UpdateStatus {
  /** Version of the background service. */
  current: string;
  /** Newest published version ("" until checked). */
  latest: string;
  available: boolean;
  checkedAt: string;
  /** Version being installed right now, or "". */
  installing: string;
  error: string;
  /** False for development builds. */
  automatic: boolean;
}
