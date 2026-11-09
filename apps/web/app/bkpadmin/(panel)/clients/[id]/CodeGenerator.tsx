"use client";

import { useActionState } from "react";
import { Button } from "@bakvion/ui";
import { issueCodeAction, type CodeState } from "../../../actions";
import { CopyButton } from "../../CopyButton";

const initial: CodeState = { error: null };

export function CodeGenerator({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(issueCodeAction, initial);
  return (
    <div className="stack">
      <form action={action}>
        <input type="hidden" name="id" value={clientId} />
        <Button type="submit" disabled={pending}>
          Generate 6-digit code
        </Button>
      </form>
      {state.error ? <div className="error">{state.error}</div> : null}
      {state.code ? (
        <div className="stack">
          <div className="notice">
            Shown once. It is not stored in readable form, so copy it now.
          </div>
          <strong style={{ fontSize: 28, letterSpacing: 4 }}>
            {state.code}
          </strong>
          <span className="muted">
            Expires{" "}
            {new Date(state.expiresAt ?? "").toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </span>
          <label className="field">
            WhatsApp message
            <textarea readOnly value={state.whatsappText} />
          </label>
          <div>
            <CopyButton text={state.whatsappText ?? ""} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
