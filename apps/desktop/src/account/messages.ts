const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Wrong username or password.",
  CODE_INVALID:
    "This code is wrong, already used, or expired. Ask your Bakvion provider for a new one.",
  PC_LIMIT: "Your plan's PC limit is reached. Contact your Bakvion provider.",
  RATE_LIMITED: "Too many attempts. Wait 15 minutes and try again.",
  OFFLINE: "No internet connection. Connect to the internet and try again.",
  MEMBERSHIP_INACTIVE:
    "Your membership is not active. You can still restore existing backups.",
  DEVICE_REMOVED: "This PC was removed from your account. Sign in again.",
};
export function errorMessage(code: string, agentMessage: string): string {
  // PC_LIMIT text comes from the server ("Your plan allows N PCs. ..."), passed
  // through by the agent; it sends the bare code when the server gave none.
  if (code === "PC_LIMIT") {
    const text = agentMessage.trim();
    if (text !== "" && text.toUpperCase() !== code) return text;
  }
  return messages[code] ?? agentMessage;
}
export function pluralDays(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}
