import { useState, type FormEvent } from "react";
import { Button, Modal } from "@bakvion/ui";
import { AgentRequestError, request } from "../api";
import { errorMessage } from "./messages";

/** "Connect with Bakvion experts": sends an enquiry through the service. */
export function ExpertDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true);
    setError("");
    try {
      await request("submitLead", {
        name: String(data.name ?? ""),
        business: String(data.business ?? ""),
        phone: String(data.phone ?? ""),
        email: String(data.email ?? ""),
        city: String(data.city ?? ""),
        pcs: data.pcs ? Number(data.pcs) : 0,
        message: String(data.message ?? ""),
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof AgentRequestError
          ? err.code === "BAD_REQUEST"
            ? "Please check your name, business name and phone number."
            : errorMessage(err.code, err.message)
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setSent(false);
      setError("");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={sent ? "Thank you!" : "Connect with Bakvion experts"}
      description={
        sent
          ? "A Bakvion expert will contact you within 24 hours."
          : "Tell us a little about your business. We'll call or WhatsApp you within 24 hours and set everything up."
      }
    >
      {sent ? (
        <div className="stack" role="status">
          <p>We have your details. You can close this window.</p>
          <Button type="button" onClick={() => close(false)}>
            Close
          </Button>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <div className="expert-grid">
            <label className="field">
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
              />
            </label>
            <label className="field">
              Business name
              <input
                name="business"
                required
                minLength={2}
                maxLength={120}
                autoComplete="organization"
              />
            </label>
            <label className="field">
              Phone (WhatsApp)
              <input
                name="phone"
                type="tel"
                required
                pattern="[0-9+\-\s()]{10,20}"
                placeholder="+91 98765 43210"
                autoComplete="tel"
              />
            </label>
            <label className="field">
              Email (optional)
              <input
                name="email"
                type="email"
                maxLength={160}
                autoComplete="email"
              />
            </label>
            <label className="field">
              City (optional)
              <input name="city" maxLength={80} />
            </label>
            <label className="field">
              Number of PCs (optional)
              <input name="pcs" type="number" min={1} max={100} />
            </label>
          </div>
          <label className="field">
            Anything we should know? (optional)
            <textarea name="message" rows={3} maxLength={1000} />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
