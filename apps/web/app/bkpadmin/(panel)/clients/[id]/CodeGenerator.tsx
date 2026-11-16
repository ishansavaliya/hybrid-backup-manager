"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { issueCodeAction, type CodeState } from "../../../actions";
import { CopyButton } from "../../CopyButton";
import { Button, Notice } from "../../../ui";

const initial: CodeState = { error: null };

const EXPIRY = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function CodeGenerator({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(issueCodeAction, initial);
  return (
    <div className="gx-code">
      <div className="gx-code__intro">
        <div>
          <p className="gx-label">6-digit sign-in code</p>
          <p className="gx-hint">
            Works once, for 48 hours. Send it on WhatsApp; the client types it
            in the Bakvion app.
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={clientId} />
          <Button
            type="submit"
            variant="secondary"
            disabled={pending}
            aria-busy={pending}
          >
            <KeyRound size={16} aria-hidden="true" />
            {pending
              ? "Generating…"
              : state.code
                ? "New code"
                : "Generate code"}
          </Button>
        </form>
      </div>
      {state.error ? <Notice error={state.error} variant="inline" /> : null}
      {state.code ? (
        <div className="gx-code__result">
          <div className="gx-code__digits" aria-label={`Code ${state.code}`}>
            <span>{state.code.slice(0, 3)}</span>
            <span>{state.code.slice(3)}</span>
          </div>
          <p className="gx-hint">
            Expires {EXPIRY.format(new Date(state.expiresAt ?? ""))} India time
            · shown only now, copy it before leaving this page.
          </p>
          <div className="gx-code__message">{state.whatsappText}</div>
          <div className="gx-code__actions">
            <CopyButton text={state.code} label="Copy code" />
            <CopyButton
              text={state.whatsappText ?? ""}
              label="Copy for WhatsApp"
              variant="primary"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
