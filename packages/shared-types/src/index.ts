// v1 local protocol. Paths are sensitive: never synchronize them by default.
export type JobState =
  "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
export interface Destination {
  id: string;
  name: string;
  repository: string;
  passwordFile: string;
}
export interface Plan {
  id: string;
  name: string;
  sources: string[];
  exclusions: string[];
  destinations: Destination[];
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
export interface AgentOverview {
  status: AgentStatus;
  plans: Plan[];
  executions: Execution[];
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
