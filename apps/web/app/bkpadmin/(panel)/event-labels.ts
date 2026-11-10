import type { BadgeTone } from "../ui";

/** Human labels for audit actions (History table, client activity). */
const ACTION: Record<string, { label: string; tone: BadgeTone }> = {
  admin_login: { label: "Admin signed in", tone: "neutral" },
  admin_login_failed: { label: "Admin sign-in failed", tone: "danger" },
  client_created: { label: "Client created", tone: "success" },
  client_updated: { label: "Details updated", tone: "neutral" },
  credentials_set: { label: "Login set", tone: "neutral" },
  login_code_issued: { label: "Code generated", tone: "accent" },
  code_used: { label: "Signed in with code", tone: "success" },
  code_failed: { label: "Wrong code", tone: "danger" },
  sign_in: { label: "Signed in", tone: "success" },
  sign_in_failed: { label: "Sign-in failed", tone: "danger" },
  sign_out: { label: "Signed out", tone: "neutral" },
  expiry_set: { label: "Expiry changed", tone: "warning" },
  membership_extended: { label: "Membership extended", tone: "success" },
  pc_limit_set: { label: "PC limit changed", tone: "neutral" },
  device_removed: { label: "PC removed", tone: "warning" },
  client_blocked: { label: "Client blocked", tone: "danger" },
  client_unblocked: { label: "Client unblocked", tone: "success" },
  renew_contact_set: { label: "Renewal message changed", tone: "neutral" },
  lead_received: { label: "New enquiry", tone: "accent" },
  lead_status_set: { label: "Lead status changed", tone: "neutral" },
};

export function actionInfo(action: string): { label: string; tone: BadgeTone } {
  return (
    ACTION[action] ?? { label: action.replaceAll("_", " "), tone: "neutral" }
  );
}
